import { describe, expect, it } from 'vitest'
import type { LifeObjectiveWithSteps, LifeWeekView } from '@balance/core'
import {
  collect,
  formatTime,
  matchByRef,
  nullable,
  parseVehicle,
  renderImportResult,
  renderObjectives,
  renderWeek,
} from './life'

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'

function slot(day: string, vehicle: 'sport' | 'work' | 'personal', title: string, starts_at: string | null = null) {
  return {
    id: `${day}-${title}`,
    week_id: 'w1',
    user_id: 'u1',
    day,
    vehicle,
    session_id: null,
    title,
    starts_at,
    position: 0,
    note: null,
    created_at: '',
    updated_at: '',
  }
}

const WEEK: LifeWeekView = {
  week: { id: 'w1', user_id: 'u1', week_start: '2026-10-12', intent: null, created_at: '', updated_at: '' },
  slots: [
    slot('2026-10-12', 'sport', 'KUDO', '21:00:00'),
    slot('2026-10-12', 'work', 'Planificar la semana'),
    slot('2026-10-14', 'work', 'Cierre IMC', '18:30:00'),
    slot('2026-10-14', 'work', 'Taram presencial'),
    slot('2026-10-18', 'personal', 'Día de las relaciones'),
  ],
  notes: [
    {
      week_id: 'w1',
      user_id: 'u1',
      vehicle: 'sport',
      body: 'Bien',
      wins: ['3 sesiones'],
      risks: ['Sueño'],
      updated_at: '',
    },
  ],
}

describe('parseVehicle', () => {
  it('accepts English and Spanish names', () => {
    expect(parseVehicle('sport')).toBe('sport')
    expect(parseVehicle('Deporte')).toBe('sport')
    expect(parseVehicle('trabajo')).toBe('work')
    expect(parseVehicle('personal')).toBe('personal')
  })

  it('rejects anything else', () => {
    expect(() => parseVehicle('relaciones')).toThrow('vehículo inválido')
  })
})

describe('option helpers', () => {
  it('nullable maps none to null and keeps other values', () => {
    expect(nullable(undefined)).toBeUndefined()
    expect(nullable('none')).toBeNull()
    expect(nullable('NONE')).toBeNull()
    expect(nullable('18:00')).toBe('18:00')
  })

  it('collect accumulates repeated options', () => {
    expect(collect('b', collect('a'))).toEqual(['a', 'b'])
  })

  it('formatTime drops seconds', () => {
    expect(formatTime('21:00:00')).toBe('21:00')
    expect(formatTime(null)).toBe('')
  })
})

describe('matchByRef', () => {
  const items = [
    { id: ID_A, name: 'Full Body A' },
    { id: ID_B, name: 'Full Body B' },
  ]
  const name = (i: { name: string }) => i.name

  it('matches by uuid, exact name and unique substring', () => {
    expect(matchByRef(items, ID_B, name, 'sesión').id).toBe(ID_B)
    expect(matchByRef(items, 'full body a', name, 'sesión').id).toBe(ID_A)
    expect(matchByRef(items, 'y b', name, 'sesión').id).toBe(ID_B)
  })

  it('errors on ambiguous or missing refs', () => {
    expect(() => matchByRef(items, 'full', name, 'sesión')).toThrow('ambiguo')
    expect(() => matchByRef(items, 'kudo', name, 'sesión')).toThrow('Ningún sesión')
    expect(() => matchByRef(items, '33333333-3333-4333-8333-333333333333', name, 'sesión')).toThrow('No hay')
  })
})

describe('renderWeek', () => {
  it('lays out one row per day with a column per vehicle', () => {
    const out = renderWeek(WEEK)
    expect(out).toContain('SEMANA DEL 2026-10-12')
    expect(out).toMatch(/Lun 12\s+21:00 KUDO\s+Planificar la semana/)
    expect(out).toMatch(/Mié 14\s+·\s+18:30 Cierre IMC/)
    expect(out).toMatch(/\n\s+Taram presencial/)
    expect(out).toMatch(/Dom 18\s+·\s+·\s+Día de las relaciones/)
  })

  it('shows the week notes with wins and risks', () => {
    const out = renderWeek(WEEK)
    expect(out).toContain('Deporte  Bien')
    expect(out).toContain('+ 3 sesiones')
    expect(out).toContain('! Sueño')
  })

  it('lists slot ids only when asked', () => {
    expect(renderWeek(WEEK)).not.toContain('2026-10-12-KUDO')
    expect(renderWeek(WEEK, { ids: true })).toContain('2026-10-12-KUDO')
  })
})

describe('renderObjectives', () => {
  const objective: LifeObjectiveWithSteps = {
    id: ID_A,
    user_id: 'u1',
    vehicle: 'sport',
    title: 'Pino libre',
    year: 2026,
    focus: 'Sábados',
    status: 'active',
    status_note: null,
    closed_on: null,
    linear_project_id: null,
    position: 1,
    created_at: '',
    updated_at: '',
    steps: [
      { id: 's1', objective_id: ID_A, user_id: 'u1', position: 1, title: 'Practicar', period: 'Ene', status: 'done', started_on: null, done_on: '2026-02-28', note: null, created_at: '', updated_at: '' },
      { id: 's2', objective_id: ID_A, user_id: 'u1', position: 2, title: 'Libre 5 s', period: null, status: 'current', started_on: null, done_on: null, note: null, created_at: '', updated_at: '' },
    ],
  }

  it('groups by vehicle and shows progress and step marks', () => {
    const out = renderObjectives([objective])
    expect(out).toContain('DEPORTE')
    expect(out).toMatch(/Pino libre\s+1\/2/)
    expect(out).toContain('✅ Ene  Practicar  2026-02-28')
    expect(out).toContain('▶ Libre 5 s')
  })

  it('marks closed objectives', () => {
    const out = renderObjectives([{ ...objective, status: 'dropped', closed_on: '2026-10-01' }])
    expect(out).toContain('[abandonado 2026-10-01]')
  })
})

describe('renderImportResult', () => {
  it('explains a refusal', () => {
    const out = renderImportResult({ status: 'refused', existing: { sessions: 4, objectives: 13 } })
    expect(out).toContain('4 sesiones, 13 objetivos')
    expect(out).toContain('No se escribió nada')
  })

  it('summarizes an import', () => {
    const out = renderImportResult({
      status: 'imported',
      from: '2026-10-12',
      counts: { habits: 4, sessions: 4, exercises: 26, slots: 13, objectives: 13, steps: 40, budgets: 3, notes: 10 },
    })
    expect(out).toContain('vigente desde 2026-10-12')
    expect(out).toContain('26 ejercicios')
    expect(out).toContain('10 notas')
  })
})
