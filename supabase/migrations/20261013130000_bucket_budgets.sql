-- Monthly budget per bucket (necesidades, consumo, ahorro) and how each one
-- moves through the month. The amounts lived in the vault's finanzas.md; here
-- they become data so the app and `bal` can show what is left per bucket.
--
-- A budget row applies from its month on until a later month sets a new one,
-- so the budget is set once and only touched when it changes.
--
-- The classification of a movement into a bucket moves to _bucket_movements so
-- get_monthly_buckets and the daily series read the same rows.

create table bucket_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entity entity_type not null default 'personal',
  bucket text not null check (bucket in ('necesidades', 'consumo', 'ahorro')),
  month date not null check (extract(day from month) = 1),
  amount bigint not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, entity, bucket, month)
);

alter table bucket_budgets enable row level security;

create policy "bucket_budgets_select" on bucket_budgets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "bucket_budgets_insert" on bucket_budgets
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "bucket_budgets_update" on bucket_budgets
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "bucket_budgets_delete" on bucket_budgets
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on bucket_budgets to authenticated;

-- Every movement of the user that lands in a bucket, with its signed delta.
create function _bucket_movements(p_start date, p_end date, p_entity entity_type)
returns table (day date, bucket text, delta bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select t.date, s.bucket, s.delta
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
    and t.date between p_start and p_end
    and c.cat not in ('pago-cuentas', 'pago-tarjeta', 'cobro', 'reembolso',
                      'apertura', 'ajuste', 'movimiento', 'reserva')
    and not (t.type = 'expense' and t.debt_id is not null)
    and (
      t.type in ('expense', 'refund', 'debt_payment')
      or (t.type = 'income' and c.root <> 'ahorro')
      or (t.type = 'adjustment' and t.description like 'Undo:%')
    );
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
  v_comprometido bigint := 0;
begin
  select
    coalesce(sum(m.delta) filter (where m.bucket = 'income'), 0),
    coalesce(sum(m.delta) filter (where m.bucket = 'necesidades'), 0),
    coalesce(sum(m.delta) filter (where m.bucket = 'consumo'), 0),
    coalesce(sum(m.delta) filter (where m.bucket = 'ahorro'), 0),
    coalesce(sum(m.delta) filter (where m.bucket = 'por_categorizar'), 0)
  into v_income, v_necesidades, v_consumo, v_ahorro, v_por_categorizar
  from _bucket_movements(v_start, v_end, p_entity) m;

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

-- Budget, spent and remaining per bucket for a month, plus the cumulative
-- spend by day so a client can draw how the bucket moved. budget is null when
-- no budget was ever set for that bucket.
create function get_bucket_budgets(
  p_month date default null,
  p_entity entity_type default 'personal'
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', coalesce(p_month, current_date))::date as start_on
  ),
  win as (
    select start_on, (start_on + interval '1 month' - interval '1 day')::date as end_on
    from bounds
  ),
  buckets(bucket, ord) as (
    values ('necesidades', 1), ('consumo', 2), ('ahorro', 3)
  ),
  moves as (
    select m.day, m.bucket, sum(m.delta)::bigint as delta
    from win, _bucket_movements(win.start_on, win.end_on, p_entity) m
    where m.bucket in ('necesidades', 'consumo', 'ahorro')
    group by m.day, m.bucket
  ),
  per_bucket as (
    select
      b.bucket,
      b.ord,
      (
        select bb.amount from bucket_budgets bb, win
        where bb.user_id = (select auth.uid())
          and bb.entity = p_entity
          and bb.bucket = b.bucket
          and bb.month <= win.start_on
        order by bb.month desc
        limit 1
      ) as budget,
      coalesce((select sum(mv.delta) from moves mv where mv.bucket = b.bucket), 0)::bigint as spent,
      coalesce((
        select jsonb_agg(
          jsonb_build_object('date', d.day, 'spent', d.cumulative)
          order by d.day
        )
        from (
          select mv.day, sum(mv.delta) over (order by mv.day)::bigint as cumulative
          from moves mv
          where mv.bucket = b.bucket
        ) d
      ), '[]'::jsonb) as daily
    from buckets b
  )
  select jsonb_build_object(
    'month', (select to_char(start_on, 'YYYY-MM') from win),
    'buckets', jsonb_agg(
      jsonb_build_object(
        'bucket', p.bucket,
        'budget', p.budget,
        'spent', p.spent,
        'remaining', case when p.budget is null then null else p.budget - p.spent end,
        'daily', p.daily
      )
      order by p.ord
    )
  )
  from per_bucket p;
$$;

revoke all on function _bucket_movements(date, date, entity_type) from public, anon;
grant execute on function _bucket_movements(date, date, entity_type) to authenticated;
revoke all on function get_bucket_budgets(date, entity_type) from public, anon;
grant execute on function get_bucket_budgets(date, entity_type) to authenticated;
