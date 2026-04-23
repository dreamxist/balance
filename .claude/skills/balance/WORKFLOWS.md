# Flujos — cómo resolver pedidos del usuario

Los ejemplos usan nombres genéricos (`Checking`, `CC Visa`, `Wallet`, etc.). Adaptá al set de cuentas que el usuario tenga configurado.

## Registrar un gasto

Trigger: "anota 8k almuerzo", "gasté 15 mil en transporte", "pagué 38.500 de luz".

1. Extraer: monto, categoría, cuenta (si la mencionó), fecha (si la mencionó, default hoy), contexto para `--note`.
2. Si **no mencionó cuenta**, preguntá cuál usar. Cuentas típicas según contexto:
   - Gasto diario pequeño → cuenta de débito o efectivo.
   - Compra con tarjeta mencionada → la tarjeta de crédito correspondiente.
   - Cuenta bancaria genérica → una cuenta corriente del usuario.
3. Si **monto > $100.000**, mostrá el comando completo y pedí confirmación antes de ejecutar.
4. Correr `bal add <monto> <categoría> --account "<cuenta>" --note "<contexto>" --json`.
5. Confirmar éxito con monto formateado en CLP.

## Consultar estado financiero

Trigger: "¿cuánto tengo?", "¿cuánto llevo?", "estado de cuentas".

1. Correr `bal balance --json`.
2. Reportar:
   - Total (position) formateado.
   - Si `is_balanced: true` → "cuadrado, delta 0".
   - Si `is_balanced: false` → delta + status color.
3. Si pidió detalle, listar top 3-5 cuentas por `balance` desc.

## Revisar movimientos del período

Trigger: "qué gasté esta semana", "movimientos del mes", "últimos gastos".

1. Detectar período: "semana" → `week`, "mes" → `month`, "hoy" → `day`.
2. Detectar filtros adicionales: categoría, cuenta, tipo.
3. Correr `bal list --period <X> [filtros] --json`.
4. Presentar agrupado por fecha (ya lo hace el output humano). Si hay >20 rows, sumarizar por categoría.

## Cuadrar / diagnosticar delta ≠ 0

Trigger: "¿cuadré?", "¿está cuadrado?", "hay delta".

1. `bal balance --json` → leer `delta` y `is_balanced`.
2. Si cuadrado, responder simple: "sí, delta 0".
3. Si no cuadrado:
   - Reportar delta.
   - Sugerir `bal list --period month --type adjustment --json` para ver ajustes recientes que pueden haber creado el desfase.
   - El usuario probablemente tiene que ir a la UI web (`/movimientos` o `/configuracion`) para reconciliar.

## Parsear un correo de cargo y registrarlo

Trigger: el usuario pega un correo/screenshot con un cargo bancario.

1. Extraer campos:
   - Monto (del subject o body).
   - Comercio (Uber, cafetería, etc.).
   - Fecha (si viene explícita; si no, hoy).
   - Banco/tarjeta emisora → mapear a la cuenta que el usuario tenga configurada (tarjeta de crédito si dice "tarjeta", cuenta corriente si dice "giro"/"transferencia").
2. Inferir categoría por comercio:
   - Uber/Cabify/taxi → `transporte`
   - Cafetería → `comida` o `consumo.libre`
   - Streaming/apps → `servicios` o `entretenimiento`
   - Supermercado → `comida`
   - Farmacia → `salud`
3. **Antes de ejecutar**, mostrar al usuario lo que inferiste + el comando exacto. Esperar confirmación.
4. Correr `bal add` con los datos confirmados.

## Registrar un ingreso

Trigger: "cobré 500k", "me transfirieron 80 mil", "entró sueldo".

1. Mismo patrón que gasto, pero con `--type income`.
2. Cuenta por defecto: donde entró la plata (cuenta corriente del usuario).
3. Categoría típica: `sueldo`, `honorarios`, `reembolso`, o libre según contexto.

## Ver uso de una categoría

Trigger: "cuánto gasté en comida este mes", "total ahorro semana".

1. `bal list --period <x> --category <prefix> --type expense --json`.
2. Sumar `amount` de los rows devueltos.
3. Reportar total + count + (opcional) top 3 transacciones.
