// Pure parsers: one function per email source. Each takes the raw Gmail
// message (sender, subject, date, body as text or HTML) and returns the
// email_movements shape, or null when the email matches the sender but the
// expected fields cannot be extracted (the caller stages those as 'error').
//
// Amount conventions (project-wide): CLP in integer pesos, USD in integer
// cents. Real-world formats: Banco de Chile/BICE use dot thousands ($9.900),
// BCI uses comma thousands ($ 60,173), USD uses comma decimals (US$23,79).
// Account numbers appear dashed (00-112-23344-55) or zero-padded
// (000000009988776655) — normalizeAccountNumber strips both.

export type EmailSource =
  | 'bancochile_tc'
  | 'bancochile_pago'
  | 'bancochile_transfer_out'
  | 'bancochile_transfer_in'
  | 'bancochile_pago_tc'
  | 'bice_transfer_out'
  | 'bice_transfer_in'
  | 'bice_pago_tc'
  | 'mp_transfer_out'
  | 'tenpo_transfer_in'
  | 'bci_spa'

export interface RawEmail {
  id: string
  from: string
  subject: string
  date: string
  body: string
}

export interface ParsedMovement {
  gmail_message_id: string
  source: EmailSource
  amount: number | null
  currency: 'CLP' | 'USD'
  counterparty: string | null
  merchant: string | null
  account_hint: string | null
  dest_hint: string | null
  email_date: string
  bank_tx_id: string | null
  raw_snippet: string
}

const NOISE_SENDERS = [
  'info.bci.cl',
  'beneficiosbice@',
  'a.mercadolibre.cl',
  'noreply@mercadopago.com',
]

const NOISE_SUBJECTS = [/cartola/i, /estado de cuenta/i]

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]{2,8};/gi, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** First capture group of the regex over the text, or null. */
function matchGroup(text: string, re: RegExp): string | null {
  const m = text.match(re)
  return m?.[1] !== undefined ? m[1].trim() : null
}

/** "$1.234.567" or "$ 60,173" -> integer CLP pesos (CLP has no decimals). */
export function parseClpAmount(raw: string): number | null {
  const digits = matchGroup(raw.replace(/\s/g, ''), /^\$?([\d.,]+)$/)
  if (digits === null) return null
  const value = Number.parseInt(digits.replace(/[.,]/g, ''), 10)
  return Number.isFinite(value) ? value : null
}

/** "US$23,79" -> 2379 (integer USD cents). */
export function parseUsdCents(raw: string): number | null {
  const m = raw.replace(/\s/g, '').match(/^(?:US\$|USD)?([\d.]+)(?:,(\d{1,2}))?$/)
  const whole = m?.[1]
  if (whole === undefined) return null
  const wholeValue = Number.parseInt(whole.replace(/\./g, ''), 10)
  if (!Number.isFinite(wholeValue)) return null
  const cents = m?.[2] !== undefined ? Number.parseInt(m[2].padEnd(2, '0'), 10) : 0
  return wholeValue * 100 + cents
}

/** "00-112-23344-55" -> "80162771 00"… digits only, no leading zeros. */
export function normalizeAccountNumber(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+/, '')
}

function base(
  email: RawEmail,
  source: EmailSource,
  fields: Partial<ParsedMovement>,
): ParsedMovement {
  return {
    gmail_message_id: email.id,
    source,
    amount: null,
    currency: 'CLP',
    counterparty: null,
    merchant: null,
    account_hint: null,
    dest_hint: null,
    email_date: email.date,
    bank_tx_id: null,
    raw_snippet: stripHtml(email.body).slice(0, 500),
    ...fields,
  }
}

const RE_CLP = /\$\s*([\d.,]+)/
const RE_CARD = /\*{2,}\s*(\d{4})/
// "Cuenta Corriente N° 07654321" / "Cuenta Corriente N de cuenta 00-112-23344-55"
// / "su Cuenta Corriente 1122334455"
const RE_ACCOUNT = /cuenta(?:\s+corriente)?[^\d$]{0,25}([\d-]{6,})/i

function accountHint(text: string, re: RegExp = RE_ACCOUNT): string | null {
  const raw = matchGroup(text, re)
  return raw !== null ? normalizeAccountNumber(raw) : null
}

// ---------------------------------------------------------------------------
// Banco de Chile
// ---------------------------------------------------------------------------

/**
 * "Compra con Tarjeta de Crédito": "…compra por $9.900 (o US$23,79) con
 * Tarjeta de Crédito ****NNNN en COMERCIO el 08/07/2026 21:15…"
 */
export function parseBancoChileTc(email: RawEmail): ParsedMovement | null {
  const text = stripHtml(email.body)
  const card = matchGroup(text, RE_CARD)
  const merchant = matchGroup(text, /\ben\s+(.+?)\s+el\s+\d{2}\/\d{2}\/\d{4}/i)
  if (card === null) return null

  const usdRaw = matchGroup(text, /US\$\s*([\d.]+(?:,\d{1,2})?)/i)
  if (usdRaw !== null) {
    const cents = parseUsdCents(usdRaw)
    if (cents === null) return null
    return base(email, 'bancochile_tc', {
      amount: cents,
      currency: 'USD',
      merchant,
      account_hint: card,
    })
  }

  const clpRaw = matchGroup(text, RE_CLP)
  if (clpRaw === null) return null
  const amount = parseClpAmount(clpRaw)
  if (amount === null) return null
  return base(email, 'bancochile_tc', { amount, merchant, account_hint: card })
}

/**
 * "Comprobante de Pago" (Mi Banco): "Comercio FONASA WEB Monto $ 14.420 …
 * Medio de pago Tarjeta de Débito ****4321". Hint = debit card last4.
 */
export function parseBancoChilePago(email: RawEmail): ParsedMovement | null {
  const text = stripHtml(email.body)
  const amountRaw = matchGroup(text, /monto\s*:?\s*\$\s*([\d.,]+)/i) ?? matchGroup(text, RE_CLP)
  if (amountRaw === null) return null
  const amount = parseClpAmount(amountRaw)
  if (amount === null) return null
  const debitCard = matchGroup(text, /tarjeta de d[ée]bito\s*\*{2,}\s*(\d{4})/i)
  return base(email, 'bancochile_pago', {
    amount,
    merchant: matchGroup(text, /comercio\s+([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑa-záéíóúñ0-9 .]+?)\s+(?:monto|detalle|\$)/i),
    account_hint: debitCard ?? accountHint(text),
  })
}

/**
 * "Transferencia a Terceros" / "Transferencias de Fondos a …":
 * "…una transferencia de fondos a NOMBRE, el día …, desde su Cuenta
 *  Corriente 1122334455 … Monto $36.800 … TEF_…" (o tabla Destinatario/Monto).
 */
export function parseBancoChileTransferOut(email: RawEmail): ParsedMovement | null {
  const text = stripHtml(email.body)
  const amountRaw = matchGroup(text, /monto\s*(?:transferido)?\s*:?\s*\$\s*([\d.,]+)/i)
    ?? matchGroup(text, RE_CLP)
  if (amountRaw === null) return null
  const amount = parseClpAmount(amountRaw)
  if (amount === null) return null
  return base(email, 'bancochile_transfer_out', {
    amount,
    counterparty:
      matchGroup(text, /transferencia de fondos a\s+(.+?)[,.]?\s+el d[ií]a/i)
      ?? matchGroup(text, /(?:destinatario|nombre)\s*:?\s*([A-ZÁÉÍÓÚÑa-záéíóúñ ]{3,}?)(?=\s*(?:RUT|rut|banco|cuenta|monto|$))/i),
    account_hint:
      accountHint(text, /desde su cuenta corriente\s*(?:n[^\d$]{0,15})?([\d-]{6,})/i)
      ?? accountHint(text, /cuenta\s+(?:de\s+)?origen[^\d$]{0,25}([\d-]{6,})/i)
      ?? accountHint(text),
    // "Datos del Destinatario … Rut … Cuenta 5566778899 Banco …" — proves an
    // own-account transfer when the number matches one of the user's accounts.
    dest_hint: accountHint(text, /destinatario.{0,120}?rut\s*:?\s*[\d.kK-]+\s*cuenta\s*:?\s*([\d-]{4,})/i),
    bank_tx_id: matchGroup(text, /\b(TEF_\w+)\b/),
  })
}

/** "Aviso de transferencia de fondos" (Banco de Chile): incoming transfer. */
export function parseBancoChileTransferIn(email: RawEmail): ParsedMovement | null {
  const text = stripHtml(email.body)
  const amountRaw = matchGroup(text, RE_CLP)
  if (amountRaw === null) return null
  const amount = parseClpAmount(amountRaw)
  if (amount === null) return null
  return base(email, 'bancochile_transfer_in', {
    amount,
    counterparty: matchGroup(
      text,
      /(?:que|de|desde|remitente)\s*:?\s*(?:don|doña|sr\.?|sra\.?)?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{3,}?)(?=\s*(?:RUT|le ha|ha realizado|te transfirió|monto|\$))/,
    ),
    account_hint: accountHint(text),
  })
}

/**
 * "Pago de Tarjeta de Crédito Nacional/Internacional" (Mi Banco):
 * "Origen … N de cuenta 00-112-23344-55 Destino … N de tarjeta
 *  ************NNNN Utilizado $16.615 Monto $518.612". The payment amount is
 * "Monto" (NOT the first $ in the body). Hint = destination card last4.
 */
export function parseBancoChilePagoTc(email: RawEmail): ParsedMovement | null {
  const text = stripHtml(email.body)
  const amountRaw = matchGroup(text, /(?:^|\s)monto\s*:?\s*\$\s*([\d.,]+)/i)
  if (amountRaw === null) return null
  const amount = parseClpAmount(amountRaw)
  if (amount === null) return null
  const card = matchGroup(text, RE_CARD)
  return base(email, 'bancochile_pago_tc', {
    amount,
    account_hint: card ?? accountHint(text),
    counterparty: /internacional/i.test(email.subject) ? 'TC Internacional' : 'TC Nacional',
  })
}

// ---------------------------------------------------------------------------
// BICE
// ---------------------------------------------------------------------------

/**
 * "Hicimos la transferencia": "Monto $71.648 Cuenta de origen … Número de
 * cuenta 7654321 Cuenta de destino Nombre … Banco … Número de cuenta …".
 * Hint = ORIGIN account (money leaves it).
 */
export function parseBiceTransferOut(email: RawEmail): ParsedMovement | null {
  const text = stripHtml(email.body)
  const amountRaw = matchGroup(text, /monto\s*\$\s*([\d.,]+)/i) ?? matchGroup(text, RE_CLP)
  if (amountRaw === null) return null
  const amount = parseClpAmount(amountRaw)
  if (amount === null) return null
  return base(email, 'bice_transfer_out', {
    amount,
    counterparty: matchGroup(
      text,
      /cuenta de destino.{0,60}?nombre\s+([A-ZÁÉÍÓÚÑa-záéíóúñ ]{3,}?)\s+(?:RUT|rut|banco)/i,
    ),
    account_hint: accountHint(text, /cuenta de origen.{0,80}?mero de cuenta\s*([\d-]{4,})/i)
      ?? accountHint(text),
    dest_hint: accountHint(text, /cuenta de destino.{0,120}?mero de cuenta\s*([\d-]{4,})/i),
  })
}

/**
 * "Recibiste una transferencia": "Monto $71.648 Cuenta de origen Nombre …
 * Cuenta de destino Banco … Número de cuenta 9988776655".
 * Hint = DESTINATION account (money arrives there).
 */
export function parseBiceTransferIn(email: RawEmail): ParsedMovement | null {
  const text = stripHtml(email.body)
  const amountRaw = matchGroup(text, /monto\s*\$\s*([\d.,]+)/i) ?? matchGroup(text, RE_CLP)
  if (amountRaw === null) return null
  const amount = parseClpAmount(amountRaw)
  if (amount === null) return null
  return base(email, 'bice_transfer_in', {
    amount,
    counterparty: matchGroup(
      text,
      /cuenta de origen.{0,60}?nombre\s+([A-ZÁÉÍÓÚÑa-záéíóúñ ]{3,}?)\s+(?:RUT|rut|banco)/i,
    ),
    account_hint: accountHint(text, /cuenta de destino.{0,120}?mero de cuenta\s*([\d-]{4,})/i)
      ?? accountHint(text),
  })
}

/**
 * "Confirmación del pago de tarjeta de crédito": "Pagaste tu tarjeta de
 * crédito por: Monto $197.802 … Número de tarjeta **** 1234".
 */
export function parseBicePagoTc(email: RawEmail): ParsedMovement | null {
  const text = stripHtml(email.body)
  const amountRaw = matchGroup(text, /monto\s*\$\s*([\d.,]+)/i) ?? matchGroup(text, RE_CLP)
  if (amountRaw === null) return null
  const amount = parseClpAmount(amountRaw)
  if (amount === null) return null
  return base(email, 'bice_pago_tc', {
    amount,
    account_hint: matchGroup(text, RE_CARD),
    counterparty: 'Pago TC BICE',
  })
}

// ---------------------------------------------------------------------------
// Mercado Pago / Tenpo / BCI
// ---------------------------------------------------------------------------

/** "Tu transferencia fue enviada" (Mercado Pago). */
export function parseMpTransferOut(email: RawEmail): ParsedMovement | null {
  const text = stripHtml(email.body)
  const amountRaw = matchGroup(text, RE_CLP)
  if (amountRaw === null) return null
  const amount = parseClpAmount(amountRaw)
  if (amount === null) return null
  return base(email, 'mp_transfer_out', {
    amount,
    counterparty: matchGroup(
      text,
      /(?:para|a)\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{3,}?)(?=\s*(?:RUT|rut|banco|cuenta|monto|\$|\.|$))/,
    ),
    account_hint: 'mercadopago',
    dest_hint: accountHint(text, /n[úu]mero de cuenta:?\s*([\d-]{4,})/i),
  })
}

/**
 * "Comprobante de transferencia - Tenpo": "La transferencia de NOMBRE por
 * $2.440.173 a tu cuenta fue exitosa … Nº cuenta de destino: 5566778899".
 * Hint = destination account (where the money landed).
 */
export function parseTenpoTransferIn(email: RawEmail): ParsedMovement | null {
  const text = stripHtml(email.body)
  const amountRaw = matchGroup(text, /monto transferencia:?\s*\$\s*([\d.,]+)/i)
    ?? matchGroup(text, RE_CLP)
  if (amountRaw === null) return null
  const amount = parseClpAmount(amountRaw)
  if (amount === null) return null
  return base(email, 'tenpo_transfer_in', {
    amount,
    counterparty: matchGroup(text, /transferencia de\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{3,}?)\s+por/i),
    account_hint: accountHint(text, /cuenta de destino:?\s*([\d-]{6,})/i) ?? 'tenpo',
  })
}

/**
 * BCI (contacto@bci.cl), both directions. Amounts use COMMA thousands
 * ("Monto transferido: $ 60,173").
 * - Outgoing ("Origen Razón social: … SPA … Destino Nombre: … N de cuenta:
 *   000000009988776655"): hint = DESTINATION account; promote decides whether
 *   it is an own-account transfer or an expense.
 * - Incoming: hint = own/destination account.
 */
export function parseBciSpa(email: RawEmail): ParsedMovement | null {
  const text = stripHtml(email.body)
  const amountRaw = matchGroup(text, /monto(?:\s+transferido)?:?\s*\$\s*([\d.,]+)/i)
    ?? matchGroup(text, RE_CLP)
  if (amountRaw === null) return null
  const amount = parseClpAmount(amountRaw)
  if (amount === null) return null

  // BCI sends two notification emails per transfer: the comprobante number
  // dedups them via transactions.metadata.bank_tx_id.
  const comprobante = matchGroup(text, /de comprobante:?\s*(\d{5,})/i)
  const bankTxId = comprobante !== null ? `BCI_${comprobante}` : null

  const isOutgoing = /origen\s+raz[óo]n social/i.test(text)
  if (isOutgoing) {
    return base(email, 'bci_spa', {
      amount,
      counterparty: matchGroup(text, /destino\s+nombre:?\s*([A-ZÁÉÍÓÚÑa-záéíóúñ ]{3,}?)\s+(?:monto|RUT|rut|n)/i),
      account_hint: accountHint(text, /de cuenta:?\s*([\d-]{6,})/i),
      bank_tx_id: bankTxId,
    })
  }
  return base(email, 'bci_spa', {
    amount,
    counterparty: matchGroup(text, /(?:de|desde|origen)\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{3,}?)(?=\s*(?:RUT|rut|banco|cuenta|monto|por|\$|$))/),
    account_hint: accountHint(text),
    bank_tx_id: bankTxId,
  })
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function isNoise(email: RawEmail): boolean {
  const from = email.from.toLowerCase()
  if (NOISE_SENDERS.some((s) => from.includes(s))) return true
  return NOISE_SUBJECTS.some((re) => re.test(email.subject))
}

/**
 * Source an email WOULD map to by sender+subject, without parsing the body.
 * Used to stage unparseable-but-routed emails as 'error' rows (the
 * email_movements.source check constraint needs a concrete source).
 * Returns null when no route matches (unknown subject at a known sender).
 */
export function sourceForEmail(email: RawEmail): EmailSource | null {
  const from = email.from.toLowerCase()
  const subject = email.subject

  if (from.includes('enviodigital@bancochile.cl')) {
    return /compra con tarjeta/i.test(subject) ? 'bancochile_tc' : null
  }
  if (from.includes('serviciodetransferencias@bancochile.cl')) {
    if (/pago de tarjeta de cr[eé]dito/i.test(subject)) return 'bancochile_pago_tc'
    if (/comprobante de pago/i.test(subject)) return 'bancochile_pago'
    if (/transferencia a terceros|transferencias? de fondos a/i.test(subject)) {
      return 'bancochile_transfer_out'
    }
    if (/aviso de transferencia/i.test(subject)) return 'bancochile_transfer_in'
    return null
  }
  if (from.includes('reply@info.bice.cl')) {
    if (/hicimos la transferencia/i.test(subject)) return 'bice_transfer_out'
    if (/recibiste una transferencia/i.test(subject)) return 'bice_transfer_in'
    if (/pago de tarjeta de cr[eé]dito/i.test(subject)) return 'bice_pago_tc'
    return null
  }
  if (from.includes('info@mercadopago.com')) {
    return /transferencia fue enviada/i.test(subject) ? 'mp_transfer_out' : null
  }
  if (from.includes('no-reply@tenpo.cl')) {
    return /comprobante de transferencia/i.test(subject) ? 'tenpo_transfer_in' : null
  }
  if (from.includes('contacto@bci.cl')) {
    return /aviso de transferencia|transferencia se realiz[óo]/i.test(subject) ? 'bci_spa' : null
  }
  return null
}

/**
 * Route a raw email to its parser.
 * - Returns ParsedMovement when parsed.
 * - Returns null when the sender is known but the email is unparseable or the
 *   subject matches no known format (caller stages it as 'error').
 * - Returns 'ignore' for noise and unknown senders.
 */
export function parseEmail(email: RawEmail): ParsedMovement | null | 'ignore' {
  if (isNoise(email)) return 'ignore'
  const from = email.from.toLowerCase()

  const knownSender = [
    'enviodigital@bancochile.cl',
    'serviciodetransferencias@bancochile.cl',
    'reply@info.bice.cl',
    'info@mercadopago.com',
    'no-reply@tenpo.cl',
    'contacto@bci.cl',
  ].some((s) => from.includes(s))
  if (!knownSender) return 'ignore'

  const source = sourceForEmail(email)
  if (source === null) return null

  switch (source) {
    case 'bancochile_tc':
      return parseBancoChileTc(email)
    case 'bancochile_pago':
      return parseBancoChilePago(email)
    case 'bancochile_transfer_out':
      return parseBancoChileTransferOut(email)
    case 'bancochile_transfer_in':
      return parseBancoChileTransferIn(email)
    case 'bancochile_pago_tc':
      return parseBancoChilePagoTc(email)
    case 'bice_transfer_out':
      return parseBiceTransferOut(email)
    case 'bice_transfer_in':
      return parseBiceTransferIn(email)
    case 'bice_pago_tc':
      return parseBicePagoTc(email)
    case 'mp_transfer_out':
      return parseMpTransferOut(email)
    case 'tenpo_transfer_in':
      return parseTenpoTransferIn(email)
    case 'bci_spa':
      return parseBciSpa(email)
  }
}
