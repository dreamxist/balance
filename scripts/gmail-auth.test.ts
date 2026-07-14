import { assertEquals } from 'jsr:@std/assert@1'
import { buildConsentUrl } from './gmail-auth.ts'

Deno.test('buildConsentUrl requests offline gmail.readonly consent', () => {
  const url = new URL(buildConsentUrl('client-123', 'http://127.0.0.1:8377'))
  assertEquals(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
  assertEquals(url.searchParams.get('client_id'), 'client-123')
  assertEquals(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:8377')
  assertEquals(url.searchParams.get('response_type'), 'code')
  assertEquals(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/gmail.readonly')
  assertEquals(url.searchParams.get('access_type'), 'offline')
  assertEquals(url.searchParams.get('prompt'), 'consent')
})
