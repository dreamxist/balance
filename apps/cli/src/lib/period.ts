export type Period = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all'

export const VALID_PERIODS: readonly Period[] = ['day', 'week', 'month', 'quarter', 'year', 'all']

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
  } else if (period === 'month') {
    start = new Date(base.getFullYear(), base.getMonth(), 1)
  } else if (period === 'quarter') {
    const quarterStartMonth = Math.floor(base.getMonth() / 3) * 3
    start = new Date(base.getFullYear(), quarterStartMonth, 1)
  } else if (period === 'year') {
    start = new Date(base.getFullYear(), 0, 1)
  } else {
    start = new Date(1970, 0, 1)
  }
  return { start: toDateString(start), endExclusive: toDateString(endExclusive) }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string): boolean {
  return ISO_DATE_RE.test(value)
}
