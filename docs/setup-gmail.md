# Setup Gmail Sync — conciliación automática por correo

Pasos manuales (una sola vez) para que `gmail-sync` lea los correos bancarios
de tu Gmail 2×/día. Nada de esto bloquea el desarrollo del resto del feature.

## 1. Proyecto Google Cloud + OAuth client

1. Entra a [console.cloud.google.com](https://console.cloud.google.com) y crea
   un proyecto (ej. `balance-gmail-sync`).
2. **APIs & Services → Library**: habilita **Gmail API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**, publishing status **Testing** basta.
   - Agrega tu propio correo como *test user* (`tu-correo@gmail.com`).
   - Scope: `https://www.googleapis.com/auth/gmail.readonly`.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Desktop app** (necesario para el loopback local).
   - Guarda el **Client ID** y el **Client Secret**.

## 2. Obtener el refresh token

```bash
export GMAIL_CLIENT_ID='...apps.googleusercontent.com'
export GMAIL_CLIENT_SECRET='GOCSPX-...'
deno run --allow-net --allow-env scripts/gmail-auth.ts
```

El script imprime la URL de consentimiento, captura el código en
`http://127.0.0.1:8377` y termina imprimiendo el comando
`supabase secrets set` completo con el refresh token.

> Si no llega `refresh_token`, revisa que el cliente sea tipo **Desktop app**
> y que la URL incluyera `prompt=consent` (el script lo hace siempre).

## 3. Secrets del proyecto Supabase

```bash
supabase secrets set \
  GMAIL_CLIENT_ID='...' \
  GMAIL_CLIENT_SECRET='...' \
  GMAIL_REFRESH_TOKEN='...' \
  GMAIL_USER_ID='<uuid de tu usuario en auth.users>' \
  CRON_SECRET='<string aleatorio largo>'
```

- `GMAIL_USER_ID`: uuid de tu usuario (modo cron es single-user). Lo obtienes
  con `select id from auth.users;` en el SQL editor.
- `CRON_SECRET`: el mismo que ya usa `daily-charges`; si ya existe no lo
  regeneres (lo comparte el scheduler).

## 4. Deploy de la función

```bash
supabase functions deploy gmail-sync
```

## 5. Programar el cron (2×/día)

En el dashboard de Supabase → **Database → Cron** (pg_cron + pg_net), igual
que `daily-charges`, con horarios 11:00 y 23:00 UTC:

```sql
select cron.schedule(
  'gmail-sync-am',
  '0 11 * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/gmail-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
-- idem 'gmail-sync-pm' con '0 23 * * *'
```

## 6. Configurar el matching de cuentas

`promote_email_movements` matchea `account_hint` contra `accounts.metadata`.
Configura cada cuenta una vez (SQL editor o `bal`):

```sql
update accounts set metadata = metadata || '{"bank_account_numbers": ["1122334455"]}'
where name = 'Cuenta Corriente Banco de Chile';

update accounts set metadata = metadata || '{"card_last4": "1234"}'
where name = 'TC Banco de Chile';
```

Cuentas sin identificador: los correos que apunten a ellas quedan en
`email_movements` con `status='error'` y el detalle del hint — se revisan con
`bal inbox` o el panel "Por categorizar".

## 7. Probar

```bash
# manual con tu JWT (bal sync usa esto mismo)
curl -s "https://<project-ref>.supabase.co/functions/v1/gmail-sync?since=2026-07-01" \
  -H "Authorization: Bearer $USER_JWT" | jq

# respuesta esperada: {fetched, parsed, ignored, staged_errors, promoted, pending, errors, ...}
```

Backfill histórico: `?since=2026-06-01` (o `bal sync --since 2026-06-01`
cuando exista el comando, Fase 3). El dedup por `gmail_message_id` y
`bank_tx_id` hace que repetir el backfill sea inocuo.
