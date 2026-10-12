import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { normalizeMonth } from './buckets'

type TypedClient = SupabaseClient<Database>
type Tables = Database['public']['Tables']
type Enums = Database['public']['Enums']

export type LifeVehicle = Enums['life_vehicle']
export type LifeStepStatus = Enums['life_step_status']
export type LifeObjectiveStatus = Enums['life_objective_status']
export type LifeHabit = Tables['life_habits']['Row']
export type LifeHabitDay = Tables['life_habit_days']['Row']
export type LifeSession = Tables['life_sessions']['Row']
export type LifeExercise = Tables['life_exercises']['Row']
export type LifeRoutineSlot = Tables['life_routine_slots']['Row']
export type LifeWeek = Tables['life_weeks']['Row']
export type LifeWeekSlot = Tables['life_week_slots']['Row']
export type LifeWeekNote = Tables['life_week_notes']['Row']
export type LifeObjective = Tables['life_objectives']['Row']
export type LifeObjectiveStep = Tables['life_objective_steps']['Row']
export type LifeNote = Tables['life_notes']['Row']

export const LIFE_VEHICLES: readonly LifeVehicle[] = ['sport', 'work', 'personal']
export const LIFE_STEP_STATUSES: readonly LifeStepStatus[] = ['done', 'current', 'pending', 'paused']
export const LIFE_OBJECTIVE_STATUSES: readonly LifeObjectiveStatus[] = ['active', 'done', 'dropped']
export const BUDGET_BUCKETS = ['necesidades', 'consumo', 'ahorro'] as const
export type BudgetBucket = (typeof BUDGET_BUCKETS)[number]

export function isLifeVehicle(value: unknown): value is LifeVehicle {
  return typeof value === 'string' && (LIFE_VEHICLES as readonly string[]).includes(value)
}

export function isLifeStepStatus(value: unknown): value is LifeStepStatus {
  return typeof value === 'string' && (LIFE_STEP_STATUSES as readonly string[]).includes(value)
}

export function isLifeObjectiveStatus(value: unknown): value is LifeObjectiveStatus {
  return typeof value === 'string' && (LIFE_OBJECTIVE_STATUSES as readonly string[]).includes(value)
}

export function isBudgetBucket(value: unknown): value is BudgetBucket {
  return typeof value === 'string' && (BUDGET_BUCKETS as readonly string[]).includes(value)
}

// ============================================================
// Date helpers (pure). Days are 'YYYY-MM-DD' strings, computed in UTC so the
// arithmetic never drifts with the local timezone.
// ============================================================

const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

function parseDay(day: string): Date {
  const match = ISO_DAY_RE.exec(day)
  if (!match) throw new Error(`Invalid date "${day}", expected YYYY-MM-DD`)
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (date.toISOString().slice(0, 10) !== day) throw new Error(`Invalid date "${day}"`)
  return date
}

export function isIsoDay(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    parseDay(value)
    return true
  } catch {
    return false
  }
}

export function isTimeOfDay(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value)
}

export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(day: string, days: number): string {
  const date = parseDay(day)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Monday of the ISO week that contains `day`. */
export function weekStartOf(day: string): string {
  const offset = (parseDay(day).getUTCDay() + 6) % 7
  return addDays(day, -offset)
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(day: string): number {
  return ((parseDay(day).getUTCDay() + 6) % 7) + 1
}

/**
 * A step is done iff it has done_on. Setting done fills done_on (today unless
 * given); any other status clears it.
 */
export function stepStatusChange(
  status: LifeStepStatus,
  today: string,
  doneOn?: string,
): { status: LifeStepStatus; done_on: string | null } {
  if (status !== 'done') {
    if (doneOn !== undefined) throw new Error('done_on only applies to status "done"')
    return { status, done_on: null }
  }
  return { status, done_on: doneOn ?? today }
}

// ============================================================
// Weeks
// ============================================================

export interface LifeWeekView {
  week: LifeWeek
  slots: LifeWeekSlot[]
  notes: LifeWeekNote[]
}

async function openWeekRow(supabase: TypedClient, day?: string): Promise<LifeWeek> {
  const { data, error } = await supabase.rpc('life_open_week', day === undefined ? {} : { p_day: day })
  if (error) throw error
  return data
}

/** Opens (or returns) the week containing `day` with its slots and notes. */
export async function openWeek(supabase: TypedClient, day?: string): Promise<LifeWeekView> {
  const week = await openWeekRow(supabase, day)
  const [slots, notes] = await Promise.all([
    supabase
      .from('life_week_slots')
      .select('*')
      .eq('week_id', week.id)
      .order('day')
      .order('position')
      .order('starts_at', { nullsFirst: false }),
    supabase.from('life_week_notes').select('*').eq('week_id', week.id),
  ])
  if (slots.error) throw slots.error
  if (notes.error) throw notes.error
  return { week, slots: slots.data, notes: notes.data }
}

export interface AddWeekSlotInput {
  day: string
  vehicle: LifeVehicle
  title: string
  sessionId?: string | null
  startsAt?: string | null
  position?: number
  note?: string | null
}

export async function addWeekSlot(supabase: TypedClient, input: AddWeekSlotInput): Promise<LifeWeekSlot> {
  const week = await openWeekRow(supabase, input.day)
  const { data, error } = await supabase
    .from('life_week_slots')
    .insert({
      week_id: week.id,
      day: input.day,
      vehicle: input.vehicle,
      title: input.title,
      session_id: input.sessionId ?? null,
      starts_at: input.startsAt ?? null,
      position: input.position ?? 0,
      note: input.note ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export interface UpdateWeekSlotInput {
  day?: string
  vehicle?: LifeVehicle
  title?: string
  sessionId?: string | null
  startsAt?: string | null
  position?: number
  note?: string | null
}

export async function updateWeekSlot(
  supabase: TypedClient,
  slotId: string,
  patch: UpdateWeekSlotInput,
): Promise<LifeWeekSlot> {
  const update: Tables['life_week_slots']['Update'] = {}
  if (patch.day !== undefined) {
    const { data: current, error: readError } = await supabase
      .from('life_week_slots')
      .select('day')
      .eq('id', slotId)
      .single()
    if (readError) throw readError
    if (weekStartOf(current.day) !== weekStartOf(patch.day)) {
      throw new Error('A slot can only move within its own week')
    }
    update.day = patch.day
  }
  if (patch.vehicle !== undefined) update.vehicle = patch.vehicle
  if (patch.title !== undefined) update.title = patch.title
  if (patch.sessionId !== undefined) update.session_id = patch.sessionId
  if (patch.startsAt !== undefined) update.starts_at = patch.startsAt
  if (patch.position !== undefined) update.position = patch.position
  if (patch.note !== undefined) update.note = patch.note

  const { data, error } = await supabase
    .from('life_week_slots')
    .update(update)
    .eq('id', slotId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeWeekSlot(supabase: TypedClient, slotId: string): Promise<void> {
  const { data, error } = await supabase.from('life_week_slots').delete().eq('id', slotId).select('id')
  if (error) throw error
  if (data.length === 0) throw new Error(`No week slot with id ${slotId}`)
}

export interface WeekNoteInput {
  day?: string
  vehicle: LifeVehicle
  body?: string | null
  wins?: string[]
  risks?: string[]
}

/** Upserts the note of a vehicle for the week containing `day`. Omitted fields keep their value. */
export async function upsertWeekNote(supabase: TypedClient, input: WeekNoteInput): Promise<LifeWeekNote> {
  const week = await openWeekRow(supabase, input.day)
  const row: Tables['life_week_notes']['Insert'] = { week_id: week.id, vehicle: input.vehicle }
  if (input.body !== undefined) row.body = input.body
  if (input.wins !== undefined) row.wins = input.wins
  if (input.risks !== undefined) row.risks = input.risks
  const { data, error } = await supabase
    .from('life_week_notes')
    .upsert(row, { onConflict: 'week_id,vehicle' })
    .select()
    .single()
  if (error) throw error
  return data
}

// ============================================================
// Routine: sessions, exercises, typical week
// ============================================================

export interface LifeSessionWithExercises extends LifeSession {
  exercises: LifeExercise[]
}

/** Sessions with their current exercises (valid_to is null). */
export async function listSessions(
  supabase: TypedClient,
  options: { includeArchived?: boolean } = {},
): Promise<LifeSessionWithExercises[]> {
  let sessionsQuery = supabase.from('life_sessions').select('*').order('vehicle').order('position')
  if (!options.includeArchived) sessionsQuery = sessionsQuery.eq('is_archived', false)
  const [sessions, exercises] = await Promise.all([
    sessionsQuery,
    supabase.from('life_exercises').select('*').is('valid_to', null).order('position'),
  ])
  if (sessions.error) throw sessions.error
  if (exercises.error) throw exercises.error
  return sessions.data.map((session) => ({
    ...session,
    exercises: exercises.data.filter((e) => e.session_id === session.id),
  }))
}

export interface ReplaceExerciseInput {
  name?: string
  prescription?: string | null
  purpose?: string | null
  note?: string | null
  from?: string
}

/**
 * Changes an exercise from `from` on (RPC life_replace_exercise). Omitted
 * fields keep the current value, since the RPC writes every field.
 */
export async function replaceExercise(
  supabase: TypedClient,
  exerciseId: string,
  input: ReplaceExerciseInput,
): Promise<LifeExercise> {
  const { data: current, error: readError } = await supabase
    .from('life_exercises')
    .select('*')
    .eq('id', exerciseId)
    .is('valid_to', null)
    .maybeSingle()
  if (readError) throw readError
  if (!current) throw new Error(`No current exercise with id ${exerciseId}`)

  const args: Database['public']['Functions']['life_replace_exercise']['Args'] = {
    p_exercise_id: exerciseId,
    p_name: input.name ?? current.name,
  }
  const prescription = input.prescription === undefined ? current.prescription : input.prescription
  const purpose = input.purpose === undefined ? current.purpose : input.purpose
  if (prescription !== null) args.p_prescription = prescription
  if (purpose !== null) args.p_purpose = purpose
  if (input.note != null) args.p_note = input.note
  if (input.from !== undefined) args.p_from = input.from

  const { data, error } = await supabase.rpc('life_replace_exercise', args)
  if (error) throw error
  return data
}

export interface AddExerciseInput {
  sessionId: string
  name: string
  block?: string | null
  prescription?: string | null
  purpose?: string | null
  position?: number
  from?: string
}

/** Adds an exercise to a session; without position it goes last. */
export async function addExercise(supabase: TypedClient, input: AddExerciseInput): Promise<LifeExercise> {
  let position = input.position
  if (position === undefined) {
    const { data: last, error: lastError } = await supabase
      .from('life_exercises')
      .select('position')
      .eq('session_id', input.sessionId)
      .is('valid_to', null)
      .order('position', { ascending: false })
      .limit(1)
    if (lastError) throw lastError
    position = (last[0]?.position ?? 0) + 1
  }
  const { data, error } = await supabase
    .from('life_exercises')
    .insert({
      session_id: input.sessionId,
      name: input.name,
      block: input.block ?? null,
      prescription: input.prescription ?? null,
      purpose: input.purpose ?? null,
      position,
      valid_from: input.from ?? todayIso(),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/** Current slots of the typical week (valid_to is null), by weekday and position. */
export async function listRoutineSlots(supabase: TypedClient): Promise<LifeRoutineSlot[]> {
  const { data, error } = await supabase
    .from('life_routine_slots')
    .select('*')
    .is('valid_to', null)
    .order('weekday')
    .order('position')
  if (error) throw error
  return data
}

export interface ReplaceSlotInput {
  title?: string
  sessionId?: string | null
  startsAt?: string | null
  note?: string | null
  from?: string
}

/**
 * Changes a slot of the typical week from `from` on (RPC life_replace_slot).
 * Omitted fields keep the current value.
 */
export async function replaceRoutineSlot(
  supabase: TypedClient,
  slotId: string,
  input: ReplaceSlotInput,
): Promise<LifeRoutineSlot> {
  const { data: current, error: readError } = await supabase
    .from('life_routine_slots')
    .select('*')
    .eq('id', slotId)
    .is('valid_to', null)
    .maybeSingle()
  if (readError) throw readError
  if (!current) throw new Error(`No current routine slot with id ${slotId}`)

  const args: Database['public']['Functions']['life_replace_slot']['Args'] = {
    p_slot_id: slotId,
    p_title: input.title ?? current.title,
  }
  const sessionId = input.sessionId === undefined ? current.session_id : input.sessionId
  const startsAt = input.startsAt === undefined ? current.starts_at : input.startsAt
  if (sessionId !== null) args.p_session_id = sessionId
  if (startsAt !== null) args.p_starts_at = startsAt
  if (input.note != null) args.p_note = input.note
  if (input.from !== undefined) args.p_from = input.from

  const { data, error } = await supabase.rpc('life_replace_slot', args)
  if (error) throw error
  return data
}

// ============================================================
// Habits
// ============================================================

export async function listHabits(
  supabase: TypedClient,
  options: { includeArchived?: boolean } = {},
): Promise<LifeHabit[]> {
  let query = supabase.from('life_habits').select('*').order('position')
  if (!options.includeArchived) query = query.eq('is_archived', false)
  const { data, error } = await query
  if (error) throw error
  return data
}

export interface AddHabitInput {
  name: string
  emoji?: string | null
  position?: number
}

/** Adds a habit; without position it goes last. */
export async function addHabit(supabase: TypedClient, input: AddHabitInput): Promise<LifeHabit> {
  let position = input.position
  if (position === undefined) {
    const { data: last, error: lastError } = await supabase
      .from('life_habits')
      .select('position')
      .eq('is_archived', false)
      .order('position', { ascending: false })
      .limit(1)
    if (lastError) throw lastError
    position = (last[0]?.position ?? 0) + 1
  }
  const { data, error } = await supabase
    .from('life_habits')
    .insert({ name: input.name, emoji: input.emoji ?? null, position })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function archiveHabit(supabase: TypedClient, habitId: string): Promise<LifeHabit> {
  const { data, error } = await supabase
    .from('life_habits')
    .update({ is_archived: true })
    .eq('id', habitId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function markHabitDay(
  supabase: TypedClient,
  habitId: string,
  day: string,
  note?: string | null,
): Promise<LifeHabitDay> {
  const row: Tables['life_habit_days']['Insert'] = { habit_id: habitId, day }
  if (note !== undefined) row.note = note
  const { data, error } = await supabase
    .from('life_habit_days')
    .upsert(row, { onConflict: 'habit_id,day' })
    .select()
    .single()
  if (error) throw error
  return data
}

/** Returns whether a mark existed. */
export async function unmarkHabitDay(supabase: TypedClient, habitId: string, day: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('life_habit_days')
    .delete()
    .eq('habit_id', habitId)
    .eq('day', day)
    .select('habit_id')
  if (error) throw error
  return data.length > 0
}

/** Marked days between `from` and `to`, both inclusive. */
export async function listHabitDays(supabase: TypedClient, from: string, to: string): Promise<LifeHabitDay[]> {
  const { data, error } = await supabase
    .from('life_habit_days')
    .select('*')
    .gte('day', from)
    .lte('day', to)
    .order('day')
  if (error) throw error
  return data
}

// ============================================================
// Objectives
// ============================================================

export interface LifeObjectiveWithSteps extends LifeObjective {
  steps: LifeObjectiveStep[]
}

export interface ListObjectivesOptions {
  year?: number
  vehicle?: LifeVehicle
  status?: LifeObjectiveStatus
}

export async function listObjectives(
  supabase: TypedClient,
  options: ListObjectivesOptions = {},
): Promise<LifeObjectiveWithSteps[]> {
  let query = supabase.from('life_objectives').select('*').order('vehicle').order('position')
  if (options.year !== undefined) query = query.eq('year', options.year)
  if (options.vehicle !== undefined) query = query.eq('vehicle', options.vehicle)
  if (options.status !== undefined) query = query.eq('status', options.status)
  const { data: objectives, error } = await query
  if (error) throw error
  if (objectives.length === 0) return []

  const { data: steps, error: stepsError } = await supabase
    .from('life_objective_steps')
    .select('*')
    .in('objective_id', objectives.map((o) => o.id))
    .order('position')
  if (stepsError) throw stepsError
  return objectives.map((objective) => ({
    ...objective,
    steps: steps.filter((s) => s.objective_id === objective.id),
  }))
}

export interface AddObjectiveInput {
  vehicle: LifeVehicle
  title: string
  year?: number
  focus?: string | null
  linearProjectId?: string | null
  position?: number
}

export async function addObjective(supabase: TypedClient, input: AddObjectiveInput): Promise<LifeObjective> {
  const row: Tables['life_objectives']['Insert'] = {
    vehicle: input.vehicle,
    title: input.title,
    focus: input.focus ?? null,
    linear_project_id: input.linearProjectId ?? null,
    position: input.position ?? 0,
  }
  if (input.year !== undefined) row.year = input.year
  const { data, error } = await supabase.from('life_objectives').insert(row).select().single()
  if (error) throw error
  return data
}

export interface AddStepInput {
  objectiveId: string
  title: string
  period?: string | null
  status?: LifeStepStatus
  startedOn?: string | null
  doneOn?: string
  note?: string | null
  position?: number
}

/** Adds a roadmap step; without position it goes last. */
export async function addObjectiveStep(supabase: TypedClient, input: AddStepInput): Promise<LifeObjectiveStep> {
  const { status, done_on } = stepStatusChange(input.status ?? 'pending', todayIso(), input.doneOn)
  let position = input.position
  if (position === undefined) {
    const { data: last, error: lastError } = await supabase
      .from('life_objective_steps')
      .select('position')
      .eq('objective_id', input.objectiveId)
      .order('position', { ascending: false })
      .limit(1)
    if (lastError) throw lastError
    position = (last[0]?.position ?? 0) + 1
  }
  const { data, error } = await supabase
    .from('life_objective_steps')
    .insert({
      objective_id: input.objectiveId,
      title: input.title,
      period: input.period ?? null,
      status,
      done_on,
      started_on: input.startedOn ?? null,
      note: input.note ?? null,
      position,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/** Sets a step's status: done fills done_on (today unless `doneOn`); any other status clears it. */
export async function setStepStatus(
  supabase: TypedClient,
  stepId: string,
  status: LifeStepStatus,
  options: { doneOn?: string; today?: string } = {},
): Promise<LifeObjectiveStep> {
  const patch = stepStatusChange(status, options.today ?? todayIso(), options.doneOn)
  const { data, error } = await supabase
    .from('life_objective_steps')
    .update(patch)
    .eq('id', stepId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function closeObjective(
  supabase: TypedClient,
  objectiveId: string,
  status: LifeObjectiveStatus,
  options: { note?: string; on?: string } = {},
): Promise<LifeObjective> {
  const args: Database['public']['Functions']['life_close_objective']['Args'] = {
    p_objective_id: objectiveId,
    p_status: status,
  }
  if (options.note !== undefined) args.p_note = options.note
  if (options.on !== undefined) args.p_on = options.on
  const { data, error } = await supabase.rpc('life_close_objective', args)
  if (error) throw error
  return data
}

// ============================================================
// Notes
// ============================================================

export interface AddNoteInput {
  vehicle: LifeVehicle
  body: string
  topic?: string | null
  notedOn?: string
}

export async function addNote(supabase: TypedClient, input: AddNoteInput): Promise<LifeNote> {
  const row: Tables['life_notes']['Insert'] = {
    vehicle: input.vehicle,
    body: input.body,
    topic: input.topic ?? null,
  }
  if (input.notedOn !== undefined) row.noted_on = input.notedOn
  const { data, error } = await supabase.from('life_notes').insert(row).select().single()
  if (error) throw error
  return data
}

export interface ListNotesOptions {
  vehicle?: LifeVehicle
  topic?: string
  limit?: number
}

export async function listNotes(supabase: TypedClient, options: ListNotesOptions = {}): Promise<LifeNote[]> {
  let query = supabase
    .from('life_notes')
    .select('*')
    .eq('is_archived', false)
    .order('noted_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (options.vehicle !== undefined) query = query.eq('vehicle', options.vehicle)
  if (options.topic !== undefined) query = query.ilike('topic', `%${options.topic}%`)
  if (options.limit !== undefined) query = query.limit(options.limit)
  const { data, error } = await query
  if (error) throw error
  return data
}

// ============================================================
// Import
// ============================================================

export interface LifeSeedHabit {
  name: string
  emoji?: string | null
  position: number
}

export interface LifeSeedExercise {
  block?: string | null
  name: string
  prescription?: string | null
  purpose?: string | null
  position: number
}

export interface LifeSeedSession {
  key: string
  vehicle: LifeVehicle
  name: string
  emoji?: string | null
  focus?: string | null
  position: number
  exercises: LifeSeedExercise[]
}

export interface LifeSeedSlot {
  weekday: number
  vehicle: LifeVehicle
  session_key?: string | null
  title: string
  starts_at?: string | null
  position: number
}

export interface LifeSeedStep {
  title: string
  period?: string | null
  status: LifeStepStatus
  started_on?: string | null
  done_on?: string | null
  note?: string | null
  position: number
}

export interface LifeSeedObjective {
  vehicle: LifeVehicle
  title: string
  year: number
  focus?: string | null
  status: LifeObjectiveStatus
  status_note?: string | null
  closed_on?: string | null
  linear_project_id?: string | null
  position: number
  steps: LifeSeedStep[]
}

export interface LifeSeedBudget {
  bucket: BudgetBucket
  month: string
  amount: number
}

export interface LifeSeedNote {
  vehicle: LifeVehicle
  topic?: string | null
  body: string
  noted_on: string
}

export interface LifeSeed {
  habits: LifeSeedHabit[]
  sessions: LifeSeedSession[]
  slots: LifeSeedSlot[]
  objectives: LifeSeedObjective[]
  budgets: LifeSeedBudget[]
  notes?: LifeSeedNote[]
}

type Rec = Record<string, unknown>

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string'
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isOptionalDay(value: unknown): boolean {
  return value === undefined || value === null || isIsoDay(value)
}

function isMonthString(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    return isIsoDay(normalizeMonth(value)) && normalizeMonth(value).endsWith('-01')
  } catch {
    return false
  }
}

function checkArray(seed: Rec, key: string, errors: string[], required: boolean): unknown[] {
  const value = seed[key]
  if (value === undefined && !required) return []
  if (!Array.isArray(value)) {
    errors.push(`${key}: must be an array`)
    return []
  }
  return value
}

/** Every problem found in a seed, with its path. Empty means the seed is valid. */
export function lifeSeedErrors(value: unknown): string[] {
  const errors: string[] = []
  if (!isRecord(value)) return ['seed: must be an object']

  checkArray(value, 'habits', errors, true).forEach((h, i) => {
    const p = `habits[${i}]`
    if (!isRecord(h)) return void errors.push(`${p}: must be an object`)
    if (!isText(h.name)) errors.push(`${p}.name: required text`)
    if (!isOptionalString(h.emoji)) errors.push(`${p}.emoji: must be a string`)
    if (!isInt(h.position)) errors.push(`${p}.position: must be an integer`)
  })
  const activeHabits = Array.isArray(value.habits) ? value.habits.length : 0
  if (activeHabits > 4) errors.push('habits: at most four active habits')

  const sessionKeys = new Set<string>()
  checkArray(value, 'sessions', errors, true).forEach((s, i) => {
    const p = `sessions[${i}]`
    if (!isRecord(s)) return void errors.push(`${p}: must be an object`)
    if (!isText(s.key)) errors.push(`${p}.key: required text`)
    else if (sessionKeys.has(s.key)) errors.push(`${p}.key: duplicated "${s.key}"`)
    else sessionKeys.add(s.key)
    if (!isLifeVehicle(s.vehicle)) errors.push(`${p}.vehicle: one of ${LIFE_VEHICLES.join(', ')}`)
    if (!isText(s.name)) errors.push(`${p}.name: required text`)
    if (!isOptionalString(s.emoji)) errors.push(`${p}.emoji: must be a string`)
    if (!isOptionalString(s.focus)) errors.push(`${p}.focus: must be a string`)
    if (!isInt(s.position)) errors.push(`${p}.position: must be an integer`)
    checkArray(s, 'exercises', errors, true).forEach((e, j) => {
      const q = `${p}.exercises[${j}]`
      if (!isRecord(e)) return void errors.push(`${q}: must be an object`)
      if (!isText(e.name)) errors.push(`${q}.name: required text`)
      for (const k of ['block', 'prescription', 'purpose']) {
        if (!isOptionalString(e[k])) errors.push(`${q}.${k}: must be a string`)
      }
      if (!isInt(e.position)) errors.push(`${q}.position: must be an integer`)
    })
  })

  checkArray(value, 'slots', errors, true).forEach((s, i) => {
    const p = `slots[${i}]`
    if (!isRecord(s)) return void errors.push(`${p}: must be an object`)
    if (!isInt(s.weekday) || s.weekday < 1 || s.weekday > 7) errors.push(`${p}.weekday: integer 1-7 (Monday = 1)`)
    if (!isLifeVehicle(s.vehicle)) errors.push(`${p}.vehicle: one of ${LIFE_VEHICLES.join(', ')}`)
    if (!isText(s.title)) errors.push(`${p}.title: required text`)
    if (s.session_key !== undefined && s.session_key !== null) {
      if (typeof s.session_key !== 'string' || !sessionKeys.has(s.session_key)) {
        errors.push(`${p}.session_key: no session with key "${String(s.session_key)}"`)
      }
    }
    if (s.starts_at !== undefined && s.starts_at !== null && !isTimeOfDay(s.starts_at)) {
      errors.push(`${p}.starts_at: expected HH:MM`)
    }
    if (!isInt(s.position)) errors.push(`${p}.position: must be an integer`)
  })

  checkArray(value, 'objectives', errors, true).forEach((o, i) => {
    const p = `objectives[${i}]`
    if (!isRecord(o)) return void errors.push(`${p}: must be an object`)
    if (!isLifeVehicle(o.vehicle)) errors.push(`${p}.vehicle: one of ${LIFE_VEHICLES.join(', ')}`)
    if (!isText(o.title)) errors.push(`${p}.title: required text`)
    if (!isInt(o.year)) errors.push(`${p}.year: must be an integer`)
    for (const k of ['focus', 'status_note', 'linear_project_id']) {
      if (!isOptionalString(o[k])) errors.push(`${p}.${k}: must be a string`)
    }
    if (!isLifeObjectiveStatus(o.status)) {
      errors.push(`${p}.status: one of ${LIFE_OBJECTIVE_STATUSES.join(', ')}`)
    }
    if (!isOptionalDay(o.closed_on)) errors.push(`${p}.closed_on: expected YYYY-MM-DD`)
    const closed = o.closed_on !== undefined && o.closed_on !== null
    if (o.status === 'active' && closed) errors.push(`${p}.closed_on: an active objective has no closed_on`)
    if ((o.status === 'done' || o.status === 'dropped') && !closed) {
      errors.push(`${p}.closed_on: required when status is ${o.status}`)
    }
    if (!isInt(o.position)) errors.push(`${p}.position: must be an integer`)
    checkArray(o, 'steps', errors, true).forEach((s, j) => {
      const q = `${p}.steps[${j}]`
      if (!isRecord(s)) return void errors.push(`${q}: must be an object`)
      if (!isText(s.title)) errors.push(`${q}.title: required text`)
      for (const k of ['period', 'note']) {
        if (!isOptionalString(s[k])) errors.push(`${q}.${k}: must be a string`)
      }
      if (!isLifeStepStatus(s.status)) errors.push(`${q}.status: one of ${LIFE_STEP_STATUSES.join(', ')}`)
      if (!isOptionalDay(s.started_on)) errors.push(`${q}.started_on: expected YYYY-MM-DD`)
      if (!isOptionalDay(s.done_on)) errors.push(`${q}.done_on: expected YYYY-MM-DD`)
      const done = s.done_on !== undefined && s.done_on !== null
      if (s.status === 'done' && !done) errors.push(`${q}.done_on: required when status is done`)
      if (s.status !== 'done' && done) errors.push(`${q}.done_on: only allowed when status is done`)
      if (!isInt(s.position)) errors.push(`${q}.position: must be an integer`)
    })
  })

  checkArray(value, 'budgets', errors, true).forEach((b, i) => {
    const p = `budgets[${i}]`
    if (!isRecord(b)) return void errors.push(`${p}: must be an object`)
    if (!isBudgetBucket(b.bucket)) errors.push(`${p}.bucket: one of ${BUDGET_BUCKETS.join(', ')}`)
    if (!isMonthString(b.month)) errors.push(`${p}.month: expected YYYY-MM or the first day YYYY-MM-01`)
    if (!isInt(b.amount) || b.amount < 0) errors.push(`${p}.amount: non-negative integer (CLP)`)
  })

  checkArray(value, 'notes', errors, false).forEach((n, i) => {
    const p = `notes[${i}]`
    if (!isRecord(n)) return void errors.push(`${p}: must be an object`)
    if (!isLifeVehicle(n.vehicle)) errors.push(`${p}.vehicle: one of ${LIFE_VEHICLES.join(', ')}`)
    if (!isOptionalString(n.topic)) errors.push(`${p}.topic: must be a string`)
    if (!isText(n.body)) errors.push(`${p}.body: required text`)
    if (!isIsoDay(n.noted_on)) errors.push(`${p}.noted_on: expected YYYY-MM-DD`)
  })

  return errors
}

export function isLifeSeed(value: unknown): value is LifeSeed {
  return lifeSeedErrors(value).length === 0
}

function blankToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  return value.trim().length === 0 ? null : value
}

export interface LifeImportCounts {
  habits: number
  sessions: number
  exercises: number
  slots: number
  objectives: number
  steps: number
  budgets: number
  notes: number
}

export type LifeImportResult =
  | { status: 'imported'; from: string; counts: LifeImportCounts }
  | { status: 'refused'; existing: { sessions: number; objectives: number } }

async function countRows(supabase: TypedClient, table: 'life_sessions' | 'life_objectives'): Promise<number> {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

/**
 * Loads a seed into the life tables. Refuses (without writing) when the user
 * already has sessions or objectives. Exercises and typical-week slots are
 * valid from `from` (default today).
 */
export async function importLife(
  supabase: TypedClient,
  seed: unknown,
  options: { from?: string } = {},
): Promise<LifeImportResult> {
  const errors = lifeSeedErrors(seed)
  if (errors.length > 0 || !isLifeSeed(seed)) {
    throw new Error(`Invalid life seed:\n- ${errors.join('\n- ')}`)
  }
  const from = options.from ?? todayIso()
  if (!isIsoDay(from)) throw new Error(`Invalid from date "${from}", expected YYYY-MM-DD`)

  const [sessionsCount, objectivesCount] = await Promise.all([
    countRows(supabase, 'life_sessions'),
    countRows(supabase, 'life_objectives'),
  ])
  if (sessionsCount > 0 || objectivesCount > 0) {
    return { status: 'refused', existing: { sessions: sessionsCount, objectives: objectivesCount } }
  }

  const counts: LifeImportCounts = {
    habits: 0, sessions: 0, exercises: 0, slots: 0, objectives: 0, steps: 0, budgets: 0, notes: 0,
  }

  if (seed.habits.length > 0) {
    const { error } = await supabase.from('life_habits').insert(
      seed.habits.map((h) => ({ name: h.name, emoji: blankToNull(h.emoji), position: h.position })),
    )
    if (error) throw error
    counts.habits = seed.habits.length
  }

  const sessionIds = new Map<string, string>()
  for (const session of seed.sessions) {
    const { data, error } = await supabase
      .from('life_sessions')
      .insert({
        vehicle: session.vehicle,
        name: session.name,
        emoji: blankToNull(session.emoji),
        focus: blankToNull(session.focus),
        position: session.position,
      })
      .select('id')
      .single()
    if (error) throw error
    sessionIds.set(session.key, data.id)
    counts.sessions += 1

    if (session.exercises.length > 0) {
      const { error: exError } = await supabase.from('life_exercises').insert(
        session.exercises.map((e) => ({
          session_id: data.id,
          block: blankToNull(e.block),
          name: e.name,
          prescription: blankToNull(e.prescription),
          purpose: blankToNull(e.purpose),
          position: e.position,
          valid_from: from,
        })),
      )
      if (exError) throw exError
      counts.exercises += session.exercises.length
    }
  }

  if (seed.slots.length > 0) {
    const { error } = await supabase.from('life_routine_slots').insert(
      seed.slots.map((s) => ({
        weekday: s.weekday,
        vehicle: s.vehicle,
        session_id: s.session_key ? (sessionIds.get(s.session_key) ?? null) : null,
        title: s.title,
        starts_at: blankToNull(s.starts_at),
        position: s.position,
        valid_from: from,
      })),
    )
    if (error) throw error
    counts.slots = seed.slots.length
  }

  for (const objective of seed.objectives) {
    const { data, error } = await supabase
      .from('life_objectives')
      .insert({
        vehicle: objective.vehicle,
        title: objective.title,
        year: objective.year,
        focus: blankToNull(objective.focus),
        status: objective.status,
        status_note: blankToNull(objective.status_note),
        closed_on: objective.closed_on ?? null,
        linear_project_id: blankToNull(objective.linear_project_id),
        position: objective.position,
      })
      .select('id')
      .single()
    if (error) throw error
    counts.objectives += 1

    if (objective.steps.length > 0) {
      const { error: stepsError } = await supabase.from('life_objective_steps').insert(
        objective.steps.map((s) => ({
          objective_id: data.id,
          title: s.title,
          period: blankToNull(s.period),
          status: s.status,
          started_on: s.started_on ?? null,
          done_on: s.done_on ?? null,
          note: blankToNull(s.note),
          position: s.position,
        })),
      )
      if (stepsError) throw stepsError
      counts.steps += objective.steps.length
    }
  }

  if (seed.budgets.length > 0) {
    const { error } = await supabase.from('bucket_budgets').upsert(
      seed.budgets.map((b) => ({
        entity: 'personal' as const,
        bucket: b.bucket,
        month: normalizeMonth(b.month),
        amount: b.amount,
      })),
      { onConflict: 'user_id,entity,bucket,month' },
    )
    if (error) throw error
    counts.budgets = seed.budgets.length
  }

  const notes = seed.notes ?? []
  if (notes.length > 0) {
    const { error } = await supabase.from('life_notes').insert(
      notes.map((n) => ({
        vehicle: n.vehicle,
        topic: blankToNull(n.topic),
        body: n.body,
        noted_on: n.noted_on,
      })),
    )
    if (error) throw error
    counts.notes = notes.length
  }

  return { status: 'imported', from, counts }
}
