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
