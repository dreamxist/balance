-- F29 declaration tracking: cuándo declaraste cada periodo

create table spa_f29_declarations (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) not null,
  year                int not null,
  month               int not null,
  declared_at         date not null,
  confirmation_number text,
  -- Snapshot of values at declaration time
  iva_debito          bigint not null,
  iva_credito         bigint not null,
  remanente_anterior  bigint not null default 0,
  remanente_siguiente bigint not null default 0,
  iva_neto            bigint not null,
  ppm                 bigint not null,
  f29_total           bigint not null,
  notes               text,
  created_at          timestamptz not null default now(),
  unique (user_id, year, month)
);

create index idx_f29_declarations_user on spa_f29_declarations(user_id, year desc, month desc);

alter table spa_f29_declarations enable row level security;

create policy "f29_declarations_select" on spa_f29_declarations
  for select using ((select auth.uid()) = user_id);
create policy "f29_declarations_insert" on spa_f29_declarations
  for insert with check ((select auth.uid()) = user_id);
create policy "f29_declarations_update" on spa_f29_declarations
  for update using ((select auth.uid()) = user_id);

-- Marca un F29 como declarado (captura snapshot del cálculo)
create function mark_f29_declared(
  p_year                int,
  p_month               int,
  p_declared_at         date default current_date,
  p_confirmation_number text default null,
  p_notes               text default null
) returns spa_f29_declarations as $$
declare
  v_summary jsonb;
  v_result spa_f29_declarations;
begin
  v_summary := get_f29_summary(p_year, p_month);

  insert into spa_f29_declarations (
    user_id, year, month, declared_at, confirmation_number,
    iva_debito, iva_credito, remanente_anterior, remanente_siguiente,
    iva_neto, ppm, f29_total, notes
  ) values (
    (select auth.uid()), p_year, p_month, p_declared_at, p_confirmation_number,
    (v_summary->>'iva_debito')::bigint,
    (v_summary->>'iva_credito')::bigint,
    (v_summary->>'remanente_anterior')::bigint,
    (v_summary->>'remanente_siguiente')::bigint,
    (v_summary->>'iva_neto')::bigint,
    (v_summary->>'ppm')::bigint,
    (v_summary->>'f29_total')::bigint,
    p_notes
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
        notes = excluded.notes
  returning * into v_result;

  return v_result;
end;
$$ language plpgsql security definer;

-- Actualiza get_f29_summary para incluir info de deadline y declaración
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
      'notes', v_declared.notes
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
