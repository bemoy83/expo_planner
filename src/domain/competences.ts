import { competenceKey, LINE_COLORS, type CompetenceKey, type CompetenceStyle, type KpiConfig, type LineColor, type Person, type Workspace } from './types'

/**
 * The competences of Bemanning and the people who have them. The list of competences is derived: it is
 * every competence text on the product types, the demand, the planning rows and the people, plus those
 * the planner has added by hand. How each one is shown (name, short name, colour, order) is its style.
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
export const setCompetenceStyle = (ws: Workspace, key: CompetenceKey, patch: Partial<Pick<CompetenceStyle, 'label' | 'shortLabel' | 'color'>>): Record<CompetenceKey, CompetenceStyle> =>
  asRecord(competenceStyles(ws).map((style) => (style.key === key ? { ...style, ...patch, shortLabel: (patch.shortLabel ?? style.shortLabel).slice(0, SHORT_LABEL_LENGTH) } : style)))

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
  const was = new Map(kpiBefore.workTypes.map((type) => [type.name.trim().toLowerCase(), type.competence]))
  const wentTo = new Map<CompetenceKey, Set<string>>()
  for (const type of after.kpi?.workTypes ?? []) {
    const old = competenceKey(was.get(type.name.trim().toLowerCase()) ?? '')
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
