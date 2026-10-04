import { describe, expect, it } from 'vitest'
import { resolveF29Values } from './spa'
import type { F29Summary } from './spa'

const ESTIMATE: F29Summary = {
  year: 2026,
  month: 3,
  iva_debito: 190000,
  iva_credito: 30000,
  remanente_anterior: 0,
  credito_total: 30000,
  iva_neto: 160000,
  remanente_siguiente: 0,
  ppm: 2500,
  f29_total: 162500,
  bruto: 1000000,
  deadline: '2026-04-20',
  declared: null,
}

describe('resolveF29Values', () => {
  it('uses the app estimate while the period is not declared', () => {
    const result = resolveF29Values(ESTIMATE)
    expect(result.source).toBe('estimate')
    expect(result.f29_total).toBe(162500)
    expect(result.breakdownUnknown).toBe(false)
  })

  it('uses the app estimate when the declaration is not official', () => {
    const result = resolveF29Values({
      ...ESTIMATE,
      declared: { declared_at: '2026-04-12', confirmation_number: null, notes: null, is_official: false },
    })
    expect(result.source).toBe('estimate')
    expect(result.f29_total).toBe(162500)
  })

  it('prefers the declared values over the estimate', () => {
    const result = resolveF29Values({
      ...ESTIMATE,
      declared: {
        declared_at: '2026-04-12',
        confirmation_number: '1234',
        notes: null,
        is_official: true,
        official_codes: { '538': 200000, '537': 50000, '091': 152000 },
        iva_debito: 200000,
        iva_credito: 50000,
        remanente_anterior: 0,
        remanente_siguiente: 0,
        iva_neto: 150000,
        ppm: 2000,
        f29_total: 152000,
      },
    })
    expect(result.source).toBe('official')
    expect(result.iva_debito).toBe(200000)
    expect(result.f29_total).toBe(152000)
    expect(result.breakdownUnknown).toBe(false)
  })

  it('flags a declaration that only carries the total to pay', () => {
    const result = resolveF29Values({
      ...ESTIMATE,
      iva_debito: 0,
      iva_credito: 0,
      credito_total: 0,
      iva_neto: 0,
      ppm: 0,
      f29_total: 0,
      bruto: 0,
      declared: {
        declared_at: '2026-04-12',
        confirmation_number: null,
        notes: null,
        is_official: true,
        official_codes: { '091': 152000 },
        iva_debito: 0,
        iva_credito: 0,
        remanente_anterior: 0,
        remanente_siguiente: 0,
        iva_neto: 0,
        ppm: 0,
        f29_total: 152000,
      },
    })
    expect(result.source).toBe('official')
    expect(result.f29_total).toBe(152000)
    expect(result.ppm).toBe(0)
    expect(result.breakdownUnknown).toBe(true)
  })
})
