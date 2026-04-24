import type { Command } from 'commander'
import { createSubcategory, deleteCategory, getCategories, renameCategory } from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { padRight } from '../lib/format'

const VALID_ENTITIES = ['personal', 'spa'] as const
type Entity = (typeof VALID_ENTITIES)[number]

function isEntity(v: string): v is Entity {
  return (VALID_ENTITIES as readonly string[]).includes(v)
}

interface ListOptions {
  entity?: string
  json?: boolean
}

function registerList(group: Command): void {
  group
    .command('list')
    .description('List categories')
    .option('--entity <entity>', `filter by entity: ${VALID_ENTITIES.join('|')}`)
    .option('--json', 'output JSON')
    .action(async (opts: ListOptions) => {
      if (opts.entity && !isEntity(opts.entity)) {
        fail(`invalid --entity: ${opts.entity}. One of: ${VALID_ENTITIES.join(', ')}`)
      }

      const client = await getAuthedClient()
      const categories = await getCategories(client, { entity: opts.entity as Entity | undefined })

      if (opts.json) {
        process.stdout.write(JSON.stringify(categories ?? []) + '\n')
        return
      }

      if (!categories || categories.length === 0) {
        process.stdout.write('(no categories)\n')
        return
      }

      const lines: string[] = []
      lines.push(`${padRight('ID', 30)}${padRight('NAME', 28)}${padRight('PARENT', 24)}ENTITY`)
      for (const c of categories) {
        lines.push(
          padRight(c.id, 30) +
            padRight(c.name, 28) +
            padRight(c.parent_id ?? '—', 24) +
            (c.entity ?? ''),
        )
      }
      process.stdout.write(lines.join('\n') + '\n')
    })
}

interface CreateOptions {
  json?: boolean
}

function registerCreate(group: Command): void {
  group
    .command('create <parentId> <id> <name>')
    .description('Create a subcategory under an existing parent (id is the dotted slug, e.g. consumo.cafe)')
    .option('--json', 'output JSON')
    .action(async (parentId: string, id: string, name: string, opts: CreateOptions) => {
      const client = await getAuthedClient()
      const result = await createSubcategory(client, { parentId, id, name })

      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(`Created category ${id} ("${name}") under ${parentId}\n`)
      }
    })
}

interface RenameOptions {
  json?: boolean
}

function registerRename(group: Command): void {
  group
    .command('rename <id> <newName>')
    .description('Rename a category')
    .option('--json', 'output JSON')
    .action(async (id: string, newName: string, opts: RenameOptions) => {
      const client = await getAuthedClient()
      const result = await renameCategory(client, id, newName)

      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(`Renamed ${id} → "${newName}"\n`)
      }
    })
}

interface DeleteOptions {
  json?: boolean
}

function registerDelete(group: Command): void {
  group
    .command('delete <id>')
    .description('Delete a category (fails if any transactions reference it)')
    .option('--json', 'output JSON')
    .action(async (id: string, opts: DeleteOptions) => {
      const client = await getAuthedClient()
      const result = await deleteCategory(client, id)

      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        process.stdout.write(`Deleted category ${id}\n`)
      }
    })
}

export function registerCategoryCommand(program: Command): void {
  const group = program.command('category').description('Manage transaction categories')
  registerList(group)
  registerCreate(group)
  registerRename(group)
  registerDelete(group)
}
