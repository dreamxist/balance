import { describe, expect, it } from 'vitest'
import { isMonth, renderBuckets } from './buckets'
import type { MonthlyBuckets } from '@balance/core'

const SAMPLE: MonthlyBuckets = {
  income: 980000,
  necesidades: 310000,
  consumo: 70000,
  ahorro: 480000,
  por_categorizar: 40000,
  disponible: 560000,
  month: '2026-03',
}

describe('isMonth', () => {
  it('accepts YYYY-MM', () => {
    expect(isMonth('2026-03')).toBe(true)
    expect(isMonth('2026-12')).toBe(true)
  })

  it('rejects other formats and impossible months', () => {
    expect(isMonth('2026-3')).toBe(false)
    expect(isMonth('2026-03-01')).toBe(false)
    expect(isMonth('03-2026')).toBe(false)
    expect(isMonth('2026-00')).toBe(false)
    expect(isMonth('2026-13')).toBe(false)
    expect(isMonth('marzo')).toBe(false)
  })
})

describe('renderBuckets', () => {
  it('renders every bucket with its amount', () => {
    const out = renderBuckets(SAMPLE, 'personal')
    expect(out).toContain('Buckets 2026-03 (personal)')
    expect(out).toMatch(/Ingresos.*980\.000/)
    expect(out).toMatch(/Necesidades.*310\.000/)
    expect(out).toMatch(/Consumo.*70\.000/)
    expect(out).toMatch(/Ahorro.*480\.000/)
    expect(out).toMatch(/Por categorizar.*40\.000/)
    expect(out).toMatch(/Disponible.*560\.000/)
  })

  it('renders negative disponible with minus sign', () => {
    const out = renderBuckets({ ...SAMPLE, disponible: -123456 }, 'personal')
    // es-CL currency puts the sign after the symbol: $-123.456
    expect(out).toMatch(/Disponible.*\$-123\.456/)
  })

  it('shows the requested entity', () => {
    expect(renderBuckets(SAMPLE, 'spa')).toContain('(spa)')
  })
})
