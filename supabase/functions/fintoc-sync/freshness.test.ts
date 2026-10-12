// deno test supabase/functions/fintoc-sync/
import { assertEquals } from 'jsr:@std/assert@1'
import { nextWatermark, staleBankDataError } from './freshness.ts'

const now = new Date('2026-10-12T12:00:00Z')

Deno.test('fresh bank data is not an error', () => {
  assertEquals(staleBankDataError({ last_time_refreshed: '2026-10-12T02:00:00Z', refresh_status: 'idle' }, now), null)
})

Deno.test('an interrupted link that stopped refreshing is an error', () => {
  assertEquals(
    staleBankDataError({ last_time_refreshed: '2026-09-29T19:11:01Z', refresh_status: 'interrupted' }, now),
    'Fintoc no actualiza los datos del banco desde 2026-09-29 (refresh_status interrupted)',
  )
})

Deno.test('a link that never refreshed is an error', () => {
  assertEquals(staleBankDataError({ last_time_refreshed: null }, now), 'Fintoc no actualiza los datos del banco nunca')
})

Deno.test('watermark stops at the last bank refresh', () => {
  assertEquals(nextWatermark('2026-10-12', { last_time_refreshed: '2026-09-29T19:11:01Z' }), '2026-09-29')
  assertEquals(nextWatermark('2026-10-12', { last_time_refreshed: '2026-10-12T02:00:00Z' }), '2026-10-12')
  assertEquals(nextWatermark('2026-10-12', {}), '2026-10-12')
})
