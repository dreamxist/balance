---
name: balance
description: Interactúa con el CLI `bal` para gestionar finanzas personales Y de una SpA/empresa (app Balance con Supabase). Usa cuando el usuario menciona registrar un gasto o ingreso, consultar saldo, ver movimientos, cuadrar cuentas, o nombra cuentas de débito/crédito/efectivo/inversiones — y también para la SpA: facturar, IVA, F29, cierre mensual, sueldo de empresario, patrimonio bruto/neto. Requiere que `bal login` ya haya corrido (sesión en ~/.balance/session.json) o que BAL_API_KEY esté exportada.
allowed-tools: Bash(bal *) Bash(node *) Bash(npx *)
---

# Balance — CLI de finanzas del usuario (personal + SpA)

El CLI `bal` es la interfaz principal para hablar con la base de datos de finanzas (Supabase). El modelo core es **Balance Assertion with Reconciliation**: cada peso está ubicado (en una cuenta) y explicado (por una transacción). El cuadre se mide por `delta = posición - acumulado` y debe ser 0.

## Dos entidades: personal y SpA

Balance maneja **una economía personal** y, opcionalmente, una **SpA/empresa**, separadas por el campo `entity` (`personal` | `spa`):

- **Personal** → cuentas `on_budget=true`, tienen **cuadre** (delta 0). Comandos: `bal add`, `bal balance`, `bal list`.
- **SpA** → cuentas `entity='spa'`, `on_budget=false` → cuentan en **patrimonio (bruto, pre-impuestos)** pero NO en tu cuadre personal. La reconciliación filtra por entidad, así que la SpA nunca rompe tu delta personal. Comandos: el grupo `bal spa` (facturas, F29, sueldo, anual) + `bal balance --entity spa`.

Regla práctica: para lo personal usá los comandos base; para la empresa usá `bal spa` y `--entity spa`. Ante la duda de a qué entidad pertenece algo, preguntá.

## Cuándo activar este skill

- Menciones de montos en CLP ("8k", "15 mil", "$20.000") junto a verbos como gasté, pagué, anoté, cobré, transferí.
- Preguntas de estado: "¿cuánto tengo?", "¿cuadré?", "¿cuánto llevo este mes?".
- Pedidos sobre movimientos: "últimos gastos", "qué gasté en X", "muéstrame Y".
- Cuentas configuradas por el usuario: débito, tarjetas de crédito, efectivo, inversiones (Broker/Fintual), cuentas por cobrar/pagar.
- Categorías del dominio: `consumo.libre`, `ahorro`, `comida`, `transporte`, `servicios`, `apertura`.

**SpA / empresa** (usar el grupo `bal spa`):
- Facturación: "emití una factura", "facturé a <cliente>", "nota de crédito".
- Impuestos: "IVA del mes", "F29", "cierre mensual", "cuánto declaré", "remanente".
- Sueldo de empresario: "me pagué sueldo", "retiro", "sueldo empresarial".
- Estado SpA: "cuánto tiene la SpA", "caja de la empresa", "utilidad/ventas/compras del año".
- Patrimonio: "patrimonio total", "cuánto tengo neto/bruto", simulación post-impuestos.

## Archivos relacionados (cargar on-demand)

- [COMMANDS.md](COMMANDS.md) — referencia completa de cada comando y sus flags.
- [WORKFLOWS.md](WORKFLOWS.md) — flujos típicos (registrar gasto, consultar, parsear correos).
- [EXAMPLES.md](EXAMPLES.md) — tabla de prompts reales → comando exacto.

## Reglas innegociables

1. **Siempre `--json` para parsear**. El output humano es para mostrarle al usuario, no para consumir.
2. **CLP sin decimales**. Los montos son enteros. `8.5` no es válido; `8500` sí. El parser acepta separadores de miles (`8.000`, `8,000`).
3. **`--account` es obligatorio en `bal add`**. Si el usuario no lo menciona, preguntá antes de ejecutar — no asumas.
4. **Montos >$100.000 requieren confirmación** antes de correr `bal add`. Mostrá monto + categoría + cuenta y pedí sí/no.
5. **No reintentes `bal login` más de una vez**. Si falla, pedile al usuario que genere una API key nueva con `bal key create --name "<device>"`.
6. **Signo en la salida**: expense/debt_payment siempre se muestran con `-`, income/refund con `+`, adjustment/transfer siguen el signo natural del monto.

## Setup que debe existir antes de que funcione

Env vars requeridas en la terminal donde corre `bal`:
- `SUPABASE_URL=https://<your-project-ref>.supabase.co`
- `SUPABASE_ANON_KEY=sb_publishable_...`
- Opcional: `BAL_API_KEY=bal_...` (para `bal login` sin prompt)

Primera vez:
```
bal key create --name "mi-device"     # pide email+password, imprime key plaintext UNA vez
bal login --api-key bal_...           # guarda sesión JWT en ~/.balance/session.json
```

De ahí en adelante, los comandos de lectura/escritura usan la sesión automáticamente y la refrescan antes de expirar.

## Si el CLI no está instalado globalmente

Desde la raíz del repo `balance`:
```
npx tsx apps/cli/src/index.ts <comando>
```
o, con build:
```
node apps/cli/dist/index.js <comando>
```
