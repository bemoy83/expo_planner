import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ALL_HALLS, cleanHallFilter, projectsOutside, type HallFilter } from '../../domain/areas'
import { capacityForDate, dailyNeed, formatFte, planningSettings, requiredHours, rowTotals, sumValues } from '../../domain/calc'
import { calendarRange } from '../../domain/calendarRange'
import { dateRange, daysBetween, todayIso, type ISODate } from '../../domain/dates'
import { decimalText } from '../../domain/numbers'
import { dayType } from '../../domain/holidays'
import type { AllocationRow } from '../../domain/types'
import { hallNames, projectPhases } from '../../domain/venue'
import { locateRows, sharedPlaces } from '../../domain/locations'
import { absenceLine, overtimeLine } from '../../domain/staffing'
import { isSuggestedRow, rowScope, suggestedRows } from '../../domain/plannedRows'
import { spread } from '../../domain/spread'
import { buildWindows, windowFor } from '../../domain/windows'
import { loadPref, savePref, usePref, usePrefSet } from '../../store/prefs'
import { useWorkspace } from '../../store/workspaceStore'
import { AllocationDialog } from '../AllocationDialog'
import { BemanningHead, BemanningOverlays, BemanningToolbar, BemanningTop } from '../bemanning/BemanningParts'
import { BemanningScope } from '../bemanning/BemanningScope'
import { PeopleHeading, PeopleRows } from '../bemanning/PeopleRows'
import { PersonPanel } from '../bemanning/PersonPanel'
import type { BlockNames } from '../bemanning/dayCell'
import { unfoldedHeight } from '../bemanning/layout'
import type { ProjectSpan } from '../bemanning/projectsInView'
import { AreaMenu } from './AreaMenu'
import { CellMenu } from './CellMenu'
import { daysWide, fitSpan, LEFT_W, OVERSCAN_ROWS, overscanCols, parseCellInput, ROW_H, TOP_ROW_H, ZOOM_WIDTHS, type Zoom } from './layout'
import { AllocRow, GroupRow, HeadRows } from './GridRows'
import type { AllocLane, CellEdit, Columns, GridActions } from './gridTypes'
import { heatScale } from './heat'
import { rowTitle } from './labels'
import { KalenderBar, KalenderHead } from './KalenderBar'
import { RowInspector, type RowDetails } from './RowInspector'
import { buildGroups, cleanGrouping, DEFAULT_GROUPING, EMPTY_FILTER, filterGroups, groupItems, inWindow, itemDepth, levelSections, pathKeys, projectIndex, projectKey, type Dimension, type GroupItem, type RowFilter } from './rows'
import { StatusBar, type FocusInfo } from './StatusBar'
import { HallSection, PlanningHeading, StaffingSection } from './TopSections'
import { useGridDrag } from './useGridDrag'
import { useGridViewport } from './useGridViewport'
import { useHallCalendar } from './useHallCalendar'
import { useProjectHover } from './useProjectHover'
import { useStableActions } from './useStableActions'
import { useToolKeys } from './useToolKeys'
import { useModeZoom } from './useModeZoom'
import { BEMANNING_DAYS, cleanPlanMode, enterSpan, fitWidth, spanDays, zoomOf, type DaySpan, type HeldColumns, type PlanMode } from './zoom'
import { copyText, fillNotice, fillPreview, fillProgress, ghostCells, overbookedDays, pasteCells, pencilNotice, pencilProgress, pencilStroke, proposal, proposalNotice } from './strokes'
import { followLanes, rangeOf, type Cell, type LaneKey, type Fill, type FillCell, type Selection, type Tool } from './selection'

/** A line that takes no numbers has nothing selected on it. */
const NO_EDIT: CellEdit = { selFrom: -1, selTo: -1, focusCol: -1, handle: false, draft: null, ghost: undefined, ghostClass: 'drawn' }

/**
 * `hints` is the setting «Hjelpetekster»: with it off, pointing at a project lights nothing.
 * `heat` is the setting «Varmekart for avvik»: the Avvik line as coloured tiles.
 * `blockNames`, `selectionStyle` and `overtimeLimit` are the settings of Bemanning: what a block says, how what is picked is shown, and the overtime per week that is flagged.
 * `onOpenPersonell` opens the tab where the people are entered, from Bemanning when there are none.
 */
export function Kalender({ hints = true, heat = true, blockNames = 'full', overtimeLimit = 10, onOpenPersonell }: { hints?: boolean; heat?: boolean; blockNames?: BlockNames; overtimeLimit?: number; onOpenPersonell: () => void }) {
  const { workspace, demandIndex, locatedDemand, setAllocationFte, setSuggestedFte, setAllocationNote, removeAllocation } = useWorkspace()
  const ws = workspace!
  const settings = useMemo(() => planningSettings(ws), [ws.settings, ws.persons]) // eslint-disable-line react-hooks/exhaustive-deps
  // The staffing lines come from Bemanning: absence and overtime, which are worked out.
  const absence = useMemo(() => absenceLine(ws), [ws.persons, ws.unavailability, ws.settings]) // eslint-disable-line react-hooks/exhaustive-deps
  const overtime = useMemo(() => overtimeLine(ws), [ws.persons, ws.unavailability, ws.assignments, ws.settings]) // eslint-disable-line react-hooks/exhaustive-deps
  const capacity = useMemo(() => [absence, overtime], [absence, overtime])
  const fromBemanning = useMemo(() => {
    if (!ws.persons?.length) return []
    const overtimeFte = Object.fromEntries(Object.entries(overtime.values).map(([date, people]) => [date, Math.round(((people * (overtime.hours?.[date] ?? 0)) / settings.hoursPerDay) * 100) / 100]))
    return [
      { label: 'Fravær faste (FTE)', title: 'Fravær blant de faste, hentet fra Bemanning. Trekkes fra Tilgjengelig.', values: absence.values },
      { label: 'Overtid faste (FTE)', title: 'Overtid tegnet i Bemanning, regnet om til FTE. Legges til Tilgjengelig.', values: overtimeFte },
    ]
  }, [ws.persons, absence, overtime, settings.hoursPerDay])

  const [zoom, setZoom] = usePref<Zoom>('zoom', 'normal')
  const [filter, setFilter] = usePref<RowFilter>('filter', EMPTY_FILTER)
  const [grouping, setGrouping] = usePref<Dimension[]>('grouping', DEFAULT_GROUPING, cleanGrouping)
  const [collapsed, setCollapsed] = usePrefSet('collapsedLevels')
  const [entry, setEntry] = usePrefSet('entryLevels')
  const [hallsOpen, setHallsOpen] = usePref('hallsOpen', true)
  const [hallFilter, setHallFilter] = usePref<HallFilter>('hallFilter', ALL_HALLS, cleanHallFilter)
  const [staffingOpen, setStaffingOpen] = usePref('staffingOpen', true)
  const [capacityOpen, setCapacityOpen] = usePref('capacityOpen', false)
  const [onlyInView, setOnlyInView] = usePref('onlyInView', true)
  const [selection, setSelection] = useState<Selection | null>(null)
  // With the pencil, drawing across days on a row shares out what is left of its demand over those days.
  // With the eraser, drawing across cells clears them.
  const [tool, setTool] = useState<Tool>('select')
  const [notice, setNotice] = useState<string | null>(null)
  const dragging = useRef(false)
  // The tool of the stroke being drawn. Shift or Alt held when the mouse goes down picks the pencil or the
  // eraser for that one stroke, whatever tool is chosen.
  const [stroke, setStroke] = useState<Exclude<Tool, 'select'> | null>(null)
  const strokeRef = useRef<Exclude<Tool, 'select'> | null>(null)
  // A Shift-click extends the selection, as in Excel. Dragged on to another cell, it becomes a pencil stroke from the cell it started on.
  const spring = useRef<Cell | null>(null)
  const [cellMenu, setCellMenu] = useState<{ x: number; y: number; rowId: string; col: number } | null>(null)
  const [inspectorOpen, setInspectorOpen] = usePref('inspectorOpen', false)
  // The row the details panel shows: the last planning row that had the focus.
  const [detailId, setDetailId] = useState<string | null>(null)
  const [fill, setFill] = useState<Fill | null>(null)
  const fillRef = useRef<Fill | null>(null)
  const fillCellsRef = useRef<FillCell[]>([])
  const selectionRef = useRef<Selection | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ row?: AllocationRow; projectName?: string; projectNo?: string } | null>(null)
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)
  // The cell to scroll to, and whether the grid takes the keys, once it is selected.
  const [reveal, setReveal] = useState<{ cell: Cell; takeKeys: boolean } | null>(null)
  // The project whose halls and days the hall calendar is showing, after a click on its name.
  const [located, setLocated] = useState<string | null>(null)

  // The period follows the hall bookings, see `calendarRange`.
  const range = useMemo(() => calendarRange({ venue: ws.venue, allocations: ws.allocations }, todayIso()), [ws.venue, ws.allocations])
  const dates = useMemo(() => dateRange(range.start, range.end), [range.start, range.end])
  const today = todayIso()
  // The day in focus is shared by the two modes (`planningFocus`): the Kalender opens on it, and the day of the cell the planner stands on becomes it.
  const [planningFocus, setPlanningFocus] = usePref<{ date: ISODate } | null>('planningFocus', null)

  // The rows are the demand plan or the people (`planMode`). `shown` is what is drawn: on the way into
  // Bemanning the plan zooms in first and the rows change at the end, on the way out they change first.
  const [planMode, setPlanMode] = usePref<PlanMode>('planMode', 'plan', cleanPlanMode)
  const [shown, setShown] = useState<PlanMode>(planMode)
  // Bemanning has no steps of zoom: its days are as wide as the span it shows asks for.
  // A page that opens in Bemanning opens on the days last seen there.
  const [openSpan] = useState(() => {
    const inPeriod = (date: ISODate | undefined) => !!date && date >= range.start && date <= range.end
    return enterSpan({ period: range, stored: loadPref<DaySpan | null>('bemanningRange', null), leftEdge: inPeriod(planningFocus?.date) ? planningFocus!.date : inPeriod(today) ? today : range.start })
  })
  const [bemanningW, setBemanningW] = useState(() => fitWidth(spanDays(openSpan), window.innerWidth - LEFT_W))
  // The width the lines are drawn at. While the switch zooms, the width on screen is on its way from
  // one mode's to the other's (`useModeZoom`), and the days it passes are held drawn.
  const colW = shown === 'bemanning' ? bemanningW : ZOOM_WIDTHS[zoom]
  const [held, setHeld] = useState<HeldColumns | null>(null)
  // The person whose hours are open in Bemanning. The top block gives way by as much as they need.
  const [unfolded, setUnfolded] = useState<string | null>(null)

  const projectHover = useProjectHover(hints)
  const closeCellMenu = useCallback(() => setCellMenu(null), [])
  const clearSelection = useCallback(() => setSelection(null), [])
  const { scrollRef, headRef, topRef, toolsRef, viewport, topHeight, headHeight, barHeight, tucked, measure, onScroll, scrollToDate, showSpan, placeLeft, zoomFrom, zoomStep } = useGridViewport({
    start: range.start,
    end: range.end,
    openOn: planningFocus?.date ?? today,
    zoom,
    colW,
    reserve: shown === 'bemanning' && unfolded ? unfoldedHeight(ws.settings.workday) : 0,
    onScrolled: closeCellMenu,
    onPeriodMoved: clearSelection,
  })

  // ---- derived data -------------------------------------------------------------------------
  const { shownVenue, events, projectOf, hallProjectLists, hallLabels, hallBars, halls, hallTree, hallCount, statuses, bookedProjects } = useHallCalendar(ws, range.start, zoom === 'wide', hallFilter)
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

  // While the switch between the modes zooms, the days in view are held at those the plan shows at its own
  // width. The zoom passes through fewer days, and the projects listed would come and go with them,
  // moving the rows under the planner.
  const [heldWindow, setHeldWindow] = useState<DaySpan | null>(null)
  const winFrom = heldWindow?.start ?? dates[Math.max(0, Math.floor(viewport.left / colW))]
  const winTo = heldWindow?.end ?? dates[Math.max(0, Math.min(dates.length - 1, Math.floor((viewport.left + viewport.width - LEFT_W) / colW)))]
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
    () => (inViewOnly ? JSON.stringify(filtered.filter((group) => inWindow(group, { from: winFrom, to: winTo })).map((group) => group.key)) : null),
    [filtered, inViewOnly, winFrom, winTo],
  )
  const shownGroups = useMemo(() => {
    const keys = inViewKeys === null ? null : new Set(JSON.parse(inViewKeys) as string[])
    return keys ? filtered.filter((group) => keys.has(group.key)) : filtered
  }, [filtered, inViewKeys])
  const items = useMemo(() => groupItems(shownGroups, demandIndex, settings, collapsed, grouping, entry), [shownGroups, demandIndex, settings, collapsed, grouping, entry])
  const allocLanes = useMemo<AllocLane[]>(() => items.flatMap((item, index): AllocLane[] => (item.kind === 'row' ? [{ row: item.row, index }] : item.entry ? [{ node: item.node, index }] : [])), [items])
  const laneOfRow = useMemo(() => new Map(allocLanes.map((lane, i) => [lane.row?.id ?? `level:${lane.node!.key}`, i])), [allocLanes])
  // The selection stays on its lines when they move in the list, see `followLanes`.
  const laneKeys = useMemo<LaneKey[]>(() => allocLanes.map((lane) => (lane.row ? { id: lane.row.id, scope: rowScope(lane.row) } : { id: `level:${lane.node!.key}` })), [allocLanes])
  const [seenLaneKeys, setSeenLaneKeys] = useState(laneKeys)
  if (seenLaneKeys !== laneKeys) {
    setSeenLaneKeys(laneKeys)
    const followed = selection && followLanes(selection, seenLaneKeys, laneKeys)
    if (followed !== selection) {
      setSelection(followed)
      // The grid does not take the keys here: the list may have changed because of something typed in a field.
      setReveal(followed && { cell: followed.focus, takeKeys: false })
    }
  }
  // The details panel keeps its row when the selection is cleared or moves to a level.
  const focusRowId = selection ? (allocLanes[selection.focus.lane]?.row?.id ?? null) : null
  if (focusRowId && focusRowId !== detailId) setDetailId(focusRowId)
  const allGroups = useMemo(() => buildGroups(rows, events, demandIndex, settings, ws.projects), [rows, events, demandIndex, settings, ws.projects])
  const projects = useMemo(
    () => allGroups.filter((group) => !outside.has(group.key)).map((group) => [group.key, group.projectName] as [string, string]).sort((a, b) => a[1].localeCompare(b[1], 'nb')),
    [allGroups, outside],
  )
  // The days each row can be worked on: its project's build-up or tear-down days in its hall.
  // The same lookup gives the hall phase of each day of a project, for the strip on its line.
  const [windows, phasesOfProject] = useMemo(() => [buildWindows(shownVenue, projectOf, sharedPlaces(hallNames(ws.venue), ws.hallRules)), projectPhases(shownVenue, projectOf)] as const, [shownVenue, projectOf, ws.venue, ws.hallRules])
  const projectOfRow = useMemo(() => new Map(allGroups.flatMap((group) => group.rows.map((row) => [row.id, group.key] as const))), [allGroups])
  // The FTE that counts as need, in the staffing lines and as the demand of Bemanning: that of the projects shown.
  const planned = useMemo(() => (outside.size ? ws.allocations.filter((row) => !outside.has(projectOfRow.get(row.id) ?? projectKey(row))) : ws.allocations), [ws.allocations, outside, projectOfRow])
  const need = useMemo(() => dailyNeed(planned), [planned])
  const windowOf = useCallback((row: AllocationRow) => windowFor(windows, projectOfRow.get(row.id) ?? projectKey(row), row.hall, row.phase), [windows, projectOfRow])

  const details = useMemo<RowDetails | null>(() => {
    const row = inspectorOpen && detailId ? rows.find((r) => r.id === detailId) : undefined
    if (!row) return null
    const key = projectOfRow.get(row.id) ?? projectKey(row)
    const halls = [...new Set(shownVenue.filter((booking) => projectOf(booking) === key).map((booking) => booking.hall))].sort((a, b) => a.localeCompare(b, 'nb', { numeric: true }))
    return { row, totals: rowTotals(demandIndex, row, settings), window: windowOf(row), projectName: allGroups.find((group) => group.key === key)?.projectName ?? row.projectName, halls, stored: !isSuggestedRow(row) }
  }, [inspectorOpen, detailId, rows, projectOfRow, shownVenue, projectOf, demandIndex, settings, windowOf, allGroups])
  // The heat map of the Avvik line is scaled by the largest shortage and surplus of the whole period.
  const heatMax = useMemo(() => heatScale(heat ? dates.map((date) => capacityForDate(date, capacity, settings).available - (need.get(date) ?? 0)) : []), [heat, dates, capacity, settings, need])

  const projectOptions = useMemo(() => allGroups.map((group) => ({ name: group.projectName, projectNo: group.projectNo })), [allGroups])
  // What a row's own line says: the properties that are not a level above it. The phase shows as a colour mark in front of it.
  const rowDimensions = useMemo(() => (['project', 'competence', 'hall', 'avdeling'] as Dimension[]).filter((d) => !grouping.includes(d)), [grouping])
  const competences = useMemo(() => [...new Set(rows.map((r) => r.competence).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb')), [rows])

  // ---- virtualization ------------------------------------------------------------------------
  const overscan = overscanCols(colW)
  const c0 = Math.max(0, (held ? held.from : Math.floor(viewport.left / colW)) - overscan)
  const c1 = Math.min(dates.length - 1, (held ? held.to : Math.ceil((viewport.left + viewport.width - LEFT_W) / colW)) + overscan)
  const visibleDates = useMemo(() => dates.slice(c0, c1 + 1), [dates, c0, c1])
  const firstVisibleCol = Math.min(dates.length - 1, Math.ceil(viewport.left / colW))
  // Where each line starts: the top level's lines are taller than the rest. One entry more than there are lines, the last being the full height.
  const rowTops = useMemo(() => {
    const tops = [0]
    for (const item of items) tops.push(tops[tops.length - 1] + (item.kind === 'group' && item.node.depth === 0 ? TOP_ROW_H : ROW_H))
    return tops
  }, [items])
  /** The line that covers `y`, counted from the top of the planning rows. */
  const rowAt = (y: number) => {
    let lo = 0
    let hi = items.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (rowTops[mid + 1] <= y) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  // A top level's line stays at the top of the rows while the lines under it scroll past, and is pushed
  // out by the next one. Each is drawn in a box as tall as its stretch of lines and sticks inside it, so
  // the browser moves it while scrolling and nothing is worked out per frame.
  const allSections = useMemo(() => levelSections(items), [items])
  /** What stays pinned over the rows once they are scrolled: the top block, less the part of it that gives way where the rows have no room. */
  const pinnedHeight = topHeight - tucked
  /** How much of the rows the line of a top level covers above the line at `index`: nothing above a top level itself. */
  const headOver = (index: number) => {
    const item = items[index]
    return item && allSections.length && itemDepth(item) > 0 ? TOP_ROW_H : 0
  }
  const r0 = Math.max(0, rowAt(viewport.top - tucked) - OVERSCAN_ROWS)
  const r1 = Math.min(items.length, rowAt(viewport.top + viewport.height - topHeight) + 1 + OVERSCAN_ROWS)

  const ensureVisible = useCallback(
    (cell: Cell) => {
      const el = scrollRef.current
      if (!el) return
      const x = cell.col * colW
      if (x < el.scrollLeft) el.scrollLeft = x
      else if (x + colW > el.scrollLeft + el.clientWidth - LEFT_W) el.scrollLeft = x + colW - (el.clientWidth - LEFT_W)
      const index = allocLanes[cell.lane]?.index ?? 0
      const y = rowTops[index] ?? 0
      const bottom = rowTops[index + 1] ?? y + ROW_H
      const pinned = pinnedHeight + headOver(index)
      if (topHeight + y < el.scrollTop + pinned) el.scrollTop = topHeight + y - pinned
      else if (topHeight + bottom > el.scrollTop + el.clientHeight) el.scrollTop = topHeight + bottom - el.clientHeight
    },
    [scrollRef, colW, allocLanes, rowTops, topHeight, pinnedHeight, items, allSections], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Select the first visible day of a row that was just added or edited, once it is among the lines.
  const pendingLane = pendingFocus ? laneOfRow.get(pendingFocus) : undefined
  if (pendingLane !== undefined) {
    const cell = { lane: pendingLane, col: firstVisibleCol }
    setPendingFocus(null)
    setSelection({ anchor: cell, focus: cell })
    setReveal({ cell, takeKeys: true })
  }
  useEffect(() => {
    if (!reveal) return
    ensureVisible(reveal.cell)
    if (reveal.takeKeys) scrollRef.current?.focus({ preventScroll: true })
  }, [reveal]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- cell values ----------------------------------------------------------------------------
  const getValue = useCallback(
    (lane: number, date: ISODate): number | undefined => {
      const { row, node } = allocLanes[lane] ?? {}
      // A level's value is a sum of rounded parts; keep float noise out of the editor and the clipboard.
      const sum = node?.daily.get(date)
      return node ? (sum === undefined ? undefined : Math.round(sum * 100) / 100) : row?.fte[date]
    },
    [allocLanes],
  )

  const setRowFte = useCallback(
    (row: AllocationRow, date: ISODate, value: number | null) => (isSuggestedRow(row) ? setSuggestedFte(row, date, value) : setAllocationFte(row.id, date, value)),
    [setSuggestedFte, setAllocationFte],
  )

  const setValue = useCallback(
    (lane: number, date: ISODate, value: number | null) => {
      const { row, node } = allocLanes[lane] ?? {}
      if (row) setRowFte(row, date, value)
      else if (node) {
        // A number typed on a level replaces that day for every row below it, shared out by their required hours.
        const parts = value === null ? [] : spread(value, node.rows.map((r) => requiredHours(demandIndex, r) ?? 0))
        node.rows.forEach((r, i) => {
          const part = parts[i] || null
          if (part !== null || r.fte[date] !== undefined) setRowFte(r, date, part)
        })
      }
    },
    [allocLanes, setRowFte, demandIndex],
  )

  const fillSelection = useCallback(
    (value: number | null) => {
      if (!selection) return
      const { lane0, lane1, col0, col1 } = rangeOf(selection)
      for (let lane = lane0; lane <= lane1; lane++) for (let col = col0; col <= col1; col++) setValue(lane, dates[col], value)
    },
    [selection, setValue, dates],
  )

  const move = useCallback(
    (dLane: number, dCol: number, extend = false) => {
      setSelection((sel) => {
        if (!sel) return sel
        const focus = {
          lane: Math.min(allocLanes.length - 1, Math.max(0, sel.focus.lane + dLane)),
          col: Math.min(dates.length - 1, Math.max(0, sel.focus.col + dCol)),
        }
        ensureVisible(focus)
        return { anchor: extend ? sel.anchor : focus, focus }
      })
    },
    [dates.length, ensureVisible], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const commitDraft = useCallback(
    (then?: () => void) => {
      if (draft === null || !selection) return
      const value = parseCellInput(draft)
      setDraft(null)
      if (value !== undefined) fillSelection(value)
      then?.()
      scrollRef.current?.focus({ preventScroll: true })
    },
    [scrollRef, draft, selection, fillSelection],
  )

  const select = (cell: Cell, extend: boolean) => {
    if (draft !== null) commitDraft()
    setNotice(null)
    setSelection((sel) => (extend && sel ? { ...sel, focus: cell } : { anchor: cell, focus: cell }))
    scrollRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  const strokeFor = useCallback((sel: Selection | null) => pencilStroke(sel, dates, allocLanes, demandIndex, settings), [dates, allocLanes, demandIndex, settings])

  const drawDemand = useCallback((over: Selection | null = selectionRef.current) => {
    const drawn = strokeFor(over)
    if (!drawn) return
    for (const { lane, parts } of drawn.lanes) drawn.target.forEach((date, i) => setValue(lane, date, parts[i] || null))
    setNotice(pencilNotice(drawn))
  }, [strokeFor, setValue])

  /** «Foreslå plan»: fills rows over their windows, see `proposal`. */
  const proposePlan = useCallback(
    (list: AllocationRow[], replace: boolean) => {
      const plan = proposal(list, replace, windowOf, demandIndex, settings)
      for (const { row, date, value } of plan.writes) setRowFte(row, date, value)
      setNotice(proposalNotice(plan))
    },
    [windowOf, demandIndex, settings, setRowFte],
  )

  /** The eraser: clears every cell drawn across. On a level in entry mode, that day is cleared for the rows below. */
  const eraseDrawn = useCallback(() => {
    const sel = selectionRef.current
    if (!sel) return
    const { lane0, lane1, col0, col1 } = rangeOf(sel)
    let erased = 0
    for (let lane = lane0; lane <= lane1; lane++)
      for (let col = col0; col <= col1; col++) {
        const value = getValue(lane, dates[col])
        if (value === undefined) continue
        erased += value
        setValue(lane, dates[col], null)
      }
    setNotice(erased ? `Visket ut ${formatFte(erased, 1)} FTE-dager` : 'Ingenting å viske ut her')
  }, [dates, getValue, setValue])

  // While a stroke is being drawn, what it would give: shown in the cells, with the level per day in the status bar.
  // The total is left out: a stroke always places all that is left, so it would not move.
  const preview = useMemo(() => (stroke === 'pencil' ? strokeFor(selection) : null), [stroke, strokeFor, selection])
  const fillCells = useMemo(() => fillPreview(fill, dates, getValue), [fill, dates, getValue])
  useEffect(() => {
    fillRef.current = fill
    fillCellsRef.current = fillCells
  }, [fill, fillCells])

  const commitFill = useCallback(() => {
    const done = fillRef.current
    const cells = fillCellsRef.current
    fillRef.current = null
    setFill(null)
    if (!done) return
    for (const cell of cells) setValue(cell.lane, cell.date, cell.value)
    // The block is now what was dragged out, so it can be dragged on from there.
    setSelection({ anchor: { lane: done.lane0, col: done.col0 }, focus: { lane: done.lane1, col: done.toCol } })
    setNotice(fillNotice(done, cells))
  }, [setValue])

  // What the cells of each line would hold if the stroke or the drag ended now, keyed by lane.
  const ghost = useMemo(() => ghostCells(preview, stroke === 'eraser' ? selection : null, dates, fillCells), [preview, stroke, selection, dates, fillCells])

  useGridDrag({ scrollRef, dragging, fillRef, strokeRef, spring, setFill, setSelection, setStroke, drawDemand, eraseDrawn, commitFill, colW, dayCount: dates.length })

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (draft !== null || !selection) return
    if (e.target !== scrollRef.current) return
    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    if (arrows[e.key]) {
      e.preventDefault()
      move(...arrows[e.key], e.shiftKey)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      move(0, e.shiftKey ? -1 : 1)
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      const current = getValue(selection.focus.lane, dates[selection.focus.col])
      setDraft(current === undefined ? '' : decimalText(current))
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      fillSelection(null)
    } else if (e.key === 'Escape') {
      // Escape first puts the pencil or the eraser away, see the tool keys.
      if (tool === 'select' && !cellMenu) setSelection(null)
    } else if (/^[0-9,.-]$/.test(e.key) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      setDraft(e.key)
    }
  }

  const onCopy = (e: React.ClipboardEvent) => {
    if (!selection || draft !== null) return
    e.clipboardData.setData('text/plain', copyText(selection, dates, getValue))
    e.preventDefault()
  }

  const onPaste = (e: React.ClipboardEvent) => {
    if (!selection || draft !== null) return
    const textData = e.clipboardData.getData('text/plain')
    if (!textData) return
    e.preventDefault()
    for (const cell of pasteCells(textData, selection, dates, allocLanes.length)) setValue(cell.lane, cell.date, cell.value)
  }

  const selectionRange = selection ? rangeOf(selection) : null

  // ---- rendering helpers --------------------------------------------------------------------
  // Days planned above the available crew. Without the heat map they are tinted down the whole grid; with it,
  // the Avvik line alone carries them. A pencil stroke in progress counts, so the clash shows while it is being drawn.
  const overbooked = useMemo(() => overbookedDays(need, preview, fillCells, allocLanes, getValue, capacity, settings), [need, preview, fillCells, allocLanes, getValue, capacity, settings])

  // Every cell of a day shares these classes; they are worked out once per day, not once per cell.
  const dayClasses = useMemo(() => {
    const classes = new Map<ISODate, string>()
    for (const date of visibleDates) {
      const type = dayType(date)
      classes.set(date, `day ${type !== 'arbeidsdag' ? type : ''} ${date === today ? 'today' : ''} ${date.endsWith('-01') ? 'month-start' : ''} ${!heat && overbooked.has(date) ? 'overbooked' : ''}`)
    }
    return classes
  }, [visibleDates, today, overbooked, heat])
  const leftCol = held ? held.left : Math.floor(viewport.left / colW)
  const cols = useMemo<Columns>(() => ({ dates: visibleDates, c0, first: leftCol, colW, classes: dayClasses }), [visibleDates, c0, leftCol, colW, dayClasses])

  // What the stroke or the drag in progress would do, for the status bar.
  const progress = fill ? fillProgress(fill, fillCells) : preview ? pencilProgress(preview) : null

  const toggled = (prev: Set<string>, key: string) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }
  // Lanes are positions in the list, so a selection would land on other rows once levels fold or unfold.
  const toggleGroup = (key: string) => {
    setSelection(null)
    setCollapsed((prev) => toggled(prev, key))
  }
  const toggleEntry = (key: string) => {
    setSelection(null)
    setEntry((prev) => toggled(prev, key))
  }

  // ---- what the rows are given ---------------------------------------------------------------
  const actions = useStableActions<GridActions>({
    cellDown: (lane, col, e) => {
      e.preventDefault()
      const drags = e.button === 0 && !(e.target instanceof HTMLInputElement)
      // Alt clears and Shift shares out demand for this one stroke. With «Velg», Shift still extends the
      // selection on a click; the stroke starts once the mouse is dragged on.
      const erases = drags && e.altKey
      const extends_ = e.shiftKey && !erases && (!drags || tool === 'select')
      select({ lane, col }, extends_)
      if (!drags) return
      dragging.current = true
      spring.current = extends_ ? { lane, col } : null
      const started = spring.current ? null : erases ? 'eraser' : e.shiftKey ? 'pencil' : tool === 'select' ? null : tool
      strokeRef.current = started
      setStroke(started)
    },
    cellEnter: (lane, col) => {
      if (fillRef.current) setFill((f) => f && { ...f, toCol: Math.max(f.col0, col) })
      else if (dragging.current && spring.current) {
        const anchor = spring.current
        spring.current = null
        strokeRef.current = 'pencil'
        setStroke('pencil')
        setSelection({ anchor, focus: { lane, col } })
      } else if (dragging.current) setSelection((sel) => sel && { ...sel, focus: { lane, col } })
    },
    cellMenu: (lane, col, e) => {
      const row = allocLanes[lane]?.row
      if (!row) return
      e.preventDefault()
      // The press that asked for the menu is no drag.
      dragging.current = false
      strokeRef.current = null
      spring.current = null
      setStroke(null)
      select({ lane, col }, false)
      setCellMenu({ x: e.clientX, y: e.clientY, rowId: row.id, col })
    },
    selectRow: (lane) => select({ lane, col: selection ? selection.focus.col : firstVisibleCol }, false),
    editCell: (value) => setDraft(value === undefined ? '' : decimalText(value)),
    setDraft,
    commitDraft: () => commitDraft(),
    draftKey: (e) => {
      // A number typed over several cells fills them all, and they stay selected, as in Excel; on a single cell Enter and Tab move on.
      const several = !!selectionRange && (selectionRange.lane0 !== selectionRange.lane1 || selectionRange.col0 !== selectionRange.col1)
      if (e.key === 'Enter') {
        e.preventDefault()
        commitDraft(several ? undefined : () => move(e.shiftKey ? -1 : 1, 0))
      } else if (e.key === 'Tab') {
        e.preventDefault()
        commitDraft(several ? undefined : () => move(0, e.shiftKey ? -1 : 1))
      } else if (e.key === 'Escape') {
        setDraft(null)
        scrollRef.current?.focus({ preventScroll: true })
      }
    },
    fillDown: (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (!selectionRange) return
      const started: Fill = { ...selectionRange, toCol: selectionRange.col1, stretch: e.altKey }
      fillRef.current = started
      setFill(started)
    },
    // Shows where and when a project is: its days are brought into view, in narrower columns if they do not
    // fit, and its halls and bars stay lit. A click on the same project again lets go of it.
    showProject: (key) => {
      const span = located === key ? undefined : allGroups.find((group) => group.key === key)?.venue
      setLocated(span ? key : null)
      projectHover.pin(span ? key : null)
      if (!span) return
      const el = scrollRef.current
      const fit = fitSpan(0, daysBetween(span.start, span.end) + 1, (el?.clientWidth ?? viewport.width) - LEFT_W, zoom)
      if (fit.zoom !== zoom) setZoom(fit.zoom)
      showSpan(span)
    },
    // The list keeps its order, so what comes before and after the project is still there to see.
    findProject: (key) => {
      const index = projectIndex(items, key)
      if (index < 0) return setNotice('Prosjektet er ikke blant radene som vises. Se filteret, eller åpne nivåene over det.')
      scrollRef.current?.scrollTo({ top: topHeight + rowTops[index] - pinnedHeight - headOver(index), behavior: 'smooth' })
    },
    toggleGroup,
    toggleEntry,
    proposePlan,
    addRow: (projectName, projectNo) => setDialog({ projectName, projectNo }),
    editRow: (row) => setDialog({ row }),
    removeRow: (row) => {
      if (confirm(`Slette raden ${rowTitle(row)}?`)) removeAllocation(row.id)
    },
    clearRow: (row) => {
      const cleared = sumValues(row.fte)
      for (const date of Object.keys(row.fte)) setRowFte(row, date, null)
      setNotice(cleared ? `Tømte raden: ${formatFte(cleared, 1)} FTE-dager` : 'Raden var tom')
    },
  })

  // ---- the two modes ---------------------------------------------------------------------------
  const zoomTo = useModeZoom(zoomFrom, zoomStep, setHeld, placeLeft)
  /** The days between the label column and the right edge of the grid, in pixels. */
  const dayRoom = () => (scrollRef.current?.clientWidth ?? viewport.width) - LEFT_W
  const projectSpan = (key: string): DaySpan | undefined => allGroups.find((group) => group.key === key)?.venue ?? undefined
  /** Zooms Bemanning to a span of days: as wide as fills the grid, the first day at the left edge (R18). */
  const fitBemanning = (span: DaySpan) => {
    const width = fitWidth(spanDays(span), dayRoom())
    zoomTo({ colW: width, left: daysBetween(range.start, span.start) }, () => setBemanningW(width))
  }
  // The two modes have rows of their own, so each keeps how far down it was scrolled: the plan is found
  // again where it was left, and the people do not open partway down their list. The plan is put back
  // once more when the zoom out has ended, should the list have changed on the way. The modes also have
  // blocks of different heights above the rows; they are measured here and now, or the first frame would
  // draw the rows of the other mode's place under the other mode's heights.
  const scrolledTo = useRef<Record<PlanMode, number>>({ plan: 0, bemanning: 0 })
  const [zoomsEnded, setZoomsEnded] = useState(0)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = scrolledTo.current[shown]
    measure()
  }, [shown, zoomsEnded, scrollRef, measure])
  const switchMode = (next: PlanMode) => {
    const el = scrollRef.current
    if (next === planMode || !el) return
    scrolledTo.current[shown] = el.scrollTop
    setPlanMode(next)
    setSelection(null)
    setCellMenu(null)
    setTool('select')
    // A project kept lit in the plan would leave every other project's bars faint in Bemanning, where Escape does not let go of it.
    setLocated(null)
    projectHover.pin(null)
    // The two modes share the timeline: the day at the left edge of the one is the day at the left edge
    // of the other. Only the width of a day differs, and Bemanning keeps the width it was last seen in.
    const left = Math.floor(zoomFrom().left + 0.01)
    setHeldWindow({ start: dates[left], end: dates[Math.min(dates.length - 1, left + Math.floor(dayRoom() / ZOOM_WIDTHS[zoom]))] })
    if (next === 'bemanning') {
      const stored = loadPref<DaySpan | null>('bemanningRange', null)
      const width = fitWidth(stored && stored.start <= stored.end ? spanDays(stored) : BEMANNING_DAYS, dayRoom())
      zoomTo({ colW: width, left }, () => {
        setBemanningW(width)
        setShown('bemanning')
        setHeldWindow(null)
      })
    } else {
      setShown('plan')
      zoomTo({ colW: ZOOM_WIDTHS[zoom], left }, () => {
        setHeldWindow(null)
        setZoomsEnded((n) => n + 1)
      })
    }
  }
  // The days seen in Bemanning are remembered, for the next time it is opened.
  // Whole days, so the same days give the same width when they are opened again.
  const seenFrom = Math.min(dates.length - 1, Math.round(viewport.left / colW))
  const seenTo = Math.min(dates.length - 1, seenFrom + Math.max(1, Math.round((viewport.width - LEFT_W) / colW)) - 1)
  const bemanningSpan = shown === 'bemanning' && held === null && dates.length ? `${dates[seenFrom]}|${dates[seenTo]}` : null
  useEffect(() => {
    if (!bemanningSpan) return
    const [start, end] = bemanningSpan.split('|')
    // Not while the grid has no width of its own (a page opened out of sight): the days it seems to show then are not the days seen.
    const timer = setTimeout(() => {
      const el = scrollRef.current
      if (el && el.clientWidth > LEFT_W) savePref('bemanningRange', { start, end })
    }, 300)
    return () => clearTimeout(timer)
  }, [bemanningSpan, scrollRef])
  useLayoutEffect(() => {
    if (shown === 'bemanning') placeLeft(daysBetween(range.start, openSpan.start), bemanningW)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const bemanning = shown === 'bemanning'
  // The projects as Bemanning lists them: their days in the hall calendar, from the first phase to the last.
  const projectSpans = useMemo<ProjectSpan[]>(() => {
    if (!bemanning) return []
    // As in the hall calendar: only the projects with a booking in one of the halls it shows. And only
    // those with FTE planned somewhere in the period: a project without has nothing to staff.
    const shownHalls = new Set(halls)
    return allGroups.flatMap((group): ProjectSpan[] => {
      const days = [...(phasesOfProject.get(group.key) ?? [])].sort((a, b) => a[0].localeCompare(b[0]))
      if (![...group.daily.values()].some((fte) => fte > 0)) return []
      if (!days.length || ![...(hallsOf.get(group.key) ?? [])].some((hall) => shownHalls.has(hall))) return []
      const start = daysBetween(range.start, days[0][0])
      const event = days.find(([, phase]) => phase === 'event')
      return [{ key: group.key, name: group.projectName, halls: [...(hallsOf.get(group.key) ?? [])].sort((a, b) => a.localeCompare(b, 'nb', { numeric: true })), start, end: daysBetween(range.start, days[days.length - 1][0]), eventStart: event ? daysBetween(range.start, event[0]) : start }]
    })
  }, [bemanning, hallsOf, allGroups, phasesOfProject, range.start, halls])
  const focusDay = useCallback((date: ISODate) => setPlanningFocus({ date }), [setPlanningFocus])
  const showDate = useCallback((date: ISODate) => scrollToDate(date, 1), [scrollToDate])

  // ---- tools: keys and modifiers --------------------------------------------------------------
  // Escape first closes the menu, then puts the pencil or the eraser away, then lets go of the project that is lit.
  const modifier = useToolKeys({
    blocked: !!dialog || bemanning,
    onTool: setTool,
    onEscape: () => {
      if (cellMenu) setCellMenu(null)
      else if (tool !== 'select') setTool('select')
      else if (located) {
        setLocated(null)
        projectHover.pin(null)
      }
    },
  })
  const activeTool = stroke ?? modifier ?? tool
  // The details panel is memoized; these keep their identity so it is not drawn again on every scroll frame.
  const spreadRow = useCallback((row: AllocationRow) => proposePlan([row], true), [proposePlan])
  const closeInspector = useCallback(() => setInspectorOpen(false), [setInspectorOpen])

  // What one line of cells is told about the selection: plain values, so only the lines it touches are drawn again.
  const ghostClass = stroke === 'eraser' ? 'erasing' : 'drawn'
  const editOf = (lane: number): CellEdit => {
    const selected = !!selectionRange && lane >= selectionRange.lane0 && lane <= selectionRange.lane1
    const focused = selection?.focus.lane === lane
    return {
      selFrom: selected ? selectionRange.col0 : -1,
      selTo: selected ? selectionRange.col1 : -1,
      focusCol: focused ? selection.focus.col : -1,
      // The fill handle sits on the last cell of the selection, as in Excel.
      handle: selected && tool === 'select' && draft === null && selectionRange.lane1 === lane,
      draft: focused ? draft : null,
      ghost: ghost.get(lane),
      ghostClass,
    }
  }

  // ---- selection details for the status bar -------------------------------------------------
  const focusInfo = ((): FocusInfo | null => {
    if (!selection) return null
    const date = dates[selection.focus.col]
    const { row: r, node } = allocLanes[selection.focus.lane] ?? {}
    if (node) return { title: `${node.label} · fordeles på ${node.rows.length} ${node.rows.length === 1 ? 'rad' : 'rader'}`, date, value: node.daily.get(date), note: '', rowId: null }
    if (!r) return null
    return { title: rowTitle(r), date, value: r.fte[date], note: r.notes[date] ?? '', rowId: isSuggestedRow(r) ? null : r.id }
  })()
  const selectionSum = (() => {
    if (!selection) return null
    const { lane0, lane1, col0, col1 } = rangeOf(selection)
    if (lane0 === lane1 && col0 === col1) return null
    let sum = 0
    for (let lane = lane0; lane <= lane1; lane++) for (let col = col0; col <= col1; col++) sum += getValue(lane, dates[col]) ?? 0
    return sum
  })()

  const shownRowCount = shownGroups.reduce((sum, group) => sum + group.rows.length, 0)
  const menuRow = cellMenu ? rows.find((row) => row.id === cellMenu.rowId) : undefined
  const menuWindow = menuRow ? windowOf(menuRow) : undefined
  const menuWindowEnd = menuWindow?.size ? [...menuWindow].sort().at(-1) : undefined

  const selectedDate = selection ? dates[selection.focus.col] : undefined
  if (selectedDate && selectedDate !== planningFocus?.date) setPlanningFocus({ date: selectedDate })
  const activeDate = selectedDate ?? planningFocus?.date

  const groupRow = (item: GroupItem) => {
    // A level takes numbers only in entry mode; otherwise it has no place among the lanes.
    const lane = item.entry ? laneOfRow.get(`level:${item.node.key}`)! : -1
    return <GroupRow key={`g:${item.node.key}`} item={item} lane={lane} phases={item.node.project ? phasesOfProject.get(item.node.project.key) : undefined} cols={cols} actions={actions} {...(item.entry ? editOf(lane) : NO_EDIT)} />
  }

  // ---- render ---------------------------------------------------------------------------------
  const places = <AreaMenu tree={hallTree} statuses={statuses} filter={hallFilter} onChange={setHallFilter} />
  return (
    <div className={`kalender ${bemanning ? 'bemanning-mode' : activeTool === 'select' ? '' : activeTool}`}>
      <BemanningScope active={bemanning} dates={dates} cols={cols} viewport={viewport} scrollRef={scrollRef} focusDate={planningFocus?.date} onFocusDate={focusDay} projects={projectSpans} planned={planned} phases={phasesOfProject} chosenProject={filter.project} unfolded={unfolded} setUnfolded={setUnfolded} onShowDate={showDate} blockNames={blockNames} overtimeLimit={overtimeLimit}>
      {bemanning ? <BemanningHead places={places} /> : <KalenderHead
        places={places}
        projects={shownGroups.length}
        rows={shownRowCount}
        overbooked={overbooked.size}
        inspectorOpen={inspectorOpen}
        onInspector={setInspectorOpen}
        onNewRow={() => setDialog(allGroups.filter((g) => g.key === filter.project).map((g) => ({ projectName: g.projectName, projectNo: g.projectNo }))[0] ?? {})}
        onPropose={() => proposePlan(shownGroups.flatMap((group) => group.rows), false)}
      />}

      <div className="kal-work">
      <div className="grid-scroll" ref={scrollRef} tabIndex={0} onScroll={onScroll} onMouseOver={projectHover.onMouseOver} onMouseLeave={projectHover.onMouseLeave} onKeyDown={onKeyDown} onCopy={onCopy} onPaste={onPaste}>
        <div className="grid-canvas" style={{ width: daysWide(dates.length, LEFT_W) }}>
          {/* The date header is always pinned. The block under it stays pinned too, like Excel's frozen rows. Where it leaves the rows no room it moves up by what does not fit, and the hall calendar stays where it is, over the staffing lines. */}
          <div className="grid-head" ref={headRef}>
            <HeadRows cols={cols} zoom={zoomOf(colW)} overbooked={overbooked} activeDate={activeDate} onDate={bemanning ? focusDay : undefined} />
            {bemanning && <i className="bm-crosshair" />}
          </div>
          {/* A click on an event's bar is caught here, so the lines of the hall calendar are given no handler and are not drawn again for it. */}
          <div
            className="grid-top"
            ref={topRef}
            style={{ top: headHeight - tucked }}
            onClick={(e) => {
              const project = e.target instanceof Element ? e.target.closest<HTMLElement>('.hall-bar[data-project]')?.dataset.project : undefined
              if (project) actions.findProject(project)
            }}
          >
            {bemanning ? <BemanningTop /> : <>
            <HallSection open={hallsOpen} onOpen={setHallsOpen} empty={ws.venue.length === 0} pinTop={headHeight} halls={halls} hallCount={hallCount} hallBars={hallBars} hallLabels={hallLabels} hallProjectLists={hallProjectLists} cols={cols} />
            <StaffingSection
              open={staffingOpen}
              onOpen={setStaffingOpen}
              detailsOpen={capacityOpen}
              onDetailsOpen={setCapacityOpen}
              cols={cols}
              need={need}
              capacity={capacity}
              fromBemanning={fromBemanning}
              settings={settings}
              heat={heat}
              heatMax={heatMax}
            />
            </>}
          </div>

          {/* The planning tools sit right above the rows they work on. They stay put when the days scroll sideways, and follow the top block when part of it gives way. */}
          <div className="grid-tools" ref={toolsRef} style={{ top: pinnedHeight - barHeight }}>
            {bemanning ? (
              <BemanningToolbar
                width={viewport.width}
                mode={planMode}
                onMode={switchMode}
                projects={projects}
                project={filter.project}
                onProject={(key) => {
                  setFilter({ ...filter, project: key })
                  const span = projectSpan(key)
                  if (span) fitBemanning(span)
                }}
                onToday={() => scrollToDate(today, 1)}
                onFit={() => {
                  const span = projectSpan(filter.project)
                  if (span) fitBemanning(span)
                }}
              />
            ) : (
            <KalenderBar
              width={viewport.width}
              hints={hints}
              mode={planMode}
              onMode={switchMode}
              tool={tool}
              onTool={setTool}
              filter={filter}
              onFilter={setFilter}
              projects={projects}
              competences={competences}
              onlyInView={onlyInView}
              onOnlyInView={setOnlyInView}
              grouping={grouping}
              onGrouping={(next) => {
                // Lanes are positions in the list, so a selection would land on other rows after regrouping.
                setSelection(null)
                setGrouping(next)
              }}
              folded={collapsed.size > 0}
              onFold={() => setCollapsed(collapsed.size ? new Set() : new Set(items.flatMap((i) => (i.kind === 'group' && i.node.depth === 0 ? [i.node.key] : []))))}
              start={range.start}
              end={range.end}
              onToday={() => scrollToDate(today)}
              onDate={(date) => scrollToDate(date, 2)}
              zoom={zoom}
              onZoom={setZoom}
            />
            )}
            {bemanning ? <PeopleHeading /> : <PlanningHeading />}
          </div>

          {bemanning && <PeopleRows onOpenPersonell={onOpenPersonell} />}
          {!bemanning && <div className="grid-alloc" style={{ height: rowTops[items.length] }}>
            <div style={{ height: rowTops[r0] }} />
            {items.slice(r0, r1).map((item) => {
              if (item.kind === 'row') {
                const lane = laneOfRow.get(item.row.id)!
                return <AllocRow key={item.row.id} item={item} lane={lane} window={windowOf(item.row)} rowDimensions={rowDimensions} cols={cols} actions={actions} {...editOf(lane)} />
              }
              // A top level's line is drawn in its section below; here it only takes up its place.
              if (item.node.depth === 0) return <div key={`g:${item.node.key}`} style={{ height: TOP_ROW_H }} />
              return groupRow(item)
            })}
            {allSections
              .filter((section) => section.end > r0 && section.index < r1)
              .map(({ item, index, end }) => (
                <div key={`s:${item.node.key}`} className="level-section" style={{ top: rowTops[index], height: rowTops[end] - rowTops[index] }}>
                  <div className="level-stick" style={{ top: pinnedHeight }}>
                    {groupRow(item)}
                  </div>
                </div>
              ))}
          </div>}
          {!bemanning && items.length === 0 && (
            <p className="empty-rows">{rows.length === 0
                ? 'Ingen planleggingsrader ennå. Bruk «+ Ny rad» for å legge til en rad for et prosjekt.'
                : inViewOnly
                  ? 'Ingen prosjekter har planlagte dager i denne perioden. Slå av «Bare prosjekter i visningen» under Filter for å se alle.'
                  : 'Ingen rader passer filteret.'}</p>
          )}
        </div>
      </div>
      {bemanning && <PersonPanel />}
      {inspectorOpen && !bemanning && <RowInspector details={details} need={need} capacity={capacity} settings={settings} onEdit={actions.editRow} onSpread={spreadRow} onClose={closeInspector} />}
      </div>

      {cellMenu && menuRow && (
        <CellMenu
          x={cellMenu.x}
          y={cellMenu.y}
          row={menuRow}
          date={dates[cellMenu.col]}
          remaining={(rowTotals(demandIndex, menuRow, settings).requiredFte ?? 0) - sumValues(menuRow.fte)}
          windowEnd={menuWindowEnd}
          stored={!isSuggestedRow(menuRow)}
          onClose={() => setCellMenu(null)}
          onSpread={() => proposePlan([menuRow], true)}
          onSpreadFromHere={() => {
            const lane = laneOfRow.get(menuRow.id)
            if (lane !== undefined && menuWindowEnd) drawDemand({ anchor: { lane, col: cellMenu.col }, focus: { lane, col: daysBetween(range.start, menuWindowEnd) } })
          }}
          onClearCell={() => setRowFte(menuRow, dates[cellMenu.col], null)}
          onClearRow={() => actions.clearRow(menuRow)}
          onDetails={() => setInspectorOpen(true)}
          onEdit={() => actions.editRow(menuRow)}
          onRemove={() => actions.removeRow(menuRow)}
        />
      )}

      {bemanning && <BemanningOverlays />}
      {!bemanning && <StatusBar focus={focusInfo} selectionSum={selectionSum} notice={notice} progress={progress} onSaveNote={setAllocationNote} />}

      {dialog && (
        <AllocationDialog
          row={dialog.row}
          projectName={dialog.projectName}
          projectNo={dialog.projectNo}
          projects={projectOptions}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            // If the row's project is not in the list as filtered now, switch to showing that project.
            const key = allGroups.find((group) => group.key === projectKey(saved) || group.projectName === saved.projectName)?.key ?? projectKey(saved)
            const shown = items.some((item) => (item.kind === 'group' ? item.node.project?.key : item.project.key) === key)
            if (!shown) setFilter({ ...EMPTY_FILTER, project: key })
            // Open every level above the row.
            setCollapsed((prev) => {
              const next = new Set(prev)
              for (const level of pathKeys(saved, key, grouping)) next.delete(level)
              return next
            })
            setPendingFocus(saved.id)
          }}
        />
      )}
      </BemanningScope>
    </div>
  )
}
