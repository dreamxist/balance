import { describe, expect, it } from 'vitest'
import { aggregateBreakdown, categoryRoot, type BreakdownRow } from './breakdown'

function row(
  type: string,
  amount: number,
  category: string | null,
  description = '',
): BreakdownRow {
  return { type, amount, category, description }
}

describe('categoryRoot', () => {
  it('resolves dotted tree ids by their head segment', () => {
    expect(categoryRoot('necesidad.salud')).toBe('necesidad')
    expect(categoryRoot('consumo.comida')).toBe('consumo')
    expect(categoryRoot('ahorro.fondo')).toBe('ahorro')
    expect(categoryRoot('ingreso.sueldo')).toBe('ingreso')
  })

  it('maps top-level ids', () => {
    expect(categoryRoot('necesidad')).toBe('necesidad')
    expect(categoryRoot('ahorro')).toBe('ahorro')
  })

  it('maps legacy free-text categories', () => {
    expect(categoryRoot('comida')).toBe('consumo')
    expect(categoryRoot('salud')).toBe('necesidad')
    expect(categoryRoot('transporte')).toBe('necesidad')
    expect(categoryRoot('supermercado')).toBe('necesidad')
    expect(categoryRoot('entretenimiento')).toBe('consumo')
    expect(categoryRoot('necesidades')).toBe('necesidad')
    expect(categoryRoot('consumo.libre')).toBe('consumo')
  })

  it('falls back to other for unknown categories', () => {
    expect(categoryRoot('reembolso')).toBe('other')
    expect(categoryRoot('cobro')).toBe('other')
    expect(categoryRoot(null)).toBe('other')
    expect(categoryRoot('')).toBe('other')
  })

  it('is case insensitive and trims', () => {
    expect(categoryRoot('  Necesidad.Salud ')).toBe('necesidad')
    expect(categoryRoot('Facturacion')).toBe('ingreso')
  })
})

describe('aggregateBreakdown', () => {
  it('buckets basic income and spending; delta excludes ahorro', () => {
    const r = aggregateBreakdown([
      row('income', 900_000, 'sueldo'),
      row('expense', 75_000, 'transporte'), // necesidad
      row('expense', 60_000, 'comida'), // consumo
      row('expense', 100_000, 'ahorro'), // ahorro
    ])
    expect(r.income).toBe(900_000)
    expect(r.necesidades).toBe(75_000)
    expect(r.consumo).toBe(60_000)
    expect(r.ahorro).toBe(100_000)
    // delta is income minus spending only — ahorro is an allocation, not a loss.
    expect(r.delta).toBe(900_000 - 75_000 - 60_000)
  })

  it('subtracts refunds from their bucket', () => {
    const r = aggregateBreakdown([
      row('expense', 50_000, 'comida'),
      row('refund', 20_000, 'comida'),
    ])
    expect(r.consumo).toBe(30_000)
  })

  it('nets out undo reversals so an undone expense stops counting', () => {
    // expense + its "Undo:" adjustment (same sign for an expense reversal).
    const r = aggregateBreakdown([
      row('expense', 100_000, 'consumo.libre', 'Polla'),
      row('adjustment', 100_000, 'consumo.libre', 'Undo: Polla'),
    ])
    expect(r.consumo).toBe(0)
  })

  it('nets out an undone income (reversal amount is inverse-signed)', () => {
    const r = aggregateBreakdown([
      row('income', 225_000, 'arriendo', 'Arriendo junio'),
      row('adjustment', -225_000, 'arriendo', 'Undo: Arriendo junio'),
    ])
    expect(r.income).toBe(0)
  })

  it('ignores adjustments that are not undos', () => {
    const r = aggregateBreakdown([
      row('adjustment', 287_970, 'pago-tarjeta', 'Pago tarjeta BICE'),
      row('adjustment', 50_000, 'ajuste', 'Ajuste cuadre MP'),
    ])
    expect(r).toMatchObject({ income: 0, necesidades: 0, consumo: 0, ahorro: 0 })
  })

  it('drops non-flow categories: card payments, collections, movements', () => {
    const r = aggregateBreakdown([
      row('expense', 487_754, 'pago-cuentas', 'Salida MP→BCH p/ pagar TCs'),
      row('expense', 200_000, 'reembolso', 'Cobro reembolso'),
      row('expense', 25_000, 'cobro', 'Pagado este mes'),
      row('expense', 5_000_000, 'movimiento', 'Separado a reserva'),
    ])
    expect(r).toMatchObject({ income: 0, necesidades: 0, consumo: 0, ahorro: 0 })
  })

  it('treats income filed under ahorro as a movement, not earnings', () => {
    const r = aggregateBreakdown([
      row('income', 1_790_000, 'ahorro', 'Ahorro efectivo ingresado a MP'),
      row('income', 900_000, 'sueldo'),
    ])
    expect(r.income).toBe(900_000)
  })

  it('drops collection income (cobro/reembolso) from earnings', () => {
    const r = aggregateBreakdown([
      row('income', 224_420, 'reembolso', 'Reembolso Claude SpA'),
      row('income', 13_284, 'honorarios', 'Deuda IMC'),
    ])
    expect(r.income).toBe(13_284)
  })
})
