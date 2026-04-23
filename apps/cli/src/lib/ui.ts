import pc from 'picocolors'

const isTTY = process.stdout.isTTY === true
const forceColor = process.env.FORCE_COLOR === '1' || process.env.FORCE_COLOR === 'true'
const colorsOn = (forceColor || isTTY) && !process.env.NO_COLOR && process.env.TERM !== 'dumb'

function apply(fn: (s: string) => string, text: string): string {
  return colorsOn ? fn(text) : text
}

export const ui = {
  brand: (s: string) => apply(pc.green, apply(pc.bold, s)),
  logo: (s: string) => apply(pc.green, s),
  bar: () => apply(pc.green, '▎'),
  title: (s: string) => apply(pc.bold, s),
  dim: (s: string) => apply(pc.dim, s),
  muted: (s: string) => apply(pc.gray, s),
  positive: (s: string) => apply(pc.green, s),
  negative: (s: string) => apply(pc.red, s),
  warn: (s: string) => apply(pc.yellow, s),
  accent: (s: string) => apply(pc.cyan, s),
  strong: (s: string) => apply(pc.bold, s),
}

const MARGIN = '  '
const WIDTH = 68

export function pad(text: string, width: number, side: 'left' | 'right' = 'right'): string {
  const visible = stripAnsi(text)
  if (visible.length >= width) return text
  const spaces = ' '.repeat(width - visible.length)
  return side === 'right' ? text + spaces : spaces + text
}

export function stripAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*m/g, '')
}

export function headerLine(left: string, right?: string): string {
  if (!right) return `${MARGIN}${ui.bar()} ${left}`
  const leftRendered = `${ui.bar()} ${left}`
  const leftLen = stripAnsi(leftRendered).length
  const rightLen = stripAnsi(right).length
  const gap = Math.max(1, WIDTH - leftLen - rightLen)
  return `${MARGIN}${leftRendered}${' '.repeat(gap)}${right}`
}

export function ruleLabel(label: string): string {
  const prefix = `─ ${label} `
  const fill = Math.max(3, WIDTH - prefix.length)
  return `${MARGIN}${ui.dim(prefix + '─'.repeat(fill))}`
}

export function blank(): string {
  return ''
}

export function indent(text: string): string {
  return `${MARGIN}  ${text}`
}

export function kv(label: string, value: string, labelWidth = 14): string {
  return `${MARGIN}  ${ui.dim(pad(label, labelWidth))}${value}`
}

export function chip(text: string, tone: 'positive' | 'negative' | 'warn' | 'muted' = 'positive'): string {
  const dot = tone === 'positive' ? ui.positive('●') : tone === 'negative' ? ui.negative('●') : tone === 'warn' ? ui.warn('●') : ui.muted('●')
  const body = tone === 'positive' ? ui.positive(text) : tone === 'negative' ? ui.negative(text) : tone === 'warn' ? ui.warn(text) : ui.muted(text)
  return `${dot} ${body}`
}

export function divider(width = 28): string {
  return `${MARGIN}  ${ui.dim('─'.repeat(width))}`
}
