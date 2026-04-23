# Referencia de comandos `bal`

## bal login

Autentica contra el Edge Function `auth-apikey` usando una API key y persiste la sesión JWT en `~/.balance/session.json` (modo 0600).

```
bal login --api-key <bal_...>
bal login                       # usa BAL_API_KEY env
bal login --json                # output JSON
```

Flags:
- `--api-key <key>` — API key en formato `bal_<48hex>`. Fallback: env `BAL_API_KEY`.
- `--json` — imprime `{ok, expires_at}`.

La sesión dura ~1h. El cliente hace refresh automático antes de expirar. Si el refresh falla, corré `bal login` de nuevo.

## bal key create

Genera una API key nueva. Requiere auth con email + password para satisfacer RLS (`user_id = auth.uid()`).

```
bal key create --name "iphone"
```

Flags:
- `--name <label>` — **requerido**. Etiqueta humana (ej: "iphone", "laptop", "cli-scripts").
- `--email <e>` — fallback: env `BAL_EMAIL`.
- `--password <p>` — fallback: env `BAL_PASSWORD`. Preferí env vars para no dejar password en historial de shell.
- `--json` — output JSON con `{api_key, record}`.

**IMPORTANTE**: la key plaintext solo se imprime acá. Si la perdés, revocá esta y creá otra.

## bal key list

Lista API keys del usuario autenticado (no muestra plaintext, solo prefix).

```
bal key list
bal key list --include-revoked
bal key list --json
```

Flags:
- `--include-revoked` — incluye keys con `is_active=false`.
- `--email` / `--password` — o `BAL_EMAIL` / `BAL_PASSWORD` env.
- `--json`

## bal key revoke

Marca una key como inactiva (`is_active=false`). Reversible solo vía SQL directo.

```
bal key revoke <prefix_o_uuid>
```

Acepta prefix (ej: `bal_5b61ae61`) o uuid completo. Si el prefix matchea múltiples keys, falla — usá el uuid.

## bal add

Registra una transacción (expense por defecto).

```
bal add <monto> <categoría> --account <nombre|uuid> [flags]
```

Arguments:
- `<monto>` — entero en CLP. Aceptable: `8000`, `8.000`, `8,000`, `8 000`, `8_000`. El signo se ignora, el tipo determina el efecto.
- `<categoría>` — texto libre. Preferí categorías existentes: `consumo.libre`, `ahorro`, `comida`, `transporte`, `servicios`, `apertura`, `salud`, `entretenimiento`.

Flags:
- `--type expense|income|refund|adjustment` — default `expense`.
- `--account <nombre|uuid>` — **requerido**. Match fuzzy por nombre (ej: "checking" matchea "Checking"). Falla si ambiguo.
- `--note <text>` — descripción humana.
- `--date YYYY-MM-DD` — default hoy.
- `--json`

Efecto en el cuadre:
- `expense`, `income`, `refund`, `adjustment` → afectan `accumulated`.
- `transfer`, `debt_payment` → NO afectan `accumulated` (mueven plata, no la consumen/generan).

## bal balance

Estado de reconciliación + saldos por cuenta.

```
bal balance
bal balance --json
```

Output humano:
```
Posición        $X
Acumulado       $Y
Delta           $Z  [green|amber|red]
Cuadrado        sí|no

Cuentas:
  <nombre>      <saldo>
  ...
```

JSON:
```json
{
  "reconciliation": {
    "position": <int>,
    "accumulated": <int>,
    "delta": <int>,
    "is_balanced": <bool>,
    "delta_status": "green|amber|red"
  },
  "accounts": [ { "id", "name", "balance", "type", "subtype", ... } ]
}
```

## bal list

Lista transacciones del período.

```
bal list
bal list --period month
bal list --period week --category comida --json
```

Flags:
- `--period day|week|month` — default `week`.
  - `day`: hoy
  - `week`: últimos 7 días (incluye hoy)
  - `month`: desde el día 1 del mes corriente hasta hoy
- `--category <prefix>` — match por prefijo (ej: `--category consumo` matchea `consumo.libre` y `consumo.servicios`).
- `--account <nombre|uuid>` — filtrar por cuenta.
- `--type <tipo>` — uno de: `income`, `expense`, `refund`, `transfer`, `debt_payment`, `adjustment`.
- `--limit <n>` — default 100.
- `--json`

Output humano: agrupado por fecha, signo y amount. JSON: array de rows de `transactions`.
