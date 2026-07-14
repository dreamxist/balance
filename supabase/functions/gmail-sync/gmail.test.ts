import { assertEquals } from 'jsr:@std/assert@1'
import { buildGmailQuery, decodeBase64Url, extractBody, headerValue } from './gmail.ts'
import { sourceForEmail } from './parsers.ts'

function b64url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

Deno.test('buildGmailQuery includes every known sender and the watermark', () => {
  const q = buildGmailQuery(1751900000.7)
  assertEquals(q.includes('from:enviodigital@bancochile.cl'), true)
  assertEquals(q.includes('from:serviciodetransferencias@bancochile.cl'), true)
  assertEquals(q.includes('from:reply@info.bice.cl'), true)
  assertEquals(q.includes('from:info@mercadopago.com'), true)
  assertEquals(q.includes('from:no-reply@tenpo.cl'), true)
  assertEquals(q.includes('from:contacto@bci.cl'), true)
  assertEquals(q.endsWith('after:1751900000'), true)
})

Deno.test('decodeBase64Url handles gmail url-safe encoding with UTF-8', () => {
  assertEquals(decodeBase64Url(b64url('compra por $9.900')), 'compra por $9.900')
})

Deno.test('headerValue is case-insensitive and defaults to empty', () => {
  const payload = { headers: [{ name: 'From', value: 'x@y.cl' }] }
  assertEquals(headerValue(payload, 'from'), 'x@y.cl')
  assertEquals(headerValue(payload, 'Subject'), '')
})

Deno.test('extractBody prefers html parts and walks nesting', () => {
  const payload = {
    mimeType: 'multipart/alternative',
    parts: [
      { mimeType: 'text/plain', body: { data: b64url('plano') } },
      {
        mimeType: 'multipart/related',
        parts: [{ mimeType: 'text/html', body: { data: b64url('<b>html</b>') } }],
      },
    ],
  }
  assertEquals(extractBody(payload), '<b>html</b>')
})

Deno.test('extractBody falls back to plain text, then top-level body', () => {
  assertEquals(
    extractBody({
      mimeType: 'multipart/alternative',
      parts: [{ mimeType: 'text/plain', body: { data: b64url('solo texto') } }],
    }),
    'solo texto',
  )
  assertEquals(extractBody({ body: { data: b64url('crudo') } }), 'crudo')
  assertEquals(extractBody({}), '')
})

Deno.test('sourceForEmail routes by sender+subject without parsing', () => {
  assertEquals(
    sourceForEmail({
      id: '1',
      from: 'enviodigital@bancochile.cl',
      subject: 'Compra con Tarjeta de Crédito',
      date: '',
      body: '',
    }),
    'bancochile_tc',
  )
  assertEquals(
    sourceForEmail({
      id: '2',
      from: 'serviciodetransferencias@bancochile.cl',
      subject: 'Novedades',
      date: '',
      body: '',
    }),
    null,
  )
})
