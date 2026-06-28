import * as p from '@clack/prompts'
import { getAccounts, getCategories, type SupabaseClient, type Database } from '@balance/core'

type Client = SupabaseClient<Database>

/** True only when both stdin and stdout are a TTY (safe to prompt). */
export function isInteractive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true
}

/** Unwrap a clack result, exiting cleanly if the user cancelled (Ctrl+C). */
function ensure<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Cancelado.')
    process.exit(130)
  }
  return value as T
}

export function intro(message: string): void {
  p.intro(message)
}

export function outro(message: string): void {
  p.outro(message)
}

export function note(message: string, title?: string): void {
  p.note(message, title)
}

export async function promptText(
  message: string,
  opts?: { placeholder?: string; defaultValue?: string; validate?: (v: string) => string | undefined },
): Promise<string> {
  const validate = opts?.validate
  return ensure(
    await p.text({
      message,
      placeholder: opts?.placeholder,
      defaultValue: opts?.defaultValue,
      validate: validate ? (v) => validate(v ?? '') : undefined,
    }),
  )
}

export interface SelectOption<T extends string> {
  value: T
  label: string
  hint?: string
}

export async function promptSelect<T extends string>(message: string, options: SelectOption<T>[]): Promise<T> {
  // clack's Option<Value> is a conditional type on `Value extends Primitive`,
  // which TS can't resolve for a deferred generic. Instantiate with concrete
  // `string` (which resolves the conditional) and narrow the result back to T.
  return ensure(await p.select<string>({ message, options })) as T
}

export async function promptMultiselect<T extends string>(
  message: string,
  options: SelectOption<T>[],
  required = false,
): Promise<T[]> {
  return ensure(await p.multiselect<string>({ message, options, required })) as T[]
}

export async function promptConfirm(message: string, initialValue = true): Promise<boolean> {
  return ensure(await p.confirm({ message, initialValue }))
}

export function spinner(): { start: (msg?: string) => void; stop: (msg?: string) => void } {
  return p.spinner()
}

/** Interactive account picker. Returns the account id. */
export async function selectAccount(
  client: Client,
  opts?: { entity?: 'personal' | 'spa'; message?: string },
): Promise<string> {
  const accounts = await getAccounts(client, opts?.entity ? { entity: opts.entity } : undefined)
  if (!accounts || accounts.length === 0) throw new Error('No accounts found')
  const options = accounts.map((a) => ({
    value: a.id,
    label: a.name,
    hint: `${a.entity} · ${a.subtype}`,
  }))
  return promptSelect(opts?.message ?? 'Cuenta', options)
}

/** Interactive category picker. Returns the category id (e.g. necesidad.suscripciones). */
export async function selectCategory(
  client: Client,
  opts?: { entity?: 'personal' | 'spa'; message?: string },
): Promise<string> {
  const cats = await getCategories(client, opts?.entity ? { entity: opts.entity } : undefined)
  const all = cats ?? []
  // Prefer leaf subcategories (the ones transactions actually use).
  const leaves = all.filter((c) => (c as { parent_id: string | null }).parent_id != null)
  const list = leaves.length > 0 ? leaves : all
  const options = list.map((c) => ({
    value: c.id as string,
    label: c.id as string,
    hint: c.name as string,
  }))
  return promptSelect(opts?.message ?? 'Categoría', options)
}
