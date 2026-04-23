export type Period = 'day' | 'week' | 'month'

export const VALID_PERIODS: readonly Period[] = ['day', 'week', 'month']

export function isPeriod(value: string): value is Period {
  return (VALID_PERIODS as readonly string[]).includes(value)
}

function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function periodRange(period: Period, now: Date = new Date()): { start: string; endExclusive: string } {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endExclusive = new Date(base)
  endExclusive.setDate(endExclusive.getDate() + 1)

  let start: Date
  if (period === 'day') {
    start = base
  } else if (period === 'week') {
    start = new Date(base)
    start.setDate(base.getDate() - 6)
  } else {
    start = new Date(base.getFullYear(), base.getMonth(), 1)
  }
  return { start: toDateString(start), endExclusive: toDateString(endExclusive) }
}
