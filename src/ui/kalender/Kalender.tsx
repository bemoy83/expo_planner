import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { capacityForDate, dailyNeed, formatFte, planningSettings, requiredHours, rowTotals, sumValues } from '../../domain/calc'
import { calendarRange } from '../../domain/calendarRange'
import { dateRange, daysBetween, todayIso, type ISODate } from '../../domain/dates'
import { decimalText } from '../../domain/numbers'
import { dayType } from '../../domain/holidays'
import type { AllocationRow } from '../../domain/types'
import { hallNames, projectPhases } from '../../domain/venue'
import { locateRows } from '../../domain/locations'
import { absenceLine, overtimeLine } from '../../domain/staffing'
import { isSuggestedRow, rowScope, suggestedRows } from '../../domain/plannedRows'
import { spread } from '../../domain/spread'
import { buildWindows, windowFor } from '../../domain/windows'
import { usePref, usePrefSet } from '../../store/prefs'
import { useWorkspace } from '../../store/workspaceStore'
import { AllocationDialog } from '../AllocationDialog'
import { CellMenu } from './CellMenu'
import { fitSpan, LEFT_W, OVERSCAN_COLS, OVERSCAN_ROWS, parseCellInput, ROW_H, TOP_ROW_H, ZOOM_WIDTHS, type Zoom } from './layout'
import { AllocRow, GroupRow, HeadRows } from './GridRows'
import type { AllocLane, CapLane, CellEdit, Columns, GridActions } from './gridTypes'
import { heatScale } from './heat'
import { rowTitle } from './labels'
import { KalenderBar, KalenderHead } from './KalenderBar'
import { RowInspector, type RowDetails } from './RowInspector'
import { buildGroups, cleanGrouping, DEFAULT_GROUPING, EMPTY_FILTER, filterGroups, groupItems, inWindow, pathKeys, projectKey, type Dimension, type RowFilter } from './rows'
import { StatusBar, type FocusInfo } from './StatusBar'
import { HallSection, PlanningHeading, StaffingSection } from './TopSections'
import { useGridDrag } from './useGridDrag'
import { useGridViewport } from './useGridViewport'
import { useHallCalendar } from './useHallCalendar'
import { useProjectHover } from './useProjectHover'
import { useStableActions } from './useStableActions'
import { useToolKeys } from './useToolKeys'
import { copyText, fillNotice, fillPreview, fillProgress, ghostCells, overbookedDays, pasteCells, pencilNotice, pencilProgress, pencilStroke, proposal, proposalNotice } from './strokes'
import { followLanes, rangeOf, type Cell, type LaneKey, type Fill, type FillCell, type Section, type Selection, type Tool } from './selection'

/** A line that takes no numbers has nothing selected on it. */
const NO_EDIT: CellEdit = { selFrom: -1, selTo: -1, focusCol: -1, handle: false, draft: null, ghost: undefined, ghostClass: 'drawn' }

/**
 * `hints` is the setting «Hjelpetekster»: with it off, pointing at a project lights nothing.
 * `heat` is the setting «Varmekart for avvik»: the Avvik line as coloured tiles.
 */
export function Kalender({ hints = true, heat = true }: { hints?: boolean; heat?: boolean }) {
  const { workspace, demandIndex, locatedDemand, setAllocationFte, setSuggestedFte, setCapacityValue, setAllocationNote, removeAllocation } = useWorkspace()
  const ws = workspace!
  const settings = useMemo(() => planningSettings(ws), [ws.settings, ws.persons]) // eslint-disable-line react-hooks/exhaustive-deps
  // The staffing lines the planner types in, and after them what comes from Bemanning: absence and overtime, which are worked out.
  const absence = useMemo(() => absenceLine(ws), [ws.persons, ws.unavailability, ws.settings]) // eslint-disable-line react-hooks/exhaustive-deps
  const overtime = useMemo(() => overtimeLine(ws), [ws.persons, ws.unavailability, ws.assignments, ws.settings]) // eslint-disable-line react-hooks/exhaustive-deps
  const capacity = useMemo(() => [...ws.capacity, absence, overtime], [ws.capacity, absence, overtime])
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
  const [allHalls, setAllHalls] = usePref('allHalls', false)
  const [staffingOpen, setStaffingOpen] = usePref('staffingOpen', true)
  const [capacityOpen, setCapacityOpen] = usePref('capacityOpen', false)
  const [onlyInView, setOnlyInView] = usePref('onlyInView', true)
  const [selection, setSelection] = useState<Selection | null>(null)
  // With the pencil, drawing across days on a row shares out what is left of its demand over those days.
  // With the eraser, drawing across cells clears them.
  const [tool, setTool] = useState<Tool>('select')
  const [notice, setNotice] = useState<string | null>(null)
  const dragging = useRef<Section | null>(null)
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

  const colW = ZOOM_WIDTHS[zoom]
  // The period follows the hall bookings, see `calendarRange`.
  const range = useMemo(() => calendarRange({ venue: ws.venue, allocations: ws.allocations, capacity: ws.capacity }, todayIso()), [ws.venue, ws.allocations, ws.capacity])
  const dates = useMemo(() => dateRange(range.start, range.end), [range.start, range.end])
  const today = todayIso()

  const projectHover = useProjectHover(hints)
  // The day in focus is shared with Bemanning (`planningFocus`): the Kalender opens on it, and the day of the cell the planner stands on becomes it.
  const [planningFocus, setPlanningFocus] = usePref<{ date: ISODate } | null>('planningFocus', null)
  const closeCellMenu = useCallback(() => setCellMenu(null), [])
  const clearSelection = useCallback(() => setSelection(null), [])
  const { scrollRef, topRef, toolsRef, viewport, topHeight, barHeight, topPinned, onScroll, scrollToDate, showSpan } = useGridViewport({
    start: range.start,
    end: range.end,
    openOn: planningFocus?.date ?? today,
    zoom,
    colW,
    onScrolled: closeCellMenu,
    onPeriodMoved: clearSelection,
  })

  // ---- derived data -------------------------------------------------------------------------
  const { shownVenue, events, projectOf, hallProjectLists, hallLabels, hallBars, halls, hallCount } = useHallCalendar(ws, range.start, zoom === 'wide', allHalls)

  const need = useMemo(() => dailyNeed(ws.allocations), [ws.allocations])
  const winFrom = dates[Math.max(0, Math.floor(viewport.left / colW))]
  const winTo = dates[Math.max(0, Math.min(dates.length - 1, Math.floor((viewport.left + viewport.width - LEFT_W) / colW)))]
  const inViewOnly = onlyInView && !filter.project && !filter.search
  // Demand taken into the plan shows as rows by itself; they become ordinary rows once FTE is typed in.
  const rows = useMemo(() => {
    const placed = locateRows(ws.allocations, hallNames(ws.venue), ws.hallAliases)
    return [...placed, ...suggestedRows(locatedDemand, placed)]
  }, [ws.allocations, ws.venue, ws.hallAliases, locatedDemand])
  const filtered = useMemo(() => filterGroups(rows, events, demandIndex, settings, filter, grouping), [rows, events, demandIndex, settings, filter, grouping])
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
  // The details panel keeps its row when the selection is cleared or moves to a level or a staffing line.
  const focusRowId = selection?.section === 'alloc' ? (allocLanes[selection.focus.lane]?.row?.id ?? null) : null
  if (focusRowId && focusRowId !== detailId) setDetailId(focusRowId)
  const capLanes = useMemo<CapLane[]>(
    () =>
      ws.capacity.flatMap((line) =>
        line.group === 'overtime'
          ? [
              { line, field: 'values' as const, label: `${line.label} (personer)` },
              { line, field: 'hours' as const, label: `${line.label} (timer)` },
            ]
          : [{ line, field: 'values' as const, label: line.label }],
      ),
    [ws.capacity],
  )
  const allGroups = useMemo(() => buildGroups(rows, events, demandIndex, settings), [rows, events, demandIndex, settings])
  const projects = useMemo(
    () => allGroups.map((group) => [group.key, group.projectName] as [string, string]).sort((a, b) => a[1].localeCompare(b[1], 'nb')),
    [allGroups],
  )
  // The days each row can be worked on: its project's build-up or tear-down days in its hall.
  // The same lookup gives the hall phase of each day of a project, for the strip on its line.
  const [windows, phasesOfProject] = useMemo(() => [buildWindows(shownVenue, projectOf), projectPhases(shownVenue, projectOf)] as const, [shownVenue, projectOf])
  const projectOfRow = useMemo(() => new Map(allGroups.flatMap((group) => group.rows.map((row) => [row.id, group.key] as const))), [allGroups])
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
  const c0 = Math.max(0, Math.floor(viewport.left / colW) - OVERSCAN_COLS)
  const c1 = Math.min(dates.length - 1, Math.ceil((viewport.left + viewport.width - LEFT_W) / colW) + OVERSCAN_COLS)
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
  const r0 = Math.max(0, rowAt(viewport.top - (topPinned ? 0 : topHeight)) - OVERSCAN_ROWS)
  const r1 = Math.min(items.length, rowAt(viewport.top + viewport.height - topHeight) + 1 + OVERSCAN_ROWS)

  const ensureVisible = useCallback(
    (section: Section, cell: Cell) => {
      const el = scrollRef.current
      if (!el) return
      const x = cell.col * colW
      if (x < el.scrollLeft) el.scrollLeft = x
      else if (x + colW > el.scrollLeft + el.clientWidth - LEFT_W) el.scrollLeft = x + colW - (el.clientWidth - LEFT_W)
      if (section === 'alloc') {
        const index = allocLanes[cell.lane]?.index ?? 0
        const y = rowTops[index] ?? 0
        const bottom = rowTops[index + 1] ?? y + ROW_H
        // What stays pinned over the rows: the whole top block, or only the planning bar when the block is too tall to pin.
        const pinned = topPinned ? topHeight : barHeight
        if (topHeight + y < el.scrollTop + pinned) el.scrollTop = topHeight + y - pinned
        else if (topHeight + bottom > el.scrollTop + el.clientHeight) el.scrollTop = topHeight + bottom - el.clientHeight
      }
    },
    [scrollRef, colW, allocLanes, rowTops, topHeight, barHeight, topPinned],
  )

  // Select the first visible day of a row that was just added or edited, once it is among the lines.
  const pendingLane = pendingFocus ? laneOfRow.get(pendingFocus) : undefined
  if (pendingLane !== undefined) {
    const cell = { lane: pendingLane, col: firstVisibleCol }
    setPendingFocus(null)
    setSelection({ section: 'alloc', anchor: cell, focus: cell })
    setReveal({ cell, takeKeys: true })
  }
  useEffect(() => {
    if (!reveal) return
    ensureVisible('alloc', reveal.cell)
    if (reveal.takeKeys) scrollRef.current?.focus({ preventScroll: true })
  }, [reveal]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- cell values ----------------------------------------------------------------------------
  const laneCount = (section: Section) => (section === 'alloc' ? allocLanes.length : capLanes.length)

  const getValue = useCallback(
    (section: Section, lane: number, date: ISODate): number | undefined => {
      if (section === 'alloc') {
        const { row, node } = allocLanes[lane] ?? {}
        // A level's value is a sum of rounded parts; keep float noise out of the editor and the clipboard.
        const sum = node?.daily.get(date)
        return node ? (sum === undefined ? undefined : Math.round(sum * 100) / 100) : row?.fte[date]
      }
      const cap = capLanes[lane]
      return cap?.line[cap.field]?.[date]
    },
    [allocLanes, capLanes],
  )

  const setRowFte = useCallback(
    (row: AllocationRow, date: ISODate, value: number | null) => (isSuggestedRow(row) ? setSuggestedFte(row, date, value) : setAllocationFte(row.id, date, value)),
    [setSuggestedFte, setAllocationFte],
  )

  const setValue = useCallback(
    (section: Section, lane: number, date: ISODate, value: number | null) => {
      if (section === 'alloc') {
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
      } else {
        const cap = capLanes[lane]
        if (cap) setCapacityValue(cap.line.id, date, cap.field, value)
      }
    },
    [allocLanes, capLanes, setRowFte, demandIndex, setCapacityValue],
  )

  const fillSelection = useCallback(
    (value: number | null) => {
      if (!selection) return
      const { lane0, lane1, col0, col1 } = rangeOf(selection)
      for (let lane = lane0; lane <= lane1; lane++) for (let col = col0; col <= col1; col++) setValue(selection.section, lane, dates[col], value)
    },
    [selection, setValue, dates],
  )

  const move = useCallback(
    (dLane: number, dCol: number, extend = false) => {
      setSelection((sel) => {
        if (!sel) return sel
        const lanes = laneCount(sel.section)
        const focus = {
          lane: Math.min(lanes - 1, Math.max(0, sel.focus.lane + dLane)),
          col: Math.min(dates.length - 1, Math.max(0, sel.focus.col + dCol)),
        }
        ensureVisible(sel.section, focus)
        return { section: sel.section, anchor: extend ? sel.anchor : focus, focus }
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

  const select = (section: Section, cell: Cell, extend: boolean) => {
    if (draft !== null) commitDraft()
    setNotice(null)
    setSelection((sel) => (extend && sel?.section === section ? { ...sel, focus: cell } : { section, anchor: cell, focus: cell }))
    scrollRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  const strokeFor = useCallback((sel: Selection | null) => pencilStroke(sel, dates, allocLanes, demandIndex, settings), [dates, allocLanes, demandIndex, settings])

  const drawDemand = useCallback((over: Selection | null = selectionRef.current) => {
    const drawn = strokeFor(over)
    if (!drawn) return
    for (const { lane, parts } of drawn.lanes) drawn.target.forEach((date, i) => setValue('alloc', lane, date, parts[i] || null))
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
    if (!sel || sel.section !== 'alloc') return
    const { lane0, lane1, col0, col1 } = rangeOf(sel)
    let erased = 0
    for (let lane = lane0; lane <= lane1; lane++)
      for (let col = col0; col <= col1; col++) {
        const value = getValue('alloc', lane, dates[col])
        if (value === undefined) continue
        erased += value
        setValue('alloc', lane, dates[col], null)
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
    for (const cell of cells) setValue(cell.section, cell.lane, cell.date, cell.value)
    // The block is now what was dragged out, so it can be dragged on from there.
    setSelection({ section: done.section, anchor: { lane: done.lane0, col: done.col0 }, focus: { lane: done.lane1, col: done.toCol } })
    setNotice(fillNotice(done, cells))
  }, [setValue])

  // What the cells of each line would hold if the stroke or the drag ended now, keyed by section and lane.
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
      const current = getValue(selection.section, selection.focus.lane, dates[selection.focus.col])
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
    for (const cell of pasteCells(textData, selection, dates, laneCount(selection.section))) setValue(selection.section, cell.lane, cell.date, cell.value)
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
  const cols = useMemo<Columns>(() => ({ dates: visibleDates, c0, colW, classes: dayClasses }), [visibleDates, c0, colW, dayClasses])

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
    cellDown: (section, lane, col, e) => {
      e.preventDefault()
      const drags = e.button === 0 && !(e.target instanceof HTMLInputElement)
      const plans = drags && section === 'alloc'
      // Alt clears and Shift shares out demand for this one stroke. With «Velg», Shift still extends the
      // selection on a click; the stroke starts once the mouse is dragged on.
      const erases = plans && e.altKey
      const extends_ = e.shiftKey && !erases && (!plans || tool === 'select')
      select(section, { lane, col }, extends_)
      if (!drags) return
      dragging.current = section
      spring.current = plans && extends_ ? { lane, col } : null
      const started = !plans || spring.current ? null : erases ? 'eraser' : e.shiftKey ? 'pencil' : tool === 'select' ? null : tool
      strokeRef.current = started
      setStroke(started)
    },
    cellEnter: (section, lane, col) => {
      if (fillRef.current?.section === section) setFill((f) => f && { ...f, toCol: Math.max(f.col0, col) })
      else if (dragging.current === section && spring.current) {
        const anchor = spring.current
        spring.current = null
        strokeRef.current = 'pencil'
        setStroke('pencil')
        setSelection({ section, anchor, focus: { lane, col } })
      } else if (dragging.current === section) setSelection((sel) => (sel?.section === section ? { ...sel, focus: { lane, col } } : sel))
    },
    cellMenu: (lane, col, e) => {
      const row = allocLanes[lane]?.row
      if (!row) return
      e.preventDefault()
      // The press that asked for the menu is no drag.
      dragging.current = null
      strokeRef.current = null
      spring.current = null
      setStroke(null)
      select('alloc', { lane, col }, false)
      setCellMenu({ x: e.clientX, y: e.clientY, rowId: row.id, col })
    },
    selectRow: (lane) => select('alloc', { lane, col: selection?.section === 'alloc' ? selection.focus.col : firstVisibleCol }, false),
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
    fillDown: (section, e) => {
      e.preventDefault()
      e.stopPropagation()
      if (!selectionRange) return
      const started: Fill = { section, ...selectionRange, toCol: selectionRange.col1, stretch: e.altKey }
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

  // ---- tools: keys and modifiers --------------------------------------------------------------
  // Escape first closes the menu, then puts the pencil or the eraser away, then lets go of the project that is lit.
  const modifier = useToolKeys({
    blocked: !!dialog,
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
  const editOf = (section: Section, lane: number): CellEdit => {
    const selected = selection?.section === section && !!selectionRange && lane >= selectionRange.lane0 && lane <= selectionRange.lane1
    const focused = selection?.section === section && selection.focus.lane === lane
    return {
      selFrom: selected ? selectionRange.col0 : -1,
      selTo: selected ? selectionRange.col1 : -1,
      focusCol: focused ? selection.focus.col : -1,
      // The fill handle sits on the last cell of the selection, as in Excel.
      handle: selected && tool === 'select' && draft === null && selectionRange.lane1 === lane,
      draft: focused ? draft : null,
      ghost: ghost.get(`${section}|${lane}`),
      ghostClass,
    }
  }

  // ---- selection details for the status bar -------------------------------------------------
  const focusInfo = ((): FocusInfo | null => {
    if (!selection) return null
    const date = dates[selection.focus.col]
    if (selection.section === 'alloc') {
      const { row: r, node } = allocLanes[selection.focus.lane] ?? {}
      if (node) return { title: `${node.label} · fordeles på ${node.rows.length} ${node.rows.length === 1 ? 'rad' : 'rader'}`, date, value: node.daily.get(date), note: '', rowId: null }
      if (!r) return null
      return { title: rowTitle(r), date, value: r.fte[date], note: r.notes[date] ?? '', rowId: isSuggestedRow(r) ? null : r.id }
    }
    const cap = capLanes[selection.focus.lane]
    if (!cap) return null
    return { title: cap.label, date, value: cap.line[cap.field]?.[date], note: cap.line.notes[date] ?? '', rowId: null }
  })()
  const selectionSum = (() => {
    if (!selection) return null
    const { lane0, lane1, col0, col1 } = rangeOf(selection)
    if (lane0 === lane1 && col0 === col1) return null
    let sum = 0
    for (let lane = lane0; lane <= lane1; lane++) for (let col = col0; col <= col1; col++) sum += getValue(selection.section, lane, dates[col]) ?? 0
    return sum
  })()

  const shownRowCount = shownGroups.reduce((sum, group) => sum + group.rows.length, 0)
  const menuRow = cellMenu ? rows.find((row) => row.id === cellMenu.rowId) : undefined
  const menuWindow = menuRow ? windowOf(menuRow) : undefined
  const menuWindowEnd = menuWindow?.size ? [...menuWindow].sort().at(-1) : undefined

  const selectedDate = selection ? dates[selection.focus.col] : undefined
  if (selectedDate && selectedDate !== planningFocus?.date) setPlanningFocus({ date: selectedDate })
  const activeDate = selectedDate ?? planningFocus?.date

  // ---- render ---------------------------------------------------------------------------------
  return (
    <div className={`kalender ${activeTool === 'select' ? '' : activeTool}`}>
      <KalenderHead
        projects={shownGroups.length}
        rows={shownRowCount}
        overbooked={overbooked.size}
        inspectorOpen={inspectorOpen}
        onInspector={setInspectorOpen}
        onNewRow={() => setDialog(allGroups.filter((g) => g.key === filter.project).map((g) => ({ projectName: g.projectName, projectNo: g.projectNo }))[0] ?? {})}
        onPropose={() => proposePlan(shownGroups.flatMap((group) => group.rows), false)}
      />

      <div className="kal-work">
      <div className="grid-scroll" ref={scrollRef} tabIndex={0} onScroll={onScroll} onMouseOver={projectHover.onMouseOver} onMouseLeave={projectHover.onMouseLeave} onKeyDown={onKeyDown} onCopy={onCopy} onPaste={onPaste}>
        <div className="grid-canvas" style={{ width: LEFT_W + dates.length * colW }}>
          {/* The top block stays pinned like Excel's frozen rows, unless it would cover most of the screen. */}
          <div className={`grid-top ${topPinned ? 'pinned' : ''}`} ref={topRef}>
            <HeadRows cols={cols} zoom={zoom} overbooked={overbooked} activeDate={activeDate} />

            <HallSection open={hallsOpen} onOpen={setHallsOpen} allHalls={allHalls} onAllHalls={setAllHalls} empty={ws.venue.length === 0} halls={halls} hallCount={hallCount} hallBars={hallBars} hallLabels={hallLabels} hallProjectLists={hallProjectLists} cols={cols} />
            <StaffingSection
              open={staffingOpen}
              onOpen={(open) => {
                // A selection in the staffing lines has nowhere to be once they are folded away.
                if (!open && selection?.section === 'cap') setSelection(null)
                setStaffingOpen(open)
              }}
              detailsOpen={capacityOpen}
              onDetailsOpen={setCapacityOpen}
              capLanes={capLanes}
              editOf={(lane) => editOf('cap', lane)}
              cols={cols}
              actions={actions}
              need={need}
              capacity={capacity}
              fromBemanning={fromBemanning}
              settings={settings}
              heat={heat}
              heatMax={heatMax}
            />
          </div>

          {/* The planning tools sit right above the rows they work on. They stay put when the days scroll sideways, and stay pinned even when the top block is too tall to be. */}
          <div className="grid-tools" ref={toolsRef} style={{ top: topPinned ? topHeight - barHeight : 0 }}>
            <KalenderBar
              width={viewport.width}
              hints={hints}
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
            <PlanningHeading />
          </div>

          <div className="grid-alloc" style={{ height: rowTops[items.length] }}>
            <div style={{ height: rowTops[r0] }} />
            {items.slice(r0, r1).map((item) => {
              if (item.kind === 'row') {
                const lane = laneOfRow.get(item.row.id)!
                return <AllocRow key={item.row.id} item={item} lane={lane} window={windowOf(item.row)} rowDimensions={rowDimensions} cols={cols} actions={actions} {...editOf('alloc', lane)} />
              }
              // A level takes numbers only in entry mode; otherwise it has no place among the lanes.
              const lane = item.entry ? laneOfRow.get(`level:${item.node.key}`)! : -1
              return <GroupRow key={`g:${item.node.key}`} item={item} lane={lane} phases={item.node.project ? phasesOfProject.get(item.node.project.key) : undefined} cols={cols} actions={actions} {...(item.entry ? editOf('alloc', lane) : NO_EDIT)} />
            })}
          </div>
          {items.length === 0 && (
            <p className="empty-rows">{rows.length === 0
                ? 'Ingen planleggingsrader ennå. Bruk «+ Ny rad» for å legge til en rad for et prosjekt.'
                : inViewOnly
                  ? 'Ingen prosjekter har planlagte dager i denne perioden. Slå av «Bare prosjekter i visningen» under Filter for å se alle.'
                  : 'Ingen rader passer filteret.'}</p>
          )}
        </div>
      </div>
      {inspectorOpen && <RowInspector details={details} need={need} capacity={capacity} settings={settings} onEdit={actions.editRow} onSpread={spreadRow} onClose={closeInspector} />}
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
            if (lane !== undefined && menuWindowEnd) drawDemand({ section: 'alloc', anchor: { lane, col: cellMenu.col }, focus: { lane, col: daysBetween(range.start, menuWindowEnd) } })
          }}
          onClearCell={() => setRowFte(menuRow, dates[cellMenu.col], null)}
          onClearRow={() => actions.clearRow(menuRow)}
          onDetails={() => setInspectorOpen(true)}
          onEdit={() => actions.editRow(menuRow)}
          onRemove={() => actions.removeRow(menuRow)}
        />
      )}

      <StatusBar focus={focusInfo} selectionSum={selectionSum} notice={notice} progress={progress} onSaveNote={setAllocationNote} />

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
    </div>
  )
}
