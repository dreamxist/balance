import { readFile } from 'node:fs/promises'
import type { Command } from 'commander'
import {
  addDays,
  addExercise,
  addHabit,
  addNote,
  addObjective,
  addObjectiveStep,
  addWeekSlot,
  archiveHabit,
  closeObjective,
  importLife,
  isIsoDay,
  isLifeObjectiveStatus,
  isLifeStepStatus,
  isTimeOfDay,
  isoWeekday,
  LIFE_OBJECTIVE_STATUSES,
  LIFE_STEP_STATUSES,
  LIFE_VEHICLES,
  listHabitDays,
  listHabits,
  listNotes,
  listObjectives,
  listRoutineSlots,
  listSessions,
  markHabitDay,
  openWeek,
  removeWeekSlot,
  replaceExercise,
  replaceRoutineSlot,
  setStepStatus,
  todayIso,
  unmarkHabitDay,
  updateWeekSlot,
  upsertWeekNote,
  weekStartOf,
  type LifeHabit,
  type LifeHabitDay,
  type LifeImportResult,
  type LifeNote,
  type LifeObjectiveWithSteps,
  type LifeRoutineSlot,
  type LifeSessionWithExercises,
  type LifeStepStatus,
  type LifeVehicle,
  type LifeWeekView,
  type SupabaseClient,
  type Database,
} from '@balance/core'
import { getAuthedClient } from '../lib/client'
import { fail } from '../lib/exit'
import { isUuid } from '../lib/resolve'
import { blank, headerLine, indent, pad, ruleLabel, ui } from '../lib/ui'

type Client = SupabaseClient<Database>

export const VEHICLE_LABELS: Record<LifeVehicle, string> = {
  sport: 'Deporte',
  work: 'Trabajo',
  personal: 'Personal',
}

const VEHICLE_ALIASES: Record<string, LifeVehicle> = {
  sport: 'sport',
  deporte: 'sport',
  work: 'work',
  trabajo: 'work',
  personal: 'personal',
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const STEP_MARKS: Record<LifeStepStatus, string> = {
  done: '✅',
  current: '▶',
  pending: '○',
  paused: '⏸',
}

const CELL_WIDTH = 28

// ============================================================
// Parsing helpers (pure)
// ============================================================

export function parseVehicle(raw: string): LifeVehicle {
  const vehicle = VEHICLE_ALIASES[raw.trim().toLowerCase()]
  if (!vehicle) throw new Error(`vehículo inválido: ${raw}. Uno de: ${LIFE_VEHICLES.join(', ')}`)
  return vehicle
}

/** `none` clears an optional field; anything else is kept as is. */
export function nullable(raw: string | undefined): string | null | undefined {
  if (raw === undefined) return undefined
  return raw.trim().toLowerCase() === 'none' ? null : raw
}

export function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value]
}

export function matchByRef<T extends { id: string }>(
  items: readonly T[],
  ref: string,
  nameOf: (item: T) => string,
  kind: string,
): T {
  if (isUuid(ref)) {
    const exact = items.find((item) => item.id === ref)
    if (!exact) throw new Error(`No hay ${kind} con id ${ref}`)
    return exact
  }
  const needle = ref.toLowerCase()
  const exactName = items.filter((item) => nameOf(item).toLowerCase() === needle)
  if (exactName.length === 1) return exactName[0]!
  const matches = items.filter((item) => nameOf(item).toLowerCase().includes(needle))
  if (matches.length === 0) throw new Error(`Ningún ${kind} coincide con "${ref}"`)
  if (matches.length > 1) {
    throw new Error(`"${ref}" es ambiguo: ${matches.map(nameOf).join(', ')}. Usa el id.`)
  }
  return matches[0]!
}

function guard<T>(fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    fail((err as Error).message)
  }
}

function optDate(raw: string | undefined, flag: string): string | undefined {
  if (raw === undefined) return undefined
  if (!isIsoDay(raw)) fail(`${flag} inválido: ${raw}. Formato YYYY-MM-DD`)
  return raw
}

function optTime(raw: string | undefined): string | null | undefined {
  const value = nullable(raw)
  if (value === undefined || value === null) return value
  if (!isTimeOfDay(value)) fail(`--time inválido: ${raw}. Formato HH:MM`)
  return value
}

function optInt(raw: string | undefined, flag: string): number | undefined {
  if (raw === undefined) return undefined
  const n = Number(raw)
  if (!Number.isInteger(n)) fail(`${flag} inválido: ${raw}. Debe ser un entero`)
  return n
}

function requireUuid(raw: string, kind: string): string {
  if (!isUuid(raw)) fail(`${kind} debe ser un uuid (usa --ids para verlos)`)
  return raw
}

function writeJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value) + '\n')
}

async function resolveSessionId(client: Client, raw: string | undefined): Promise<string | null | undefined> {
  const value = nullable(raw)
  if (value === undefined || value === null) return value
  const sessions = await listSessions(client, { includeArchived: true })
  return guard(() => matchByRef(sessions, value, (s) => s.name, 'sesión')).id
}

// ============================================================
// Rendering (pure)
// ============================================================

export function formatTime(startsAt: string | null): string {
  return startsAt ? startsAt.slice(0, 5) : ''
}

function truncate(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, width - 1)}…`
}

function slotText(slot: { starts_at: string | null; title: string }): string {
  const time = formatTime(slot.starts_at)
  return time ? `${time} ${slot.title}` : slot.title
}

export function renderWeek(view: LifeWeekView, options: { ids?: boolean } = {}): string {
  const start = view.week.week_start
  const lines: string[] = [blank()]
  lines.push(headerLine(ui.title(`SEMANA DEL ${start}`), ui.dim(`${view.slots.length} bloques`)))
  lines.push(blank())
  lines.push(
    indent(ui.dim(`${pad('DÍA', 10)}${LIFE_VEHICLES.map((v) => pad(VEHICLE_LABELS[v].toUpperCase(), CELL_WIDTH)).join('  ')}`.trimEnd())),
  )
  for (let i = 0; i < 7; i++) {
    const day = addDays(start, i)
    const columns = LIFE_VEHICLES.map((v) =>
      view.slots.filter((s) => s.day === day && s.vehicle === v).map((s) => truncate(slotText(s), CELL_WIDTH)),
    )
    const height = Math.max(1, ...columns.map((c) => c.length))
    for (let row = 0; row < height; row++) {
      const dayCell = row === 0 ? `${DAY_LABELS[i]} ${day.slice(8)}` : ''
      const cells = columns.map((c) => pad(c[row] ?? (row === 0 ? ui.dim('·') : ''), CELL_WIDTH))
      lines.push(indent(`${pad(dayCell, 10)}${cells.join('  ')}`.trimEnd()))
    }
  }

  const notes = LIFE_VEHICLES.map((v) => view.notes.find((n) => n.vehicle === v)).filter(
    (n): n is NonNullable<typeof n> => n !== undefined,
  )
  if (notes.length > 0) {
    lines.push(blank())
    lines.push(ruleLabel('NOTAS'))
    for (const note of notes) {
      lines.push(indent(`${ui.strong(VEHICLE_LABELS[note.vehicle])}${note.body ? `  ${note.body}` : ''}`))
      for (const win of note.wins) lines.push(indent(`  ${ui.positive('+')} ${win}`))
      for (const risk of note.risks) lines.push(indent(`  ${ui.warn('!')} ${risk}`))
    }
  }

  if (options.ids && view.slots.length > 0) {
    lines.push(blank())
    lines.push(ruleLabel('IDS'))
    for (const slot of view.slots) {
      lines.push(indent(`${ui.dim(slot.id)}  ${slot.day}  ${pad(VEHICLE_LABELS[slot.vehicle], 10)}${slotText(slot)}`))
    }
  }
  lines.push(blank())
  return lines.join('\n') + '\n'
}

export function renderRoutine(
  slots: readonly LifeRoutineSlot[],
  sessions: readonly LifeSessionWithExercises[],
  options: { ids?: boolean } = {},
): string {
  const sessionName = new Map(sessions.map((s) => [s.id, s.name]))
  const lines: string[] = [blank(), headerLine(ui.title('SEMANA TÍPICA'), ui.dim(`${slots.length} bloques`)), blank()]
  if (slots.length === 0) lines.push(indent(ui.dim('(sin bloques: bal life import <seed.json>)')))
  for (let weekday = 1; weekday <= 7; weekday++) {
    const daySlots = slots.filter((s) => s.weekday === weekday)
    if (daySlots.length === 0) continue
    lines.push(indent(ui.strong(DAY_LABELS[weekday - 1]!)))
    for (const slot of daySlots) {
      const session = slot.session_id ? sessionName.get(slot.session_id) : undefined
      const id = options.ids ? `${ui.dim(slot.id)}  ` : ''
      const extra = session && session !== slot.title ? ui.dim(`  (${session})`) : ''
      lines.push(indent(`  ${id}${pad(VEHICLE_LABELS[slot.vehicle], 10)}${slotText(slot)}${extra}`))
    }
  }

  lines.push(blank())
  lines.push(ruleLabel('SESIONES'))
  if (sessions.length === 0) lines.push(indent(ui.dim('(sin sesiones)')))
  for (const session of sessions) {
    const head = `${session.emoji ? `${session.emoji} ` : ''}${session.name}`
    const id = options.ids ? `  ${ui.dim(session.id)}` : ''
    lines.push(indent(`${ui.strong(head)}${session.focus ? ui.dim(` — ${session.focus}`) : ''}${id}`))
    let block: string | null = null
    for (const exercise of session.exercises) {
      if (exercise.block && exercise.block !== block) {
        block = exercise.block
        lines.push(indent(`  ${ui.accent(block)}`))
      }
      const exId = options.ids ? `${ui.dim(exercise.id)}  ` : ''
      const prescription = exercise.prescription ? `  ${exercise.prescription}` : ''
      lines.push(indent(`    ${exId}${exercise.name}${prescription}`))
      if (exercise.purpose) lines.push(indent(`      ${ui.dim(exercise.purpose)}`))
    }
  }
  lines.push(blank())
  return lines.join('\n') + '\n'
}

export function renderHabits(
  habits: readonly LifeHabit[],
  days: readonly LifeHabitDay[],
  weekStart: string,
  options: { ids?: boolean } = {},
): string {
  const marked = new Set(days.map((d) => `${d.habit_id}|${d.day}`))
  const nameWidth = Math.max(16, ...habits.map((h) => h.name.length + (h.emoji ? 3 : 0)))
  const lines: string[] = [blank(), headerLine(ui.title('HÁBITOS'), ui.dim(`semana del ${weekStart}`)), blank()]
  if (habits.length === 0) {
    lines.push(indent(ui.dim('(sin hábitos activos)')))
  } else {
    lines.push(indent(ui.dim(`${pad('', nameWidth)}  ${DAY_LABELS.map((d) => pad(d, 4)).join('')}`)))
    for (const habit of habits) {
      const name = `${habit.emoji ? `${habit.emoji} ` : ''}${habit.name}`
      const cells = DAY_LABELS.map((_, i) =>
        pad(marked.has(`${habit.id}|${addDays(weekStart, i)}`) ? ui.positive('●') : ui.dim('·'), 4),
      ).join('')
      const id = options.ids ? `  ${ui.dim(habit.id)}` : ''
      lines.push(indent(`${pad(name, nameWidth)}  ${cells}${id}`))
    }
  }
  lines.push(blank())
  return lines.join('\n') + '\n'
}

export function renderObjectives(objectives: readonly LifeObjectiveWithSteps[], options: { ids?: boolean } = {}): string {
  const lines: string[] = [blank(), headerLine(ui.title('OBJETIVOS'), ui.dim(`${objectives.length}`)), blank()]
  if (objectives.length === 0) lines.push(indent(ui.dim('(sin objetivos)')))
  for (const vehicle of LIFE_VEHICLES) {
    const group = objectives.filter((o) => o.vehicle === vehicle)
    if (group.length === 0) continue
    lines.push(ruleLabel(VEHICLE_LABELS[vehicle].toUpperCase()))
    for (const objective of group) {
      const done = objective.steps.filter((s) => s.status === 'done').length
      const progress = objective.steps.length > 0 ? ui.dim(`  ${done}/${objective.steps.length}`) : ''
      const status =
        objective.status === 'active'
          ? ''
          : ui.muted(`  [${objective.status === 'done' ? 'logrado' : 'abandonado'} ${objective.closed_on ?? ''}]`)
      const id = options.ids ? `  ${ui.dim(objective.id)}` : ''
      lines.push(indent(`${ui.strong(objective.title)}${progress}${status}${id}`))
      if (objective.focus) lines.push(indent(`  ${ui.dim(objective.focus)}`))
      if (objective.status_note) lines.push(indent(`  ${ui.dim(objective.status_note)}`))
      for (const step of objective.steps) {
        const period = step.period ? ui.dim(`${step.period}  `) : ''
        const when = step.done_on ? ui.dim(`  ${step.done_on}`) : ''
        const stepId = options.ids ? `${ui.dim(step.id)}  ` : ''
        lines.push(indent(`  ${stepId}${STEP_MARKS[step.status]} ${period}${step.title}${when}`))
      }
      lines.push(blank())
    }
  }
  return lines.join('\n') + '\n'
}

export function renderNotes(notes: readonly LifeNote[]): string {
  const lines: string[] = [blank(), headerLine(ui.title('NOTAS'), ui.dim(`${notes.length}`)), blank()]
  if (notes.length === 0) lines.push(indent(ui.dim('(sin notas)')))
  for (const note of notes) {
    const topic = note.topic ? ui.accent(`${note.topic}  `) : ''
    lines.push(indent(`${ui.dim(note.noted_on)}  ${pad(VEHICLE_LABELS[note.vehicle], 10)}${topic}${note.body}`))
  }
  lines.push(blank())
  return lines.join('\n') + '\n'
}

export function renderImportResult(result: LifeImportResult): string {
  if (result.status === 'refused') {
    return (
      `Import cancelado: ya hay datos de vida (${result.existing.sessions} sesiones, ` +
      `${result.existing.objectives} objetivos). No se escribió nada.\n`
    )
  }
  const c = result.counts
  return (
    `✓ Importado (vigente desde ${result.from}): ${c.habits} hábitos, ${c.sessions} sesiones, ` +
    `${c.exercises} ejercicios, ${c.slots} bloques de la semana típica, ${c.objectives} objetivos, ` +
    `${c.steps} pasos, ${c.budgets} presupuestos, ${c.notes} notas\n`
  )
}

// ============================================================
// Commands
// ============================================================

interface JsonOpt {
  json?: boolean
}

function registerWeek(life: Command): void {
  life
    .command('week')
    .description('Semana (día × deporte/trabajo/personal) y sus notas; la abre desde la semana típica si no existe')
    .option('--date <YYYY-MM-DD>', 'cualquier día de la semana (default: hoy)')
    .option('--ids', 'mostrar ids de los bloques')
    .option('--json', 'output JSON')
    .action(async (opts: JsonOpt & { date?: string; ids?: boolean }) => {
      const day = optDate(opts.date, '--date')
      const client = await getAuthedClient()
      const view = await openWeek(client, day)
      if (opts.json) return writeJson(view)
      process.stdout.write(renderWeek(view, { ids: opts.ids }))
    })
}

interface SlotOptions extends JsonOpt {
  date?: string
  vehicle?: string
  title?: string
  time?: string
  session?: string
  note?: string
  position?: string
}

function registerSlot(life: Command): void {
  const slot = life.command('slot').description('Bloques de una semana concreta')

  slot
    .command('add')
    .description('Agregar un bloque a la semana del día dado')
    .requiredOption('--vehicle <vehicle>', LIFE_VEHICLES.join(' | '))
    .requiredOption('--title <title>', 'título del bloque')
    .option('--date <YYYY-MM-DD>', 'día (default: hoy)')
    .option('--time <HH:MM>', 'hora de inicio')
    .option('--session <name|id>', 'sesión de la rutina')
    .option('--note <text>', 'nota')
    .option('--position <n>', 'orden dentro del día')
    .option('--json', 'output JSON')
    .action(async (opts: SlotOptions) => {
      const vehicle = guard(() => parseVehicle(opts.vehicle ?? ''))
      const day = optDate(opts.date, '--date') ?? todayIso()
      const startsAt = optTime(opts.time)
      const position = optInt(opts.position, '--position')
      const client = await getAuthedClient()
      const sessionId = await resolveSessionId(client, opts.session)
      const row = await addWeekSlot(client, {
        day,
        vehicle,
        title: opts.title ?? '',
        startsAt,
        sessionId,
        note: opts.note,
        position,
      })
      if (opts.json) return writeJson(row)
      process.stdout.write(`✓ Bloque agregado: ${DAY_LABELS[isoWeekday(row.day) - 1]} ${row.day} · ${VEHICLE_LABELS[row.vehicle]} · ${slotText(row)}  ${ui.dim(row.id)}\n`)
    })

  slot
    .command('set <id>')
    .description('Editar un bloque de la semana (usa `none` para vaciar --time, --session o --note)')
    .option('--title <title>', 'título')
    .option('--date <YYYY-MM-DD>', 'mover a otro día de la misma semana')
    .option('--vehicle <vehicle>', LIFE_VEHICLES.join(' | '))
    .option('--time <HH:MM>', 'hora de inicio')
    .option('--session <name|id>', 'sesión de la rutina')
    .option('--note <text>', 'nota')
    .option('--position <n>', 'orden dentro del día')
    .option('--json', 'output JSON')
    .action(async (id: string, opts: SlotOptions) => {
      requireUuid(id, 'el id del bloque')
      const vehicle = opts.vehicle === undefined ? undefined : guard(() => parseVehicle(opts.vehicle ?? ''))
      const day = optDate(opts.date, '--date')
      const startsAt = optTime(opts.time)
      const position = optInt(opts.position, '--position')
      const client = await getAuthedClient()
      const sessionId = await resolveSessionId(client, opts.session)
      const row = await updateWeekSlot(client, id, {
        title: opts.title,
        day,
        vehicle,
        startsAt,
        sessionId,
        note: nullable(opts.note),
        position,
      })
      if (opts.json) return writeJson(row)
      process.stdout.write(`✓ Bloque actualizado: ${row.day} · ${VEHICLE_LABELS[row.vehicle]} · ${slotText(row)}\n`)
    })

  slot
    .command('rm <id>')
    .description('Quitar un bloque de la semana')
    .option('--json', 'output JSON')
    .action(async (id: string, opts: JsonOpt) => {
      requireUuid(id, 'el id del bloque')
      const client = await getAuthedClient()
      await removeWeekSlot(client, id)
      if (opts.json) return writeJson({ removed: id })
      process.stdout.write(`✓ Bloque quitado\n`)
    })
}

function registerNote(life: Command): void {
  life
    .command('note <vehicle>')
    .description('Nota de la semana para un vehículo (--win/--risk se repiten y reemplazan la lista)')
    .option('--date <YYYY-MM-DD>', 'cualquier día de la semana (default: hoy)')
    .option('--body <text>', 'cómo va la semana (`none` lo vacía)')
    .option('--win <text>', 'logro (repetible)', collect)
    .option('--risk <text>', 'riesgo (repetible)', collect)
    .option('--json', 'output JSON')
    .action(async (vehicleRaw: string, opts: JsonOpt & { date?: string; body?: string; win?: string[]; risk?: string[] }) => {
      const vehicle = guard(() => parseVehicle(vehicleRaw))
      const day = optDate(opts.date, '--date')
      const client = await getAuthedClient()
      const note = await upsertWeekNote(client, {
        day,
        vehicle,
        body: nullable(opts.body),
        wins: opts.win,
        risks: opts.risk,
      })
      if (opts.json) return writeJson(note)
      process.stdout.write(`✓ Nota de ${VEHICLE_LABELS[vehicle]} guardada (${note.wins.length} logros, ${note.risks.length} riesgos)\n`)
    })
}

function registerRoutine(life: Command): void {
  const routine = life
    .command('routine')
    .enablePositionalOptions()
    .description('Semana típica y sesiones con sus ejercicios vigentes')
    .option('--ids', 'mostrar ids')
    .option('--json', 'output JSON')
    .action(async (opts: JsonOpt & { ids?: boolean }) => {
      const client = await getAuthedClient()
      const [slots, sessions] = await Promise.all([listRoutineSlots(client), listSessions(client)])
      if (opts.json) return writeJson({ slots, sessions })
      process.stdout.write(renderRoutine(slots, sessions, { ids: opts.ids }))
    })

  routine
    .command('set <slot-id>')
    .description('Cambiar un bloque de la semana típica desde una fecha (las semanas ya abiertas no cambian)')
    .option('--title <title>', 'título')
    .option('--session <name|id>', 'sesión (`none` la quita)')
    .option('--time <HH:MM>', 'hora (`none` la quita)')
    .option('--note <text>', 'por qué cambia')
    .option('--from <YYYY-MM-DD>', 'vigente desde (default: hoy)')
    .option('--json', 'output JSON')
    .action(async (id: string, opts: JsonOpt & { title?: string; session?: string; time?: string; note?: string; from?: string }) => {
      requireUuid(id, 'el id del bloque')
      const startsAt = optTime(opts.time)
      const from = optDate(opts.from, '--from')
      const client = await getAuthedClient()
      const sessionId = await resolveSessionId(client, opts.session)
      const row = await replaceRoutineSlot(client, id, { title: opts.title, sessionId, startsAt, note: opts.note, from })
      if (opts.json) return writeJson(row)
      process.stdout.write(`✓ ${DAY_LABELS[row.weekday - 1]} · ${VEHICLE_LABELS[row.vehicle]} · ${slotText(row)} (desde ${row.valid_from})\n`)
    })
}

interface ExerciseOptions extends JsonOpt {
  name?: string
  block?: string
  prescription?: string
  purpose?: string
  note?: string
  from?: string
  position?: string
}

function registerExercise(life: Command): void {
  const exercise = life.command('exercise').description('Ejercicios de las sesiones (versionados)')

  exercise
    .command('set <id>')
    .description('Cambiar un ejercicio desde una fecha; la versión anterior queda con su motivo')
    .option('--name <name>', 'nombre')
    .option('--prescription <text>', 'series × reps, tiempo… (`none` la vacía)')
    .option('--purpose <text>', 'para qué (`none` lo vacía)')
    .option('--note <text>', 'por qué cambia')
    .option('--from <YYYY-MM-DD>', 'vigente desde (default: hoy)')
    .option('--json', 'output JSON')
    .action(async (id: string, opts: ExerciseOptions) => {
      requireUuid(id, 'el id del ejercicio')
      const from = optDate(opts.from, '--from')
      const client = await getAuthedClient()
      const row = await replaceExercise(client, id, {
        name: opts.name,
        prescription: nullable(opts.prescription),
        purpose: nullable(opts.purpose),
        note: opts.note,
        from,
      })
      if (opts.json) return writeJson(row)
      process.stdout.write(`✓ ${row.name}${row.prescription ? ` · ${row.prescription}` : ''} (desde ${row.valid_from})  ${ui.dim(row.id)}\n`)
    })

  exercise
    .command('add <session>')
    .description('Agregar un ejercicio a una sesión (por nombre o id)')
    .requiredOption('--name <name>', 'nombre')
    .option('--block <text>', 'bloque (calentamiento, A, B…)')
    .option('--prescription <text>', 'series × reps, tiempo…')
    .option('--purpose <text>', 'para qué')
    .option('--position <n>', 'orden (default: al final)')
    .option('--from <YYYY-MM-DD>', 'vigente desde (default: hoy)')
    .option('--json', 'output JSON')
    .action(async (sessionRef: string, opts: ExerciseOptions) => {
      const from = optDate(opts.from, '--from')
      const position = optInt(opts.position, '--position')
      const client = await getAuthedClient()
      const sessions = await listSessions(client)
      const session = guard(() => matchByRef(sessions, sessionRef, (s) => s.name, 'sesión'))
      const row = await addExercise(client, {
        sessionId: session.id,
        name: opts.name ?? '',
        block: opts.block,
        prescription: opts.prescription,
        purpose: opts.purpose,
        position,
        from,
      })
      if (opts.json) return writeJson(row)
      process.stdout.write(`✓ ${session.name}: ${row.name} agregado  ${ui.dim(row.id)}\n`)
    })
}

async function resolveHabit(client: Client, ref: string): Promise<LifeHabit> {
  const habits = await listHabits(client)
  return guard(() => matchByRef(habits, ref, (h) => h.name, 'hábito'))
}

function registerHabit(life: Command): void {
  const habit = life.command('habit').description('Hábitos (máximo cuatro activos; sin rachas)')

  habit
    .command('list')
    .description('Hábitos activos y los días marcados de la semana')
    .option('--date <YYYY-MM-DD>', 'cualquier día de la semana (default: hoy)')
    .option('--ids', 'mostrar ids')
    .option('--json', 'output JSON')
    .action(async (opts: JsonOpt & { date?: string; ids?: boolean }) => {
      const weekStart = weekStartOf(optDate(opts.date, '--date') ?? todayIso())
      const client = await getAuthedClient()
      const [habits, days] = await Promise.all([
        listHabits(client),
        listHabitDays(client, weekStart, addDays(weekStart, 6)),
      ])
      if (opts.json) return writeJson({ week_start: weekStart, habits, days })
      process.stdout.write(renderHabits(habits, days, weekStart, { ids: opts.ids }))
    })

  habit
    .command('add <name>')
    .description('Agregar un hábito (si ya hay cuatro, archiva uno antes)')
    .option('--emoji <emoji>', 'emoji')
    .option('--position <n>', 'orden')
    .option('--json', 'output JSON')
    .action(async (name: string, opts: JsonOpt & { emoji?: string; position?: string }) => {
      const position = optInt(opts.position, '--position')
      const client = await getAuthedClient()
      const row = await addHabit(client, { name, emoji: opts.emoji, position })
      if (opts.json) return writeJson(row)
      process.stdout.write(`✓ Hábito agregado: ${row.name}  ${ui.dim(row.id)}\n`)
    })

  habit
    .command('archive <habit>')
    .description('Archivar un hábito (por nombre o id)')
    .option('--json', 'output JSON')
    .action(async (ref: string, opts: JsonOpt) => {
      const client = await getAuthedClient()
      const target = await resolveHabit(client, ref)
      const row = await archiveHabit(client, target.id)
      if (opts.json) return writeJson(row)
      process.stdout.write(`✓ Hábito archivado: ${row.name}\n`)
    })

  habit
    .command('mark <habit>')
    .description('Marcar un hábito como cumplido en un día')
    .option('--date <YYYY-MM-DD>', 'día (default: hoy)')
    .option('--note <text>', 'nota')
    .option('--json', 'output JSON')
    .action(async (ref: string, opts: JsonOpt & { date?: string; note?: string }) => {
      const day = optDate(opts.date, '--date') ?? todayIso()
      const client = await getAuthedClient()
      const target = await resolveHabit(client, ref)
      const row = await markHabitDay(client, target.id, day, opts.note)
      if (opts.json) return writeJson(row)
      process.stdout.write(`✓ ${target.name}: ${day}\n`)
    })

  habit
    .command('unmark <habit>')
    .description('Desmarcar un hábito en un día')
    .option('--date <YYYY-MM-DD>', 'día (default: hoy)')
    .option('--json', 'output JSON')
    .action(async (ref: string, opts: JsonOpt & { date?: string }) => {
      const day = optDate(opts.date, '--date') ?? todayIso()
      const client = await getAuthedClient()
      const target = await resolveHabit(client, ref)
      const removed = await unmarkHabitDay(client, target.id, day)
      if (opts.json) return writeJson({ habit_id: target.id, day, removed })
      process.stdout.write(removed ? `✓ ${target.name}: desmarcado ${day}\n` : `${target.name} no estaba marcado el ${day}\n`)
    })
}

async function resolveObjective(client: Client, ref: string): Promise<LifeObjectiveWithSteps> {
  const objectives = await listObjectives(client)
  return guard(() => matchByRef(objectives, ref, (o) => o.title, 'objetivo'))
}

function registerObjective(life: Command): void {
  const objective = life.command('objective').description('Objetivos con su hoja de ruta')

  objective
    .command('list')
    .description('Objetivos del año con sus pasos')
    .option('--year <yyyy>', 'año (default: el actual)')
    .option('--vehicle <vehicle>', LIFE_VEHICLES.join(' | '))
    .option('--status <status>', LIFE_OBJECTIVE_STATUSES.join(' | '))
    .option('--ids', 'mostrar ids de objetivos y pasos')
    .option('--json', 'output JSON')
    .action(async (opts: JsonOpt & { year?: string; vehicle?: string; status?: string; ids?: boolean }) => {
      const year = optInt(opts.year, '--year') ?? Number(todayIso().slice(0, 4))
      const vehicle = opts.vehicle === undefined ? undefined : guard(() => parseVehicle(opts.vehicle ?? ''))
      if (opts.status !== undefined && !isLifeObjectiveStatus(opts.status)) {
        fail(`--status inválido: ${opts.status}. Uno de: ${LIFE_OBJECTIVE_STATUSES.join(', ')}`)
      }
      const status = opts.status !== undefined && isLifeObjectiveStatus(opts.status) ? opts.status : undefined
      const client = await getAuthedClient()
      const objectives = await listObjectives(client, { year, vehicle, status })
      if (opts.json) return writeJson(objectives)
      process.stdout.write(renderObjectives(objectives, { ids: opts.ids }))
    })

  objective
    .command('add')
    .description('Agregar un objetivo')
    .requiredOption('--vehicle <vehicle>', LIFE_VEHICLES.join(' | '))
    .requiredOption('--title <title>', 'título')
    .option('--year <yyyy>', 'año (default: el actual)')
    .option('--focus <text>', 'foco / meta')
    .option('--linear-project <id>', 'id del proyecto en Linear')
    .option('--position <n>', 'orden')
    .option('--json', 'output JSON')
    .action(async (opts: JsonOpt & { vehicle?: string; title?: string; year?: string; focus?: string; linearProject?: string; position?: string }) => {
      const vehicle = guard(() => parseVehicle(opts.vehicle ?? ''))
      const year = optInt(opts.year, '--year')
      const position = optInt(opts.position, '--position')
      const client = await getAuthedClient()
      const row = await addObjective(client, {
        vehicle,
        title: opts.title ?? '',
        year,
        focus: opts.focus,
        linearProjectId: opts.linearProject,
        position,
      })
      if (opts.json) return writeJson(row)
      process.stdout.write(`✓ Objetivo agregado: ${row.title} (${VEHICLE_LABELS[row.vehicle]} ${row.year})  ${ui.dim(row.id)}\n`)
    })

  const step = objective.command('step').description('Pasos de la hoja de ruta')

  step
    .command('add <objective> <title>')
    .description('Agregar un paso a un objetivo (por título o id)')
    .option('--period <text>', 'periodo (Ene, Q1…)')
    .option('--status <status>', LIFE_STEP_STATUSES.join(' | '), 'pending')
    .option('--done-on <YYYY-MM-DD>', 'fecha de término (solo con status done; default: hoy)')
    .option('--note <text>', 'nota')
    .option('--position <n>', 'orden (default: al final)')
    .option('--json', 'output JSON')
    .action(async (ref: string, title: string, opts: JsonOpt & { period?: string; status: string; doneOn?: string; note?: string; position?: string }) => {
      if (!isLifeStepStatus(opts.status)) fail(`--status inválido: ${opts.status}. Uno de: ${LIFE_STEP_STATUSES.join(', ')}`)
      const status: LifeStepStatus = opts.status
      const doneOn = optDate(opts.doneOn, '--done-on')
      if (doneOn !== undefined && status !== 'done') fail('--done-on solo aplica con --status done')
      const position = optInt(opts.position, '--position')
      const client = await getAuthedClient()
      const target = await resolveObjective(client, ref)
      const row = await addObjectiveStep(client, {
        objectiveId: target.id,
        title,
        period: opts.period,
        status,
        doneOn,
        note: opts.note,
        position,
      })
      if (opts.json) return writeJson(row)
      process.stdout.write(`✓ ${target.title}: ${STEP_MARKS[row.status]} ${row.title}  ${ui.dim(row.id)}\n`)
    })

  step
    .command('set <step-id> <status>')
    .description(`Cambiar el estado de un paso (${LIFE_STEP_STATUSES.join(', ')}); done fecha el paso, otro estado borra la fecha`)
    .option('--on <YYYY-MM-DD>', 'fecha de término (solo con done; default: hoy)')
    .option('--json', 'output JSON')
    .action(async (id: string, statusRaw: string, opts: JsonOpt & { on?: string }) => {
      requireUuid(id, 'el id del paso')
      if (!isLifeStepStatus(statusRaw)) fail(`estado inválido: ${statusRaw}. Uno de: ${LIFE_STEP_STATUSES.join(', ')}`)
      const status: LifeStepStatus = statusRaw
      const doneOn = optDate(opts.on, '--on')
      if (doneOn !== undefined && status !== 'done') fail('--on solo aplica al estado done')
      const client = await getAuthedClient()
      const row = await setStepStatus(client, id, status, { doneOn })
      if (opts.json) return writeJson(row)
      process.stdout.write(`✓ ${STEP_MARKS[row.status]} ${row.title}${row.done_on ? ` (${row.done_on})` : ''}\n`)
    })

  objective
    .command('close <objective> <status>')
    .description('Cerrar un objetivo: done (logrado), dropped (abandonado) o active (reabrir)')
    .option('--note <text>', 'cómo terminó')
    .option('--on <YYYY-MM-DD>', 'fecha (default: hoy)')
    .option('--json', 'output JSON')
    .action(async (ref: string, statusRaw: string, opts: JsonOpt & { note?: string; on?: string }) => {
      if (!isLifeObjectiveStatus(statusRaw)) {
        fail(`estado inválido: ${statusRaw}. Uno de: ${LIFE_OBJECTIVE_STATUSES.join(', ')}`)
      }
      const on = optDate(opts.on, '--on')
      const client = await getAuthedClient()
      const target = await resolveObjective(client, ref)
      const row = await closeObjective(client, target.id, statusRaw, { note: opts.note, on })
      if (opts.json) return writeJson(row)
      const label = row.status === 'active' ? 'reabierto' : row.status === 'done' ? `logrado ${row.closed_on}` : `abandonado ${row.closed_on}`
      process.stdout.write(`✓ ${row.title}: ${label}\n`)
    })
}

function registerNotes(life: Command): void {
  const notes = life.command('notes').description('Notas de seguimiento por vehículo (nunca un número)')

  notes
    .command('add <vehicle> <body>')
    .description('Agregar una nota')
    .option('--topic <text>', 'tema')
    .option('--date <YYYY-MM-DD>', 'fecha (default: hoy)')
    .option('--json', 'output JSON')
    .action(async (vehicleRaw: string, body: string, opts: JsonOpt & { topic?: string; date?: string }) => {
      const vehicle = guard(() => parseVehicle(vehicleRaw))
      const notedOn = optDate(opts.date, '--date')
      const client = await getAuthedClient()
      const row = await addNote(client, { vehicle, body, topic: opts.topic, notedOn })
      if (opts.json) return writeJson(row)
      process.stdout.write(`✓ Nota agregada (${VEHICLE_LABELS[row.vehicle]}, ${row.noted_on})\n`)
    })

  notes
    .command('list')
    .description('Notas recientes')
    .option('--vehicle <vehicle>', LIFE_VEHICLES.join(' | '))
    .option('--topic <text>', 'filtrar por tema')
    .option('--limit <n>', 'máximo de notas', '20')
    .option('--json', 'output JSON')
    .action(async (opts: JsonOpt & { vehicle?: string; topic?: string; limit: string }) => {
      const vehicle = opts.vehicle === undefined ? undefined : guard(() => parseVehicle(opts.vehicle ?? ''))
      const limit = optInt(opts.limit, '--limit')
      const client = await getAuthedClient()
      const rows = await listNotes(client, { vehicle, topic: opts.topic, limit })
      if (opts.json) return writeJson(rows)
      process.stdout.write(renderNotes(rows))
    })
}

function registerImport(life: Command): void {
  life
    .command('import <file>')
    .description('Cargar un seed JSON (hábitos, rutina, semana típica, objetivos, presupuestos, notas). Se niega si ya hay datos')
    .option('--from <YYYY-MM-DD>', 'vigencia de ejercicios y semana típica (default: hoy)')
    .option('--json', 'output JSON')
    .action(async (file: string, opts: JsonOpt & { from?: string }) => {
      const from = optDate(opts.from, '--from')
      let seed: unknown
      try {
        seed = JSON.parse(await readFile(file, 'utf8'))
      } catch (err) {
        fail(`no se pudo leer ${file}: ${(err as Error).message}`)
      }
      const client = await getAuthedClient()
      const result = await importLife(client, seed, { from })
      if (opts.json) writeJson(result)
      else process.stdout.write(renderImportResult(result))
      if (result.status === 'refused') process.exit(1)
    })
}

export function registerLifeCommand(program: Command): void {
  const life = program
    .command('life')
    .enablePositionalOptions()
    .description('Plan de vida: semana, rutina, hábitos, objetivos y notas (deporte, trabajo, personal)')
  registerWeek(life)
  registerSlot(life)
  registerNote(life)
  registerRoutine(life)
  registerExercise(life)
  registerHabit(life)
  registerObjective(life)
  registerNotes(life)
  registerImport(life)
}
