-- Port the PR#8 ("wrong-balance-figures") breakdown semantics into
-- get_monthly_buckets. The RPC replaced packages/core/src/breakdown.ts as the
-- single source of truth but silently dropped four rules that PR#8 had added
-- on purpose, regressing the dashboard numbers:
--
--   1. NON-FLOW categories (paying a card/bill, collecting a receivable,
--      moving money between own accounts, opening balances, reconciliation
--      tweaks) are bookkeeping, not real income or spending -> excluded.
--   2. Income filed under an ahorro% category is cash deposited into an
--      account, not earnings -> not income.
--   3. Undo reversals (type = adjustment, description 'Undo:%') net back out
--      of the bucket they originally inflated. Any other adjustment stays out.
--   4. disponible = income - (necesidades + consumo + por_categorizar).
--      Ahorro is an allocation of income, not a loss: it is NOT subtracted.
--      (por_categorizar IS subtracted: under PR#8 those rows lived inside
--      consumo, so subtracting keeps the figure equivalent.)
--
-- Additionally (new, deliberate — reviewed against prod data):
--   5. Only transactions on on_budget accounts count, matching
--      get_reconciliation_status and create_snapshot scope.
--   6. The special clause "transfer with ahorro% category counts as ahorro"
--      is REMOVED. It double-counted transfer pairs (both legs carried
--      ahorro.inversion and summed to 0, or double with abs()). The user's
--      actual books record savings as an expense with an ahorro category
--      (see prod July 2026), which the category-prefix rule already captures;
--      promote_email_movements is aligned in the sibling migration.
--
-- Known limitation (inherited from PR#8): an undo of an *adjustment* (a row
-- that never counted) still nets into a bucket. Rows with unmapped categories
-- net into por_categorizar, where they stay visible for review instead of
-- silently distorting consumo.

-- Resolves a category (tree id like 'necesidad.salud' or legacy free text like
-- 'supermercado' / 'Otro ingreso') to its top-level bucket root.
create or replace function _bucket_root(p_category text)
returns text
language sql
immutable
as $$
  with c as (
    select lower(trim(coalesce(p_category, ''))) as cat
  ), h as (
    select c.cat, split_part(c.cat, '.', 1) as head from c
  )
  select case
    when h.head in ('necesidad', 'consumo', 'ahorro', 'ingreso') then h.head
    -- Legacy free-text categories entered before the category tree existed,
    -- mapped by hand (superset of the PR#8 map, extended with names seen in
    -- prod: 'Otro ingreso', 'Bencina y TAG').
    when h.cat in ('necesidades', 'supermercado', 'salud', 'transporte',
                   'bencina', 'bencina y tag', 'servicios', 'pago-cuentas')
      then 'necesidad'
    when h.cat in ('comida', 'entretenimiento', 'sin-detallar') then 'consumo'
    when h.cat in ('sueldo', 'honorarios', 'arriendo', 'facturacion',
                   'otro ingreso')
      then 'ingreso'
    else 'other'
  end
  from h;
$$;

create or replace function get_monthly_buckets(
  p_month date default null,
  p_entity entity_type default 'personal'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_start date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_end date := (v_start + interval '1 month' - interval '1 day')::date;
  v_income bigint;
  v_necesidades bigint;
  v_consumo bigint;
  v_ahorro bigint;
  v_por_categorizar bigint;
begin
  select
    coalesce(sum(s.delta) filter (where s.bucket = 'income'), 0),
    coalesce(sum(s.delta) filter (where s.bucket = 'necesidades'), 0),
    coalesce(sum(s.delta) filter (where s.bucket = 'consumo'), 0),
    coalesce(sum(s.delta) filter (where s.bucket = 'ahorro'), 0),
    coalesce(sum(s.delta) filter (where s.bucket = 'por_categorizar'), 0)
  into v_income, v_necesidades, v_consumo, v_ahorro, v_por_categorizar
  from transactions t
  join accounts a on a.id = t.account_id and a.on_budget
  cross join lateral (
    select lower(trim(coalesce(t.category, ''))) as cat,
           _bucket_root(t.category) as root
  ) c
  cross join lateral (
    select
      case
        -- Undo reversal: route to the bucket the original inflated.
        when t.type = 'adjustment' then
          case c.root
            when 'ingreso' then 'income'
            when 'necesidad' then 'necesidades'
            when 'consumo' then 'consumo'
            when 'ahorro' then 'ahorro'
            else 'por_categorizar'
          end
        when t.type = 'income' then 'income'
        when c.root = 'necesidad' then 'necesidades'
        when c.root = 'ahorro' then 'ahorro'
        -- PR#8: an expense filed under an ingreso-rooted category is consumo.
        when c.root in ('consumo', 'ingreso') then 'consumo'
        else 'por_categorizar'
      end as bucket,
      case
        -- Undo of an income adds its (negative) amount to income; undos of
        -- spends subtract their (positive) amount from the spend bucket.
        when t.type = 'adjustment' and c.root = 'ingreso' then t.amount
        when t.type = 'adjustment' then -t.amount
        when t.type = 'refund' then -t.amount
        else t.amount
      end as delta
  ) s
  where t.user_id = (select auth.uid())
    and t.entity = p_entity
    and t.date between v_start and v_end
    and c.cat not in ('pago-cuentas', 'pago-tarjeta', 'cobro', 'reembolso',
                      'apertura', 'ajuste', 'movimiento', 'reserva')
    and (
      t.type in ('expense', 'refund')
      or (t.type = 'income' and c.root <> 'ahorro')
      or (t.type = 'adjustment' and t.description like 'Undo:%')
    );

  return jsonb_build_object(
    'income', v_income,
    'necesidades', v_necesidades,
    'consumo', v_consumo,
    'ahorro', v_ahorro,
    'por_categorizar', v_por_categorizar,
    'disponible', v_income - (v_necesidades + v_consumo + v_por_categorizar),
    'month', to_char(v_start, 'YYYY-MM')
  );
end;
$$;
