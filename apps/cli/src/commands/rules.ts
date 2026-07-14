import type { Command } from 'commander'
import {
  createCategorizationRule,
  deleteCategorizationRule,
  getCategorizationRules,
  type CategorizationRule,
} from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { padRight } from '../lib/format'

export function renderRules(rules: CategorizationRule[]): string {
  if (rules.length === 0) return '(sin reglas — usa `bal rules add <patrón> <categoría>`)\n'
  const lines = [`${padRight('PATRÓN', 24)}${padRight('CATEGORÍA', 24)}${padRight('PRIO', 6)}ID`]
  for (const r of rules) {
    lines.push(`${padRight(r.pattern, 24)}${padRight(r.category, 24)}${padRight(String(r.priority), 6)}${r.id}`)
  }
  return lines.join('\n') + '\n'
}

export function registerRulesCommand(program: Command): void {
  const rules = program
    .command('rules')
    .description('Manage merchant categorization rules')

  rules
    .command('list')
    .option('--json', 'output JSON')
    .action(async (opts: { json?: boolean }) => {
      const client = await getAuthedClient()
      const data = await getCategorizationRules(client)
      if (opts.json) {
        process.stdout.write(JSON.stringify(data) + '\n')
        return
      }
      process.stdout.write(renderRules(data))
    })

  rules
    .command('add <pattern> <category>')
    .option('--priority <n>', 'higher priority wins on overlapping patterns', '0')
    .action(async (pattern: string, category: string, opts: { priority: string }) => {
      const priority = Number.parseInt(opts.priority, 10)
      if (!Number.isFinite(priority)) fail(`invalid --priority: ${opts.priority}`)
      if (pattern.trim().length === 0) fail('pattern must not be blank')

      const client = await getAuthedClient()
      const rule = await createCategorizationRule(client, {
        pattern: pattern.toUpperCase(),
        category,
        priority,
      })
      process.stdout.write(`regla creada: ${rule.pattern} → ${rule.category} (prio ${rule.priority})\n`)
    })

  rules
    .command('rm <id>')
    .action(async (id: string) => {
      const client = await getAuthedClient()
      await deleteCategorizationRule(client, id)
      process.stdout.write('regla eliminada\n')
    })
}
