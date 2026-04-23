-- SpA Invoices: facturas emitidas y recibidas para F29

-- Enums
create type invoice_direction as enum ('emitida', 'recibida');
create type document_type as enum (
  'factura_afecta', 'factura_exenta', 'boleta',
  'factura_exportacion', 'nota_credito', 'nota_debito'
);

-- Table
create table spa_invoices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) not null,
  direction       invoice_direction not null,
  doc_type        document_type not null default 'factura_afecta',
  counterpart     text not null,
  description     text not null default '',
  neto            bigint not null,
  iva             bigint not null,
  total           bigint not null,
  folio_sii       text,
  date            date not null default current_date,
  status          invoice_status not null default 'draft',
  in_rcv          boolean not null default false,
  transaction_id  uuid references transactions(id),
  created_at      timestamptz not null default now()
);

create index idx_spa_invoices_user_date on spa_invoices(user_id, date desc);
create index idx_spa_invoices_direction on spa_invoices(user_id, direction);

-- RLS
alter table spa_invoices enable row level security;

create policy "spa_invoices_select" on spa_invoices
  for select using ((select auth.uid()) = user_id);
create policy "spa_invoices_insert" on spa_invoices
  for insert with check ((select auth.uid()) = user_id);
create policy "spa_invoices_update" on spa_invoices
  for update using ((select auth.uid()) = user_id);

-- Function 1: create_spa_invoice
create function create_spa_invoice(
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
    case
      when p_direction = 'recibida' then 'paid'
      when p_create_transaction then 'paid'
      else 'draft'
    end,
    case when p_direction = 'recibida' then true else false end
  ) returning * into v_invoice;

  if p_direction = 'emitida' and p_create_transaction and p_account_id is not null then
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

-- Function 2: mark_invoice_paid
create function mark_invoice_paid(
  p_invoice_id uuid,
  p_account_id uuid
) returns spa_invoices as $$
declare
  v_invoice spa_invoices;
  v_tx jsonb;
begin
  select * into strict v_invoice from spa_invoices
    where id = p_invoice_id and user_id = (select auth.uid());

  if v_invoice.direction != 'emitida' then
    raise exception 'Solo facturas emitidas pueden marcarse como pagadas';
  end if;
  if v_invoice.status = 'paid' then
    raise exception 'Factura ya está pagada';
  end if;

  v_tx := create_transaction(
    v_invoice.total, 'Facturacion', p_account_id,
    'FAC ' || v_invoice.counterpart || ' | Neto: ' || v_invoice.neto ||
    ' | IVA: ' || v_invoice.iva || ' | Total: ' || v_invoice.total,
    'income', current_date
  );

  update spa_invoices
    set status = 'paid', transaction_id = (v_tx->>'id')::uuid
    where id = p_invoice_id
  returning * into v_invoice;

  return v_invoice;
end;
$$ language plpgsql security definer;

-- Function 3: get_f29_summary (with remanente carry-forward)
create function get_f29_summary(p_year int, p_month int)
returns jsonb as $$
declare
  v_start date; v_end date;
  v_debito bigint; v_credito bigint; v_bruto bigint;
  v_remanente_anterior bigint := 0;
  v_credito_total bigint; v_iva_neto bigint;
  v_remanente_siguiente bigint; v_ppm bigint;
  v_m int; v_d bigint; v_c bigint;
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

  return jsonb_build_object(
    'year', p_year, 'month', p_month,
    'iva_debito', v_debito, 'iva_credito', v_credito,
    'remanente_anterior', v_remanente_anterior,
    'credito_total', v_credito_total,
    'iva_neto', v_iva_neto,
    'remanente_siguiente', v_remanente_siguiente,
    'ppm', v_ppm,
    'f29_total', v_iva_neto + v_ppm,
    'bruto', v_bruto
  );
end;
$$ language plpgsql security definer;

-- Function 4: get_spa_annual_summary
create function get_spa_annual_summary(p_year int)
returns jsonb as $$
declare
  v_months jsonb := '[]'::jsonb;
  v_m int; v_f29 jsonb;
  v_total_ventas_neto bigint; v_total_ventas_iva bigint;
  v_total_compras_neto bigint; v_total_compras_iva bigint;
  v_total_ppm bigint := 0;
begin
  select coalesce(sum(neto), 0), coalesce(sum(iva), 0)
    into v_total_ventas_neto, v_total_ventas_iva
    from spa_invoices where user_id = (select auth.uid())
      and direction = 'emitida' and extract(year from date) = p_year;

  select coalesce(sum(neto), 0), coalesce(sum(iva), 0)
    into v_total_compras_neto, v_total_compras_iva
    from spa_invoices where user_id = (select auth.uid())
      and direction = 'recibida' and extract(year from date) = p_year;

  for v_m in 1..12 loop
    v_f29 := get_f29_summary(p_year, v_m);
    v_total_ppm := v_total_ppm + (v_f29->>'ppm')::bigint;
    v_months := v_months || jsonb_build_object(
      'month', v_m,
      'debito', (v_f29->>'iva_debito')::bigint,
      'credito', (v_f29->>'iva_credito')::bigint,
      'remanente', (v_f29->>'remanente_siguiente')::bigint,
      'ppm', (v_f29->>'ppm')::bigint,
      'f29_total', (v_f29->>'f29_total')::bigint
    );
  end loop;

  return jsonb_build_object(
    'year', p_year,
    'ventas_neto', v_total_ventas_neto,
    'ventas_iva', v_total_ventas_iva,
    'compras_neto', v_total_compras_neto,
    'compras_iva', v_total_compras_iva,
    'total_ppm', v_total_ppm,
    'utilidad', v_total_ventas_neto - v_total_compras_neto,
    'meses', v_months
  );
end;
$$ language plpgsql security definer;
