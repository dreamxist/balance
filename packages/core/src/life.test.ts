import { describe, expect, it, vi } from 'vitest'
import {
  addDays,
  closeObjective,
  importLife,
  isIsoDay,
  isLifeSeed,
  isoWeekday,
  lifeSeedErrors,
  stepStatusChange,
  todayIso,
  weekStartOf,
} from './life'

function validSeed(): Record<string, unknown> {
  return {
    habits: [{ name: 'Dormir 7 h', emoji: '😴', position: 1 }],
    sessions: [
      {
        key: 'kudo',
        vehicle: 'sport',
        name: 'KUDO',
        emoji: null,
        focus: '',
        position: 1,
        exercises: [{ block: 'A', name: 'Sentadilla', prescription: '3x8', purpose: null, position: 1 }],
      },
    ],
    slots: [
      { weekday: 1, vehicle: 'sport', session_key: 'kudo', title: 'KUDO', starts_at: '21:00', position: 1 },
      { weekday: 1, vehicle: 'work', session_key: null, title: 'Planificar', starts_at: null, position: 1 },
    ],
    objectives: [
      {
        vehicle: 'sport',
        title: 'Grasa 12%',
        year: 2026,
        focus: '',
        status: 'active',
        status_note: null,
        closed_on: null,
        linear_project_id: null,
        position: 1,
        steps: [
          { title: 'Bioimpedancia', status: 'done', done_on: '2026-01-31', period: 'Ene', position: 1 },
          { title: 'Cut', status: 'current', done_on: null, position: 2 },
        ],
      },
      { vehicle: 'work', title: 'Sin pasos', year: 2026, status: 'active', position: 2, steps: [] },
    ],
    budgets: [{ bucket: 'necesidades', month: '2026-10-01', amount: 500000 }],
    notes: [{ vehicle: 'personal', topic: null, body: 'Algo', noted_on: '2026-10-01' }],
  }
}

describe('date helpers', () => {
  it('weekStartOf returns the Monday of the ISO week', () => {
    expect(weekStartOf('2026-10-12')).toBe('2026-10-12') // Monday
    expect(weekStartOf('2026-10-14')).toBe('2026-10-12')
    expect(weekStartOf('2026-10-18')).toBe('2026-10-12') // Sunday
    expect(weekStartOf('2026-01-01')).toBe('2025-12-29') // across the year
  })

  it('isoWeekday is 1 for Monday and 7 for Sunday', () => {
    expect(isoWeekday('2026-10-12')).toBe(1)
    expect(isoWeekday('2026-10-18')).toBe(7)
  })

  it('addDays crosses months and DST without drifting', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-09-06', 7)).toBe('2026-09-13')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('isIsoDay rejects impossible dates and other formats', () => {
    expect(isIsoDay('2026-02-28')).toBe(true)
    expect(isIsoDay('2026-02-30')).toBe(false)
    expect(isIsoDay('2026-2-01')).toBe(false)
    expect(isIsoDay(20261001)).toBe(false)
  })

  it('todayIso uses the local date', () => {
    expect(todayIso(new Date(2026, 9, 5, 23, 30))).toBe('2026-10-05')
  })
})

describe('stepStatusChange', () => {
  it('done fills done_on with today', () => {
    expect(stepStatusChange('done', '2026-10-12')).toEqual({ status: 'done', done_on: '2026-10-12' })
  })

  it('done keeps an explicit date', () => {
    expect(stepStatusChange('done', '2026-10-12', '2026-10-01')).toEqual({ status: 'done', done_on: '2026-10-01' })
  })

  it('leaving done clears done_on', () => {
    expect(stepStatusChange('current', '2026-10-12')).toEqual({ status: 'current', done_on: null })
    expect(stepStatusChange('paused', '2026-10-12')).toEqual({ status: 'paused', done_on: null })
  })

  it('rejects a date for a status other than done', () => {
    expect(() => stepStatusChange('pending', '2026-10-12', '2026-10-01')).toThrow()
  })
})

describe('lifeSeedErrors', () => {
  it('accepts a valid seed, with empty steps and empty-string focus', () => {
    expect(lifeSeedErrors(validSeed())).toEqual([])
    expect(isLifeSeed(validSeed())).toBe(true)
  })

  it('accepts a seed without notes', () => {
    const seed = validSeed()
    delete seed.notes
    expect(isLifeSeed(seed)).toBe(true)
  })

  it('rejects non-objects and missing arrays', () => {
    expect(lifeSeedErrors(null)).toEqual(['seed: must be an object'])
    expect(lifeSeedErrors({})).toEqual(
      expect.arrayContaining(['habits: must be an array', 'objectives: must be an array']),
    )
  })

  it('flags a slot pointing to an unknown session', () => {
    const seed = validSeed()
    seed.slots = [{ weekday: 8, vehicle: 'sport', session_key: 'nope', title: 'X', starts_at: '25:00', position: 1 }]
    const errors = lifeSeedErrors(seed)
    expect(errors).toContain('slots[0].weekday: integer 1-7 (Monday = 1)')
    expect(errors).toContain('slots[0].session_key: no session with key "nope"')
    expect(errors).toContain('slots[0].starts_at: expected HH:MM')
  })

  it('enforces the done_on rule on steps and closed_on on objectives', () => {
    const seed = validSeed()
    seed.objectives = [
      {
        vehicle: 'work',
        title: 'X',
        year: 2026,
        status: 'done',
        position: 1,
        steps: [
          { title: 'a', status: 'done', position: 1 },
          { title: 'b', status: 'pending', done_on: '2026-01-01', position: 2 },
        ],
      },
    ]
    const errors = lifeSeedErrors(seed)
    expect(errors).toContain('objectives[0].closed_on: required when status is done')
    expect(errors).toContain('objectives[0].steps[0].done_on: required when status is done')
    expect(errors).toContain('objectives[0].steps[1].done_on: only allowed when status is done')
  })

  it('rejects bad vehicles, budgets and notes', () => {
    const seed = validSeed()
    seed.sessions = [{ key: 'k', vehicle: 'love', name: 'x', position: 1, exercises: [] }]
    seed.budgets = [{ bucket: 'lujo', month: '2026-10-15', amount: 1.5 }]
    seed.notes = [{ vehicle: 'personal', body: '', noted_on: 'ayer' }]
    const errors = lifeSeedErrors(seed)
    expect(errors).toContain('sessions[0].vehicle: one of sport, work, personal')
    expect(errors).toContain('budgets[0].bucket: one of necesidades, consumo, ahorro')
    expect(errors).toContain('budgets[0].month: expected YYYY-MM or the first day YYYY-MM-01')
    expect(errors).toContain('budgets[0].amount: non-negative integer (CLP)')
    expect(errors).toContain('notes[0].body: required text')
    expect(errors).toContain('notes[0].noted_on: expected YYYY-MM-DD')
  })

  it('rejects more than four habits', () => {
    const seed = validSeed()
    seed.habits = [1, 2, 3, 4, 5].map((n) => ({ name: `h${n}`, position: n }))
    expect(lifeSeedErrors(seed)).toContain('habits: at most four active habits')
  })
})

describe('importLife', () => {
  it('throws on an invalid seed without touching the database', async () => {
    const from = vi.fn()
    await expect(importLife({ from } as never, { habits: 'x' })).rejects.toThrow('Invalid life seed')
    expect(from).not.toHaveBeenCalled()
  })

  it('refuses when sessions or objectives already exist', async () => {
    const insert = vi.fn()
    const from = vi.fn((table: string) => ({
      select: () => Promise.resolve({ count: table === 'life_objectives' ? 3 : 0, error: null }),
      insert,
    }))
    const result = await importLife({ from } as never, validSeed(), { from: '2026-10-13' })
    expect(result).toEqual({ status: 'refused', existing: { sessions: 0, objectives: 3 } })
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('closeObjective', () => {
  it('calls the RPC with only the given arguments', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'o1', status: 'done' }, error: null })
    await closeObjective({ rpc } as never, 'o1', 'done', { on: '2026-10-01' })
    expect(rpc).toHaveBeenCalledWith('life_close_objective', {
      p_objective_id: 'o1',
      p_status: 'done',
      p_on: '2026-10-01',
    })
  })
})
