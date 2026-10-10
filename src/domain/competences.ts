import { productTypeKey } from './kpi'
import type { TableDiff } from './tableDiff'
import { competenceKey, LINE_COLORS, type CompetenceKey, type CompetenceStyle, type KpiConfig, type LineColor, type Person, type Workspace } from './types'

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

/** Changes how a competence is shown. The styles of all competences are stored from then on, so their colours and order stay put. */
export const setCompetenceStyle = (ws: Workspace, key: CompetenceKey, patch: Partial<Pick<CompetenceStyle, 'shortLabel' | 'color'>>): Record<CompetenceKey, CompetenceStyle> =>
  asRecord(competenceStyles(ws).map((style) => (style.key === key ? { ...style, ...patch, shortLabel: (patch.shortLabel ?? style.shortLabel).slice(0, SHORT_LABEL_LENGTH) } : style)))

/** The list with `change` made to the items it applies to, or the list itself when it applies to none. */
const mapChanged = <T,>(list: T[], change: (item: T) => T): T[] => {
  const next = list.map(change)
  return next.some((item, index) => item !== list[index]) ? next : list
}

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
    persons: ws.persons && mapChanged(ws.persons, (person) => (to !== from && person.competences.includes(from) ? { ...person, competences: person.competences.map((key) => (key === from ? to : key)) } : person)),
    assignments: keyed(ws.assignments),
    demandAdjustments: keyed(ws.demandAdjustments),
    competenceStyles: stored ? asRecord(styles.map((s) => (s === style ? renamed : s))) : ws.competenceStyles,
  }
  const same = (Object.keys(next) as (keyof Workspace)[]).every((part) => next[part] === ws[part])
  return same ? ws : next
}

/** Moves a competence to the place of another; the ones between shift by one. */
export const moveCompetence = (ws: Workspace, key: CompetenceKey, toIndex: number): Record<CompetenceKey, CompetenceStyle> => {
  const styles = competenceStyles(ws)
  const from = styles.findIndex((style) => style.key === key)
  const to = Math.min(Math.max(toIndex, 0), styles.length - 1)
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
  blocks: number
}

export const competenceUse = (ws: Workspace, key: CompetenceKey): CompetenceUse => ({
  productTypes: (ws.kpi?.workTypes ?? []).filter((rule) => competenceKey(rule.competence) === key).length,
  demandLines: ws.demand.filter((line) => competenceKey(line.competence) === key).length,
  rows: ws.allocations.filter((row) => competenceKey(row.competence) === key).length,
  people: (ws.persons ?? []).filter((person) => person.competences.includes(key)).length,
  blocks: (ws.assignments ?? []).filter((a) => a.competence === key).length,
})

/** Whether a competence is only there because the planner added it, so that it can be removed again. */
export const isUnusedCompetence = (ws: Workspace, key: CompetenceKey): boolean => !textsInUse(ws).has(key) && !(ws.assignments ?? []).some((a) => a.competence === key)

export const removeCompetence = (ws: Workspace, key: CompetenceKey): Record<CompetenceKey, CompetenceStyle> => asRecord(competenceStyles(ws).filter((style) => style.key !== key))

/** A new person at the end of the list, active and without competences. */
export const addPerson = (persons: Person[], name: string, id: string = `person-${crypto.randomUUID()}`): Person[] => [
  ...persons,
  { id, name: name.trim(), order: Math.max(-1, ...persons.map((p) => p.order)) + 1, active: true, competences: [] },
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

/** The competences Bemanning works with: those an active person has, in the planner's order. The first nine are picked with the keys 1–9. */
export const staffedCompetences = (ws: Workspace): CompetenceStyle[] => {
  const held = new Set((ws.persons ?? []).filter((p) => p.active).flatMap((p) => p.competences))
  return competenceStyles(ws).filter((style) => held.has(style.key))
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
  const persons = ws.persons?.some((person) => person.competences.includes(from))
    ? ws.persons.map((person) => (person.competences.includes(from) ? { ...person, competences: [...new Set(person.competences.map((key) => (key === from ? to : key)))] } : person))
    : ws.persons
  let styles = ws.competenceStyles
  if (styles?.[from]) {
    const { [from]: old, ...rest } = styles
    styles = rest[to] ? rest : { ...rest, [to]: { ...old, key: to, label: toLabel.trim(), shortLabel: defaultShortLabel(toLabel.trim()) } }
  }
  return { ...ws, persons, assignments: swap(ws.assignments), demandAdjustments: swap(ws.demandAdjustments), competenceStyles: styles }
}

const nameKey = (name: string): string => name.trim().toLowerCase()

/** Whether a person already has the name, other than the person given. People are told apart by their names in a file. */
export const isNameTaken = (persons: Person[], name: string, exceptId?: string): boolean => persons.some((p) => p.id !== exceptId && nameKey(p.name) === nameKey(name))

/** One person as a file has them. A part the file does not say is left as it is in the app. */
export interface FilePerson {
  name: string
  active?: boolean
  note?: string
  /** For each competence the file has a column for, by its name, whether the person has it. */
  competences: Record<string, boolean>
}

const sameSet = (a: CompetenceKey[], b: CompetenceKey[]) => a.length === b.length && a.every((key) => b.includes(key))

/** The person as the file has them: what it says wins, what it does not say is kept. */
const fromFile = (person: Person, file: FilePerson): Person => {
  const said = new Map(Object.entries(file.competences).map(([label, has]) => [competenceKey(label), has]))
  const competences = [...person.competences.filter((key) => said.get(key) !== false), ...[...said].filter(([key, has]) => key && has && !person.competences.includes(key)).map(([key]) => key)]
  const next: Person = { ...person, active: file.active ?? person.active, competences: sameSet(competences, person.competences) ? person.competences : competences }
  if (file.note !== undefined) {
    if (file.note) next.note = file.note
    else delete next.note
  }
  return next.active === person.active && next.competences === person.competences && (next.note ?? '') === (person.note ?? '') ? person : next
}

/** The people of a file, one per name: the first row of a name counts. */
const oneEach = (file: FilePerson[]): FilePerson[] => {
  const seen = new Set<string>()
  return file.filter((person) => nameKey(person.name) && !seen.has(nameKey(person.name)) && seen.add(nameKey(person.name)))
}

/** The workspace with the competences a file names that the app does not know, added by hand. */
const withFileCompetences = (ws: Workspace, file: FilePerson[]): Workspace => {
  let next = ws
  for (const label of new Set(file.flatMap((person) => Object.keys(person.competences)))) {
    const added = addCompetence(next, label)
    if (added) next = { ...next, competenceStyles: added }
  }
  return next
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

export interface PersonsDiff extends TableDiff {
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
  const known = new Set(competenceStyles(ws).map((style) => style.key))
  const changed = rows.filter((row) => persons.has(nameKey(row.name)) && fromFile(persons.get(nameKey(row.name))!, row) !== persons.get(nameKey(row.name))).length
  const added = rows.filter((row) => !persons.has(nameKey(row.name))).length
  return {
    added,
    changed,
    unchanged: rows.length - added - changed,
    onlyInApp: only.length,
    lostBlocks: (ws.assignments ?? []).filter((a) => onlyIds.has(a.personId)).length + (ws.unavailability ?? []).filter((u) => onlyIds.has(u.personId)).length,
    newCompetences: [...new Set(rows.flatMap((row) => Object.keys(row.competences)))].filter((label) => competenceKey(label) && !known.has(competenceKey(label))),
  }
}

/** One competence as a file has it. A part the file does not say is left as it is in the app. */
export interface FileCompetence {
  label: string
  shortLabel?: string
  color?: LineColor
}

const styled = (style: CompetenceStyle, file: FileCompetence): CompetenceStyle => {
  const shortLabel = (file.shortLabel || style.shortLabel).slice(0, SHORT_LABEL_LENGTH)
  const color = file.color ?? style.color
  return shortLabel === style.shortLabel && color === style.color ? style : { ...style, shortLabel, color }
}

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
  return asRecord([...fromRows, ...(replace ? [] : styles.filter((style) => !inFile.has(style.key)))])
}

export interface StylesDiff extends TableDiff {
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
