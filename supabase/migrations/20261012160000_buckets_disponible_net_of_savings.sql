-- Savings are set aside at the start of the month, so disponible subtracts
-- what already went to savings plus the recurring charges still due this
-- month. The previous rule (ahorro not subtracted) assumed savings came out of
-- whatever was left at month end.
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
  v_comprometido bigint := 0;
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
        when c.root in ('consumo', 'ingreso') then 'consumo'
        else 'por_categorizar'
      end as bucket,
      case
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
    and not (t.type = 'expense' and t.debt_id is not null)
    and (
      t.type in ('expense', 'refund', 'debt_payment')
      or (t.type = 'income' and c.root <> 'ahorro')
      or (t.type = 'adjustment' and t.description like 'Undo:%')
    );

  -- Recurring charges still to be paid this month are already spoken for.
  -- Only the current month has a forward-looking commitment.
  if current_date between v_start and v_end then
    select coalesce(sum((r->>'amount')::bigint), 0)
    into v_comprometido
    from jsonb_array_elements(get_recurring_status(current_date, p_entity)) r
    where r->>'status' in ('due', 'upcoming')
      and coalesce(r->>'currency', 'CLP') = 'CLP';
  end if;

  return jsonb_build_object(
    'income', v_income,
    'necesidades', v_necesidades,
    'consumo', v_consumo,
    'ahorro', v_ahorro,
    'por_categorizar', v_por_categorizar,
    'comprometido', v_comprometido,
    'disponible', v_income - (v_necesidades + v_consumo + v_ahorro + v_por_categorizar) - v_comprometido,
    'month', to_char(v_start, 'YYYY-MM')
  );
end;
$$;
