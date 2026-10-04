import { rowTotals, type DemandIndex, type RowTotals } from '../../domain/calc'
import type { ISODate } from '../../domain/dates'
import type { AllocationRow, Settings } from '../../domain/types'

export interface ProjectGroup {
  key: string
  projectName: string
  projectNo: string
  rows: AllocationRow[]
  totals: { requiredFte: number; plannedFte: number; firstDate: ISODate | null }
  /** Summed FTE per day across the group's rows. */
  daily: Map<ISODate, number>
}

export type GridItem =
  | { kind: 'group'; group: ProjectGroup; collapsed: boolean }
  | { kind: 'row'; row: AllocationRow; totals: RowTotals; group: ProjectGroup }

export interface RowFilter {
  /** A project key, see `projectKey`. */
  project: string
  competence: string
  search: string
}

export const EMPTY_FILTER: RowFilter = { project: '', competence: '', search: '' }

/** Rows with the same project number belong together even when the name is spelled differently. */
export const projectKey = (row: Pick<AllocationRow, 'projectNo' | 'projectName'>): string => row.projectNo.trim() || `navn:${row.projectName.trim().toLowerCase()}`

const matches = (row: AllocationRow, filter: RowFilter): boolean => {
  if (filter.project && projectKey(row) !== filter.project) return false
  if (filter.competence && row.competence.toLowerCase() !== filter.competence.toLowerCase()) return false
  if (filter.search) {
    const q = filter.search.toLowerCase()
    const hay = `${row.projectName} ${row.projectNo} ${row.competence} ${row.basis} ${row.phase}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

/** Groups rows by project, ordered by first planned day (unplanned projects last, by name). */
export const buildGroups = (rows: AllocationRow[], index: DemandIndex, settings: Settings): ProjectGroup[] => {
  const groups = new Map<string, ProjectGroup>()
  for (const row of rows) {
    const key = projectKey(row)
    let group = groups.get(key)
    if (!group) {
      group = { key, projectName: row.projectName || '(uten prosjekt)', projectNo: row.projectNo, rows: [], totals: { requiredFte: 0, plannedFte: 0, firstDate: null }, daily: new Map() }
      groups.set(key, group)
    }
    group.rows.push(row)
    const t = rowTotals(index, row, settings)
    group.totals.requiredFte += t.requiredFte ?? 0
    group.totals.plannedFte += t.plannedFte
    if (t.firstDate && (!group.totals.firstDate || t.firstDate < group.totals.firstDate)) group.totals.firstDate = t.firstDate
    for (const [date, fte] of Object.entries(row.fte)) group.daily.set(date, (group.daily.get(date) ?? 0) + fte)
  }
  return [...groups.values()].sort((a, b) => {
    if (a.totals.firstDate && b.totals.firstDate) return a.totals.firstDate.localeCompare(b.totals.firstDate) || a.key.localeCompare(b.key, 'nb')
    if (a.totals.firstDate) return -1
    if (b.totals.firstDate) return 1
    return a.key.localeCompare(b.key, 'nb')
  })
}

export const buildItems = (
  rows: AllocationRow[],
  index: DemandIndex,
  settings: Settings,
  filter: RowFilter,
  collapsed: Set<string>,
  window?: { from: ISODate; to: ISODate },
): GridItem[] => {
  let groups = buildGroups(rows.filter((row) => matches(row, filter)), index, settings)
  // Like hiding rows in the workbook: keep projects with planned days inside the visible dates.
  if (window) groups = groups.filter((g) => [...g.daily.keys()].some((d) => d >= window.from && d <= window.to))
  const items: GridItem[] = []
  for (const group of groups) {
    const isCollapsed = collapsed.has(group.key)
    items.push({ kind: 'group', group, collapsed: isCollapsed })
    if (isCollapsed) continue
    for (const row of group.rows) items.push({ kind: 'row', row, totals: rowTotals(index, row, settings), group })
  }
  return items
}
