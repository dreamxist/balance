// deno test supabase/functions/gmail-sync/
// Fixtures reproduce the REAL bank email formats observed in production
// (2026-07 backfill), lightly trimmed.
import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1'
import {
  isNoise,
  normalizeAccountNumber,
  parseClpAmount,
  parseEmail,
  parseUsdCents,
  type RawEmail,
} from './parsers.ts'

function email(partial: Partial<RawEmail>): RawEmail {
  return {
    id: 'msg-1',
    from: 'unknown@example.com',
    subject: '',
    date: '2026-07-08T21:15:00Z',
    body: '',
    ...partial,
  }
}

function parsed(e: RawEmail) {
  const result = parseEmail(e)
  if (result === null || result === 'ignore') {
    throw new Error(`expected parse, got ${String(result)}`)
  }
  return result
}

// ---------------------------------------------------------------------------
// Amount / account helpers
// ---------------------------------------------------------------------------

Deno.test('parseClpAmount handles dot AND comma thousand separators', () => {
  assertEquals(parseClpAmount('$9.900'), 9900)
  assertEquals(parseClpAmount('1.234.567'), 1234567)
  assertEquals(parseClpAmount('$ 60,173'), 60173) // BCI comma thousands
  assertEquals(parseClpAmount('no es plata'), null)
})

Deno.test('parseUsdCents handles comma decimals', () => {
  assertEquals(parseUsdCents('US$23,79'), 2379)
  assertEquals(parseUsdCents('US$120'), 12000)
  assertEquals(parseUsdCents('abc'), null)
})

Deno.test('normalizeAccountNumber strips dashes and leading zeros', () => {
  assertEquals(normalizeAccountNumber('00-112-23344-55'), '1122334455')
  assertEquals(normalizeAccountNumber('000000009988776655'), '9988776655')
  assertEquals(normalizeAccountNumber('07654321'), '7654321')
})

// ---------------------------------------------------------------------------
// Banco de Chile
// ---------------------------------------------------------------------------

Deno.test('bancochile_tc parses CLP purchase', () => {
  const p = parsed(email({
    from: 'enviodigital@bancochile.cl',
    subject: 'Compra con Tarjeta de Crédito',
    body: `Sr(a). PEREZ: Le informamos que se ha realizado una compra por
      $9.900 con Tarjeta de Crédito ****NNNN en CRUNCHYROLL MEMBERSHIP el
      08/07/2026 21:15.`,
  }))
  assertEquals(p.source, 'bancochile_tc')
  assertEquals(p.amount, 9900)
  assertEquals(p.currency, 'CLP')
  assertEquals(p.merchant, 'CRUNCHYROLL MEMBERSHIP')
  assertEquals(p.account_hint, '1234')
})

Deno.test('bancochile_tc parses USD purchase as cents', () => {
  const p = parsed(email({
    from: 'enviodigital@bancochile.cl',
    subject: 'Compra con Tarjeta de Crédito',
    body: 'compra por US$23,79 con Tarjeta de Crédito ****NNNN en OPENAI el 09/07/2026 03:22.',
  }))
  assertEquals(p.amount, 2379)
  assertEquals(p.currency, 'USD')
})

Deno.test('bancochile_pago (Mi Banco) takes debit card as hint', () => {
  const p = parsed(email({
    from: 'serviciodetransferencias@bancochile.cl',
    subject: 'Comprobante de Pago',
    body: `Banco de Chile | Mi Banco Comprobante de pago exitoso Estimado(a):
      Juan Detalle cuenta(s) pagada(s) Comercio FONASA WEB Monto $ 14.420
      Detalle del pago Medio de pago Tarjeta de Débito ****4321 Dirección
      comercio Ecommerce Total $14.420 Fecha y Hora 08/07/2026 19:06:28`,
  }))
  assertEquals(p.source, 'bancochile_pago')
  assertEquals(p.amount, 14420)
  assertEquals(p.account_hint, '4321')
  assertEquals(p.merchant, 'FONASA WEB')
})

Deno.test('bancochile_pago_tc uses Monto (not Utilizado) and card hint', () => {
  const p = parsed(email({
    from: 'serviciodetransferencias@bancochile.cl',
    subject: 'Pago de Tarjeta de Crédito Nacional',
    body: `Comprobante pago Tarjeta de Crédito Nacional … Origen Tipo de cuenta
      Cuenta Corriente N&deg; de cuenta 00-112-23344-55 Destino Tipo de tarjeta
      Tarjeta de Crédito N&deg; de tarjeta ************NNNN Utilizado $16.615
      Monto $518.612 Fecha y Hora: jueves 02 de julio`,
  }))
  assertEquals(p.source, 'bancochile_pago_tc')
  assertEquals(p.amount, 518612)
  assertEquals(p.account_hint, '1234')
  assertEquals(p.counterparty, 'TC Nacional')
})

Deno.test('bancochile_transfer_out parses prose format with origin account', () => {
  const p = parsed(email({
    from: 'serviciodetransferencias@bancochile.cl',
    subject: 'Transferencias de Fondos a Medio De Pago Fintoc',
    body: `Estimado(a) Juan Le informamos que usted ha efectuado una
      transferencia de fondos a Medio De Pago Fintoc, el día 04 de julio de
      2026, desde su Cuenta Corriente 1122334455. Datos del Destinatario
      Nombre Medio De Pago Fintoc Monto $36.800 TEF_20260704_112233`,
  }))
  assertEquals(p.source, 'bancochile_transfer_out')
  assertEquals(p.amount, 36800)
  assertEquals(p.account_hint, '1122334455')
  assertEquals(p.counterparty, 'Medio De Pago Fintoc')
  assertEquals(p.bank_tx_id, 'TEF_20260704_112233')
})

Deno.test('bancochile_transfer_in parses incoming transfer', () => {
  const p = parsed(email({
    from: 'serviciodetransferencias@bancochile.cl',
    subject: 'Aviso de transferencia de fondos',
    body: `Le informamos que PEDRO PABLO PAGADOR RUT 9.876.543-2 le ha
      realizado una transferencia por $30.000 a su Cuenta Corriente N° 1122334455.`,
  }))
  assertEquals(p.source, 'bancochile_transfer_in')
  assertEquals(p.amount, 30000)
  assertEquals(p.counterparty, 'PEDRO PABLO PAGADOR')
  assertEquals(p.account_hint, '1122334455')
})

// ---------------------------------------------------------------------------
// BICE
// ---------------------------------------------------------------------------

Deno.test('bice_transfer_out hints the ORIGIN account', () => {
  const p = parsed(email({
    from: 'reply@info.bice.cl',
    subject: 'Hicimos la transferencia',
    body: `Hola, Juan Hicimos la transferencia que nos pediste por:
      Monto $71.648 Cuenta de origen Tipo de cuenta CUENTA CORRIENTE Número de
      cuenta 7654321 Cuenta de destino Nombre Juan Perez Soto RUT
      12.345.678-5 Banco Mercado Pago Tipo de cuenta CUENTA VISTA Número de
      cuenta 9988776655`,
  }))
  assertEquals(p.source, 'bice_transfer_out')
  assertEquals(p.amount, 71648)
  assertEquals(p.account_hint, '7654321')
  assertEquals(p.counterparty, 'Juan Perez Soto')
})

Deno.test('bice_transfer_in hints the DESTINATION account', () => {
  const p = parsed(email({
    from: 'reply@info.bice.cl',
    subject: 'Recibiste una transferencia',
    body: `Hola, Recibiste una transferencia por: Monto $71.648 Cuenta de
      origen Nombre Juan Perez Soto Banco Banco BICE Cuenta de destino
      Banco Mercado Pago Tipo de cuenta CUENTA VISTA Número de cuenta 9988776655`,
  }))
  assertEquals(p.source, 'bice_transfer_in')
  assertEquals(p.amount, 71648)
  assertEquals(p.account_hint, '9988776655')
})

Deno.test('bice_pago_tc handles spaced card asterisks', () => {
  const p = parsed(email({
    from: 'reply@info.bice.cl',
    subject: 'Confirmación del pago de tarjeta de crédito',
    body: `Hola, Juan Pagaste tu tarjeta de crédito por: Monto $197.802
      Datos del pago Tipo de tarjeta Visa Gold Número de tarjeta **** 1234
      Medio de pago Cuenta corriente N° 07654321`,
  }))
  assertEquals(p.source, 'bice_pago_tc')
  assertEquals(p.amount, 197802)
  assertEquals(p.account_hint, '1234')
})

// ---------------------------------------------------------------------------
// Mercado Pago / Tenpo / BCI
// ---------------------------------------------------------------------------

Deno.test('mp_transfer_out parses sent transfer', () => {
  const p = parsed(email({
    from: 'info@mercadopago.com',
    subject: 'Tu transferencia fue enviada',
    body: '<p>Enviaste $25.990 para ANA MARIA REYES Banco Santander cuenta N° 001122334455.</p>',
  }))
  assertEquals(p.source, 'mp_transfer_out')
  assertEquals(p.amount, 25990)
  assertEquals(p.account_hint, 'mercadopago')
})

Deno.test('tenpo_transfer_in hints the destination account', () => {
  const p = parsed(email({
    from: 'no-reply@tenpo.cl',
    subject: 'Comprobante de transferencia - Tenpo',
    body: `Comprobante de transferencia exitosa La transferencia de PEDRO PAGADOR GOMEZ por $2.440.173 a tu cuenta fue exitosa. Monto
      transferencia: $ 2.440.173 Nombre del destinatario: PEDRO PAGADOR GOMEZ Banco de destino: BANCO BCI/MACH Nº cuenta de destino: 5566778899
      RUT: 76.123.456-7`,
  }))
  assertEquals(p.source, 'tenpo_transfer_in')
  assertEquals(p.amount, 2440173)
  assertEquals(p.account_hint, '5566778899')
  assertEquals(p.counterparty, 'PEDRO PAGADOR GOMEZ')
})

Deno.test('bci_spa outgoing: comma thousands and DESTINATION hint', () => {
  const p = parsed(email({
    from: 'contacto@bci.cl',
    subject: 'Aviso de transferencia de fondos',
    body: `Hola EJEMPLO SPA Te informamos que la transferencia se realizó
      con éxito. Detalle de la transferencia Origen Razón social: EJEMPLO SPA RUT: 76123456-7 Cuenta: BCI/TBANC/NOVA Destino Nombre: Juan Perez Monto transferido: $ 60,173 N&ordm; de cuenta: 000000009988776655
      Banco: Mercado Pago N&ordm; de comprobante: 12345678`,
  }))
  assertEquals(p.source, 'bci_spa')
  assertEquals(p.amount, 60173)
  assertEquals(p.account_hint, '9988776655')
  assertEquals(p.bank_tx_id, 'BCI_12345678')
})

Deno.test('bci_spa incoming falls back to generic account hint', () => {
  const p = parsed(email({
    from: 'contacto@bci.cl',
    subject: 'Aviso de transferencia de fondos',
    body: `Se ha recibido una transferencia de CLIENTE IMPORTANTE LTDA RUT
      76.111.222-3 por $500.000 en la cuenta corriente N° 5566778899 de EJEMPLO SPA.`,
  }))
  assertEquals(p.source, 'bci_spa')
  assertEquals(p.amount, 500000)
  assertEquals(p.account_hint, '5566778899')
})

// ---------------------------------------------------------------------------
// Ruido y fallos
// ---------------------------------------------------------------------------

Deno.test('noise senders and subjects are ignored', () => {
  assertEquals(isNoise(email({ from: 'ofertas@info.bci.cl' })), true)
  assertEquals(isNoise(email({ from: 'beneficiosbice@bice.cl' })), true)
  assertEquals(isNoise(email({ from: 'noreply@mercadopago.com' })), true)
  assertEquals(
    isNoise(email({ from: 'enviodigital@bancochile.cl', subject: 'Cartola mensual' })),
    true,
  )
  assertEquals(parseEmail(email({ from: 'ofertas@info.bci.cl' })), 'ignore')
  assertEquals(parseEmail(email({ from: 'alguien@gmail.com' })), 'ignore')
})

Deno.test('known sender with unparseable body returns null (staged as error)', () => {
  const p = parseEmail(email({
    from: 'enviodigital@bancochile.cl',
    subject: 'Compra con Tarjeta de Crédito',
    body: 'Formato nuevo del banco sin monto ni tarjeta.',
  }))
  assertEquals(p, null)
  assertNotEquals(p, 'ignore')
})

Deno.test('known sender with unknown subject returns null', () => {
  assertEquals(
    parseEmail(email({
      from: 'serviciodetransferencias@bancochile.cl',
      subject: 'Novedades de su banco',
      body: 'Contenido irrelevante $1.000',
    })),
    null,
  )
})
