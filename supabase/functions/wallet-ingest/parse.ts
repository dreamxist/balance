// Pure parsing of the payload an iOS Shortcut sends from a Wallet
// "Transaction" automation. The Shortcut passes the amount as the localized
// currency text Wallet shows (e.g. "$4.500", "CLP 12.000", "4.500,00").

export interface WalletPayment {
  card: string
  merchant: string
  amount: number
  occurredAt: string
}

export type ParseResult = { ok: true; payment: WalletPayment } | { ok: false; error: string }

/** CLP integer from Wallet's amount text; null when it is not a CLP amount. */
export function parseClpAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw > 0 ? raw : null
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (/us\$|usd|€|eur/i.test(text)) return null
  // es-CL groups thousands with "." and writes cents after ","; CLP has no cents.
  const digits = text.replace(/,\d{1,2}$/, '').replace(/[^\d]/g, '')
  if (!digits) return null
  const amount = Number.parseInt(digits, 10)
  return amount > 0 ? amount : null
}

export function parsePayload(body: unknown, now: Date): ParseResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be a JSON object' }
  const b = body as Record<string, unknown>
  const card = typeof b.card === 'string' ? b.card.trim() : ''
  if (!card) return { ok: false, error: 'card is required' }
  const amount = parseClpAmount(b.amount)
  if (amount === null) return { ok: false, error: `amount is not a CLP amount: ${String(b.amount)}` }
  const merchant = typeof b.merchant === 'string' ? b.merchant.trim() : ''
  const date = typeof b.date === 'string' && !Number.isNaN(Date.parse(b.date)) ? new Date(b.date) : now
  return { ok: true, payment: { card, merchant, amount, occurredAt: date.toISOString() } }
}
