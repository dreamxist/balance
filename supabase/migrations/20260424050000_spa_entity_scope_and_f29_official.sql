-- Entity-scoped reconciliation + official F29 codes + SpA invoice hardening.
--
-- Builds on 20260424033500 / 20260424034500 (which added the on_budget filter to
-- accumulated). This migration:
--   1. Adds an OPTIONAL entity filter to get_reconciliation_status(p_entity) and
--      scopes the reconciliation_status view to entity='personal', so SpA activity
--      (off-budget) never breaks the personal delta. Default p_entity null = all.
--   2. Corrects the refund sign: refund is money coming back (+amount), matching the
--      BUG03 fix — the intermediate on_budget migrations grouped refund with expense
--      (-amount), which would unbalance books that have refunds. This restores +amount.
--   3. mark_f29_declared stores the official SII codes (is_official/official_codes) so
--      the declared F29 is the source of truth, not the app estimate.
--   4. create_spa_invoice: cast status to invoice_status (00027 bug) + caller ownership
--      check before booking cash.

-- =============================================================================
-- 1 + 2. get_reconciliation_status(p_entity) — entity-scoped, refund=+amount
-- =============================================================================
drop function if exists get_reconciliation_status();
drop function if exists get_reconciliation_status(entity_type);

create function get_reconciliation_status(p_entity entity_type default null)
returns jsonb as $$
declare
  v_position bigint;
  v_accumulated bigint;
  v_delta bigint;
  v_status text;
begin
  -- Position = sum of on_budget, non-archived account balances (entity-scoped)
  select coalesce(sum(a.balance), 0) into v_position
  from accounts a
  where not a.is_archived
    and a.on_budget = true
    and a.user_id = (select auth.uid())
    and (p_entity is null or a.entity = p_entity);

  -- Accumulated = signed flows over on_budget accounts (entity-scoped).
  -- refund is +amount (money coming back), symmetric to income.
  select coalesce(sum(
    case
      when t.type = 'income' then t.amount
      when t.type = 'refund' then t.amount
      when t.type = 'expense' then -t.amount
      when t.type = 'adjustment' then t.amount
      else 0
    end
  ), 0) into v_accumulated
  from transactions t
  join accounts a on a.id = t.account_id
  where t.type in ('income', 'expense', 'refund', 'adjustment')
    and t.user_id = (select auth.uid())
    and a.on_budget = true
    and (p_entity is null or a.entity = p_entity);

  v_delta := v_position - v_accumulated;
  v_status := case
    when v_delta = 0 then 'green'
    when abs(v_delta) <= 1000 then 'amber'
    else 'red'
  end;

  return jsonb_build_object(
    'position', v_position,
    'accumulated', v_accumulated,
    'delta', v_delta,
    'is_balanced', v_delta = 0,
    'delta_status', v_status,
    'entity', p_entity
  );
end;
$$ language plpgsql security invoker;

-- reconciliation_status view — scoped to personal (dashboard/CLI default cuadre).
-- For per-entity or global use get_reconciliation_status(p_entity).
drop view if exists reconciliation_status;

create view reconciliation_status with (security_invoker = true) as
with pos as (
  select coalesce(sum(a.balance), 0) as v
  from accounts a
  where not a.is_archived
    and a.on_budget = true
    and a.entity = 'personal'
    and a.user_id = (select auth.uid())
),
acc as (
  select coalesce(sum(
    case
      when t.type = 'income' then t.amount
      when t.type = 'refund' then t.amount
      when t.type = 'expense' then -t.amount
      when t.type = 'adjustment' then t.amount
      else 0
    end
  ), 0) as v
  from transactions t
  join accounts a on a.id = t.account_id
  where t.type in ('income', 'expense', 'refund', 'adjustment')
    and t.user_id = (select auth.uid())
    and a.on_budget = true
    and a.entity = 'personal'
)
select pos.v as position, acc.v as accumulated, (pos.v - acc.v) as delta
from pos, acc;

-- =============================================================================
-- 3. mark_f29_declared — accept official SII codes as source of truth
-- =============================================================================
alter table spa_f29_declarations
  add column if not exists is_official boolean not null default false,
  add column if not exists official_codes jsonb;

drop function if exists mark_f29_declared(int, int, date, text, text);

create or replace function mark_f29_declared(
  p_year                int,
  p_month               int,
  p_declared_at         date default current_date,
  p_confirmation_number text default null,
  p_notes               text default null,
  p_official_codes      jsonb default null
) returns spa_f29_declarations as $$
declare
  v_summary jsonb;
  v_result spa_f29_declarations;
  v_debito bigint; v_credito bigint; v_rem_ant bigint;
  v_rem_sig bigint; v_iva_neto bigint; v_ppm bigint; v_f29_total bigint;
begin
  v_summary := get_f29_summary(p_year, p_month);

  if p_official_codes is null then
    v_debito    := (v_summary->>'iva_debito')::bigint;
    v_credito   := (v_summary->>'iva_credito')::bigint;
    v_rem_ant   := (v_summary->>'remanente_anterior')::bigint;
    v_rem_sig   := (v_summary->>'remanente_siguiente')::bigint;
    v_iva_neto  := (v_summary->>'iva_neto')::bigint;
    v_ppm       := (v_summary->>'ppm')::bigint;
    v_f29_total := (v_summary->>'f29_total')::bigint;
  else
    -- Official SII codes win. Canonical mapping (F29 codes):
    --   538/502 = débito IVA ; 537/520 = crédito ; 504 = remanente anterior
    --   077 = remanente siguiente ; 091 = total a pagar (f29_total)
    v_debito  := coalesce((p_official_codes->>'538')::bigint, (p_official_codes->>'502')::bigint, 0);
    v_credito := coalesce((p_official_codes->>'537')::bigint, (p_official_codes->>'520')::bigint, 0);
    v_rem_ant := coalesce((p_official_codes->>'504')::bigint, 0);
    v_rem_sig := coalesce((p_official_codes->>'077')::bigint, (p_official_codes->>'77')::bigint, 0);
    v_f29_total := coalesce((p_official_codes->>'091')::bigint, (p_official_codes->>'91')::bigint, 0);
    v_iva_neto := greatest(v_debito - v_credito - v_rem_ant, 0);
    -- ppm derived as (091 − iva_neto): exact only for a normal F29 (IVA + PPM) without
    -- reajustes/multas/intereses/retenciones. Raw codes kept in official_codes for audit.
    v_ppm := greatest(v_f29_total - v_iva_neto, 0);
  end if;

  insert into spa_f29_declarations (
    user_id, year, month, declared_at, confirmation_number,
    iva_debito, iva_credito, remanente_anterior, remanente_siguiente,
    iva_neto, ppm, f29_total, notes, is_official, official_codes
  ) values (
    (select auth.uid()), p_year, p_month, p_declared_at, p_confirmation_number,
    v_debito, v_credito, v_rem_ant, v_rem_sig,
    v_iva_neto, v_ppm, v_f29_total, p_notes,
    p_official_codes is not null, p_official_codes
  )
  on conflict (user_id, year, month) do update
    set declared_at = excluded.declared_at,
        confirmation_number = excluded.confirmation_number,
        iva_debito = excluded.iva_debito,
        iva_credito = excluded.iva_credito,
        remanente_anterior = excluded.remanente_anterior,
        remanente_siguiente = excluded.remanente_siguiente,
        iva_neto = excluded.iva_neto,
        ppm = excluded.ppm,
        f29_total = excluded.f29_total,
        notes = excluded.notes,
        is_official = excluded.is_official,
        official_codes = excluded.official_codes
  returning * into v_result;

  return v_result;
end;
$$ language plpgsql security definer;

-- =============================================================================
-- 4. Fix create_spa_invoice: cast status to invoice_status (00027 bug) + ownership
-- =============================================================================
create or replace function create_spa_invoice(
  p_direction       invoice_direction,
  p_counterpart     text,
  p_neto            bigint,
  p_doc_type        document_type default 'factura_afecta',
  p_description     text default '',
  p_folio_sii       text default null,
  p_date            date default current_date,
  p_account_id      uuid default null,
  p_create_transaction boolean default false
) returns spa_invoices as $$
declare
  v_iva bigint;
  v_total bigint;
  v_invoice spa_invoices;
  v_tx jsonb;
begin
  v_iva := case
    when p_doc_type in ('factura_afecta', 'boleta') then round(p_neto * 0.19)
    else 0
  end;
  v_total := p_neto + v_iva;

  insert into spa_invoices (
    user_id, direction, doc_type, counterpart, description,
    neto, iva, total, folio_sii, date, status, in_rcv
  ) values (
    (select auth.uid()), p_direction, p_doc_type, p_counterpart, p_description,
    p_neto, v_iva, v_total, p_folio_sii, p_date,
    (case
      when p_direction = 'recibida' then 'paid'
      when p_create_transaction then 'paid'
      else 'draft'
    end)::invoice_status,
    case when p_direction = 'recibida' then true else false end
  ) returning * into v_invoice;

  if p_direction = 'emitida' and p_create_transaction and p_account_id is not null then
    -- Defense-in-depth: only let the caller book cash into their OWN account.
    if not exists (select 1 from accounts where id = p_account_id and user_id = (select auth.uid())) then
      raise exception 'Account not found or unauthorized' using errcode = '42501';
    end if;
    v_tx := create_transaction(
      v_total, 'Facturacion', p_account_id,
      'FAC ' || p_counterpart || ' | Neto: ' || p_neto || ' | IVA: ' || v_iva || ' | Total: ' || v_total,
      'income', p_date
    );
    update spa_invoices
      set transaction_id = (v_tx->>'id')::uuid
      where id = v_invoice.id;
    v_invoice.transaction_id := (v_tx->>'id')::uuid;
  end if;

  return v_invoice;
end;
$$ language plpgsql security definer;
