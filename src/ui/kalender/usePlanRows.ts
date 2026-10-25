import { useCallback, useMemo } from 'react'
import { projectsOutside, type HallFilter } from '../../domain/areas'
import { dailyNeed, rowTotals, type DemandIndex } from '../../domain/calc'
import type { DateSpan } from '../../domain/types'
import type { ISODate } from '../../domain/dates'
import { locateRows, sharedPlaces } from '../../domain/locations'
import { isSuggestedRow, rowScope, suggestedRows } from '../../domain/plannedRows'
import type { AllocationRow, DemandLine, Settings, Workspace } from '../../domain/types'
import { hallNames, projectPhases } from '../../domain/venue'
import { buildWindows, freeDaysNear, windowFor } from '../../domain/windows'
import type { AllocLane } from './gridTypes'
import type { RowDetails } from './RowInspector'
import { buildGroups, filterGroups, groupItems, inWindow, projectKey, type Dimension, type RowFilter } from './rows'
import type { LaneKey } from './selection'
import { useHallCalendar } from './useHallCalendar'

interface Options {
  ws: Workspace
  /** The period of the Kalender. */
  range: DateSpan
  demandIndex: DemandIndex
  locatedDemand: DemandLine[]
  settings: Settings
  /** The hall calendar splits a day in the widest zoom. */
  wide: boolean
  hallFilter: HallFilter
  filter: RowFilter
  grouping: Dimension[]
  collapsed: Set<string>
  /** Only the projects that take place or have planned days in the days in view, see `onlyInView`. */
  onlyInView: boolean
  /** The days in view. */
  inView: { from: ISODate; to: ISODate }
  /** The row the details panel shows, or `null` while it is closed. */
  detailId: string | null
}

/**
 * The rows of the plan: the hall calendar, the planning rows with the suggested rows of the demand, the projects the
 * filter and «Steder» leave, the lines of the hierarchy, the lanes that take numbers, and the windows the rows can be worked in.
 */
export function usePlanRows({ ws, range, demandIndex, locatedDemand, settings, wide, hallFilter, filter, grouping, collapsed, onlyInView, inView, detailId }: Options) {
  const hallCalendar = useHallCalendar(ws, range.start, wide, hallFilter)
  const { shownVenue, events, projectOf, halls, bookedProjects } = hallCalendar
  /** The halls each project has booked, with the statuses that are shown: none for a project booked with other statuses alone. */
  const hallsOf = useMemo(() => {
    const booked = new Map<string, Set<string>>((bookedProjects ?? []).map((key) => [key, new Set()]))
    for (const event of events) {
      const key = projectKey({ projectNo: event.projectNo, projectName: event.name })
      booked.set(key, new Set([...(booked.get(key) ?? []), ...event.halls]))
    }
    return booked
  }, [events, bookedProjects])
  // What is unticked under «Steder» takes the projects with it that are booked in those halls alone: their rows, and their FTE in the demand.
  const outside = useMemo(() => projectsOutside(hallsOf, halls), [hallsOf, halls])

  // Rows without demand are looked for in the whole period, wherever their days are.
  const inViewOnly = onlyInView && !filter.project && !filter.search && !filter.onlyWithoutDemand
  // Demand taken into the plan shows as rows by itself; they become ordinary rows once FTE is typed in.
  const rows = useMemo(() => {
    const placed = locateRows(ws.allocations, hallNames(ws.venue), ws.hallRules)
    return [...placed, ...suggestedRows(locatedDemand, placed)]
  }, [ws.allocations, ws.venue, ws.hallRules, locatedDemand])
  const filtered = useMemo(() => filterGroups(rows, events, demandIndex, settings, filter, grouping, ws.projects).filter((group) => !outside.has(group.key)), [rows, events, demandIndex, settings, filter, grouping, ws.projects, outside])
  // Like hiding rows in the workbook: keep projects that take place or have planned days inside the visible dates.
  // The visible dates change with every column scrolled, the projects they hold seldom do; the hierarchy is
  // built again only when that list of projects changes.
  const inViewKeys = useMemo(
    () => (inViewOnly ? JSON.stringify(filtered.filter((group) => inWindow(group, inView)).map((group) => group.key)) : null),
    [filtered, inViewOnly, inView.from, inView.to], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const shownGroups = useMemo(() => {
    const keys = inViewKeys === null ? null : new Set(JSON.parse(inViewKeys) as string[])
    return keys ? filtered.filter((group) => keys.has(group.key)) : filtered
  }, [filtered, inViewKeys])
  const items = useMemo(() => groupItems(shownGroups, demandIndex, settings, collapsed, grouping), [shownGroups, demandIndex, settings, collapsed, grouping])
  const allocLanes = useMemo<AllocLane[]>(() => items.flatMap((item, index): AllocLane[] => (item.kind === 'row' ? [{ row: item.row, index }] : item.entry ? [{ node: item.node, index }] : [])), [items])
  const laneOfRow = useMemo(() => new Map(allocLanes.map((lane, i) => [lane.row?.id ?? `level:${lane.node!.key}`, i])), [allocLanes])
  // The selection stays on its lines when they move in the list, see `followLanes`.
  const laneKeys = useMemo<LaneKey[]>(() => allocLanes.map((lane) => (lane.row ? { id: lane.row.id, scope: rowScope(lane.row) } : { id: `level:${lane.node!.key}` })), [allocLanes])
  const allGroups = useMemo(() => buildGroups(rows, events, demandIndex, settings, ws.projects), [rows, events, demandIndex, settings, ws.projects])
  const projects = useMemo(
    () => allGroups.filter((group) => !outside.has(group.key)).map((group) => [group.key, group.projectName] as [string, string]).sort((a, b) => a[1].localeCompare(b[1], 'nb')),
    [allGroups, outside],
  )
  // The days each row can be worked on: its project's build-up or tear-down days in its hall.
  // The same lookup gives the hall phase of each day of a project, for the strip on its line.
  const places = useMemo(() => sharedPlaces(hallNames(ws.venue), ws.hallRules), [ws.venue, ws.hallRules])
  const [windows, phasesOfProject] = useMemo(() => [buildWindows(shownVenue, projectOf, places), projectPhases(shownVenue, projectOf)] as const, [shownVenue, projectOf, places])
  const projectOfRow = useMemo(() => new Map(allGroups.flatMap((group) => group.rows.map((row) => [row.id, group.key] as const))), [allGroups])
  // The FTE that counts as need, in the staffing lines and as the demand of Bemanning: that of the projects shown.
  const planned = useMemo(() => (outside.size ? ws.allocations.filter((row) => !outside.has(projectOfRow.get(row.id) ?? projectKey(row))) : ws.allocations), [ws.allocations, outside, projectOfRow])
  const need = useMemo(() => dailyNeed(planned), [planned])
  const windowOf = useCallback((row: AllocationRow) => windowFor(windows, projectOfRow.get(row.id) ?? projectKey(row), row.hall, row.phase), [windows, projectOfRow])
  // The days next to a row's window that its halls stand free, for the planning engine's earlier start; every booking counts, hidden or not.
  const nearbyOf = useCallback(
    (row: AllocationRow) => freeDaysNear(ws.venue, projectOf, places, projectOfRow.get(row.id) ?? projectKey(row), row.hall, row.phase, windowOf(row)),
    [ws.venue, projectOf, places, projectOfRow, windowOf],
  )
  // A level in entry is a row of its own: the days it can be worked on are those of the rows under it, together.
  const levelWindows = useMemo(
    () => new Map(items.flatMap((item) => (item.kind === 'group' && item.entry ? [[item.node.key, new Set(item.node.rows.flatMap((row) => [...(windowOf(row) ?? [])]))] as const] : []))),
    [items, windowOf],
  )

  const details = useMemo<RowDetails | null>(() => {
    const row = detailId ? rows.find((r) => r.id === detailId) : undefined
    if (!row) return null
    const key = projectOfRow.get(row.id) ?? projectKey(row)
    const halls = [...new Set(shownVenue.filter((booking) => projectOf(booking) === key).map((booking) => booking.hall))].sort((a, b) => a.localeCompare(b, 'nb', { numeric: true }))
    return { row, totals: rowTotals(demandIndex, row, settings), window: windowOf(row), projectName: allGroups.find((group) => group.key === key)?.projectName ?? row.projectName, halls, stored: !isSuggestedRow(row) }
  }, [detailId, rows, projectOfRow, shownVenue, projectOf, demandIndex, settings, windowOf, allGroups])

  const projectOptions = useMemo(() => allGroups.map((group) => ({ name: group.projectName, projectNo: group.projectNo })), [allGroups])
  // What a row's own line says: the properties that are not a level above it. The phase shows as a colour mark in front of it.
  const rowDimensions = useMemo(() => (['project', 'competence', 'hall', 'avdeling'] as Dimension[]).filter((d) => !grouping.includes(d)), [grouping])
  const competences = useMemo(() => [...new Set(rows.map((r) => r.competence).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb')), [rows])

  return {
    hallCalendar, hallsOf, inViewOnly, rows, filtered, shownGroups, items, allocLanes, laneOfRow, laneKeys, allGroups, projects,
    phasesOfProject, planned, need, windowOf, nearbyOf, levelWindows, details, projectOptions, rowDimensions, competences,
  }
}
