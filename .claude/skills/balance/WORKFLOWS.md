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

---

# Flujos SpA / empresa

La SpA es una **entidad separada** (`entity='spa'`, off-budget). Su actividad NO afecta el cuadre personal. Para todo lo de empresa usá el grupo `bal spa` y `--entity spa`.

## Facturar una venta

Trigger: "emití una factura", "facturé X a <cliente>".

1. Extraer: **neto** (el IVA lo calcula el sistema), cliente, tipo de documento, fecha.
   - Venta nacional con IVA → `factura_afecta` (default).
   - Exportación de servicios → `factura_exportacion` (IVA 0). Si viene en USD, convertir a CLP.
2. ¿Ya está cobrada? Si sí → `--create-transaction` (entra a la caja SpA). Si no → omitir (queda `draft`; igual cuenta para el IVA débito del F29).
3. Correr `bal spa invoice create --direction emitida --counterpart "<cliente>" --neto <neto> --doc-type <tipo> [--create-transaction] [--account <cuenta spa>] [--folio] [--date]`.

## Registrar una compra / gasto de la empresa

Trigger: "compré X para la SpA", "gasto de la empresa".

- **Nacional con IVA recuperable** (RUT chileno) → `bal spa invoice create --direction recibida --counterpart "<proveedor>" --neto <neto>` (suma IVA crédito al F29).
- **Extranjera / SaaS sin IVA crédito** → `bal spa gasto <monto> <categoría> [--moneda USD --tc <tc>]` (es costo para renta anual, no entra al F29 mensual).
- Si el usuario lo pagó de su bolsillo y la SpA le debe → es un **reembolsable**: gasto personal (`bal add ... --account "<cuenta personal>"`) y luego la SpA lo salda con `bal spa sueldo`/transferencia.

## Cierre mensual de IVA (F29)

Trigger: "cierre del mes", "¿cuánto pago de IVA?", "F29".

1. `bal spa f29 YYYY-MM --json` → revisar IVA débito, crédito, remanente, total a pagar (estimación).
2. El usuario declara en el SII (fuera de Balance). El **F29 oficial manda**.
3. Cuando declare, cargar los códigos oficiales: `bal spa f29-declarar YYYY-MM --codigo 538=<débito> --codigo 091=<a pagar> --folio <confirmación>`.
4. Si el IVA se pagó desde la caja SpA, registrar el egreso (`bal spa gasto` o ajuste).

## Pagarse sueldo de empresario

Trigger: "me pagué sueldo", "retiro de la SpA".

1. `bal spa sueldo <monto> --to "<cuenta personal>" [--date]`.
2. Mueve plata SpA→Personal (transferencia inter-entidad). Confirmá monto y cuenta destino antes si es > $100.000.

## Estado y patrimonio

Trigger: "¿cuánto tiene la SpA?", "patrimonio total", "¿cuánto neto?".

1. Caja SpA: `bal balance --entity spa --json`.
2. Año: `bal spa annual --json` (ventas, compras, utilidad, PPM).
3. Patrimonio: `bal patrimonio` (bruto personal + SpA). Para simular post-impuestos: `bal patrimonio --neto --tasa <%>` (es estimación de caja, NO la RLI tributaria — aclararlo).
