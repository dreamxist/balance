// Pure helpers for the Gmail REST API: query building, base64url decoding,
// header lookup and body extraction. Kept free of I/O so they run under
// `deno test` without network access.

export const KNOWN_SENDERS = [
  'enviodigital@bancochile.cl',
  'serviciodetransferencias@bancochile.cl',
  'reply@info.bice.cl',
  'info@mercadopago.com',
  'no-reply@tenpo.cl',
  'contacto@bci.cl',
] as const

export function buildGmailQuery(afterEpochSeconds: number): string {
  const from = KNOWN_SENDERS.map((s) => `from:${s}`).join(' OR ')
  return `(${from}) after:${Math.floor(afterEpochSeconds)}`
}

export function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export interface GmailPayload {
  mimeType?: string
  body?: { data?: string }
  parts?: GmailPayload[]
  headers?: Array<{ name: string; value: string }>
}

export function headerValue(payload: GmailPayload, name: string): string {
  const target = name.toLowerCase()
  return payload.headers?.find((h) => h.name.toLowerCase() === target)?.value ?? ''
}

function collectParts(payload: GmailPayload, mime: string): string[] {
  const out: string[] = []
  if (payload.mimeType === mime && payload.body?.data) {
    out.push(decodeBase64Url(payload.body.data))
  }
  for (const part of payload.parts ?? []) {
    out.push(...collectParts(part, mime))
  }
  return out
}

/** Prefer text/html, fall back to text/plain, then the top-level body. */
export function extractBody(payload: GmailPayload): string {
  const html = collectParts(payload, 'text/html')
  if (html.length > 0) return html.join('\n')
  const plain = collectParts(payload, 'text/plain')
  if (plain.length > 0) return plain.join('\n')
  return payload.body?.data ? decodeBase64Url(payload.body.data) : ''
}
