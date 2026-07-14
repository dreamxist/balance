-- Single source of truth for monthly buckets (income / necesidades / consumo /
-- ahorro / por_categorizar / disponible). Replaces the frontend-only calculation
-- in use-monthly-breakdown.ts, which silently dumped NULL/unknown categories into
-- consumo and ignored entity, causing web and CLI to diverge.
--
-- Canonical semantics:
-- - Window: calendar month of p_month (default: current month).
-- - income = sum of type = 'income' in the month (entity filtered).
-- - Spent per bucket: expense adds, refund subtracts, grouped by category prefix
--   (necesidad%, consumo%, ahorro%).
-- - category NULL or unrecognized prefix -> bucket por_categorizar.
-- - adjustment never enters buckets.
-- - transfer counts only when its category matches ahorro% (existing convention:
--   savings to Fintual are transfers).
-- - disponible = income - (necesidades + consumo + ahorro + por_categorizar).

create function get_monthly_buckets(
  p_month date default null,
  p_entity entity_type default 'personal'
)
returns jsonb
language plpgsql
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
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    coalesce(sum(s.delta) filter (where s.bucket = 'necesidades'), 0),
    coalesce(sum(s.delta) filter (where s.bucket = 'consumo'), 0),
    coalesce(sum(s.delta) filter (where s.bucket = 'ahorro'), 0),
    coalesce(sum(s.delta) filter (where s.bucket = 'por_categorizar'), 0)
  into v_income, v_necesidades, v_consumo, v_ahorro, v_por_categorizar
  from transactions t
  cross join lateral (
    select
      case when t.type = 'refund' then -t.amount else t.amount end as delta,
      case
        when t.type = 'income' then null
        when lower(t.category) like 'necesidad%' then 'necesidades'
        when lower(t.category) like 'consumo%' then 'consumo'
        when lower(t.category) like 'ahorro%' then 'ahorro'
        else 'por_categorizar'
      end as bucket
  ) s
  where t.user_id = (select auth.uid())
    and t.entity = p_entity
    and t.date between v_start and v_end
    and (
      t.type in ('income', 'expense', 'refund')
      or (t.type = 'transfer' and lower(t.category) like 'ahorro%')
    );

  return jsonb_build_object(
    'income', v_income,
    'necesidades', v_necesidades,
    'consumo', v_consumo,
    'ahorro', v_ahorro,
    'por_categorizar', v_por_categorizar,
    'disponible', v_income - (v_necesidades + v_consumo + v_ahorro + v_por_categorizar),
    'month', to_char(v_start, 'YYYY-MM')
  );
end;
$$;
