import { describe, expect, it } from 'vitest'
import { categoryRoot } from './breakdown'

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
