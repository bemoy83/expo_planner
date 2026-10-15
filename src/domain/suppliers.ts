import { competencesFromFile, nameKey, newFileCompetences, oneEach, sameSet, withFileCompetences } from './competences'
import type { TableDiff } from './tableDiff'
import { SHIFT_IDS, type CompetenceKey, type ShiftId, type Supplier, type Workspace } from './types'

/**
 * The suppliers the planner hires people from: a table of his own, as the permanent staff are.
 * No two have the same name: a file tells them apart by it.
 */

export const isSupplierNameTaken = (suppliers: Supplier[], name: string, exceptId?: string): boolean => suppliers.some((s) => s.id !== exceptId && nameKey(s.name) === nameKey(name))

/** A new supplier at the end of the list, with every shift and the competences given. */
export const addSupplier = (suppliers: Supplier[], name: string, id: string = `supplier-${crypto.randomUUID()}`, competences: CompetenceKey[] = []): Supplier[] => [
  ...suppliers,
  { id, name: name.trim(), order: Math.max(-1, ...suppliers.map((s) => s.order)) + 1, competences, shifts: [...SHIFT_IDS] },
]

export const updateSupplier = (suppliers: Supplier[], id: string, patch: Partial<Omit<Supplier, 'id'>>): Supplier[] => suppliers.map((s) => (s.id === id ? { ...s, ...patch } : s))

const toggled = <T,>(list: T[], item: T): T[] => (list.includes(item) ? list.filter((other) => other !== item) : [...list, item])

/** Gives a supplier a competence, or takes it away. The orders it has for it are kept. */
export const toggleSupplierCompetence = (suppliers: Supplier[], id: string, key: CompetenceKey): Supplier[] => suppliers.map((s) => (s.id === id ? { ...s, competences: toggled(s.competences, key) } : s))

/** Gives a supplier a shift, or takes it away, in the order of the day. */
export const toggleSupplierShift = (suppliers: Supplier[], id: string, shift: ShiftId): Supplier[] =>
  suppliers.map((s) => (s.id === id ? { ...s, shifts: SHIFT_IDS.filter((other) => toggled(s.shifts, shift).includes(other)) } : s))

/** The workspace without a supplier and without its orders. */
export const removeSupplier = (ws: Workspace, id: string): Workspace => ({
  ...ws,
  suppliers: (ws.suppliers ?? []).filter((s) => s.id !== id),
  hireOrders: (ws.hireOrders ?? []).some((order) => order.supplierId === id) ? (ws.hireOrders ?? []).filter((order) => order.supplierId !== id) : ws.hireOrders,
})

/** One supplier as a file has it. A part the file does not say is left as it is in the app. */
export interface FileSupplier {
  name: string
  contact?: string
  rate?: number
  note?: string
  /** For each shift the file has a column for, whether the supplier has it. */
  shifts: Partial<Record<ShiftId, boolean>>
  /** For each competence the file has a column for, by its name, whether the supplier has it. */
  competences: Record<string, boolean>
}

/** The supplier as the file has it: what it says wins, what it does not say is kept. An empty cell empties the field. */
const fromFile = (supplier: Supplier, file: FileSupplier): Supplier => {
  const shifts = SHIFT_IDS.filter((shift) => file.shifts[shift] ?? supplier.shifts.includes(shift))
  const next: Supplier = { ...supplier, competences: competencesFromFile(supplier.competences, file.competences), shifts: sameSet(shifts, supplier.shifts) ? supplier.shifts : shifts }
  const text = (part: 'contact' | 'note') => {
    if (file[part] === undefined) return
    if (file[part]) next[part] = file[part]
    else delete next[part]
  }
  text('contact')
  text('note')
  if (file.rate !== undefined) {
    if (file.rate) next.rate = file.rate
    else delete next.rate
  }
  const same = next.competences === supplier.competences && next.shifts === supplier.shifts && next.contact === supplier.contact && next.note === supplier.note && next.rate === supplier.rate
  return same ? supplier : next
}

/** Suppliers from a file win over those in the app, matched by name; suppliers only in the app are kept. New ones come last. */
export const mergeSuppliers = (ws: Workspace, file: FileSupplier[]): Workspace => {
  const rows = new Map(oneEach(file).map((s) => [nameKey(s.name), s]))
  const suppliers = (ws.suppliers ?? []).map((s) => (rows.has(nameKey(s.name)) ? fromFile(s, rows.get(nameKey(s.name))!) : s))
  const known = new Set(suppliers.map((s) => nameKey(s.name)))
  const added = [...rows.values()].filter((row) => !known.has(nameKey(row.name))).reduce((list, row) => addSupplier(list, row.name).map((s, i, all) => (i === all.length - 1 ? fromFile(s, row) : s)), suppliers)
  return { ...withFileCompetences(ws, file), suppliers: added }
}

/** The suppliers become those of the file, in its order. A supplier the file lacks is removed, with its orders. */
export const replaceSuppliers = (ws: Workspace, file: FileSupplier[]): Workspace => {
  const merged = mergeSuppliers(ws, file)
  const order = new Map(oneEach(file).map((s, index) => [nameKey(s.name), index]))
  const kept = (merged.suppliers ?? []).filter((s) => !order.has(nameKey(s.name))).reduce((w, s) => removeSupplier(w, s.id), merged)
  const suppliers = [...(kept.suppliers ?? [])].sort((a, b) => order.get(nameKey(a.name))! - order.get(nameKey(b.name))!).map((s, index) => (s.order === index ? s : { ...s, order: index }))
  return { ...kept, suppliers }
}

export interface SuppliersDiff extends TableDiff {
  /** Orders of the suppliers only in the app, which go with them when replacing. */
  lostOrders: number
  /** Competences the file names that the app does not know. */
  newCompetences: string[]
}

/** What a file of suppliers would change. */
export const diffSuppliers = (ws: Workspace, file: FileSupplier[]): SuppliersDiff => {
  const rows = oneEach(file)
  const suppliers = new Map((ws.suppliers ?? []).map((s) => [nameKey(s.name), s]))
  const inFile = new Set(rows.map((row) => nameKey(row.name)))
  const onlyIds = new Set([...suppliers.values()].filter((s) => !inFile.has(nameKey(s.name))).map((s) => s.id))
  const changed = rows.filter((row) => suppliers.has(nameKey(row.name)) && fromFile(suppliers.get(nameKey(row.name))!, row) !== suppliers.get(nameKey(row.name))).length
  const added = rows.filter((row) => !suppliers.has(nameKey(row.name))).length
  return {
    added,
    changed,
    unchanged: rows.length - added - changed,
    onlyInApp: onlyIds.size,
    lostOrders: (ws.hireOrders ?? []).filter((order) => onlyIds.has(order.supplierId)).length,
    newCompetences: newFileCompetences(ws, rows),
  }
}
