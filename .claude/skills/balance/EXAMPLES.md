# Ejemplos — prompts típicos → comando `bal`

Estos ejemplos son la base del skill. Si un caso nuevo no calza, pensá en el más cercano y adaptá. Reemplazá los nombres de cuenta (`Checking`, `CC Visa`, etc.) con los que el usuario haya configurado.

## Registrar gastos

| Prompt | Comando |
|---|---|
| "anota 8000 almuerzo en la cuenta corriente" | `bal add 8000 comida --account "Checking" --note "Almuerzo"` |
| "gasté 15 mil en transporte ayer" | `bal add 15000 transporte --account "Checking" --note "Viaje" --date <ayer>` |
| "pagué 38.500 de luz con la visa" | `bal add 38500 servicios --account "CC Visa" --note "Cuenta de luz"` |
| "café 4k" | (preguntar cuenta) → `bal add 4000 comida --account "<cuenta>" --note "Café"` |
| "supermercado 127 mil en cuenta corriente" | `bal add 127000 comida --account "Checking" --note "Supermercado"` |

## Ingresos

| Prompt | Comando |
|---|---|
| "entraron 800k de sueldo a la cuenta" | `bal add 800000 sueldo --type income --account "Checking" --note "Sueldo"` |
| "me transfirió un amigo 50 mil" | `bal add 50000 reembolso --type income --account "Checking" --note "Transferencia"` |

## Consultas de estado

| Prompt | Comando | Respuesta esperada |
|---|---|---|
| "¿cuánto tengo?" | `bal balance --json` | "Tenés $X en total. Cuadrado (delta 0)." + top 3 cuentas |
| "¿cuadré?" | `bal balance --json` | "Sí, delta 0." o "No, delta de $X [status]." |
| "muéstrame el balance" | `bal balance` | pasar el output humano tal cual |

## Movimientos

| Prompt | Comando |
|---|---|
| "qué gasté esta semana" | `bal list --period week --type expense --json` |
| "últimos movimientos" | `bal list --period week --json` |
| "gastos del mes en comida" | `bal list --period month --category comida --type expense --json` |
| "muéstrame los ahorros" | `bal list --period month --category ahorro --json` |
| "movimientos de hoy" | `bal list --period day --json` |
| "qué gasté con la visa este mes" | `bal list --period month --account "CC Visa" --type expense --json` |

## Totales / sumarios

| Prompt | Estrategia |
|---|---|
| "cuánto llevo gastado este mes" | `bal list --period month --type expense --json` → sumar `amount` |
| "total café mes" | `bal list --period month --category comida --json` → filtrar descripciones con "café" en local y sumar |
| "ahorros del mes" | `bal list --period month --category ahorro --json` → sumar |

## Correos de cargo (flujo con confirmación)

Input: correo con "Se realizó un cargo de $5.200 con tu tarjeta de crédito terminada en 1234, el 22/04/2026".

1. Extraigo:
   - monto: 5200
   - cuenta: la tarjeta que el usuario tenga configurada (ej. `CC Visa`)
   - categoría sugerida: `comida` (o `consumo.libre`)
   - nota: extracto del email
   - fecha: 2026-04-22
2. Mostrar al usuario:
   > Voy a registrar: **$5.200** en **comida**, cuenta **CC Visa**, nota "...", fecha 2026-04-22. ¿Confirmás?
3. Si confirma, correr:
   `bal add 5200 comida --account "CC Visa" --note "..." --date 2026-04-22 --json`

## Edge cases

| Prompt ambiguo | Acción |
|---|---|
| "gasté 10k" (sin categoría ni cuenta) | Preguntá categoría **y** cuenta antes de correr nada. |
| "anota un café" (sin monto) | Preguntá monto. |
| "15.5 almuerzo" (monto con decimal) | El CLI rechaza. Preguntá si quiso decir 15500 o 15000. |
| "cuánto gasté en viajes" (categoría inexistente) | Correr con `--category viaj` o `transporte` y aclarar al usuario qué filtro usaste. |
