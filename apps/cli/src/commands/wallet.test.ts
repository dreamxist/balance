import { describe, expect, it } from 'vitest'
import { renderUnmapped } from './wallet'

describe('renderUnmapped', () => {
  it('says so when every card is mapped', () => {
    expect(renderUnmapped([])).toContain('Todas las tarjetas')
  })

  it('lists each unmapped card with its pending payments and how to link it', () => {
    const out = renderUnmapped([{ card: 'Visa Gold', payments: 2, total: 15500, lastAt: '2026-10-10T15:00:00Z' }])
    expect(out).toMatch(/Visa Gold\s+2\s+\$15\.500/)
    expect(out).toContain('bal wallet link')
  })
})
