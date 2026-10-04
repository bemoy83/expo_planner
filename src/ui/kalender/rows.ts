import { rowTotals, type DemandIndex, type RowTotals } from '../../domain/calc'
import type { ISODate } from '../../domain/dates'
import { normalizeName, type VenueEvent } from '../../domain/projects'
import type { AllocationRow, Settings } from '../../domain/types'

export interface ProjectGroup {
  key: string
  projectName: string
  projectNo: string
  rows: AllocationRow[]
  totals: { requiredFte: number; plannedFte: number; firstDate: ISODate | null }
  /** Summed FTE per day across the group's rows. */
  daily: Map<ISODate, number>
  /** The project's period in the Venyou calendar, from first build-up day to last tear-down day. */
  venue: { start: ISODate; end: ISODate } | null
}

export type GridItem =
  | { kind: 'group'; group: ProjectGroup; collapsed: boolean }
  | { kind: 'row'; row: AllocationRow; totals: RowTotals; group: ProjectGroup }

export interface RowFilter {
  /** A project key, see `projectKey`. */
  project: string
  competence: string
  search: string
  /** Leave out projects that have no planning rows yet. */
  onlyWithRows?: boolean
}

export const EMPTY_FILTER: RowFilter = { project: '', competence: '', search: '' }

/** Rows with the same project number belong together even when the name is spelled differently. */
export const projectKey = (row: Pick<AllocationRow, 'projectNo' | 'projectName'>): string => row.projectNo.trim() || `navn:${normalizeName(row.projectName)}`

const rowMatches = (row: AllocationRow, filter: RowFilter): boolean => {
  if (filter.competence && row.competence.toLowerCase() !== filter.competence.toLowerCase()) return false
  if (filter.search) {
    const q = filter.search.toLowerCase()
    const hay = `${row.projectName} ${row.projectNo} ${row.competence} ${row.basis} ${row.phase}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

const newGroup = (key: string, projectName: string, projectNo: string): ProjectGroup => ({
  key,
  projectName,
  projectNo,
  rows: [],
  totals: { requiredFte: 0, plannedFte: 0, firstDate: null },
  daily: new Map(),
  venue: null,
})

/**
 * One group per project. Projects come from the Venyou events, so they are listed even without any rows;
 * planning rows join their event by project number, or by name where the event has no number.
 * Rows that match no event (older plans, internal work) get a group of their own.
 */
export const buildGroups = (rows: AllocationRow[], events: VenueEvent[], index: DemandIndex, settings: Settings): ProjectGroup[] => {
  const groups = new Map<string, ProjectGroup>()
  const byName = new Map<string, string>()
  for (const event of events) {
    const key = projectKey({ projectNo: event.projectNo, projectName: event.name })
    let group = groups.get(key)
    if (!group) {
      group = newGroup(key, event.name, event.projectNo)
      groups.set(key, group)
    }
    group.venue = group.venue ? { start: group.venue.start < event.start ? group.venue.start : event.start, end: group.venue.end > event.end ? group.venue.end : event.end } : { start: event.start, end: event.end }
    byName.set(normalizeName(event.name), key)
  }
  for (const row of rows) {
    // A row made before its event got a project number still belongs to that event.
    const key = groups.has(projectKey(row)) ? projectKey(row) : ((!row.projectNo.trim() && byName.get(normalizeName(row.projectName))) || projectKey(row))
    let group = groups.get(key)
    if (!group) {
      group = newGroup(key, row.projectName || '(uten prosjekt)', row.projectNo)
      groups.set(key, group)
    }
    group.rows.push(row)
    const t = rowTotals(index, row, settings)
    group.totals.requiredFte += t.requiredFte ?? 0
    group.totals.plannedFte += t.plannedFte
    if (t.firstDate && (!group.totals.firstDate || t.firstDate < group.totals.firstDate)) group.totals.firstDate = t.firstDate
    for (const [date, fte] of Object.entries(row.fte)) group.daily.set(date, (group.daily.get(date) ?? 0) + fte)
  }
  const startOf = (group: ProjectGroup): ISODate | null => {
    const dates = [group.venue?.start, group.totals.firstDate].filter((d): d is ISODate => !!d).sort()
    return dates[0] ?? null
  }
  return [...groups.values()].sort((a, b) => {
    const sa = startOf(a)
    const sb = startOf(b)
    if (sa && sb) return sa.localeCompare(sb) || a.projectName.localeCompare(b.projectName, 'nb')
    if (sa) return -1
    if (sb) return 1
    return a.projectName.localeCompare(b.projectName, 'nb')
  })
}

const inWindow = (group: ProjectGroup, window: { from: ISODate; to: ISODate }): boolean =>
  (!!group.venue && group.venue.start <= window.to && group.venue.end >= window.from) || [...group.daily.keys()].some((d) => d >= window.from && d <= window.to)

export const buildItems = (
  rows: AllocationRow[],
  events: VenueEvent[],
  index: DemandIndex,
  settings: Settings,
  filter: RowFilter,
  collapsed: Set<string>,
  window?: { from: ISODate; to: ISODate },
): GridItem[] => {
  const narrowsRows = !!filter.competence || !!filter.search
  let groups = buildGroups(rows.filter((row) => rowMatches(row, filter)), events, index, settings)
  if (filter.project) groups = groups.filter((group) => group.key === filter.project)
  // A competence or text filter is about rows, so projects without a matching row drop out, unless the text matches the project itself.
  if (narrowsRows) {
    const q = filter.search.toLowerCase()
    groups = groups.filter((group) => group.rows.length > 0 || (!filter.competence && !!q && `${group.projectName} ${group.projectNo}`.toLowerCase().includes(q)))
  }
  if (filter.onlyWithRows) groups = groups.filter((group) => group.rows.length > 0)
  // Like hiding rows in the workbook: keep projects that take place or have planned days inside the visible dates.
  if (window) groups = groups.filter((group) => inWindow(group, window))
  const items: GridItem[] = []
  for (const group of groups) {
    const isCollapsed = collapsed.has(group.key)
    items.push({ kind: 'group', group, collapsed: isCollapsed })
    if (isCollapsed) continue
    for (const row of group.rows) items.push({ kind: 'row', row, totals: rowTotals(index, row, settings), group })
  }
  return items
}
