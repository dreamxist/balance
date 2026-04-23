const clpFormatter = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

export function formatCLP(amount: number): string {
  return clpFormatter.format(amount)
}

export function padRight(text: string, width: number): string {
  if (text.length >= width) return text
  return text + ' '.repeat(width - text.length)
}

export function padLeft(text: string, width: number): string {
  if (text.length >= width) return text
  return ' '.repeat(width - text.length) + text
}
