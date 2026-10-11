export function formatMoney(amount: number, currency: string = 'CLP'): string {
  const isNegative = amount < 0
  const abs = Math.abs(amount)

  let formatted: string
  if (currency === 'USD') {
    formatted = abs.toLocaleString('en-US')
  } else {
    formatted = abs.toLocaleString('es-CL')
  }

  const prefix = isNegative ? '-$' : '$'
  return `${prefix}${formatted}`
}

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "10 oct" from a YYYY-MM-DD date. */
export function formatShortDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-')
  return `${Number(day)} ${SHORT_MONTHS[Number(month) - 1] ?? ''}`
}

export function formatHoursAgo(hours: number): string {
  if (hours < 1) return 'hace minutos'
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'hace 1 día' : `hace ${days} días`
}

/** "11 oct, 09:05" in Chile time from an ISO timestamp. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/Santiago',
  }).format(new Date(iso)).replace('.', '')
}
