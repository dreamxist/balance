-- =============================================================================
-- F29: the declared values must survive the round trip
-- =============================================================================
-- Two problems this fixes, both visible after declaring a period with official
-- SII codes:
--
--   1. get_f29_summary only exposed declared_at / confirmation_number / notes,
--      so the summary kept showing the app's own estimate. A period declared
--      from the real form looked empty whenever its invoices were not loaded
--      yet, and there was no way to read back what was declared.
--
--   2. mark_f29_declared derived ppm as (091 - iva_neto). The SII notice only
--      states the total to pay, so declaring with code 091 alone booked the
--      whole amount as PPM — a breakdown nobody provided.
-- =============================================================================

-- 1. mark_f29_declared — only derive the breakdown when an IVA code is present
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
  v_has_iva_codes boolean;
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

    v_has_iva_codes := (p_official_codes ? '538') or (p_official_codes ? '502')
                    or (p_official_codes ? '537') or (p_official_codes ? '520');

    if v_has_iva_codes then
      v_iva_neto := greatest(v_debito - v_credito - v_rem_ant, 0);
      -- ppm derived as (091 − iva_neto): exact only for a normal F29 (IVA + PPM)
      -- without reajustes/multas/intereses/retenciones.
      v_ppm := greatest(v_f29_total - v_iva_neto, 0);
    else
      -- Only the total to pay is known. Leaving the breakdown at zero keeps the
      -- declaration honest: the raw codes stay in official_codes for audit, and
      -- f29_total still carries what has to be paid.
      v_iva_neto := 0;
      v_ppm := 0;
    end if;
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

-- 2. get_f29_summary — expose the declared values, not just the declaration date
create or replace function get_f29_summary(p_year int, p_month int)
returns jsonb as $$
declare
  v_start date; v_end date;
  v_debito bigint; v_credito bigint; v_bruto bigint;
  v_remanente_anterior bigint := 0;
  v_credito_total bigint; v_iva_neto bigint;
  v_remanente_siguiente bigint; v_ppm bigint;
  v_m int; v_d bigint; v_c bigint;
  v_deadline date;
  v_declared spa_f29_declarations;
  v_declared_json jsonb;
begin
  for v_m in 1..(p_month - 1) loop
    select coalesce(sum(iva), 0) into v_d from spa_invoices
      where user_id = (select auth.uid()) and direction = 'emitida'
        and doc_type = 'factura_afecta'
        and extract(year from date) = p_year and extract(month from date) = v_m;

    select coalesce(sum(iva), 0) into v_c from spa_invoices
      where user_id = (select auth.uid()) and direction = 'recibida'
        and in_rcv = true
        and extract(year from date) = p_year and extract(month from date) = v_m;

    v_c := v_c + v_remanente_anterior;
    if v_c > v_d then
      v_remanente_anterior := v_c - v_d;
    else
      v_remanente_anterior := 0;
    end if;
  end loop;

  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + interval '1 month' - interval '1 day')::date;

  select coalesce(sum(iva), 0) into v_debito from spa_invoices
    where user_id = (select auth.uid()) and direction = 'emitida'
      and doc_type = 'factura_afecta' and date between v_start and v_end;

  select coalesce(sum(iva), 0) into v_credito from spa_invoices
    where user_id = (select auth.uid()) and direction = 'recibida'
      and in_rcv = true and date between v_start and v_end;

  select coalesce(sum(neto), 0) into v_bruto from spa_invoices
    where user_id = (select auth.uid()) and direction = 'emitida'
      and date between v_start and v_end;

  v_credito_total := v_credito + v_remanente_anterior;
  v_iva_neto := greatest(v_debito - v_credito_total, 0);
  v_remanente_siguiente := greatest(v_credito_total - v_debito, 0);
  v_ppm := round(v_bruto * 0.0025);

  -- Deadline: día 20 del mes siguiente (facturador electrónico con pago en linea)
  v_deadline := (v_end + interval '20 days')::date;

  -- Declaración existente?
  select * into v_declared from spa_f29_declarations
    where user_id = (select auth.uid())
      and year = p_year and month = p_month
    limit 1;

  if found then
    v_declared_json := jsonb_build_object(
      'declared_at', v_declared.declared_at,
      'confirmation_number', v_declared.confirmation_number,
      'notes', v_declared.notes,
      'is_official', v_declared.is_official,
      'official_codes', v_declared.official_codes,
      'iva_debito', v_declared.iva_debito,
      'iva_credito', v_declared.iva_credito,
      'remanente_anterior', v_declared.remanente_anterior,
      'remanente_siguiente', v_declared.remanente_siguiente,
      'iva_neto', v_declared.iva_neto,
      'ppm', v_declared.ppm,
      'f29_total', v_declared.f29_total
    );
  else
    v_declared_json := null;
  end if;

  return jsonb_build_object(
    'year', p_year, 'month', p_month,
    'iva_debito', v_debito, 'iva_credito', v_credito,
    'remanente_anterior', v_remanente_anterior,
    'credito_total', v_credito_total,
    'iva_neto', v_iva_neto,
    'remanente_siguiente', v_remanente_siguiente,
    'ppm', v_ppm,
    'f29_total', v_iva_neto + v_ppm,
    'bruto', v_bruto,
    'deadline', v_deadline,
    'declared', v_declared_json
  );
end;
$$ language plpgsql security definer;
