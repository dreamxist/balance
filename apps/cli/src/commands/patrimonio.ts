import type { Command } from 'commander'
import { getAccounts, getSpaAnnualSummary, getSpaExpenses } from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { formatCLP } from '../lib/format'
import { blank, divider, headerLine, indent, pad, ui } from '../lib/ui'

interface PatrimonioOptions {
  neto?: boolean
  tasa: string
  json?: boolean
}

export function registerPatrimonioCommand(program: Command): void {
  program
    .command('patrimonio')
    .description('Patrimonio bruto (personal + SpA) y neto estimado post-impuestos')
    .option('--neto', 'incluir simulación neto (post-impuestos SpA)', false)
    .option('--tasa <pct>', 'tasa de impuesto a la renta SpA (%)', '12.5')
    .option('--json', 'output JSON')
    .action(async (opts: PatrimonioOptions) => {
      const tasa = Number(opts.tasa)
      const client = await getAuthedClient()
      const accounts = (await getAccounts(client)) ?? []

      const personal = accounts.filter((a) => a.entity === 'personal')
      const spa = accounts.filter((a) => a.entity === 'spa')
      const personalTotal = personal.reduce((s, a) => s + a.balance, 0)
      const spaBruto = spa.reduce((s, a) => s + a.balance, 0)
      const brutoTotal = personalTotal + spaBruto

      let provisionRenta = 0
      let utilidadReal = 0
      if (opts.neto) {
        const year = new Date().getFullYear()
        const [summary, expenses] = await Promise.all([
          getSpaAnnualSummary(client, year),
          getSpaExpenses(client),
        ])
        const gastosExtranjeros = expenses
          .filter((t) => (t.date ?? '').startsWith(String(year)))
          .reduce((s, t) => s + Math.abs(t.amount), 0)
        utilidadReal = summary.utilidad - gastosExtranjeros
        provisionRenta = Math.max(0, Math.round((utilidadReal * tasa) / 100))
      }
      const netoTotal = brutoTotal - provisionRenta

      const payload = {
        personal: personalTotal,
        spa_bruto: spaBruto,
        bruto_total: brutoTotal,
        ...(opts.neto ? { utilidad_real: utilidadReal, tasa, provision_renta: provisionRenta, neto_total: netoTotal } : {}),
      }

      if (opts.json) {
        process.stdout.write(JSON.stringify(payload) + '\n')
        return
      }

      const lines: string[] = [blank(), headerLine(ui.title('PATRIMONIO'))]
      lines.push(blank())
      const w = 28
      const row = (l: string, v: string) => indent(`${ui.dim(pad(l, w))}${pad(v, 16, 'left')}`)
      lines.push(row('Personal', formatCLP(personalTotal)))
      lines.push(row('SpA (bruto)', formatCLP(spaBruto)))
      lines.push(divider(w + 16))
      lines.push(row(ui.strong('Patrimonio bruto'), ui.strong(formatCLP(brutoTotal))))
      if (opts.neto) {
        lines.push(blank())
        lines.push(headerLine(ui.title('SIMULACIÓN NETO'), ui.dim('estimación, no RLI')))
        lines.push(blank())
        lines.push(row(`Provisión renta (${tasa}%)`, ui.negative('-' + formatCLP(provisionRenta))))
        lines.push(divider(w + 16))
        lines.push(row(ui.strong('Patrimonio neto est.'), ui.strong(formatCLP(netoTotal))))
        lines.push(indent(ui.dim('(IVA pendiente no incluido aún)')))
      }
      lines.push(blank())
      process.stdout.write(lines.join('\n') + '\n')
    })
}
