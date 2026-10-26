import { mergeOrders } from './hire'
import { productTypeKey } from './kpi'
import type { TableDiff } from './tableDiff'
import { competenceKey, LINE_COLORS, type CompetenceKey, type CompetenceStyle, type KpiConfig, type LineColor, type Person, type Stage, type Workspace } from './types'
import { clamp } from './numbers'

/**
 * The competences of Bemanning and the people who have them. The list of competences is derived: it is
 * every competence text on the product types, the demand, the planning rows and the people, plus those
 * the planner has added by hand. How each one is shown (short name, colour, order) is its style.
 * A competence has one name: the name of its style is the text the data names it by, see `renameCompetence`.
 */

const SHORT_LABEL_LENGTH = 4

/** The competence texts in use, by key, each with the first spelling met. */
const textsInUse = (ws: Workspace): Map<CompetenceKey, string> => {
  const texts = new Map<CompetenceKey, string>()
  const add = (text: string) => {
    const key = competenceKey(text)
    if (key && !texts.has(key)) texts.set(key, text.trim())
  }
  for (const rule of ws.kpi?.workTypes ?? []) add(rule.competence)
  for (const line of ws.demand) add(line.competence)
  for (const row of ws.allocations) add(row.competence)
  for (const person of ws.persons ?? []) for (const key of person.competences) add(key)
  for (const supplier of ws.suppliers ?? []) for (const key of supplier.competences) add(key)
  return texts
}

export const defaultShortLabel = (label: string): string => (label.length <= SHORT_LABEL_LENGTH ? label : label.slice(0, 3)).toUpperCase()

/** The first colour no competence has yet; when all are taken, the one used the least. */
const nextColor = (taken: LineColor[]): LineColor => {
  const count = (color: LineColor) => taken.filter((c) => c === color).length
  return [...LINE_COLORS].sort((a, b) => count(a) - count(b))[0]
}

/**
 * Every competence with its style, in the planner's order. A competence without a stored style gets one:
 * the next free colour and a place after the stored ones, alphabetically. Nothing is stored until the planner edits a style.
 */
export const competenceStyles = (ws: Workspace): CompetenceStyle[] => {
  const stored = Object.values(ws.competenceStyles ?? {}).sort((a, b) => a.order - b.order)
  const known = new Set(stored.map((style) => style.key))
  const fresh = [...textsInUse(ws)].filter(([key]) => !known.has(key)).sort(([, a], [, b]) => a.localeCompare(b, 'nb'))
  const styles = [...stored]
  for (const [key, label] of fresh) {
    styles.push({ key, label, shortLabel: defaultShortLabel(label), color: nextColor(styles.map((style) => style.color)), order: 0 })
  }
  return styles.map((style, order) => (style.order === order ? style : { ...style, order }))
}

const asRecord = (styles: CompetenceStyle[]): Record<CompetenceKey, CompetenceStyle> => Object.fromEntries(styles.map((style, order) => [style.key, { ...style, order }]))

/** What the planning engine knows of a competence, as the planner sets it: its stage, the competence its team goes on to, and the fewest per hall. */
type EngineFields = Pick<CompetenceStyle, 'stage' | 'next' | 'minPerHall'>

/** The style with the planner's changes, a part set to nothing being left out rather than stored as empty. */
const patched = (style: CompetenceStyle, patch: Partial<Pick<CompetenceStyle, 'shortLabel' | 'color'> & EngineFields>): CompetenceStyle => {
  const next: CompetenceStyle = { ...style, ...patch, shortLabel: (patch.shortLabel ?? style.shortLabel).slice(0, SHORT_LABEL_LENGTH) }
  for (const part of ['stage', 'next', 'minPerHall'] as const) if (!next[part]) delete next[part]
  return next
}

/** Changes how a competence is shown, or what the engine knows of it. The styles of all competences are stored from then on, so their colours and order stay put. */
export const setCompetenceStyle = (ws: Workspace, key: CompetenceKey, patch: Partial<Pick<CompetenceStyle, 'shortLabel' | 'color'> & EngineFields>): Record<CompetenceKey, CompetenceStyle> =>
  asRecord(competenceStyles(ws).map((style) => (style.key === key ? patched(style, patch) : style)))

/**
 * Whether the team of one competence can go on to another: not to itself, and not where the other's teams already
 * lead back to it, so that a chain has an end. A competence nobody knows of yet is no place to go on to.
 */
export const canGoOnTo = (styles: CompetenceStyle[], from: CompetenceKey, to: CompetenceKey): boolean => {
  const byKey = new Map(styles.map((style) => [style.key, style]))
  if (from === to || !byKey.has(to)) return false
  const seen = new Set<CompetenceKey>()
  for (let at: CompetenceKey | undefined = to; at && !seen.has(at); at = byKey.get(at)?.next) {
    if (at === from) return false
    seen.add(at)
  }
  return true
}

/** The styles with a team that went on to one competence going on to another, or to none. */
const repointed = (styles: CompetenceStyle[], from: CompetenceKey, to: CompetenceKey | undefined): CompetenceStyle[] =>
  styles.map((style) => (style.next !== from ? style : patched(style, { next: to && to !== style.key ? to : undefined })))

/** The list with `change` made to the items it applies to, or the list itself when it applies to none. */
const mapChanged = <T,>(list: T[], change: (item: T) => T): T[] => {
  const next = list.map(change)
  return next.some((item, index) => item !== list[index]) ? next : list
}

/** People or suppliers with one competence replaced by another, where they hold it; the list itself where none does. */
const withKeySwapped = <T extends { competences: CompetenceKey[] }>(list: T[] | undefined, from: CompetenceKey, to: CompetenceKey): T[] | undefined =>
  list && to !== from ? mapChanged(list, (item) => (item.competences.includes(from) ? { ...item, competences: [...new Set(item.competences.map((key) => (key === from ? to : key)))] } : item)) : list

/**
 * Gives a competence another name, everywhere it is named: on the product types, the demand lines, the planning
 * rows, the people, their blocks and the hours moved between days. Its short name follows unless the planner has
 * set one. Returns `null` for an empty name or the name of another competence, and the workspace itself when
 * nothing names it otherwise already.
 */
export const renameCompetence = (ws: Workspace, from: CompetenceKey, toLabel: string): Workspace | null => {
  const label = toLabel.trim()
  const to = competenceKey(label)
  const styles = competenceStyles(ws)
  const style = styles.find((s) => s.key === from)
  if (!to || !style || (to !== from && styles.some((s) => s.key === to))) return null
  const text = <T extends { competence: string }>(list: T[]) => mapChanged(list, (item) => (competenceKey(item.competence) === from && item.competence !== label ? { ...item, competence: label } : item))
  const keyed = <T extends { competence: CompetenceKey }>(list: T[] | undefined) => list && mapChanged(list, (item) => (item.competence === from && to !== from ? { ...item, competence: to } : item))
  const workTypes = text(ws.kpi?.workTypes ?? [])
  const renamed: CompetenceStyle = { ...style, key: to, label, shortLabel: style.shortLabel === defaultShortLabel(style.label) ? defaultShortLabel(label) : style.shortLabel }
  const stored = style.label !== label || to !== from
  const next: Workspace = {
    ...ws,
    kpi: ws.kpi && workTypes !== ws.kpi.workTypes ? { ...ws.kpi, workTypes } : ws.kpi,
    demand: text(ws.demand),
    allocations: text(ws.allocations),
    persons: withKeySwapped(ws.persons, from, to),
    assignments: keyed(ws.assignments),
    demandAdjustments: keyed(ws.demandAdjustments),
    suppliers: withKeySwapped(ws.suppliers, from, to),
    hireOrders: keyed(ws.hireOrders),
    competenceStyles: stored ? asRecord(repointed(styles, from, to).map((s) => (s.key === from ? renamed : s))) : ws.competenceStyles,
  }
  const same = (Object.keys(next) as (keyof Workspace)[]).every((part) => next[part] === ws[part])
  return same ? ws : next
}

/** Moves a competence to the place of another; the ones between shift by one. */
export const moveCompetence = (ws: Workspace, key: CompetenceKey, toIndex: number): Record<CompetenceKey, CompetenceStyle> => {
  const styles = competenceStyles(ws)
  const from = styles.findIndex((style) => style.key === key)
  const to = clamp(toIndex, 0, styles.length - 1)
  if (from < 0 || from === to) return ws.competenceStyles ?? {}
  const [moved] = styles.splice(from, 1)
  styles.splice(to, 0, moved)
  return asRecord(styles)
}

/** Adds a competence by hand, for one no product type or demand line names yet. Returns `null` for an empty or known name. */
export const addCompetence = (ws: Workspace, label: string): Record<CompetenceKey, CompetenceStyle> | null => {
  const key = competenceKey(label)
  const styles = competenceStyles(ws)
  if (!key || styles.some((style) => style.key === key)) return null
  return asRecord([...styles, { key, label: label.trim(), shortLabel: defaultShortLabel(label.trim()), color: nextColor(styles.map((style) => style.color)), order: styles.length }])
}

/** What names a competence, counted: it can be removed only when nothing does. */
export interface CompetenceUse {
  productTypes: number
  demandLines: number
  rows: number
  people: number
  suppliers: number
  blocks: number
}

export const competenceUse = (ws: Workspace, key: CompetenceKey): CompetenceUse => ({
  productTypes: (ws.kpi?.workTypes ?? []).filter((rule) => competenceKey(rule.competence) === key).length,
  demandLines: ws.demand.filter((line) => competenceKey(line.competence) === key).length,
  rows: ws.allocations.filter((row) => competenceKey(row.competence) === key).length,
  people: (ws.persons ?? []).filter((person) => person.competences.includes(key)).length,
  suppliers: (ws.suppliers ?? []).filter((supplier) => supplier.competences.includes(key)).length,
  blocks: (ws.assignments ?? []).filter((a) => a.competence === key).length,
})

/** Whether a competence is only there because the planner added it, so that it can be removed again. */
export const isUnusedCompetence = (ws: Workspace, key: CompetenceKey): boolean => !textsInUse(ws).has(key) && !(ws.assignments ?? []).some((a) => a.competence === key) && !(ws.hireOrders ?? []).some((order) => order.competence === key)

export const removeCompetence = (ws: Workspace, key: CompetenceKey): Record<CompetenceKey, CompetenceStyle> => asRecord(repointed(competenceStyles(ws), key, undefined).filter((style) => style.key !== key))

/** A new person at the end of the list, with the competences given. */
export const addPerson = (persons: Person[], name: string, id: string = `person-${crypto.randomUUID()}`, competences: CompetenceKey[] = []): Person[] => [
  ...persons,
  { id, name: name.trim(), order: Math.max(-1, ...persons.map((p) => p.order)) + 1, competences },
]

export const updatePerson = (persons: Person[], id: string, patch: Partial<Omit<Person, 'id'>>): Person[] => persons.map((p) => (p.id === id ? { ...p, ...patch } : p))

/** Gives a person a competence, or takes it away. */
export const togglePersonCompetence = (persons: Person[], id: string, key: CompetenceKey): Person[] =>
  persons.map((p) => (p.id === id ? { ...p, competences: p.competences.includes(key) ? p.competences.filter((c) => c !== key) : [...p.competences, key] } : p))

/** The workspace without a person and without their absence and assignments. */
export const removePerson = (ws: Workspace, id: string): Workspace => ({
  ...ws,
  persons: (ws.persons ?? []).filter((p) => p.id !== id),
  unavailability: (ws.unavailability ?? []).filter((u) => u.personId !== id),
  assignments: (ws.assignments ?? []).filter((a) => a.personId !== id),
})

/** The competences Bemanning works with: those a person has, in the planner's order. The first nine are picked with the keys 1–9. */
export const staffedCompetences = (ws: Workspace): CompetenceStyle[] => {
  const held = new Set((ws.persons ?? []).flatMap((p) => p.competences))
  return competenceStyles(ws).filter((style) => held.has(style.key))
}

/** The competences the demand names that no person has: they can only be hired in. In the planner's order. */
export const unstaffedCompetences = (ws: Workspace): CompetenceStyle[] => {
  const held = new Set((ws.persons ?? []).flatMap((p) => p.competences))
  const needed = new Set(ws.demand.map((line) => competenceKey(line.competence)))
  return competenceStyles(ws).filter((style) => needed.has(style.key) && !held.has(style.key))
}

/**
 * The competences a change of the product types has done away with: every product type that had it was
 * given one and the same other competence, and no product type, demand line or planning row names it any
 * more. Only people and their blocks still do. `after` is the workspace with the change made.
 */
export const supersededCompetences = (kpiBefore: KpiConfig, after: Workspace): { from: CompetenceKey; to: string }[] => {
  const was = new Map(kpiBefore.workTypes.map((type) => [productTypeKey(type.productType), type.competence]))
  const wentTo = new Map<CompetenceKey, Set<string>>()
  for (const type of after.kpi?.workTypes ?? []) {
    const old = competenceKey(was.get(productTypeKey(type.productType)) ?? '')
    if (!old || !type.competence.trim() || old === competenceKey(type.competence)) continue
    wentTo.set(old, (wentTo.get(old) ?? new Set()).add(type.competence.trim()))
  }
  const inData = new Set([...(after.kpi?.workTypes ?? []).map((type) => type.competence), ...after.demand.map((line) => line.competence), ...after.allocations.map((row) => row.competence)].map(competenceKey))
  return [...wentTo].filter(([from, targets]) => targets.size === 1 && !inData.has(from)).map(([from, targets]) => ({ from, to: [...targets][0] }))
}

/**
 * Replaces a competence by another for the people: those who had it get the new one, their blocks and
 * moved hours follow, and the new one takes over its colour and place unless it has its own already.
 */
export const replaceCompetence = (ws: Workspace, from: CompetenceKey, toLabel: string): Workspace => {
  const to = competenceKey(toLabel)
  if (!to || to === from) return ws
  const swap = <T extends { competence: CompetenceKey }>(list: T[] | undefined) => (list?.some((item) => item.competence === from) ? list.map((item) => (item.competence === from ? { ...item, competence: to } : item)) : list)
  let styles = ws.competenceStyles
  if (styles?.[from]) {
    const { [from]: old, ...rest } = styles
    styles = rest[to] ? rest : { ...rest, [to]: { ...old, key: to, label: toLabel.trim(), shortLabel: defaultShortLabel(toLabel.trim()) } }
    styles = Object.fromEntries(repointed(Object.values(styles), from, to).map((style) => [style.key, style]))
  }
  return { ...ws, persons: withKeySwapped(ws.persons, from, to), suppliers: withKeySwapped(ws.suppliers, from, to), assignments: swap(ws.assignments), demandAdjustments: swap(ws.demandAdjustments), hireOrders: ws.hireOrders && mergeOrders(swap(ws.hireOrders)!), competenceStyles: styles }
}

/** How the rows of a table are told apart by name, in a file and in the app: without regard to case and the spaces around it. */
export const nameKey = (name: string): string => name.trim().toLowerCase()

/** Whether a person already has the name, other than the person given. People are told apart by their names in a file. */
export const isNameTaken = (persons: Person[], name: string, exceptId?: string): boolean => persons.some((p) => p.id !== exceptId && nameKey(p.name) === nameKey(name))

/** One person as a file has them. A part the file does not say is left as it is in the app. */
export interface FilePerson {
  name: string
  note?: string
  /** For each competence the file has a column for, by its name, whether the person has it. */
  competences: Record<string, boolean>
}

export const sameSet = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((item) => b.includes(item))

/**
 * The competences someone has after a file: for each competence the file has a column for, by its name, what it says wins;
 * the others are kept. The list itself is returned when the file changes nothing.
 */
export const competencesFromFile = (held: CompetenceKey[], file: Record<string, boolean>): CompetenceKey[] => {
  const said = new Map(Object.entries(file).map(([label, has]) => [competenceKey(label), has]))
  const next = [...held.filter((key) => said.get(key) !== false), ...[...said].filter(([key, has]) => key && has && !held.includes(key)).map(([key]) => key)]
  return sameSet(next, held) ? held : next
}

/** The person as the file has them: what it says wins, what it does not say is kept. */
const fromFile = (person: Person, file: FilePerson): Person => {
  const next: Person = { ...person, competences: competencesFromFile(person.competences, file.competences) }
  if (file.note !== undefined) {
    if (file.note) next.note = file.note
    else delete next.note
  }
  return next.competences === person.competences && (next.note ?? '') === (person.note ?? '') ? person : next
}

/** The rows of a file, one per name: the first row of a name counts. */
export const oneEach = <T extends { name: string }>(file: T[]): T[] => {
  const seen = new Set<string>()
  return file.filter((row) => nameKey(row.name) && !seen.has(nameKey(row.name)) && seen.add(nameKey(row.name)))
}

/** The workspace with the competences a file names that the app does not know, added by hand. */
export const withFileCompetences = (ws: Workspace, file: { competences: Record<string, boolean> }[]): Workspace => {
  let next = ws
  for (const label of new Set(file.flatMap((row) => Object.keys(row.competences)))) {
    const added = addCompetence(next, label)
    if (added) next = { ...next, competenceStyles: added }
  }
  return next
}

/** The competences a file names that the app does not know. */
export const newFileCompetences = (ws: Workspace, file: { competences: Record<string, boolean> }[]): string[] => {
  const known = new Set(competenceStyles(ws).map((style) => style.key))
  return [...new Set(file.flatMap((row) => Object.keys(row.competences)))].filter((label) => competenceKey(label) && !known.has(competenceKey(label)))
}

/** People from a file win over those in the app, matched by name; people only in the app are kept. New people come last. */
export const mergePersons = (ws: Workspace, file: FilePerson[]): Workspace => {
  const rows = new Map(oneEach(file).map((person) => [nameKey(person.name), person]))
  const persons = (ws.persons ?? []).map((person) => (rows.has(nameKey(person.name)) ? fromFile(person, rows.get(nameKey(person.name))!) : person))
  const known = new Set(persons.map((person) => nameKey(person.name)))
  const added = [...rows.values()].filter((row) => !known.has(nameKey(row.name))).reduce((list, row) => addPerson(list, row.name).map((p, i, all) => (i === all.length - 1 ? fromFile(p, row) : p)), persons)
  return { ...withFileCompetences(ws, file), persons: added }
}

/** The people become those of the file, in its order. A person the file lacks is removed, with their absence and assignments. */
export const replacePersons = (ws: Workspace, file: FilePerson[]): Workspace => {
  const merged = mergePersons(ws, file)
  const order = new Map(oneEach(file).map((person, index) => [nameKey(person.name), index]))
  const gone = (merged.persons ?? []).filter((person) => !order.has(nameKey(person.name)))
  const kept = gone.reduce((w, person) => removePerson(w, person.id), merged)
  const persons = [...(kept.persons ?? [])].sort((a, b) => order.get(nameKey(a.name))! - order.get(nameKey(b.name))!).map((person, index) => (person.order === index ? person : { ...person, order: index }))
  return { ...kept, persons }
}

interface PersonsDiff extends TableDiff {
  /** Assignments and absences of the people only in the app, which go with them when replacing. */
  lostBlocks: number
  /** Competences the file names that the app does not know. */
  newCompetences: string[]
}

/** What a file of people would change. */
export const diffPersons = (ws: Workspace, file: FilePerson[]): PersonsDiff => {
  const rows = oneEach(file)
  const persons = new Map((ws.persons ?? []).map((person) => [nameKey(person.name), person]))
  const inFile = new Set(rows.map((row) => nameKey(row.name)))
  const only = [...persons.values()].filter((person) => !inFile.has(nameKey(person.name)))
  const onlyIds = new Set(only.map((person) => person.id))
  const changed = rows.filter((row) => persons.has(nameKey(row.name)) && fromFile(persons.get(nameKey(row.name))!, row) !== persons.get(nameKey(row.name))).length
  const added = rows.filter((row) => !persons.has(nameKey(row.name))).length
  return {
    added,
    changed,
    unchanged: rows.length - added - changed,
    onlyInApp: only.length,
    lostBlocks: (ws.assignments ?? []).filter((a) => onlyIds.has(a.personId)).length + (ws.unavailability ?? []).filter((u) => onlyIds.has(u.personId)).length,
    newCompetences: newFileCompetences(ws, rows),
  }
}

/** One competence as a file has it. A part the file does not say is left as it is in the app. */
export interface FileCompetence {
  label: string
  shortLabel?: string
  color?: LineColor
  stage?: Stage
  /** The name of the competence its team goes on to. */
  next?: string
  minPerHall?: number
}

const styled = (style: CompetenceStyle, file: FileCompetence): CompetenceStyle => {
  const shortLabel = (file.shortLabel || style.shortLabel).slice(0, SHORT_LABEL_LENGTH)
  const color = file.color ?? style.color
  const stage = file.stage ?? style.stage
  const next = file.next ? competenceKey(file.next) : style.next
  const minPerHall = file.minPerHall ?? style.minPerHall
  const same = shortLabel === style.shortLabel && color === style.color && stage === style.stage && next === style.next && minPerHall === style.minPerHall
  return same ? style : patched(style, { shortLabel, color, stage, next, minPerHall })
}

/** The styles with a team going on only to a competence there is, and never round in a ring: a link that would close one is dropped. */
const chainsKept = (styles: CompetenceStyle[]): CompetenceStyle[] =>
  styles.reduce((kept, style, index) => {
    if (!style.next) return kept
    const without = kept.map((s, i) => (i === index ? patched(s, { next: undefined }) : s))
    return canGoOnTo(without, style.key, style.next) ? kept : without
  }, styles)

const oneOfEach = (file: FileCompetence[]): FileCompetence[] => {
  const seen = new Set<CompetenceKey>()
  return file.filter((row) => competenceKey(row.label) && !seen.has(competenceKey(row.label)) && seen.add(competenceKey(row.label)))
}

/**
 * The styles with those of a file taken in, matched by name: the file's short names and colours win, and its
 * competences come first, in its order. A name the app does not know is a new competence, added by hand; a
 * competence is given another name in the app, not in the file. With `replace`, the competences the file lacks lose
 * their styles: one that nothing names is gone, and one in use is listed after the file's, as new.
 */
export const mergeCompetenceStyles = (ws: Workspace, file: FileCompetence[], replace = false): Record<CompetenceKey, CompetenceStyle> => {
  const styles = competenceStyles(ws)
  const byKey = new Map(styles.map((style) => [style.key, style]))
  const rows = oneOfEach(file)
  const taken = styles.map((style) => style.color)
  const fromRows = rows.map((row): CompetenceStyle => {
    const key = competenceKey(row.label)
    const existing = byKey.get(key)
    if (existing) return styled(existing, row)
    const color = row.color ?? nextColor(taken)
    taken.push(color)
    return styled({ key, label: row.label.trim(), shortLabel: defaultShortLabel(row.label.trim()), color, order: 0 }, row)
  })
  const inFile = new Set(fromRows.map((style) => style.key))
  return asRecord(chainsKept([...fromRows, ...(replace ? [] : styles.filter((style) => !inFile.has(style.key)))]))
}

interface StylesDiff extends TableDiff {
  /** Of those only in the app, the ones something names: they cannot be removed, and stay when replacing. */
  inUse: number
}

/** What a file of competences would change. The order is not counted. */
export const diffCompetenceStyles = (ws: Workspace, file: FileCompetence[]): StylesDiff => {
  const byKey = new Map(competenceStyles(ws).map((style) => [style.key, style]))
  const rows = oneOfEach(file)
  const inFile = new Set(rows.map((row) => competenceKey(row.label)))
  const only = [...byKey.keys()].filter((key) => !inFile.has(key))
  const added = rows.filter((row) => !byKey.has(competenceKey(row.label))).length
  const changed = rows.filter((row) => byKey.has(competenceKey(row.label)) && styled(byKey.get(competenceKey(row.label))!, row) !== byKey.get(competenceKey(row.label))).length
  return { added, changed, unchanged: rows.length - added - changed, onlyInApp: only.length, inUse: only.filter((key) => !isUnusedCompetence(ws, key)).length }
}
