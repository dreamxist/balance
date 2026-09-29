# Setup Fintoc Sync — cuenta corriente directo del banco (opcional)

`fintoc-sync` lee los movimientos de tu cuenta corriente con la API de
Movements de [Fintoc](https://fintoc.com) 2×/día. Sirve para lo que no genera
correo, sobre todo las compras con débito. Fintoc no trae tarjetas de crédito
en Chile: las compras con TC siguen entrando por `gmail-sync`
(`docs/setup-gmail.md`).

Cada usuario usa su propia cuenta de Fintoc; Balance no intermedia nada. Sin
estos secrets la función responde `{configured: false}` y `bal sync` sigue
funcionando solo con Gmail.

## 1. Cuenta Fintoc y llaves

1. Crea una cuenta en [dashboard.fintoc.com](https://dashboard.fintoc.com).
2. Cambia el dashboard a modo **live** y copia la **Secret Key** (`sk_live_…`).
   Las llaves `sk_test_` solo sirven con bancos simulados.

> Revisa en el dashboard si tu plan tiene costo por cuenta conectada antes de
> dejarlo corriendo.

## 2. Conectar tu banco (Link)

En modo live: **Links → crear Link → Chile · Banking · Individual**, elige tu
banco y entra con tus credenciales del portal web. Al terminar el dashboard
muestra el **Link Token** (`link_…_token_…`) **una sola vez**: guárdalo.

El Link Token equivale a tus credenciales del banco. Va solo como secret de
Supabase; nunca en `accounts.metadata`, en el repo ni en un chat.

Bancos soportados y permisos necesarios del usuario del portal:
[Products and Institutions](https://docs.fintoc.com/guides/movements/overview-data-aggregation/products-and-institutions-movements).

## 3. Cuentas en Balance

`promote_email_movements` resuelve la cuenta por `accounts.metadata`:

- La cuenta corriente declara su número (sin guiones ni ceros a la izquierda)
  en `bank_account_numbers`, como para Gmail.
- Las tarjetas que se pagan desde esa cuenta declaran `card_last4` y
  `card_currency` (`CLP` / `USD`), como para Gmail.

## 4. Secrets del proyecto Supabase

```bash
supabase secrets set \
  FINTOC_SECRET_KEY='sk_live_...' \
  FINTOC_LINK_TOKEN='link_..._token_...' \
  FINTOC_USER_ID='<uuid de tu usuario en auth.users>' \
  FINTOC_CUTOVER_DATE='YYYY-MM-DD' \
  FINTOC_TC_LAST4='<últimos 4 de la TC que se paga desde la cuenta>'
```

- `FINTOC_CUTOVER_DATE`: primer día que Fintoc es dueño de la cuenta corriente.
  Desde esa fecha `gmail-sync` deja de ingerir los correos de esa cuenta, así
  que cada movimiento tiene una sola fuente. Usa **mañana**: no hay backfill
  hacia atrás, porque traer movimientos previos duplicaría lo ya registrado.
- `FINTOC_TC_LAST4` (opcional): tarjeta que pagan los cargos automáticos
  "Cargo Por Pago Tc" / "Pago Tarjeta De Credito". Sin él, esos pagos quedan
  en `bal inbox` como error para resolver a mano.

## 5. Deploy y cron

```bash
supabase db push
supabase functions deploy fintoc-sync --no-verify-jwt
supabase functions deploy gmail-sync --no-verify-jwt   # para que lea el corte
```

`--no-verify-jwt` porque la función autentica sola (JWT del dueño o
`CRON_SECRET`). Programa el cron igual que `gmail-sync`
(`docs/setup-gmail.md` §5), 10 minutos después, apuntando a
`/functions/v1/fintoc-sync`.

## 6. Verificar

```bash
bal sync      # imprime el bloque "Fintoc desde <fecha>"
bal balance   # sin bloque SYNC = ambas fuentes sanas
```

## Si deja de sincronizar

Si cambias la clave del portal del banco, el Link pasa a `login_required`:
`fintoc-sync` falla y `bal balance` muestra el bloque **SYNC** con la causa.
Reconecta el Link desde el dashboard de Fintoc y actualiza
`FINTOC_LINK_TOKEN`.
