import { describe, expect, it } from 'vitest'
import { formatSignedAmount } from './list'

describe('formatSignedAmount', () => {
  it('prefixes expense and debt_payment with minus', () => {
    expect(formatSignedAmount('expense', 5000)).toMatch(/^-\$.*5[.\s ]000/)
    expect(formatSignedAmount('debt_payment', 1000)).toMatch(/^-\$/)
  })

  it('prefixes income and refund with plus', () => {
    expect(formatSignedAmount('income', 12000)).toMatch(/^\+\$/)
    expect(formatSignedAmount('refund', 500)).toMatch(/^\+\$/)
  })

  it('uses the natural sign for adjustment and transfer', () => {
    expect(formatSignedAmount('adjustment', -378000)).toMatch(/^-\$.*378/)
    expect(formatSignedAmount('adjustment', 12000)).toMatch(/^\+\$/)
    expect(formatSignedAmount('transfer', -50000)).toMatch(/^-\$/)
    expect(formatSignedAmount('transfer', 50000)).toMatch(/^\+\$/)
  })

  it('never produces duplicated signs', () => {
    const out = formatSignedAmount('adjustment', -378000)
    expect(out).not.toMatch(/\$-/)
    expect(out).not.toMatch(/\+-|\-\+/)
  })
})
