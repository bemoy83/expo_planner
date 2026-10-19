import { withSettingsDefaults, type AllocationRow, type ExcludedArticle, type HallRules, type KpiConfig, type Settings, type Workspace } from '../domain/types'
import { isVismaLine, withVismaDemand } from '../domain/visma'

/**
 * The workspace as records: one per thing a planner edits, as they are stored in the browser and, later, synced. A
 * conflict between two planners can then lose at most one record. What can be worked out again is no record: the Visma
 * lines of the ledger are worked out from the exports, the KPI setup and the overrides wherever those change.
 *
 * Maps edited a key at a time are a record per key, and so are the parts of the KPI setup and the hall rules that are
 * edited from Behov (the rules for article texts, the articles left out, the choices for single texts). A planning row
 * is a record without its days, and each of its days with FTE or a note is a record of its own (`allocCell`). In
 * memory and in the backup the workspace keeps its shape: the records are made from it and read back into it here.
 */
export type Kind =
  | 'settings'
  | 'venueImport'
  | 'kpi'
  | 'kpiText'
  | 'kpiExcluded'
  | 'hallRules'
  | 'hallChoice'
  | 'override'
  | 'hidden'
  | 'competenceStyle'
  | 'budget'
  | 'visma'
  | 'demand'
  | 'venue'
  | 'project'
  | 'allocation'
  | 'allocCell'
  | 'person'
  | 'unavailability'
  | 'assignment'
  | 'demandAdjustment'
  | 'supplier'
  | 'hireOrder'

/** A record as it is stored. */
export interface StoredRecord {
  kind: Kind
  id: string
  value: unknown
}

/** A record before and after a change; `null` where it does not exist. */
export interface Delta {
  kind: Kind
  id: string
  before: unknown
  after: unknown
}

/** What is written for a record: its value, or `null` to delete it. */
export interface RecordWrite {
  kind: Kind
  id: string
  value: unknown
}

export const recordKey = (kind: Kind, id: string): string => `${kind}|${id}`

/** The id of a row of the project table: a row per name a project goes by, so the name and the number. */
export const projectId = (ref: { name: string; projectNo: string }): string => `${ref.name}|${ref.projectNo}`

/** The id of a day of a planning row. */
export const cellId = (rowId: string, date: string): string => `${rowId}|${date}`

/** The key of a rule for an article text, as the rules are looked up. */
const textKey = (text: string): string => text.trim().toLowerCase()

type KpiCore = Pick<KpiConfig, 'workTypes' | 'rates'>
type HallCore = Omit<HallRules, 'choices'>
type RowCore = Omit<AllocationRow, 'fte' | 'notes'>
interface Cell {
  fte?: number
  note?: string
}

/** A workspace with nothing in it, to make records from and read them into. */
const NOTHING = { settings: undefined, venue: [], projects: [], demand: [], allocations: [] } as unknown as Workspace

/** Small values compared by what they hold: a cell, a rule, a number. */
const sameValue = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b)

const rowCore = ({ fte: _fte, notes: _notes, ...core }: AllocationRow): RowCore => core

const sameCore = (a: AllocationRow, b: AllocationRow): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  keys.delete('fte')
  keys.delete('notes')
  return [...keys].every((key) => a[key as keyof AllocationRow] === b[key as keyof AllocationRow])
}

const cellOf = (row: AllocationRow | undefined, date: string): Cell | null => {
  if (!row) return null
  const fte = row.fte[date]
  const note = row.notes[date]
  return fte === undefined && note === undefined ? null : { ...(fte !== undefined ? { fte } : {}), ...(note !== undefined ? { note } : {}) }
}

/** The records that differ between two workspaces, with their values before and after. Unchanged lists are passed over by reference. */
export const diffWorkspace = (before: Workspace, after: Workspace): Delta[] => {
  const deltas: Delta[] = []
  const one = (kind: Kind, id: string, b: unknown, a: unknown, same: (x: unknown, y: unknown) => boolean = Object.is) => {
    if (!same(b ?? null, a ?? null)) deltas.push({ kind, id, before: b ?? null, after: a ?? null })
  }
  const list = <T,>(kind: Kind, b: T[] | undefined, a: T[] | undefined, idOf: (item: T) => string, same: (x: unknown, y: unknown) => boolean = Object.is) => {
    if (b === a) return
    const old = new Map((b ?? []).map((item) => [idOf(item), item]))
    for (const item of a ?? []) {
      const id = idOf(item)
      one(kind, id, old.get(id), item, same)
      old.delete(id)
    }
    for (const [id, item] of old) one(kind, id, item, null)
  }
  const map = <V,>(kind: Kind, b: Record<string, V> | undefined, a: Record<string, V> | undefined, same: (x: unknown, y: unknown) => boolean = Object.is) => {
    if (b === a) return
    for (const key of new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])) one(kind, key, b?.[key], a?.[key], same)
  }

  one('settings', 'settings', before.settings, after.settings)
  one('venueImport', 'venueImport', before.venueImport, after.venueImport)

  if (before.kpi !== after.kpi) {
    const core = (kpi: KpiConfig | undefined): KpiCore | null => (kpi ? { workTypes: kpi.workTypes, rates: kpi.rates } : null)
    const sameKpi = (x: unknown, y: unknown) => (x as KpiCore | null)?.workTypes === (y as KpiCore | null)?.workTypes && (x as KpiCore | null)?.rates === (y as KpiCore | null)?.rates && !x === !y
    one('kpi', 'kpi', core(before.kpi), core(after.kpi), sameKpi)
    list('kpiText', before.kpi?.byText, after.kpi?.byText, (rule) => textKey(rule.text), sameValue)
    list('kpiExcluded', before.kpi?.excludedArticles, after.kpi?.excludedArticles, (article) => article.articleNo, sameValue)
  }

  if (before.hallRules !== after.hallRules) {
    const core = (rules: HallRules | undefined): HallCore | null => (rules ? { places: rules.places, phrases: rules.phrases, ...(rules.areas ? { areas: rules.areas } : {}) } : null)
    const sameRules = (x: unknown, y: unknown) => {
      const [p, q] = [x as HallCore | null, y as HallCore | null]
      return !p === !q && p?.places === q?.places && p?.phrases === q?.phrases && p?.areas === q?.areas
    }
    one('hallRules', 'hallRules', core(before.hallRules), core(after.hallRules), sameRules)
    map('hallChoice', before.hallRules?.choices, after.hallRules?.choices)
  }

  map('override', before.overrides, after.overrides)
  map('hidden', before.hiddenVenue, after.hiddenVenue)
  map('competenceStyle', before.competenceStyles, after.competenceStyles)
  map('budget', before.budgets, after.budgets)

  list('visma', before.visma, after.visma, (v) => v.projectNo)
  if (before.demand !== after.demand) list('demand', before.demand.filter((line) => !isVismaLine(line)), after.demand.filter((line) => !isVismaLine(line)), (line) => line.id)
  list('venue', before.venue, after.venue, (booking) => booking.id)
  list('project', before.projects, after.projects, projectId, sameValue)

  if (before.allocations !== after.allocations) {
    const old = new Map(before.allocations.map((row) => [row.id, row]))
    const rows = new Map(after.allocations.map((row) => [row.id, row]))
    for (const id of new Set([...old.keys(), ...rows.keys()])) {
      const [b, a] = [old.get(id), rows.get(id)]
      if (b === a) continue
      if (!b || !a || !sameCore(b, a)) one('allocation', id, b && rowCore(b), a && rowCore(a))
      const dates = new Set([...Object.keys(b?.fte ?? {}), ...Object.keys(b?.notes ?? {}), ...Object.keys(a?.fte ?? {}), ...Object.keys(a?.notes ?? {})])
      for (const date of dates) one('allocCell', cellId(id, date), cellOf(b, date), cellOf(a, date), sameValue)
    }
  }

  list('person', before.persons, after.persons, (p) => p.id)
  list('unavailability', before.unavailability, after.unavailability, (u) => u.id)
  list('assignment', before.assignments, after.assignments, (a) => a.id)
  list('demandAdjustment', before.demandAdjustments, after.demandAdjustments, (d) => d.id)
  list('supplier', before.suppliers, after.suppliers, (s) => s.id)
  list('hireOrder', before.hireOrders, after.hireOrders, (o) => o.id)
  return deltas
}

/** Rows that have an order are sorted by it, and by id where two have the same, as two planners adding at once can give. */
const byOrder = <T extends { order: number; id: string },>(items: T[]): T[] => items.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

/** The kinds whose change has the Visma lines worked out again. */
const VISMA_INPUTS = new Set<Kind>(['visma', 'kpi', 'kpiText', 'kpiExcluded', 'override'])

/**
 * The workspace with the records given their values: `after` for an edit or a redo, `before` for an undo. A record
 * whose value is `null` is removed. The Visma lines are worked out again where an input of theirs changed.
 */
export const applyDeltas = (ws: Workspace, deltas: Delta[], side: 'before' | 'after'): Workspace => {
  if (!deltas.length) return ws
  const byKind = new Map<Kind, Map<string, unknown>>()
  for (const delta of deltas) {
    const values = byKind.get(delta.kind) ?? new Map<string, unknown>()
    values.set(delta.id, delta[side])
    byKind.set(delta.kind, values)
  }
  const touched = (kind: Kind) => byKind.get(kind)
  const next: Workspace = { ...ws }

  const applyList = <T,>(items: T[] | undefined, kind: Kind, idOf: (item: T) => string): T[] | undefined => {
    const values = touched(kind)
    if (!values) return items
    return [...(items ?? []).filter((item) => !values.has(idOf(item))), ...[...values.values()].filter((value): value is T => value !== null)]
  }
  const applyMap = <V,>(entries: Record<string, V> | undefined, kind: Kind): Record<string, V> | undefined => {
    const values = touched(kind)
    if (!values) return entries
    const out = { ...entries }
    for (const [key, value] of values) {
      if (value === null) delete out[key]
      else out[key] = value as V
    }
    return out
  }

  const settings = touched('settings')?.get('settings')
  if (settings !== undefined) next.settings = settings as Settings
  const venueImport = touched('venueImport')?.get('venueImport')
  if (venueImport !== undefined) next.venueImport = (venueImport ?? undefined) as Workspace['venueImport']

  if (touched('kpi') || touched('kpiText') || touched('kpiExcluded')) {
    const coreValue = touched('kpi')?.get('kpi')
    const core = coreValue === undefined ? (ws.kpi ? { workTypes: ws.kpi.workTypes, rates: ws.kpi.rates } : null) : (coreValue as KpiCore | null)
    const byText = applyList(ws.kpi?.byText, 'kpiText', (rule) => textKey(rule.text))
    const excluded = applyList<ExcludedArticle>(ws.kpi?.excludedArticles, 'kpiExcluded', (article) => article.articleNo)
    next.kpi =
      core || byText?.length || excluded?.length
        ? { ...(core ?? { workTypes: [], rates: [] }), ...(byText && (byText.length || ws.kpi?.byText) ? { byText } : {}), ...(excluded && (excluded.length || ws.kpi?.excludedArticles) ? { excludedArticles: excluded } : {}) }
        : undefined
  }

  if (touched('hallRules') || touched('hallChoice')) {
    const coreValue = touched('hallRules')?.get('hallRules')
    const core = coreValue === undefined ? (ws.hallRules ? { places: ws.hallRules.places, phrases: ws.hallRules.phrases, ...(ws.hallRules.areas ? { areas: ws.hallRules.areas } : {}) } : null) : (coreValue as HallCore | null)
    const choices = applyMap(ws.hallRules?.choices, 'hallChoice') ?? {}
    next.hallRules = core || Object.keys(choices).length ? { ...(core ?? { places: [], phrases: [] }), choices } : undefined
  }

  next.overrides = applyMap(ws.overrides, 'override')
  next.hiddenVenue = applyMap(ws.hiddenVenue, 'hidden')
  next.competenceStyles = applyMap(ws.competenceStyles, 'competenceStyle')
  next.budgets = applyMap(ws.budgets, 'budget')

  next.visma = applyList(ws.visma, 'visma', (v) => v.projectNo)
  next.demand = applyList(ws.demand, 'demand', (line) => line.id)!
  if ([...byKind.keys()].some((kind) => VISMA_INPUTS.has(kind))) next.demand = withVismaDemand(next)
  next.venue = applyList(ws.venue, 'venue', (booking) => booking.id)!
  next.projects = applyList(ws.projects, 'project', projectId)!

  const rowValues = touched('allocation')
  const cellValues = touched('allocCell')
  if (rowValues || cellValues) {
    const rows = new Map(ws.allocations.map((row) => [row.id, row]))
    const cells = new Map<string, [string, unknown][]>()
    for (const [id, value] of cellValues ?? []) {
      const at = id.lastIndexOf('|')
      const rowId = id.slice(0, at)
      cells.set(rowId, [...(cells.get(rowId) ?? []), [id.slice(at + 1), value]])
    }
    for (const rowId of new Set([...(rowValues?.keys() ?? []), ...cells.keys()])) {
      const existing = rows.get(rowId)
      const coreValue = rowValues?.get(rowId)
      const core = coreValue === undefined ? existing && rowCore(existing) : (coreValue as RowCore | null)
      // A day of a row that is not there is left out: another planner may have removed the row while this one typed in it.
      if (!core) {
        rows.delete(rowId)
        continue
      }
      const fte = { ...existing?.fte }
      const notes = { ...existing?.notes }
      for (const [date, value] of cells.get(rowId) ?? []) {
        const cell = value as Cell | null
        if (cell?.fte !== undefined) fte[date] = cell.fte
        else delete fte[date]
        if (cell?.note !== undefined) notes[date] = cell.note
        else delete notes[date]
      }
      rows.set(rowId, { ...core, fte, notes })
    }
    next.allocations = byOrder([...rows.values()])
  }

  const persons = applyList(ws.persons, 'person', (p) => p.id)
  next.persons = touched('person') ? byOrder(persons!) : persons
  next.unavailability = applyList(ws.unavailability, 'unavailability', (u) => u.id)
  next.assignments = applyList(ws.assignments, 'assignment', (a) => a.id)
  next.demandAdjustments = applyList(ws.demandAdjustments, 'demandAdjustment', (d) => d.id)
  const suppliers = applyList(ws.suppliers, 'supplier', (s) => s.id)
  next.suppliers = touched('supplier') ? byOrder(suppliers!) : suppliers
  next.hireOrders = applyList(ws.hireOrders, 'hireOrder', (o) => o.id)
  return next
}

/** Every record of a workspace, to store it as a whole. */
export const toRecords = (ws: Workspace): StoredRecord[] => diffWorkspace(NOTHING, ws).map(({ kind, id, after }) => ({ kind, id, value: after }))

/** The workspace the records make up; `null` where there are none, before a workspace is started. */
export const fromRecords = (records: StoredRecord[]): Workspace | null => {
  if (!records.some((record) => record.kind === 'settings')) return null
  const ws = applyDeltas(NOTHING, records.map(({ kind, id, value }) => ({ kind, id, before: null, after: value })), 'after')
  // The Visma lines are worked out also where no input of theirs came in, so that a workspace always has them.
  return { ...ws, settings: withSettingsDefaults(ws.settings), demand: withVismaDemand(ws) }
}

/** Several changes to the same record in one step keep the first value before and the last after. */
export const mergeDeltas = (step: Map<string, Delta>, deltas: Delta[]) => {
  for (const delta of deltas) {
    const key = recordKey(delta.kind, delta.id)
    const open = step.get(key)
    step.set(key, open ? { ...delta, before: open.before } : delta)
  }
}

/** The deltas of a step that change something: a record changed and changed back within it is none. */
export const effective = (step: Map<string, Delta>): Delta[] => [...step.values()].filter((delta) => !sameValue(delta.before, delta.after))

/** What is written to storage for the deltas, as they are on the given side. */
export const writesOf = (deltas: Delta[], side: 'before' | 'after'): RecordWrite[] => deltas.map((delta) => ({ kind: delta.kind, id: delta.id, value: delta[side] }))
