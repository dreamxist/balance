# Balance App — Flujos de trabajo

Patron: **Balance Assertion with Reconciliation**

---

## Modelo conceptual

La app mantiene dos fuentes de verdad que deben coincidir:

```
FUENTE A: Posicion financiera (balance assertions)
  "Hoy tengo X en mis cuentas, me deben Y, debo Z"
  = snapshot declarativo del mundo real

FUENTE B: Registro de movimientos (transaction log)
  "Gane A, gaste B, ahorre C"
  = acumulado de transacciones desde el inicio

INVARIANTE:
  Posicion financiera == Acumulado de movimientos
  Delta = Fuente A - Fuente B = 0
```

Cuando delta = 0, el sistema esta **cuadrado**: cada peso esta ubicado y explicado.

---

## Flujo 1: Setup inicial (primera vez)

El usuario arranca desde cero. Necesita establecer su posicion financiera base.

```
PASO 1: Crear cuentas
  Usuario crea sus cuentas con saldo actual:

  Tengo:
    Checking A           500,000
    Bank A     80,000
    Efectivo        $10,000

  Me deben:
    Friend A           100,000
    Friend B          $300,000

  Debo:
    CC Visa        -50,000
    CC Mastercard       -30,000
    Loan Demo (8/12)   -100,000

PASO 2: Sistema calcula patrimonio liquido
  Patrimonio = sum(tengo) + sum(me_deben) - sum(debo)
  Patrimonio = 600,000 + 150,000 - 80,000 = 670,000

PASO 3: Apertura
  Para cada cuenta on_budget, el sistema crea una transaccion de apertura:
  - Tipo: adjustment
  - Monto: el balance actual de la cuenta
  - NO mueve el balance (la cuenta ya tiene el saldo correcto)
  - Solo registra en el acumulado para que delta = 0

  Ejemplo:
    Checking A:       adjustment +500,000
    Checking A:      adjustment +80,000
    Efectivo: adjustment +$10,000
    CC Visa:   adjustment -50,000
    Friend A:     adjustment +100,000

  Resultado: posicion == acumulado == delta 0

PASO 4: A partir de ahora, el usuario registra movimientos
  Cada ingreso/gasto mueve el acumulado Y el balance de la cuenta.
  El delta debe seguir en $0.
```

### Reglas del setup

- El snapshot inicial SIEMPRE cuadra (es el punto de partida)
- No se pide historial — la app arranca desde hoy
- Opcionalmente, importar data historica del Excel como snapshots pasados

---

## Flujo 2: Registro de movimiento (dia a dia)

El flujo mas frecuente. El usuario gasto o recibio dinero.

```
TRIGGER: Usuario abre "Registrar movimiento"

PASO 1: Ingresa datos minimos
  Monto:       $150,000
  Categoria:   Necesidad > Bencina
  Cuenta:      Bank A (debito)
  Entidad:     Personal

PASO 2: Sistema actualiza acumulado
  acumulado_anterior:  670,000
  nuevo_acumulado:     670,000 - $150,000 = 520,000

PASO 3: Delta cambia
  Si el usuario NO actualizo el saldo de Checking A:
    posicion = 670,000  (saldos viejos)
    acumulado = 520,000
    delta = +$150,000  (pendiente de cuadrar)

  El delta indica: "hay $150K registrados como gasto
  pero los saldos de las cuentas no reflejan eso aun"

PASO 4: Usuario actualiza saldo de Checking A cuando quiera
  Checking A: 80,000 -> nuevo valor real
  Si Checking A bajo exactamente $150K: delta vuelve a $0
```

### Variantes

**Gasto al contado con TC:**
```
Monto: 10,000 (almuerzo)
Cuenta: CC Mastercard

Efecto:
  - Acumulado baja $30K (gasto real)
  - CC Mastercard sube $30K en estado de cuenta
  - Patrimonio baja $30K
  - Delta NO cambia si actualizas saldo TC
```

**Compra en cuotas con TC:**
```
Monto total: $180,000 (zapatillas en 6 cuotas)
Cuenta: CC Mastercard

Efecto:
  - Acumulado baja $180K (gasto real TOTAL)
  - CC Mastercard: primera cuota en estado de cuenta + resto en cuotas futuras
  - Patrimonio baja $180K
  - Meses siguientes: cuotas se mueven de "futuro" a "estado de cuenta"
    sin afectar patrimonio ni acumulado
  - Ver Flujo 4 para detalle completo
```

**Pago de tarjeta de credito:**
```
Monto: 30,000 (pago CC Mastercard)
Tipo: Transferencia interna (debito -> credito)

Efecto:
  - Checking A baja 30,000
  - CC Mastercard baja 30,000 (estado de cuenta se reduce)
  - Acumulado NO cambia (pagar TC no es gasto)
  - Patrimonio neto NO cambia
  - Delta NO cambia
```

**Ingreso de sueldo:**
```
Monto: 400,000
Categoria: Ingreso > Client Corp
Cuenta: Checking A

Efecto:
  - Acumulado sube $2M
  - Si Checking A no se actualiza: delta = -$2M (plata registrada que no aparece)
  - Cuando actualiza Checking A: delta vuelve a $0
```

---

## Flujo 3: Cuadrar (reconciliacion periodica)

El flujo central. El usuario "cierra" un periodo verificando que todo cuadra.

```
TRIGGER: Usuario va a tab "Cuadrar" (tipicamente fin de mes o cuando quiera)

PASO 1: Sistema muestra posicion actual
  ┌─────────────────────────────────────┐
  │ Posicion (segun saldos):  700,000│
  │ Acumulado (segun registro): 650,000│
  │ Delta:                      50,000│
  │ Estado:  ● Pendiente de cuadrar     │
  └─────────────────────────────────────┘

PASO 2: Usuario actualiza saldos reales
  Abre cada cuenta y actualiza con el numero real:
  - Revisa app Checking A -> ingresa saldo exacto
  - Revisa app Bank A -> ingresa saldo + deuda TC
  - Revisa app Bank B -> ingresa saldo + deuda TC
  - Revisa efectivo en billetera

  El delta se recalcula en tiempo real con cada cambio.

PASO 3: Analisis del delta

  SI delta = 0:
    -> Cuadrado. Boton "Guardar snapshot" se habilita.
    -> Guardar crea un snapshot inmutable del estado.

  SI delta > 0 (posicion > acumulado):
    -> "Tienes $X mas de lo registrado"
    -> Hay ingresos que no registraste
    -> Opciones:
       a) Buscar y registrar los movimientos faltantes
       b) Crear ajuste: "Ingreso no registrado" por $X

  SI delta < 0 (posicion < acumulado):
    -> "Tienes $X menos de lo registrado"
    -> Hay gastos que no registraste
    -> Opciones:
       a) Buscar y registrar los movimientos faltantes
       b) Crear ajuste: "Gasto no registrado" por $X

PASO 4: Guardar snapshot
  El snapshot captura:
  - Fecha
  - Saldo de cada cuenta
  - Patrimonio total
  - Delta (idealmente $0)
  - Es inmutable (no se edita despues)

PASO 5: Nuevo periodo comienza
  El proximo snapshot se comparara contra este.
```

### Frecuencia esperada

- **Ideal**: cada vez que el usuario quiera (semanal, quincenal)
- **Minimo**: una vez al mes (para tener historico mensual)
- **No forzado**: la app funciona sin cuadrar, solo muestra el delta

---

## Flujo 4: Compras en cuotas y tarjetas de credito

### El problema de las cuotas

Una compra en cuotas tiene doble impacto que ocurre en tiempos distintos:

```
Compras zapatillas por $180,000 en 6 cuotas de 10,000:

  Realidad economica:  ya gastaste $180,000 (el dinero esta comprometido)
  Realidad del flujo:  solo te cobran 10,000 este mes
  Realidad del cupo:   tu TC perdio $180,000 de cupo disponible
```

### Principio: el gasto se registra completo al comprar

```
MOMENTO DE LA COMPRA (Marzo):
  Patrimonio:  -$180,000  (gasto real, ya tienes las zapatillas)
  Cupo TC:     -$180,000  (el banco lo refleja inmediato)
  Flujo mes:    -10,000  (solo te cobran la primera cuota)
  Deuda nueva: $150,000   (las 5 cuotas restantes)

MES SIGUIENTE (Abril):
  Patrimonio:  sin cambio  (el gasto ya se conto en Marzo)
  Flujo mes:    -10,000   (cuota 2/6)
  Deuda:        -10,000   (baja de $150K a $120K)
  Cupo TC:      +10,000   (se libera cupo)

... y asi hasta la cuota 6
```

### Anatomia de una tarjeta de credito

La TC tiene dos componentes que se suman:

```
DEUDA TOTAL TC = Estado de cuenta + Comprometido en cuotas

  Estado de cuenta:   Lo que te cobran ESTE mes
    Compras recientes al contado (con TC)
    + Cuotas del mes de compras anteriores
    + Intereses si los hay

  Comprometido en cuotas:  Lo que te cobraran en MESES FUTUROS
    Suma de cuotas pendientes de todas las compras en cuotas

Ejemplo CC Mastercard:
  Estado de cuenta (Marzo):     -50,000
    Compras al contado del mes   -$47,712
    Cuota 3/6 Store Demo             -10,000
    Cuota 1/6 Sneakers Demo    -10,000
    Cuota 1/3 Health           -10,000

  Cuotas futuras:               -60,000
    Store Demo (quedan 3 cuotas)     -30,000
    Sneakers Demo (quedan 5)  -$150,000
    Health (quedan 2)          -20,000
    (nota: se corrige, sumemos bien)

  Cupo total:                  500,000
  Cupo usado:                    80,000  (estado + cuotas futuras)
  Cupo disponible:             920,000
```

### Registrar compra en cuotas

```
PASO 1: Usuario registra la compra
  Descripcion:  Sneakers Demo
  Monto total:  $180,000
  Cuotas:       6
  Tarjeta:      CC Mastercard
  Categoria:    Consumo > Ropa

PASO 2: Sistema genera automaticamente
  1. Gasto por el TOTAL $180,000 (impacto patrimonial inmediato)
     - Descripcion: Sneakers Demo
     - Monto: $180,000
     - Tipo: expense
     - Categoria: Consumo > Ropa
     - Afecta patrimonio: SI, inmediato, por el total (-$180,000)
     - Afecta acumulado: SI, inmediato, por el total (-$180,000)

  2. Deuda en cuotas por $180,000
     - Cuotas: 6 de 10,000
     - Asociada a: CC Mastercard
     - Primera cuota aparece en estado de cuenta del mes

  3. Cuotas mensuales como debt_payment (NO expense)
     - Tipo: debt_payment
     - Monto: 10,000 por mes
     - Aparecen en flujo mensual (el usuario ve "me cobraron $30K")
     - Cuentan para distribucion de presupuesto del mes
     - NO cambian patrimonio (ya se registro al comprar)
     - NO cambian acumulado (ya se registro al comprar)

PASO 3: Modelo DUAL VIEW del mismo evento
  PATRIMONIO (cuanto tengo):
    - Baja $180K inmediato (toda la deuda es un pasivo)
    - No cambia en meses siguientes por este concepto

  ACUMULADO (para reconciliacion):
    - Baja $180K inmediato (matches patrimonio)
    - No cambia en meses siguientes (ya se conto)

  FLUJO MENSUAL (cuanto me cobraron este mes):
    - Marzo: $30K como debt_payment (visible en flujo, no es gasto nuevo)
    - Abril: $30K como debt_payment
    - ... cada cuota aparece en el flujo del mes que se cobra

  PRESUPUESTO (distribucion % necesidades/consumo):
    - La cuota de $30K cuenta en la distribucion del mes
    - No los $180K completos, solo la cuota

PASO 4: Efecto en "Cuadrar"
  - CC Mastercard sube $180K en deuda total (estado + cuotas futuras)
  - Patrimonio neto baja $180K (nuevo pasivo)
  - Flujo de Marzo solo registra $30K como gasto
  - Delta sigue en $0 si el saldo de TC refleja la compra
```

### Cuota mensual automatica (meses siguientes)

```
TRIGGER: Inicio de mes (o cuando el banco cobra)

SISTEMA GENERA:
  Tipo:       Pago de deuda (NO es gasto)
  Monto:      10,000
  Origen:     Se cobra en CC Mastercard (sube el estado de cuenta)
  Deuda:      Baja 10,000 (de cuotas futuras a estado de cuenta)
  Patrimonio: NO cambia (ya se registro el gasto total al comprar)
  Acumulado:  NO cambia (no es gasto nuevo)

EFECTO EN TC:
  Antes de la cuota:
    Estado de cuenta:  -$X (lo que sea del mes)
    Cuotas futuras:    -$120,000 (4 cuotas restantes)
    Cupo usado:        $X + $120,000

  Despues de la cuota:
    Estado de cuenta:  -$X - 10,000 (se agrego la cuota)
    Cuotas futuras:    -$90,000 (3 cuotas restantes)
    Cupo usado:        igual (se movio de futuro a presente)

  Despues de PAGAR la TC:
    Estado de cuenta:  $0
    Cuotas futuras:    -$90,000
    Cupo usado:        $90,000
    Cupo liberado:     10,000 (respecto al mes anterior)
```

### Pago de tarjeta de credito

```
TIPO: Transferencia interna (debito -> TC)

  El usuario paga 50,000 del estado de cuenta de CC Mastercard:
  Origen:     Bank A (debito)
  Destino:    CC Mastercard (reduce estado de cuenta)

  Efecto:
    Checking A:          -50,000
    CC Mastercard:      +50,000 (estado de cuenta baja, cuotas futuras no cambian)
    Patrimonio:   NO cambia (movi plata de un bolsillo a otro)
    Acumulado:    NO cambia (no es gasto)
    Delta:        NO cambia

  IMPORTANTE: Pagar la TC no es un gasto.
  El gasto ya ocurrio cuando compraste. Pagar la TC es saldar una deuda.
```

### Resumen: tipos de movimiento con TC

```
                          PATRIMONIO  ACUMULADO   FLUJO MES   PRESUPUESTO
                          ──────────  ──────────  ──────────  ──────────────
COMPRA AL CONTADO TC:     -monto      -monto      -monto      SI
COMPRA EN CUOTAS TC:      -total      -total      -cuota      SI (cuota)
CUOTA MENSUAL (auto):     no cambia   no cambia   -cuota      SI (cuota)
PAGO DE TC (transfer):    no cambia   no cambia   no cambia   NO
REFUND:                   +monto      +monto      +monto      SI (reduce gasto)
INTERES / COMISION TC:    -monto      -monto      -monto      SI
```

Nota clave: en compras en cuotas, patrimonio y acumulado absorben el golpe
completo inmediato (porque la deuda es un pasivo real), pero el flujo mensual
y presupuesto solo ven la cuota. Las cuotas son debt_payment, no expense.
Esto permite responder ambas preguntas:
  - "Cuanto tengo realmente?" → patrimonio (descontando toda la deuda)
  - "Me estoy pasando del presupuesto este mes?" → solo la cuota cuenta

### Deudas con terceros (no TC)

Deudas que no pasan por tarjeta de credito (ej: compra en cuotas directo con el vendedor).

```
CREAR DEUDA:
  Nombre:        Loan Demo
  Monto total:   150,000
  Cuotas:        12
  Cuota mensual: $38,500  (calculado automatico)
  Acreedor:      Terceros (no es TC)
  Cuenta pago:   Checking A (de donde salen las cuotas)
  Inicio:        Dic 2025

DIFERENCIA CON TC:
  - No afecta cupo de ninguna tarjeta
  - La cuota se paga desde cuenta debito directamente
  - El gasto total se registro al momento de la compra
  - Cada cuota es pago de deuda, no gasto nuevo

ESTADO ACTUAL:
  Pagadas:   4 de 12
  Pendiente: 100,000
  Proxima:   $38,500 (Mayo 2026)

REGISTRAR PAGO DE CUOTA:
  Monto:     $38,500
  Tipo:      Pago de deuda (no gasto)
  Cuenta:    Checking A

  Efecto:
  - Checking A baja $38,500
  - Deuda "Loan Demo" baja $38,500
  - Patrimonio: NO cambia
  - Si era la ultima cuota: deuda se archiva
```

---

## Flujo 5: Cuentas por cobrar (me deben)

Dinero que otros te deben, con pagos parciales.

```
CREAR CUENTA POR COBRAR:
  Nombre:   Friend A
  Monto:    200,000
  Nota:     "Prestamo Diciembre 2025"

REGISTRAR PAGO PARCIAL:
  Friend A paga $50,000:

  1. Registrar movimiento:
     Monto:     +$50,000
     Categoria: Cobro > Friend A
     Cuenta:    Checking A (donde recibiste la plata)

  2. Sistema actualiza:
     Friend A: 200,000 -> 150,000 (pendiente)
     Checking A sube $50,000

  3. Efecto en cuadrar:
     - Checking A sube $50K
     - "Me deben" baja $50K
     - Patrimonio neto NO cambia
     - Delta NO cambia

CUENTA SALDADA:
  Cuando pendiente llega a $0, se archiva automaticamente.
```

---

## Flujo 6: Transaccion en USD

Para suscripciones internacionales y saldos en dolares.

```
REGISTRAR GASTO USD:
  Monto:     $39 USD
  Categoria: Necesidad > Suscripciones
  Cuenta:    CC Visa (Internacional)

  Sistema convierte:
  - Tipo de cambio: usuario puede fijar uno o usar manual
  - $39 * 930 = $36,270 CLP
  - Registra en CLP (moneda base)

CUENTA CON SALDO USD (Client SaaS):
  Tipo: "Me deben"
  Moneda: USD
  Saldo: 100.00 USD

  Al cuadrar:
  - Sistema muestra saldo en USD y equivalente CLP
  - Usuario puede actualizar tipo de cambio
  - El CLP equivalente se recalcula
```

---

## Flujo 7: SpA — Facturacion y separacion de entidades

La SpA es una entidad financiera separada con sus propias cuentas.

```
EMITIR FACTURA:
  Cliente:    Client Corp
  Neto:       400,000
  IVA (19%):  80,000
  Total:      500,000
  Fecha pago: 30 dias

  Sistema registra:
  - Cuenta por cobrar SpA: +500,000
  - No afecta cuentas personales

COBRAR FACTURA:
  Client Corp paga:

  1. Saldo SpA Checking sube 500,000
  2. Cuenta por cobrar Client Corp se salda
  3. IVA debito acumulado sube 80,000

PAGAR SUELDO A OWNER (transferencia SpA -> Personal):
  SpA registra: Gasto empresa > Sueldo 400,000
  Personal registra: Ingreso > Sueldo SpA 400,000

  - Saldo SpA Checking baja $2M
  - Saldo Checking A personal sube $2M
  - Patrimonio total NO cambia (se movio entre entidades)

CALCULAR IVA MENSUAL:
  IVA debito (facturas emitidas) - IVA credito (gastos con factura)
  = IVA a pagar el dia 20 del mes siguiente
```

---

## Flujo 8: Cierre de mes

Ritual mensual que combina varios flujos.

```
CHECKLIST DE CIERRE:

  1. ☐ Actualizar saldos de todas las cuentas
       Abrir cada app bancaria, anotar saldo real

  2. ☐ Verificar deudas en cuotas
       Confirmar que las cuotas del mes se pagaron

  3. ☐ Revisar delta
       Si != 0, buscar movimientos faltantes o crear ajuste

  4. ☐ Cuadrar y guardar snapshot
       Delta = 0 -> snapshot inmutable

  5. ☐ (SpA) Calcular IVA del mes
       Para pagar antes del 20 del mes siguiente

  6. ☐ Revisar presupuesto vs real
       % necesidades, % consumo, % ahorro vs metas

RESULTADO:
  - Snapshot del mes guardado
  - Historico actualizado
  - Presupuesto del mes siguiente con estimaciones
```

---

## Flujo 9: Consulta de patrimonio y proyecciones

El usuario quiere saber "como voy" y "para donde voy".

```
PATRIMONIO ACTUAL:
  Liquido personal:    670,000
  Liquido SpA:         300,000
  Inversiones Fintual: 400,000
  Propiedades (50%):   5,000,000
  Total:               7,000,000

TENDENCIA:
  Serie historica de snapshots mensuales desde 2017.
  Grafico: patrimonio liquido over time.
  Comparacion: real vs esperado (meta de ahorro).

PROYECCIONES:
  Si la SpA factura $X/mes y los gastos empresa son $Y/mes:
  - Utilidad mensual: $X - $Y
  - En 12 meses acumula: utilidad * 12
  - "Puedes comprar la Ranger en N meses"
```

---

## Flujo 10: Gestion de cuentas

```
AGREGAR CUENTA:
  El usuario agrega una nueva TC, cuenta debito, o cuenta de inversion.
  Datos minimos: nombre (unico), tipo, subtipo, entidad, moneda, saldo inicial.
  Para TC: agregar cupo total.
  Para inversiones: marcar como "no reconciliable" (on_budget = false).

ARCHIVAR CUENTA:
  Pre-condicion: no debe tener deudas activas asociadas.
  Si tiene deudas: mostrar advertencia con opciones:
    a) Pagar las deudas primero
    b) Migrar las deudas a otra cuenta
  La cuenta se marca como archivada, no se borra.
  Las transacciones historicas se mantienen.
  La cuenta no aparece en "Cuadrar" ni en flujo diario.

RENOMBRAR / EDITAR:
  Se puede cambiar nombre, metadata.
  No se puede cambiar tipo ni subtipo (crear nueva y migrar).
```

---

## Flujo 11: Transferencias entre cuentas

```
TRANSFERENCIA INTERNA (debito -> debito, debito -> TC, debito -> efectivo):
  El usuario mueve dinero entre sus propias cuentas.
  Ejemplo: Retiro ATM = Checking A -> Efectivo
  Ejemplo: Pago TC = Checking A -> CC Mastercard

  Efecto:
    Cuenta origen: balance baja
    Cuenta destino: balance sube
    Patrimonio: NO cambia
    Acumulado: NO cambia
    Es tipo 'transfer' — excluido de presupuesto y reportes de gasto

TRANSFERENCIA ENTRE ENTIDADES (SpA -> Personal):
  Genera un movimiento en cada entidad atomicamente:
  SpA: gasto empresa (categoria segun tipo: sueldo, dividendo, prestamo)
  Personal: ingreso (categoria segun tipo: sueldo SpA, dividendo, prestamo)

  Patrimonio TOTAL no cambia (se movio entre bolsillos).
  Patrimonio de cada ENTIDAD si cambia.
```

---

## Flujo 12: Refunds y devoluciones

```
DEVOLUCION COMPLETA:
  La tienda devuelve el monto completo.
  Se registra como tipo 'refund' con monto positivo.
  Se categoriza en la MISMA categoria que la compra original.
  No es ingreso — reduce el gasto de esa categoria.

DEVOLUCION PARCIAL:
  Mismo patron pero por monto menor.
  Se vincula a la transaccion original via metadata.

DEVOLUCION DE COMPRA EN CUOTAS:
  No existe una operacion magica. Se sigue el flujo real:
  
  1. La tienda hace nota de credito → registrar refund en la TC
     (createRefund con la misma categoria del gasto original)
  2. El banco cancela las cuotas futuras → archivar la deuda
  3. Al cuadrar: actualizar el saldo real de la TC
  
  Ejemplo: compra $180K en 6 cuotas, 2 pagadas, devolucion total:
    - Refund: +$180K en la TC
    - Archivar deuda (cuotas restantes desaparecen)
    - TC: -$180K + $180K = $0 (el banco ya ajusto)
    - Delta = 0 ✓
  
  No se necesita logica especial — el usuario hace cada paso
  como ocurre en la realidad.
```

---

## Flujo 13: Autenticacion

```
REGISTRO (web):
  1. Usuario ingresa email + password
  2. Supabase Auth crea la cuenta
  3. Se crea el perfil inicial
  4. Redirect al onboarding (crear cuentas)

LOGIN (web):
  1. Email + password → Supabase Auth
  2. JWT almacenado, sesion persistente
  3. Refresh automatico via onAuthStateChange

LOGIN (CLI):
  bal login
  1. Pide email + password
  2. supabase.auth.signInWithPassword()
  3. Guarda tokens en ~/.balance/credentials.json
  4. Todas las operaciones usan JWT → RLS enforced

API KEY (web → CLI/agents):
  1. En Settings > API Keys, crear nueva key
  2. Copiar la key (solo se muestra una vez)
  3. Usar en CLI: export BALANCE_API_KEY=bal_sk_...
  4. O en agent: header Authorization: Bearer bal_sk_...
  5. La key se valida via Edge Function → genera JWT temporal
  6. RLS aplica igual que login normal

REVOCAR API KEY (web):
  1. En Settings > API Keys, click "Revocar"
  2. Key queda marcada como revocada
  3. Siguiente uso del CLI/agent falla con 401
```

---

## Flujo 14: Onboarding (primer ingreso)

Flujo que se ejecuta una sola vez, despues del primer signup.
Objetivo: que el usuario tenga un balance cuadrado en menos de 2 minutos.

```
PASO 1: Signup
  Email + password → Supabase Auth crea la cuenta.
  Redirect a /onboarding.

PASO 2: Cuanto tienes
  El usuario ingresa el total de dinero que tiene.
  
  Opcion A (rapido): Solo el total
    - Sistema crea una cuenta "Mi dinero" tipo asset/debit con ese monto
    - Opening balance automatico
  
  Opcion B (detallado): Separar por cuenta
    - El usuario agrega N cuentas con nombre y monto
    - Para cada cuenta: sistema crea account + opening balance
    - El total debe coincidir (validacion visual, no bloqueo)

PASO 3: Debes algo
  El usuario indica si tiene deudas.
  
  Opcion "No debo nada":
    - No se crean cuentas de liability
    - Patrimonio = total del paso 2
  
  Opcion "Si, debo X":
    Opcion A (rapido): Solo el total
      - Sistema crea cuenta "Mis deudas" tipo liability/credit_card con -X
      - Opening balance automatico
    
    Opcion B (detallado): Separar por deuda
      - El usuario agrega TC, cuotas, prestamos
      - Para cada una: sistema crea account + opening balance

PASO 4: Perfil (opcional, skippable)
  Nombre y telefono.
  
  Feature flags segun seleccion:
    □ Empresa → habilita tab "SpA" y categorias empresa
    □ Inversiones → crea cuenta off-budget sugerida
    □ Arriendo → agrega "Arriendo" a categorias de ingreso
    □ Impuestos → habilita recordatorios de IVA/PPM

PASO 5: Dashboard inicial
  Sistema muestra el primer snapshot (cuadrado por definicion).
  Genera recomendaciones personalizadas segun el perfil.
  
  Si eligio "rapido" en pasos 2-3:
    Recomienda: "Detalla tus cuentas para un balance mas preciso"
  
  Si marco "Empresa":
    Recomienda: "Configura tu empresa en el tab SpA"
  
  Si marco "Inversiones":
    Recomienda: "Agrega tus inversiones en Patrimonio"

RESULTADO:
  - Cuenta creada en Supabase Auth
  - 1+ cuentas asset creadas con saldo
  - 0+ cuentas liability creadas con deuda
  - Opening balances para cada cuenta
  - Delta = 0 (cuadrado desde el primer momento)
  - Perfil con feature flags configurados
  - Primer snapshot guardado automaticamente
  - El usuario llega al dashboard funcional
```

REGLA: El onboarding solo se muestra una vez. Si el usuario ya tiene cuentas
(is_onboarded = true en el perfil), redirect directo al dashboard.

---

## Estados del sistema

### Estado de cuenta

```
ACTIVA:    Cuenta con saldo vigente, participa en cuadrar
ARCHIVADA: Cuenta cerrada o saldada, visible en historial
```

### Estado de deuda

```
ACTIVA:    Cuotas pendientes > 0
PAGADA:    Todas las cuotas pagadas, se archiva
```

### Estado de snapshot

```
CUADRADO:     Delta = 0 al momento de guardar
DESCUADRADO:  Delta != 0 (el usuario guardo con diferencia)
              Se permite pero queda marcado
```

### Estado de periodo

```
ABIERTO:    Mes actual, se pueden registrar movimientos
CERRADO:    Snapshot guardado, movimientos no editables
            (se pueden agregar ajustes retroactivos si es necesario)
```

---

## Reglas de negocio

1. **Snapshot es inmutable** — Una vez guardado no se modifica. Si hay error, se crea un ajuste.

2. **Movimientos en periodo cerrado** — Se permite registrar movimientos con fecha pasada, pero se marcan como "retroactivos" y afectan el delta del snapshot de ese periodo.

3. **Separacion personal/SpA** — Una transaccion pertenece a exactamente una entidad. Las transferencias entre entidades generan un movimiento en cada una.

4. **Tipo de cambio** — Se almacena el tipo de cambio al momento de la transaccion. No se recalcula retroactivamente.

5. **Deudas en cuotas** — El sistema sugiere registrar la cuota cuando se acerca la fecha, pero no obliga.

6. **Cuentas por cobrar** — Se reducen con pagos parciales. Se archivan al llegar a $0.

7. **Delta tolerance** — Diferencias menores a $1,000 se muestran en ambar (no rojo). El usuario decide si vale la pena rastrear.

8. **Nombres de cuenta unicos** — Los nombres de cuenta son unicos por usuario. No se permiten duplicados.

9. **Archivar cuenta con deudas** — No se puede archivar una cuenta que tiene deudas activas asociadas. Primero se deben pagar o migrar.

10. **Refunds** — Los refunds se categorizan en la misma categoria que el gasto original. Reducen el gasto, no son ingreso.

11. **Transferencias internas** — Las transferencias entre cuentas propias no son gasto ni ingreso. Son tipo 'transfer', excluidas de presupuesto y reportes.

12. **Cuentas off-budget** — Cuentas con on_budget=false (ej: inversiones) no participan en reconciliacion ni en el flujo de "Cuadrar".

13. **Apertura de cuentas** — Al crear una cuenta con saldo inicial, se debe llamar create_opening_balance() para registrar el saldo en el acumulado. Sin esto, el delta queda descuadrado por el monto del saldo inicial.

---

## Jerarquia de categorias

### Personal

```
Ingreso
  Sueldo SpA
  Freelance
  Arriendo
  Junaeb
  Cobro (cuentas por cobrar)
  Otro ingreso

Necesidad
  Cargos mensuales (suscripciones)
  Bencina y TAG
  Casa
  Auto mantenciones
  Aseo
  Salud

Consumo
  Libre (dia a dia)
  Ropa
  Tecnologia
  Viajes
  Regalos
  Libros
  Eventos

Ahorro
  Mediano plazo
  Largo plazo
  Polla

Deuda
  Pago de cuota
  Pago TC

Transferencia (no afecta patrimonio)
  Entre cuentas propias
  Pago de TC
```

### SpA

```
Ingreso empresa
  Facturacion
  Otro ingreso

Gasto empresa
  Sueldos
  Servicios (Claude, Render, hosting)
  Telecomunicaciones
  Servicios profesionales
  Otro gasto

Transferencia SpA -> Personal
  Sueldo
  Dividendos
  Prestamo
```
