# Setup Apple Pay — compras en tiempo real (recomendado)

Es la fuente **por defecto y recomendada** para registrar compras. Cada pago
con Apple Pay (iPhone o Apple Watch) dispara un Atajo de iOS que manda
tarjeta, comercio y monto a la Edge Function `wallet-ingest`, y el gasto queda
en Balance al instante, en la cuenta de esa tarjeta.

Cubre cualquier tarjeta que tengas en Wallet, incluidas las que no avisan las
compras por correo y las tarjetas de crédito, que Fintoc no lee. Las otras
fuentes quedan como respaldo:

| Fuente | Rol |
|---|---|
| **Apple Pay** (`wallet-ingest`) | Principal: compras con el teléfono o el reloj, al instante |
| Gmail (`gmail-sync`, `docs/setup-gmail.md`) | Respaldo: compras con TC que avisan por correo, transferencias y pagos de tarjeta |
| Fintoc (`fintoc-sync`, `docs/setup-fintoc.md`) | Opcional: cuenta corriente directo del banco |
| Cartola del banco | Cierre: compras online, con la tarjeta física o suscripciones, que no pasan por Wallet |

**No se duplica nada.** Si Apple Pay registra una compra y después llega el
correo o el movimiento de Fintoc de esa misma compra (misma cuenta y monto, a
pocos días), ese aviso se vincula al gasto ya registrado y no crea otro. Si el
aviso del banco llegó primero, Apple Pay se vincula a él.

## 1. Base de datos y función

```bash
supabase db push                                   # migración 20261012200000_apple_pay_ingestion
supabase functions deploy wallet-ingest --no-verify-jwt
```

La función no usa el JWT de Supabase: se autentica con una API key de `bal`
en el header `x-api-key` y tiene rate limit para intentos fallidos.
`ingest_wallet_payment` solo la puede llamar `service_role`.

## 2. API key para el teléfono

Crea una key exclusiva para el atajo, así puedes revocarla sin afectar el CLI:

```bash
BAL_EMAIL=tu-correo@gmail.com BAL_PASSWORD=… bal key create --name iphone-wallet
```

La key se muestra una sola vez. Pásala al teléfono por un medio privado (Notas
o AirDrop) y nunca la pegues en el repo ni en un chat.

## 3. El atajo (iOS 17 o superior)

1. **Atajos → Automatización → +** y elige **Transacción**.
2. **Tarjeta**: «Cualquier tarjeta» (o marca las tuyas). Categorías y comercios:
   cualquiera. Activa **Automatización** (ejecutar inmediatamente) y deja
   **Notificar** apagado.
3. Agrega la acción **Obtener contenido de URL**:
   - URL: `https://<project-ref>.supabase.co/functions/v1/wallet-ingest`
   - Método: **POST**
   - Encabezados: `x-api-key` con la key del paso 2
   - Cuerpo de la solicitud: **JSON**, tres campos de texto. En cada valor toca
     la variable **Entrada del atajo** y elige la propiedad:

     | Clave | Propiedad |
     |---|---|
     | `card` | Tarjeta o pase |
     | `merchant` | Comercio |
     | `amount` | Cantidad |

4. Opcional: agrega **Mostrar notificación** con el **Contenido de la URL** para
   ver en qué cuenta quedó cada pago.

La primera vez que el atajo se conecta a Supabase iOS puede pedir permiso:
elige **Permitir siempre**, para que los pagos siguientes corran sin tocar nada.

## 4. Cómo se asigna la tarjeta a una cuenta

1. Si el nombre de la tarjeta está en `accounts.metadata.wallet_cards` de una
   cuenta, va a esa cuenta.
2. Si no, se deduce del nombre: banco (`bice`, `chile`/`bch`) y tipo (débito si
   dice «débito», si no crédito), excluyendo la tarjeta internacional. Si queda
   exactamente una cuenta, se usa y el nombre se guarda en `wallet_cards`.
3. Si no se puede deducir, el pago **no se registra**: queda pendiente con el
   nombre exacto de la tarjeta.

```bash
bal wallet                                         # tarjetas sin cuenta y sus pagos pendientes
bal wallet link "Visa Gold" --account "TC Nacional BICE"   # asigna y registra lo pendiente
```

Las categorías salen de las reglas por comercio (`bal rules`). Lo que llega sin
categoría se corrige tocando el movimiento en la web.

## 5. Verificar

Con una tarjeta de prueba que no corresponde a ninguna cuenta, no se registra
ningún gasto:

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/wallet-ingest \
  -H "x-api-key: $BAL_API_KEY" -H "Content-Type: application/json" \
  -d '{"card":"Prueba","merchant":"Test","amount":"$1.234"}'
# {"card":"Prueba","status":"unmapped"}
```

Después borra ese pendiente o asígnalo con `bal wallet link`. Con una compra
real, la respuesta es `{"status":"booked","account":"…"}` (o `"linked"` si el
banco ya la había avisado).

## Límites

- Solo entran los pagos hechos con Wallet. Compras online con el número de la
  tarjeta, con la tarjeta física o suscripciones se cuadran con la cartola.
- La automatización «Transacción» de iOS a veces no se dispara (pagos con el
  reloj, timeouts o comercios que avisan tarde a Wallet), y también se dispara
  con pagos rechazados. El cuadre contra la cartola corrige ambos casos.
- Solo montos en CLP: los pagos en otra moneda se rechazan (422) y entran por
  Gmail o por la cartola.
