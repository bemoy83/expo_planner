import { rowTotals, type DemandIndex, type RowTotals } from '../../domain/calc'
import type { ISODate } from '../../domain/dates'
import { UNRESOLVED_HALL } from '../../domain/locations'
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

/** The properties of a planning row that the Kalender can be grouped by. */
export type Dimension = 'project' | 'phase' | 'hall' | 'competence' | 'avdeling'

export const DIMENSIONS: Dimension[] = ['project', 'phase', 'hall', 'competence', 'avdeling']
export const DIMENSION_LABELS: Record<Dimension, string> = { project: 'Prosjekt', phase: 'Arbeidsfase', hall: 'Hall/Sted', competence: 'Kompetanse', avdeling: 'Avd.' }
export const DEFAULT_GROUPING: Dimension[] = ['project', 'phase', 'competence']

/** Keeps what is valid of a stored grouping: known properties, each at most once. */
export const cleanGrouping = (value: unknown): Dimension[] =>
  Array.isArray(value) ? [...new Set(value.filter((d): d is Dimension => DIMENSIONS.includes(d)))] : DEFAULT_GROUPING

/** One level of the hierarchy: the rows that share a value, and their sums. */
export interface GroupNode {
  /** The path from the top, unique in the tree; used for collapsing. */
  key: string
  dimension: Dimension
  label: string
  depth: number
  rows: AllocationRow[]
  totals: { requiredFte: number; plannedFte: number }
  /** Summed FTE per day across the rows below. */
  daily: Map<ISODate, number>
  /** Set on project levels. */
  project?: ProjectGroup
}

export type GridItem =
  | { kind: 'group'; node: GroupNode; collapsed: boolean; /** FTE is typed on this level and shared out to the rows below, which are folded away. */ entry: boolean }
  | { kind: 'row'; row: AllocationRow; totals: RowTotals; project: ProjectGroup; depth: number; /** The value of the lowest level, where the row is alone under it and stands in for that level. */ lead?: string }

/** The value a row is grouped under, and how it reads. Rows without a hall or department cover all of them. */
export const dimensionValue = (row: AllocationRow, dimension: Exclude<Dimension, 'project'>): { value: string; label: string } => {
  const text = (raw: string | undefined, all: string, none: string, prefix = '') =>
    raw === undefined ? { value: '*', label: all } : raw.trim() ? { value: raw.trim().toLowerCase(), label: `${prefix}${raw.trim()}` } : { value: '', label: none }
  if (dimension === 'phase') return text(row.phase, '', 'Uten fase')
  if (dimension === 'competence') return text(row.competence, '', 'Uten kompetanse')
  if (dimension === 'hall') return text(row.hall, 'Alle haller', 'Uten hall')
  return text(row.avdeling, 'Alle avd.', 'Uten avd.', 'Avd. ')
}

export interface RowFilter {
  /** A project key, see `projectKey`. */
  project: string
  competence: string
  search: string
  /** Leave out projects that have no planning rows yet. */
  onlyWithRows?: boolean
  /** Leave out rows whose plan covers their demand, and with them the projects that have nothing left to plan. */
  onlyUncovered?: boolean
}

export const EMPTY_FILTER: RowFilter = { project: '', competence: '', search: '' }

/** Rows with the same project number belong together even when the name is spelled differently. */
export const projectKey = (row: Pick<AllocationRow, 'projectNo' | 'projectName'>): string => row.projectNo.trim() || `navn:${normalizeName(row.projectName)}`

const rowMatches = (row: AllocationRow, filter: RowFilter): boolean => {
  if (filter.competence && row.competence.toLowerCase() !== filter.competence.toLowerCase()) return false
  if (filter.search) {
    const q = filter.search.toLowerCase()
    const hay = `${row.projectName} ${row.projectNo} ${row.competence} ${row.basis} ${row.phase} ${row.hall ?? ''} ${row.avdeling ?? ''}`.toLowerCase()
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
  // A fixed order within the project, so rows keep their place as they are added or filled in.
  const phaseOrder = (row: AllocationRow) => (row.phase === 'Montering' ? 0 : row.phase === 'Demontering' ? 1 : 2)
  for (const group of groups.values()) {
    group.rows.sort(
      (a, b) =>
        a.competence.localeCompare(b.competence, 'nb') ||
        phaseOrder(a) - phaseOrder(b) ||
        (a.hall ?? '').localeCompare(b.hall ?? '', 'nb') ||
        (a.avdeling ?? '').localeCompare(b.avdeling ?? '', 'nb') ||
        a.basis.localeCompare(b.basis, 'nb') ||
        a.refYear.localeCompare(b.refYear) ||
        a.order - b.order,
    )
  }
  const startOf = (group: ProjectGroup): ISODate | null => {
    const dates = [group.venue?.start, group.totals.firstDate].filter((d): d is ISODate => !!d).sort()
    return dates[0] ?? null
  }
  return [...groups.values()].sort((a, b) => {
    const sa = startOf(a)
    const sb = startOf(b)
    if (sa && sb) return sa.localeCompare(sb) || a.projectName.localeCompare(b.projectName, 'nb')
    // Projects with rows but no dates come first: they are not tied to an event yet and need attention.
    if (!sa && !sb) return a.projectName.localeCompare(b.projectName, 'nb')
    return sa ? 1 : -1
  })
}

/** Whether a project takes place or has planned days inside the given dates. */
export const inWindow = (group: ProjectGroup, window: { from: ISODate; to: ISODate }): boolean =>
  (!!group.venue && group.venue.start <= window.to && group.venue.end >= window.from) ||
  [...group.daily.keys()].some((d) => d >= window.from && d <= window.to) ||
  // Rows with no dates at all (no event in the calendar, nothing planned yet) would otherwise never be seen.
  (!group.venue && group.daily.size === 0 && group.rows.length > 0)

const PHASE_ORDER: Record<string, number> = { montering: 0, demontering: 1 }

/**
 * The projects the filter leaves, each with the rows that match it.
 * Projects without rows are kept only where the project is the top level.
 */
export const filterGroups = (rows: AllocationRow[], events: VenueEvent[], index: DemandIndex, settings: Settings, filter: RowFilter, grouping: Dimension[] = ['project']): ProjectGroup[] => {
  const narrowsRows = !!filter.competence || !!filter.search || !!filter.onlyUncovered
  const lacksPlan = (row: AllocationRow) => {
    const { requiredFte, plannedFte } = rowTotals(index, row, settings)
    return (requiredFte ?? 0) > plannedFte + 0.05
  }
  let groups = buildGroups(rows.filter((row) => rowMatches(row, filter) && (!filter.onlyUncovered || lacksPlan(row))), events, index, settings)
  if (filter.project) groups = groups.filter((group) => group.key === filter.project)
  // A competence or text filter is about rows, so projects without a matching row drop out, unless the text matches the project itself.
  if (narrowsRows) {
    const q = filter.search.toLowerCase()
    groups = groups.filter((group) => group.rows.length > 0 || (!filter.competence && !filter.onlyUncovered && !!q && `${group.projectName} ${group.projectNo}`.toLowerCase().includes(q)))
  }
  if (filter.onlyWithRows || grouping[0] !== 'project') groups = groups.filter((group) => group.rows.length > 0)
  return groups
}

/**
 * The rows of the given projects as a hierarchy, like the row fields of a pivot table: one level per
 * property in `grouping`, in that order. FTE is typed on the rows; every level above sums what is below it.
 * Where a row is alone on the lowest level, the row itself takes that level's place.
 * A level in `entry` is folded and takes FTE itself, see `spread`.
 */
export const groupItems = (groups: ProjectGroup[], index: DemandIndex, settings: Settings, collapsed: Set<string>, grouping: Dimension[] = ['project'], entry: Set<string> = new Set()): GridItem[] => {
  interface Entry {
    row: AllocationRow
    totals: RowTotals
    project: ProjectGroup
  }
  const projectOrder = new Map(groups.map((group, i) => [group.key, i]))
  const entries: Entry[] = groups.flatMap((project) => project.rows.map((row) => ({ row, totals: rowTotals(index, row, settings), project })))
  const items: GridItem[] = []

  const walk = (list: Entry[], depth: number, path: string, emptyProjects: ProjectGroup[]) => {
    const dimension = grouping[depth]
    if (!dimension) {
      for (const entry of list) items.push({ kind: 'row', ...entry, depth })
      return
    }
    const buckets = new Map<string, { label: string; project?: ProjectGroup; entries: Entry[] }>()
    for (const project of emptyProjects) buckets.set(project.key, { label: project.projectName, project, entries: [] })
    for (const entry of list) {
      const { value, label } = dimension === 'project' ? { value: entry.project.key, label: entry.project.projectName } : dimensionValue(entry.row, dimension)
      let bucket = buckets.get(value)
      if (!bucket) {
        bucket = { label, project: dimension === 'project' ? entry.project : undefined, entries: [] }
        buckets.set(value, bucket)
      }
      bucket.entries.push(entry)
    }
    const sorted = [...buckets].sort(([a, bucketA], [b, bucketB]) => {
      if (dimension === 'project') return projectOrder.get(a)! - projectOrder.get(b)!
      if (dimension === 'phase') return (PHASE_ORDER[a] ?? 2) - (PHASE_ORDER[b] ?? 2)
      // Named values first, then rows for all halls or departments, then rows without one or with an unresolved one.
      const rank = (value: string) => (value === '' || value === UNRESOLVED_HALL.toLowerCase() ? 2 : value === '*' ? 1 : 0)
      return rank(a) - rank(b) || bucketA.label.localeCompare(bucketB.label, 'nb', { numeric: true })
    })
    for (const [value, bucket] of sorted) {
      // A lowest level with a single row would only repeat that row's figures on a line above it.
      if (depth === grouping.length - 1 && dimension !== 'project' && bucket.entries.length === 1) {
        items.push({ kind: 'row', ...bucket.entries[0], depth, lead: bucket.label })
        continue
      }
      const key = `${path}${dimension}:${value}`
      const node: GroupNode = { key, dimension, label: bucket.label, depth, rows: bucket.entries.map((e) => e.row), totals: { requiredFte: 0, plannedFte: 0 }, daily: new Map(), project: bucket.project }
      for (const { row, totals } of bucket.entries) {
        node.totals.requiredFte += totals.requiredFte ?? 0
        node.totals.plannedFte += totals.plannedFte
        for (const [date, fte] of Object.entries(row.fte)) node.daily.set(date, (node.daily.get(date) ?? 0) + fte)
      }
      const isEntry = entry.has(key) && bucket.entries.length > 0
      const isCollapsed = isEntry || collapsed.has(key)
      items.push({ kind: 'group', node, collapsed: isCollapsed, entry: isEntry })
      if (!isCollapsed) walk(bucket.entries, depth + 1, `${key}/`, [])
    }
  }
  walk(entries, 0, '', grouping[0] === 'project' ? groups.filter((group) => group.rows.length === 0) : [])
  return items
}

/** The grid's lines from the planning rows: `filterGroups`, the projects inside `window` where one is given, then `groupItems`. */
export const buildItems = (
  rows: AllocationRow[],
  events: VenueEvent[],
  index: DemandIndex,
  settings: Settings,
  filter: RowFilter,
  collapsed: Set<string>,
  window?: { from: ISODate; to: ISODate },
  grouping: Dimension[] = ['project'],
  entry: Set<string> = new Set(),
): GridItem[] => {
  const groups = filterGroups(rows, events, index, settings, filter, grouping)
  // Like hiding rows in the workbook: keep projects that take place or have planned days inside the visible dates.
  return groupItems(window ? groups.filter((group) => inWindow(group, window)) : groups, index, settings, collapsed, grouping, entry)
}

/** The keys of the levels above a row, for opening the way to it. */
export const pathKeys = (row: AllocationRow, projectGroupKey: string, grouping: Dimension[]): string[] => {
  const keys: string[] = []
  let path = ''
  for (const dimension of grouping) {
    const key = `${path}${dimension}:${dimension === 'project' ? projectGroupKey : dimensionValue(row, dimension).value}`
    keys.push(key)
    path = `${key}/`
  }
  return keys
}
