// deno test supabase/functions/wallet-ingest/
import { assertEquals } from 'jsr:@std/assert@1'
import { parseClpAmount, parsePayload } from './parse.ts'

Deno.test('parses the CLP formats Wallet shows', () => {
  assertEquals(parseClpAmount('$4.500'), 4500)
  assertEquals(parseClpAmount('CLP 12.000'), 12000)
  assertEquals(parseClpAmount('$ 1.234.567'), 1234567)
  assertEquals(parseClpAmount('4.500,00'), 4500)
  assertEquals(parseClpAmount('990'), 990)
  assertEquals(parseClpAmount(15000), 15000)
})

Deno.test('rejects foreign currency and empty amounts', () => {
  assertEquals(parseClpAmount('US$12.50'), null)
  assertEquals(parseClpAmount('USD 3'), null)
  assertEquals(parseClpAmount('$0'), null)
  assertEquals(parseClpAmount(''), null)
  assertEquals(parseClpAmount(null), null)
})

Deno.test('payload requires card and a CLP amount, merchant and date optional', () => {
  const now = new Date('2026-10-12T15:00:00Z')
  assertEquals(parsePayload({ card: 'BICE Visa', merchant: ' Cafe ', amount: '$4.500' }, now), {
    ok: true,
    payment: { card: 'BICE Visa', merchant: 'Cafe', amount: 4500, occurredAt: '2026-10-12T15:00:00.000Z' },
  })
  assertEquals(parsePayload({ merchant: 'Cafe', amount: '$4.500' }, now).ok, false)
  assertEquals(parsePayload({ card: 'BICE Visa', amount: 'US$5' }, now).ok, false)
  assertEquals(parsePayload('nope', now).ok, false)
})
