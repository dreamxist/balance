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

Estado de reconciliación + saldos por cuenta, **por entidad**.

```
bal balance                       # cuadre PERSONAL (default)
bal balance --entity personal     # explícito
bal balance --entity spa          # caja SpA (off-budget): saldo + ingresos/gastos del mes + IVA estimado
bal balance --entity all          # sin filtro de entidad
bal balance --json
```

Flags:
- `--entity personal|spa|all` — default `personal`. `spa` muestra la caja de la segunda entidad (no un delta de cuadre, porque la SpA es off-budget). `all` no filtra.

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
- `--entity personal|spa|all` — default `all`. Filtra por entidad.
- `--limit <n>` — default 100.
- `--json`

Output humano: agrupado por fecha, signo y amount. JSON: array de rows de `transactions`.

---

# Entidades: personal vs SpA

Balance maneja **dos entidades** en la misma base: tu economía **personal** y, opcionalmente, una **SpA** (u otra empresa). El campo `entity` (`personal` | `spa`) separa cuentas y transacciones.

- **Personal**: cuentas `on_budget=true`. Tienen cuadre (delta = posición − acumulado = 0).
- **SpA**: cuentas `entity='spa'`, típicamente `on_budget=false` → cuentan en patrimonio (bruto, pre-impuestos) pero **NO** entran a tu cuadre personal. La reconciliación está filtrada por entidad, así que la actividad SpA nunca rompe tu delta personal.

`bal add --account "<cuenta spa>"` hereda `entity=spa` automáticamente (lo determina la cuenta). Para operar la SpA en forma idiomática, usá el grupo `bal spa`.

# Grupo `bal spa`

Facturación, gastos, F29, sueldo y resumen anual de la segunda entidad. Los comandos de lectura aceptan `--json`.

## bal spa dashboard

Cuentas SpA + ingresos/gastos del mes + IVA debido.

```
bal spa dashboard [--json]
```

## bal spa invoice list

Lista facturas del período.

```
bal spa invoice list [--direction emitida|recibida] [--month YYYY-MM] [--json]
```

## bal spa invoice create

Crea una factura (emitida o recibida; el IVA se calcula server-side).

```
bal spa invoice create --direction <emitida|recibida> --counterpart "<nombre>" --neto <monto> [--doc-type <tipo>] [--folio N] [--date YYYY-MM-DD] [--account <nombre|id>] [--create-transaction]
```
- `--direction` — **requerido**. `emitida` = venta (IVA débito); `recibida` = compra nacional (IVA crédito).
- `--doc-type` — `factura_afecta` (default, IVA 19%) · `factura_exenta` · `factura_exportacion` (export, IVA 0) · `boleta` · `nota_credito`.
- `--create-transaction` — además registra la transacción en caja (cobro/pago). Sin esto, queda en estado draft (las emitidas igual cuentan para el IVA débito).

## bal spa invoice pay

Marca una factura como pagada, liquidando el saldo en una cuenta.

```
bal spa invoice pay <invoiceId> --account <nombre|id>
```

## bal spa gasto

Gasto de la SpA (ej. SaaS extranjero, **sin IVA crédito**). Convierte USD→CLP.

```
bal spa gasto <monto> <categoría> [--moneda CLP|USD] [--tc <CLP/USD>] [--account <nombre|id>] [--note "<texto>"] [--date YYYY-MM-DD]
```
- `--moneda USD --tc 950` — convierte al tipo de cambio dado (acepta centavos: `8.49`) y guarda el original en la nota.
- La cuenta SpA se resuelve sola si hay una sola; si pasás `--account`, valida que sea `entity='spa'`.

## bal spa f29

Resumen F29 (estimación) de un mes.

```
bal spa f29 <YYYY-MM> [--json]
```

## bal spa f29-declarar

Marca un F29 como declarado y **guarda los códigos oficiales del SII** (fuente de verdad sobre la estimación de la app).

```
bal spa f29-declarar <YYYY-MM> [--codigo 538=380000] [--codigo 091=380355] [--folio <confirmación>] [--date YYYY-MM-DD] [--json]
```
- `--codigo <cod=valor>` — repetible. Canónicos: `538/502` débito, `537/520` crédito, `504` remanente anterior, `077` remanente siguiente, `091` total a pagar.

## bal spa sueldo

Sueldo empresarial SpA→Personal (transferencia inter-entidad).

```
bal spa sueldo <monto> --to "<cuenta personal>" [--account <cuenta spa>] [--note "<texto>"] [--date YYYY-MM-DD]
```

## bal spa annual

Resumen anual: ventas, compras, utilidad, PPM.

```
bal spa annual [year] [--json]
```

# bal patrimonio

Patrimonio **bruto** (personal + SpA) y **neto** estimado post-impuestos.

```
bal patrimonio                    # bruto: personal + SpA
bal patrimonio --neto             # resta provisión de renta SpA (estimación, no RLI)
bal patrimonio --neto --tasa 12.5 # tasa de renta SpA configurable (%)
```
