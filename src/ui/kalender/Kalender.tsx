import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { capacityForDate, dailyNeed, formatFte, requiredHours, rowTotals, sumValues } from '../../domain/calc'
import { calendarRange } from '../../domain/calendarRange'
import { dateRange, daysBetween, type ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { VENUE_PHASES, type AllocationRow, type VenueBooking } from '../../domain/types'
import { buildHallCalendar, hallNames, hallRuns, hallSegments, PHASE_CODES, PHASE_LABELS, projectPhases } from '../../domain/venue'
import { locateRows } from '../../domain/locations'
import { isSuggestedRow, suggestedRows } from '../../domain/plannedRows'
import { fillAcross, shareOverDays, spread } from '../../domain/spread'
import { eventKey, venueEvents } from '../../domain/projects'
import { anchorDate, visibleVenue } from '../../domain/venueImport'
import { buildWindows, windowFor } from '../../domain/windows'
import { usePref, usePrefSet } from '../../store/prefs'
import { useWorkspace } from '../../store/workspaceStore'
import { AllocationDialog } from '../AllocationDialog'
import { Menu, Segmented, UndoRedoButtons } from '../common'
import { LEFT_W, OVERSCAN_COLS, OVERSCAN_ROWS, parseCellInput, ROW_H, TOP_ROW_H, ZOOM_WIDTHS, type Zoom } from './layout'
import { AllocRow, BaseCrewRow, CapRow, GroupRow, HallRow, HeadRows, SumRows, type HallLabelRun } from './GridRows'
import type { CapLane, CellEdit, Columns, GridActions } from './gridTypes'
import { GroupingBar } from './GroupingBar'
import { fmtDate, rowTitle } from './labels'
import { NoteEditor } from './parts'
import { buildGroups, cleanGrouping, DEFAULT_GROUPING, DIMENSION_LABELS, EMPTY_FILTER, filterGroups, groupItems, inWindow, pathKeys, projectKey, type Dimension, type GroupNode, type RowFilter } from './rows'
import { useStableActions } from './useStableActions'
import { rangeOf, type Cell, type Fill, type FillCell, type Section, type Selection } from './selection'
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Eraser, Filter, MousePointer2, Pencil, Plus } from 'lucide-react'

/** A line of the planning grid that takes FTE: a row, or a level whose number is shared out to its rows. */
interface AllocLane {
  /** Position in the list of grid items. */
  index: number
  row?: AllocationRow
  node?: GroupNode
}
/** A line that takes no numbers has nothing selected on it. */
const NO_EDIT: CellEdit = { selFrom: -1, selTo: -1, focusCol: -1, handle: false, draft: null, ghost: undefined, ghostClass: 'drawn' }

const todayIso = (): ISODate => new Date().toISOString().slice(0, 10)

export function Kalender() {
  const { workspace, demandIndex, locatedDemand, setAllocationFte, setSuggestedFte, setCapacityValue, setAllocationNote, removeAllocation } = useWorkspace()
  const ws = workspace!
  const { settings } = ws

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
  const [tool, setTool] = useState<'select' | 'pencil' | 'eraser'>('select')
  const [notice, setNotice] = useState<string | null>(null)
  const dragging = useRef<Section | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [fill, setFill] = useState<Fill | null>(null)
  const fillRef = useRef<Fill | null>(null)
  const fillCellsRef = useRef<FillCell[]>([])
  const selectionRef = useRef<Selection | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ row?: AllocationRow; projectName?: string; projectNo?: string } | null>(null)
  const [viewport, setViewport] = useState({ left: 0, top: 0, width: 1200, height: 800 })
  const [topHeight, setTopHeight] = useState(0)
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)

  const colW = ZOOM_WIDTHS[zoom]
  // The period follows the hall bookings, see `calendarRange`.
  const range = useMemo(() => calendarRange({ venue: ws.venue, allocations: ws.allocations, capacity: ws.capacity }, todayIso()), [ws.venue, ws.allocations, ws.capacity])
  const dates = useMemo(() => dateRange(range.start, range.end), [range.start, range.end])
  const today = todayIso()

  const scrollRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)

  // ---- derived data -------------------------------------------------------------------------
  const shownVenue = useMemo(() => visibleVenue(ws.venue, ws.hiddenVenue), [ws.venue, ws.hiddenVenue])
  const hallCalendar = useMemo(() => buildHallCalendar(shownVenue), [shownVenue])
  // Each event's name sits on the first day of the arrangement itself in the hall and scrolls with it.
  const hallLabels = useMemo(() => {
    const labels = new Map<string, HallLabelRun[]>()
    for (const [hall, days] of hallCalendar) {
      const all = hallRuns(days)
      // A name may run on past its own days, but not into the next event in the hall.
      const runs = all.map((run, i) => ({
        eventName: run.eventName,
        col: daysBetween(range.start, run.anchor),
        span: daysBetween(run.anchor, run.end) + 1,
        room: all[i + 1] ? daysBetween(run.anchor, all[i + 1].start) : Infinity,
      }))
      labels.set(hall, runs)
    }
    return labels
  }, [hallCalendar, range.start])
  // Each hall's bookings as bars. Wide columns have room to show both events on a day the hall is shared.
  const splitShared = zoom === 'wide'
  const hallBars = useMemo(() => new Map([...hallCalendar].map(([hall, days]) => [hall, hallSegments(days, range.start, splitShared)])), [hallCalendar, range.start, splitShared])
  const halls = useMemo(() => {
    const names = hallNames(ws.venue)
    if (allHalls) return names
    // Exhibition halls: most of their bookings have build-up or tear-down periods.
    return names.filter((hall) => {
      const bookings = shownVenue.filter((b) => b.hall === hall)
      if (!bookings.length) return false
      return bookings.filter((b) => b.phases.assembly || b.phases.dismantle).length / bookings.length >= 0.5
    })
  }, [ws.venue, shownVenue, allHalls])
  const hallCount = useMemo(() => hallNames(ws.venue).length, [ws.venue])

  const need = useMemo(() => dailyNeed(ws.allocations), [ws.allocations])
  const winFrom = dates[Math.max(0, Math.floor(viewport.left / colW))]
  const winTo = dates[Math.max(0, Math.min(dates.length - 1, Math.floor((viewport.left + viewport.width - LEFT_W) / colW)))]
  const inViewOnly = onlyInView && !filter.project && !filter.search
  // Projects are the events in the Venyou calendar that have at least one hall booking shown.
  const events = useMemo(() => venueEvents(shownVenue, ws.eventLinks, ws.projects), [shownVenue, ws.eventLinks, ws.projects])
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
  const [windows, phasesOfProject] = useMemo(() => {
    const projectOfEvent = new Map(events.map((event) => [event.key, projectKey({ projectNo: event.projectNo, projectName: event.name })]))
    const projectOf = (booking: VenueBooking) => projectOfEvent.get(eventKey(booking.eventName, anchorDate(booking))) ?? null
    return [buildWindows(shownVenue, projectOf), projectPhases(shownVenue, projectOf)] as const
  }, [shownVenue, events])
  const projectOfRow = useMemo(() => new Map(allGroups.flatMap((group) => group.rows.map((row) => [row.id, group.key] as const))), [allGroups])
  const windowOf = useCallback((row: AllocationRow) => windowFor(windows, projectOfRow.get(row.id) ?? projectKey(row), row.hall, row.phase), [windows, projectOfRow])

  const projectOptions = useMemo(() => allGroups.map((group) => ({ name: group.projectName, projectNo: group.projectNo })), [allGroups])
  // What a row's own line says: the properties that are not a level above it. The phase always shows as a badge.
  const rowDimensions = useMemo(() => (['project', 'competence', 'hall', 'avdeling'] as Dimension[]).filter((d) => !grouping.includes(d)), [grouping])
  const competences = useMemo(() => [...new Set(rows.map((r) => r.competence).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb')), [rows])

  // ---- viewport and virtualization -----------------------------------------------------------
  // Scroll events already arrive once per frame, so the viewport can be read directly.
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (el) setViewport({ left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight })
  }, [])

  useLayoutEffect(() => {
    const el = scrollRef.current
    const top = topRef.current
    if (!el || !top) return
    const observer = new ResizeObserver(() => {
      setViewport({ left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight })
      setTopHeight(top.offsetHeight)
    })
    observer.observe(el)
    observer.observe(top)
    return () => observer.disconnect()
  }, [])

  const scrollToDate = useCallback(
    (date: ISODate, offsetDays = 7) => {
      const el = scrollRef.current
      if (!el) return
      el.scrollLeft = Math.max(0, (daysBetween(range.start, date) - offsetDays) * colW)
      onScroll()
    },
    [range.start, colW, onScroll],
  )

  // Start near today, once.
  const didInitialScroll = useRef(false)
  useLayoutEffect(() => {
    if (didInitialScroll.current) return
    didInitialScroll.current = true
    scrollToDate(today >= range.start && today <= range.end ? today : range.start)
  }, [scrollToDate, today, range.start, range.end])

  // When the period grows at the start (new hall bookings, for example), stay on the same dates.
  const prevStart = useRef(range.start)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && prevStart.current !== range.start) {
      el.scrollLeft = Math.max(0, el.scrollLeft + daysBetween(range.start, prevStart.current) * colW)
      setSelection(null)
      onScroll()
    }
    prevStart.current = range.start
  }, [range.start, colW, onScroll])

  // Keep the same date at the left edge when zooming.
  const prevColW = useRef(colW)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && prevColW.current !== colW) el.scrollLeft = (el.scrollLeft / prevColW.current) * colW
    prevColW.current = colW
  }, [colW])

  const c0 = Math.max(0, Math.floor(viewport.left / colW) - OVERSCAN_COLS)
  const c1 = Math.min(dates.length - 1, Math.ceil((viewport.left + viewport.width - LEFT_W) / colW) + OVERSCAN_COLS)
  const visibleDates = useMemo(() => dates.slice(c0, c1 + 1), [dates, c0, c1])
  const firstVisibleCol = Math.min(dates.length - 1, Math.ceil(viewport.left / colW))
  const topPinned = topHeight < viewport.height * 0.65
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
        if (y < el.scrollTop) el.scrollTop = topPinned ? y : topHeight + y
        else if (topHeight + bottom > el.scrollTop + el.clientHeight) el.scrollTop = topHeight + bottom - el.clientHeight
      }
    },
    [colW, allocLanes, rowTops, topHeight, topPinned],
  )

  // Select the first visible day of a row that was just added or edited.
  useEffect(() => {
    if (!pendingFocus) return
    const lane = laneOfRow.get(pendingFocus)
    if (lane === undefined) return
    const cell = { lane, col: firstVisibleCol }
    setSelection({ section: 'alloc', anchor: cell, focus: cell })
    ensureVisible('alloc', cell)
    setPendingFocus(null)
    scrollRef.current?.focus({ preventScroll: true })
  }, [pendingFocus, laneOfRow, firstVisibleCol, ensureVisible])

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
    [draft, selection, fillSelection],
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

  /**
   * The pencil: for every line in the selection, what is left of its demand after the days outside the
   * drawn span is shared over the working days in the span, in whole people with the decimals on the last
   * day. Weekends and holidays inside the
   * span are left as they are, unless the span has no working day at all.
   */
  const strokeFor = useCallback(
    (sel: Selection | null) => {
      if (!sel || sel.section !== 'alloc') return null
      const { lane0, lane1, col0, col1 } = rangeOf(sel)
      const span = dates.slice(col0, col1 + 1)
      const workdays = span.filter((date) => dayType(date) === 'arbeidsdag')
      const target = workdays.length ? workdays : span
      const lanes: { lane: number; parts: number[] }[] = []
      let withoutDemand = 0
      for (let lane = lane0; lane <= lane1; lane++) {
        const { row, node } = allocLanes[lane] ?? {}
        if (!row && !node) continue
        const required = node ? node.totals.requiredFte : (rowTotals(demandIndex, row!, settings).requiredFte ?? 0)
        const planned = node ? node.totals.plannedFte : sumValues(row!.fte)
        const onTarget = target.reduce((sum, date) => sum + ((node ? node.daily.get(date) : row!.fte[date]) ?? 0), 0)
        const remaining = required - (planned - onTarget)
        const parts = shareOverDays(remaining, target.length)
        if (parts.length) lanes.push({ lane, parts })
        else withoutDemand += 1
      }
      const perDay = target.map((_, i) => lanes.reduce((sum, l) => sum + l.parts[i], 0))
      return { target, lanes, withoutDemand, shared: perDay.reduce((a, b) => a + b, 0), perDay }
    },
    [dates, allocLanes, demandIndex, settings],
  )

  const drawDemand = useCallback(() => {
    const stroke = strokeFor(selectionRef.current)
    if (!stroke) return
    for (const { lane, parts } of stroke.lanes) stroke.target.forEach((date, i) => setValue('alloc', lane, date, parts[i] || null))
    const { target, withoutDemand, shared } = stroke
    const days = `${target.length} ${target.length === 1 ? 'dag' : 'dager'}`
    setNotice(
      shared
        ? `Fordelte ${formatFte(shared, 1)} FTE-dager på ${days}${withoutDemand ? `. ${withoutDemand} ${withoutDemand === 1 ? 'linje' : 'linjer'} hadde ikke behov igjen.` : ''}`
        : 'Ikke noe behov igjen å fordele her. Dagene utenfor det du tegnet dekker allerede behovet, eller raden har ikke behov.',
    )
  }, [strokeFor, setValue])

  /**
   * A draft plan: each row's demand shared over the working days of its window, as a pencil stroke over
   * the whole window would. For several rows at once only rows without any FTE are filled, so nothing
   * the planner has placed is touched; for a single row the days in its window are replaced.
   */
  const proposePlan = useCallback(
    (list: AllocationRow[], replace: boolean) => {
      let done = 0
      let hadPlan = 0
      let noWindow = 0
      let noDemand = 0
      for (const row of list) {
        const window = windowOf(row)
        if (!window?.size) {
          noWindow += 1
          continue
        }
        if (!replace && Object.keys(row.fte).length) {
          hadPlan += 1
          continue
        }
        const days = [...window].sort()
        const workdays = days.filter((date) => dayType(date) === 'arbeidsdag')
        const target = workdays.length ? workdays : days
        const onTarget = target.reduce((sum, date) => sum + (row.fte[date] ?? 0), 0)
        const parts = shareOverDays((rowTotals(demandIndex, row, settings).requiredFte ?? 0) - (sumValues(row.fte) - onTarget), target.length)
        if (!parts.length) {
          noDemand += 1
          continue
        }
        target.forEach((date, i) => {
          if (parts[i] || row.fte[date] !== undefined) setRowFte(row, date, parts[i] || null)
        })
        done += 1
      }
      const rows = (n: number) => `${n} ${n === 1 ? 'rad' : 'rader'}`
      setNotice(
        [
          done ? `Foreslo plan for ${rows(done)}` : 'Ingen rader fikk forslag',
          hadPlan ? `${rows(hadPlan)} hadde plan fra før og er ikke rørt` : '',
          noWindow ? `${rows(noWindow)} har ingen monterings- eller demonteringsdager i hallkalenderen` : '',
          noDemand ? `${rows(noDemand)} har ikke behov igjen` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      )
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
  const preview = useMemo(() => (drawing && tool === 'pencil' ? strokeFor(selection) : null), [drawing, tool, strokeFor, selection])
  // What a drag of the fill handle would do, line by line: copy the block over the new days, or stretch its sum.
  const fillCells = useMemo<FillCell[]>(() => {
    if (!fill) return []
    const cells: FillCell[] = []
    const end = Math.max(fill.col1, fill.toCol)
    const span = dates.slice(fill.col0, end + 1)
    const workdays = span.map((date) => dayType(date) === 'arbeidsdag')
    for (let lane = fill.lane0; lane <= fill.lane1; lane++) {
      const result = fillAcross({
        values: span.map((date) => getValue(fill.section, lane, date)),
        workdays,
        sourceLength: fill.col1 - fill.col0 + 1,
        length: fill.toCol - fill.col0 + 1,
        mode: fill.stretch ? 'stretch' : 'copy',
      })
      result.forEach((value, i) => value !== undefined && cells.push({ section: fill.section, lane, date: span[i], value }))
    }
    return cells
  }, [fill, dates, getValue])
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
    const filled = new Set(cells.filter((cell) => cell.value !== null).map((cell) => cell.date)).size
    const cleared = new Set(cells.filter((cell) => cell.value === null).map((cell) => cell.date)).size
    const days = (n: number) => `${n} ${n === 1 ? 'dag' : 'dager'}`
    setNotice(!cells.length ? null : done.stretch ? `Strakk over ${days(filled)}` : filled ? `Fylte ${days(filled)}` : `Tømte ${days(cleared)}`)
  }, [setValue])

  // What the cells of each line would hold if the stroke or the drag ended now, keyed by section and lane.
  const ghost = useMemo(() => {
    const lanes = new Map<string, Map<ISODate, number>>()
    const set = (section: Section, lane: number, date: ISODate, value: number) => {
      const key = `${section}|${lane}`
      let cells = lanes.get(key)
      if (!cells) lanes.set(key, (cells = new Map()))
      cells.set(date, value)
    }
    for (const { lane, parts } of preview?.lanes ?? []) preview!.target.forEach((date, i) => set('alloc', lane, date, parts[i]))
    // An eraser stroke shows the cells it is about to clear as empty.
    if (drawing && tool === 'eraser' && selection?.section === 'alloc') {
      const { lane0, lane1, col0, col1 } = rangeOf(selection)
      for (let lane = lane0; lane <= lane1; lane++) for (let col = col0; col <= col1; col++) set('alloc', lane, dates[col], 0)
    }
    for (const cell of fillCells) set(cell.section, cell.lane, cell.date, cell.value ?? 0)
    return lanes
  }, [preview, drawing, tool, selection, dates, fillCells])

  // A drag ends wherever the mouse is released. While it lasts, the grid follows the mouse past its edges.
  // The listeners are attached once and read what they need from here, so a drag is not disturbed when
  // the rows or the tool change under it.
  const dragEnv = useRef({ tool, drawDemand, eraseDrawn, commitFill, colW, dayCount: dates.length })
  useEffect(() => {
    dragEnv.current = { tool, drawDemand, eraseDrawn, commitFill, colW, dayCount: dates.length }
  })
  useEffect(() => {
    let mouseX: number | null = null
    let timer: ReturnType<typeof setInterval> | undefined
    const follow = () => {
      const el = scrollRef.current
      if (!el || mouseX === null || !(dragging.current || fillRef.current)) return
      const { colW, dayCount } = dragEnv.current
      const rect = el.getBoundingClientRect()
      const step = mouseX > rect.right - 24 ? colW : mouseX < rect.left + LEFT_W + 24 ? -colW : 0
      if (!step) return
      el.scrollLeft += step
      // No cell is entered while the grid moves under a still mouse, so the selection follows the scroll.
      const col = Math.max(0, Math.min(dayCount - 1, Math.floor((Math.min(Math.max(mouseX, rect.left + LEFT_W), rect.right - 1) - rect.left - LEFT_W + el.scrollLeft) / colW)))
      if (fillRef.current) setFill((f) => f && { ...f, toCol: Math.max(f.col0, col) })
      else setSelection((sel) => (sel && sel.focus.col !== col ? { ...sel, focus: { ...sel.focus, col } } : sel))
    }
    const rest = () => {
      mouseX = null
      clearInterval(timer)
      timer = undefined
    }
    const setStretch = (stretch: boolean) => {
      if (fillRef.current && fillRef.current.stretch !== stretch) setFill((f) => f && { ...f, stretch })
    }
    const onMove = (e: MouseEvent) => {
      mouseX = dragging.current || fillRef.current ? e.clientX : null
      // The timer runs only while something is being dragged.
      if (mouseX !== null && timer === undefined) timer = setInterval(follow, 60)
      setStretch(e.altKey)
    }
    // Alt can be pressed or let go while the mouse rests.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && fillRef.current) {
        e.preventDefault()
        setStretch(e.type === 'keydown')
      }
    }
    const onUp = () => {
      rest()
      const { tool, drawDemand, eraseDrawn, commitFill } = dragEnv.current
      if (fillRef.current) {
        commitFill()
        return
      }
      const section = dragging.current
      dragging.current = null
      setDrawing(false)
      if (section === 'alloc' && tool === 'pencil') drawDemand()
      if (section === 'alloc' && tool === 'eraser') eraseDrawn()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      rest()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [])

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
      setDraft(current === undefined ? '' : String(current).replace('.', ','))
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      fillSelection(null)
    } else if (e.key === 'Escape') {
      setSelection(null)
    } else if (/^[0-9,.-]$/.test(e.key) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      setDraft(e.key)
    }
  }

  const onCopy = (e: React.ClipboardEvent) => {
    if (!selection || draft !== null) return
    const { lane0, lane1, col0, col1 } = rangeOf(selection)
    const lines: string[] = []
    for (let lane = lane0; lane <= lane1; lane++) {
      const cells: string[] = []
      for (let col = col0; col <= col1; col++) cells.push(String(getValue(selection.section, lane, dates[col]) ?? '').replace('.', ','))
      lines.push(cells.join('\t'))
    }
    e.clipboardData.setData('text/plain', lines.join('\n'))
    e.preventDefault()
  }

  const onPaste = (e: React.ClipboardEvent) => {
    if (!selection || draft !== null) return
    const textData = e.clipboardData.getData('text/plain')
    if (!textData) return
    e.preventDefault()
    const { lane0, col0 } = rangeOf(selection)
    const grid = textData.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((line) => line.split('\t'))
    const lanes = laneCount(selection.section)
    grid.forEach((cells, dl) =>
      cells.forEach((raw, dc) => {
        const lane = lane0 + dl
        const col = col0 + dc
        const value = parseCellInput(raw)
        if (lane < lanes && col < dates.length && value !== undefined) setValue(selection.section, lane, dates[col], value)
      }),
    )
  }

  const selectionRange = selection ? rangeOf(selection) : null

  // ---- rendering helpers --------------------------------------------------------------------
  // Days planned above the available crew are tinted down the whole grid. A pencil stroke in progress counts,
  // so the clash shows while it is being drawn.
  const overbooked = useMemo(() => {
    const drawn = new Map<ISODate, number>()
    for (const { lane, parts } of preview?.lanes ?? []) {
      const { row, node } = allocLanes[lane] ?? {}
      preview!.target.forEach((date, i) => drawn.set(date, (drawn.get(date) ?? 0) + parts[i] - ((node ? node.daily.get(date) : row?.fte[date]) ?? 0)))
    }
    for (const cell of fillCells) if (cell.section === 'alloc') drawn.set(cell.date, (drawn.get(cell.date) ?? 0) + (cell.value ?? 0) - (getValue('alloc', cell.lane, cell.date) ?? 0))
    const days = new Map<ISODate, { need: number; available: number }>()
    for (const date of new Set([...need.keys(), ...drawn.keys()])) {
      const planned = (need.get(date) ?? 0) + (drawn.get(date) ?? 0)
      const { available } = capacityForDate(date, ws.capacity, settings)
      if (planned > available + 0.05) days.set(date, { need: planned, available })
    }
    return days
  }, [need, preview, fillCells, getValue, allocLanes, ws.capacity, settings])

  // Every cell of a day shares these classes; they are worked out once per day, not once per cell.
  const dayClasses = useMemo(() => {
    const classes = new Map<ISODate, string>()
    for (const date of visibleDates) {
      const type = dayType(date)
      classes.set(date, `day ${type !== 'arbeidsdag' ? type : ''} ${date === today ? 'today' : ''} ${date.endsWith('-01') ? 'month-start' : ''} ${overbooked.has(date) ? 'overbooked' : ''}`)
    }
    return classes
  }, [visibleDates, today, overbooked])
  const cols = useMemo<Columns>(() => ({ dates: visibleDates, c0, colW, classes: dayClasses }), [visibleDates, c0, colW, dayClasses])

  // What the drag of the fill handle is doing, for the status bar.
  const fillInfo = (() => {
    if (!fill) return ''
    const perDay = new Map<ISODate, number>()
    for (const cell of fillCells) if (cell.value !== null) perDay.set(cell.date, (perDay.get(cell.date) ?? 0) + cell.value)
    const cleared = new Set(fillCells.filter((cell) => cell.value === null).map((cell) => cell.date)).size
    const days = (n: number) => `${n} ${n === 1 ? 'dag' : 'dager'}`
    if (fill.stretch) return perDay.size ? `Strekker: opptil ${formatFte(Math.max(...perDay.values()), 1)} FTE per dag over ${days(perDay.size)}` : 'Strekker: ingenting å fordele'
    if (perDay.size) return `Fyller ${days(perDay.size)} · hold Alt for å strekke i stedet`
    return cleared ? `Tømmer ${days(cleared)}` : 'Dra sidelengs for å fylle · hold Alt for å strekke'
  })()

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
      select(section, { lane, col }, e.shiftKey)
      if (e.button === 0 && !(e.target instanceof HTMLInputElement)) {
        dragging.current = section
        setDrawing(section === 'alloc' && tool !== 'select')
      }
    },
    cellEnter: (section, lane, col) => {
      if (fillRef.current?.section === section) setFill((f) => f && { ...f, toCol: Math.max(f.col0, col) })
      else if (dragging.current === section) setSelection((sel) => (sel?.section === section ? { ...sel, focus: { lane, col } } : sel))
    },
    editCell: (value) => setDraft(value === undefined ? '' : String(value).replace('.', ',')),
    setDraft,
    commitDraft: () => commitDraft(),
    draftKey: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitDraft(() => move(e.shiftKey ? -1 : 1, 0))
      } else if (e.key === 'Tab') {
        e.preventDefault()
        commitDraft(() => move(0, e.shiftKey ? -1 : 1))
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
    toggleGroup,
    toggleEntry,
    proposePlan,
    addRow: (projectName, projectNo) => setDialog({ projectName, projectNo }),
    editRow: (row) => setDialog({ row }),
    removeRow: (row) => {
      if (confirm(`Slette raden ${rowTitle(row)}?`)) removeAllocation(row.id)
    },
  })

  // What one line of cells is told about the selection: plain values, so only the lines it touches are drawn again.
  const ghostClass = tool === 'eraser' ? 'erasing' : 'drawn'
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
  const focusInfo = (() => {
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
  // The choices in the filter menu that narrow the list; «Bare prosjekter i visningen» is the normal state.
  const activeFilters = [filter.project, filter.competence, filter.onlyWithRows, filter.onlyUncovered].filter(Boolean).length

  // ---- render ---------------------------------------------------------------------------------
  return (
    <div className={`kalender ${tool === 'select' ? '' : tool}`}>
      <div className="page-head">
        <h2>Kalender</h2>
        <span className="page-meta">
          {[
            `${shownGroups.length} ${shownGroups.length === 1 ? 'prosjekt' : 'prosjekter'}`,
            `${shownRowCount} ${shownRowCount === 1 ? 'rad' : 'rader'}`,
            overbooked.size ? `${overbooked.size} ${overbooked.size === 1 ? 'dag' : 'dager'} med underdekning` : 'Ingen underdekning',
          ].join(' · ')}
        </span>
        <button className="ghost" onClick={() => setDialog(allGroups.filter((g) => g.key === filter.project).map((g) => ({ projectName: g.projectName, projectNo: g.projectNo }))[0] ?? {})}>
          <Plus size={14} aria-hidden /> Ny rad
        </button>
        <button
          className="primary"
          disabled={shownRowCount === 0}
          title="Foreslå plan: fordel behovet til radene i prosjektene som vises på monterings- og demonteringsdagene i hallene. Rader som allerede har FTE røres ikke."
          onClick={() => proposePlan(shownGroups.flatMap((group) => group.rows), false)}
        >
          ✦ Foreslå plan
        </button>
      </div>

      <div className="toolbar zones">
        <div className="zone">
          <UndoRedoButtons />
          <Segmented
            label="Verktøy"
            value={tool}
            onChange={setTool}
            options={[
              {
                value: 'select',
                label: (
                  <>
                    <MousePointer2 size={14} aria-hidden /> Velg
                  </>
                ), title: 'Velg celler og skriv FTE i dem.' },
              {
                value: 'pencil',
                label: (
                  <>
                    <Pencil size={14} aria-hidden /> Fordel behov
                  </>
                ),
                title: 'Tegn over dager på en rad: det som gjenstår av radens behov fordeles på arbeidsdagene du tegner over, i hele FTE med desimalene på siste dag.',
              },
              {
                value: 'eraser',
                label: (
                  <>
                    <Eraser size={14} aria-hidden /> Tøm
                  </>
                ), title: 'Tegn over celler på planleggingsradene for å tømme dem. På et nivå i ✎-modus tømmes dagene for radene under.' },
            ]}
          />
        </div>
        <span className="zone-divider" />
        <div className="zone">
          <Menu
            label={
              <>
                <Filter size={14} aria-hidden /> Filter{activeFilters > 0 && <span className="menu-count">{activeFilters}</span>}
              </>
            }
            title="Velg hvilke prosjekter og rader som vises"
          >
            {() => (
              <div className="filter-panel">
                <label>
                  Prosjekt
                  <select value={filter.project} onChange={(e) => setFilter({ ...filter, project: e.target.value })}>
                    <option value="">Alle prosjekter ({projects.length})</option>
                    {projects.map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Kompetanse
                  <select value={filter.competence} onChange={(e) => setFilter({ ...filter, competence: e.target.value })}>
                    <option value="">Alle</option>
                    {competences.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="check" title="Skjul prosjekter som ikke har noen planleggingsrader ennå">
                  <input type="checkbox" checked={!!filter.onlyWithRows} onChange={(e) => setFilter({ ...filter, onlyWithRows: e.target.checked })} />
                  Skjul tomme
                </label>
                <label className="check" title="Skjul rader der planen dekker behovet, så det som gjenstår står igjen som en arbeidsliste">
                  <input type="checkbox" checked={!!filter.onlyUncovered} onChange={(e) => setFilter({ ...filter, onlyUncovered: e.target.checked })} />
                  Bare det som gjenstår
                </label>
                <label className="check" title="Vis bare prosjekter som foregår eller har planlagte dager i datoene som vises">
                  <input type="checkbox" checked={onlyInView} onChange={(e) => setOnlyInView(e.target.checked)} />
                  Bare prosjekter i visningen
                </label>
                {(activeFilters > 0 || filter.search) && (
                  <button className="link" onClick={() => setFilter(EMPTY_FILTER)}>
                    Nullstill
                  </button>
                )}
              </div>
            )}
          </Menu>
          <input className="search" type="search" placeholder="Søk i rader" value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} />
          <GroupingBar
            grouping={grouping}
            onChange={(next) => {
              // Lanes are positions in the list, so a selection would land on other rows after regrouping.
              setSelection(null)
              setGrouping(next)
            }}
          />
          <button
            className="ghost"
            title={collapsed.size ? 'Vis alle nivåer' : 'Fold sammen til øverste nivå'}
            onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(items.flatMap((i) => (i.kind === 'group' && i.node.depth === 0 ? [i.node.key] : []))))}
          >
            {collapsed.size ? <ChevronsUpDown size={14} aria-hidden /> : <ChevronsDownUp size={14} aria-hidden />}
            {collapsed.size ? 'Utvid alle' : 'Fold sammen'}
          </button>
        </div>
        <div className="zone zone-end">
          <button className="ghost" onClick={() => scrollToDate(today)}>
            I dag
          </button>
          <input type="date" aria-label="Gå til dato" min={range.start} max={range.end} onChange={(e) => e.target.value && scrollToDate(e.target.value, 2)} />
          <Segmented
            label="Kolonnebredde"
            value={zoom}
            onChange={setZoom}
            options={[
              { value: 'compact', label: 'S', title: 'Smale kolonner' },
              { value: 'normal', label: 'M', title: 'Normale kolonner' },
              { value: 'wide', label: 'L', title: 'Brede kolonner' },
            ]}
          />
        </div>
      </div>

      <div className="grid-scroll" ref={scrollRef} tabIndex={0} onScroll={onScroll} onKeyDown={onKeyDown} onCopy={onCopy} onPaste={onPaste}>
        <div className="grid-canvas" style={{ width: LEFT_W + dates.length * colW }}>
          {/* The top block stays pinned like Excel's frozen rows, unless it would cover most of the screen. */}
          <div className={`grid-top ${topPinned ? 'pinned' : ''}`} ref={topRef}>
            <HeadRows cols={cols} zoom={zoom} overbooked={overbooked} activeDate={selection ? dates[selection.focus.col] : undefined} />

            {/* The hall calendar is framed by a hairline above and below, so it still reads as a line of its own when folded. Open, its heading with the legend is a line of its own too. */}
            <div className={`top-section ${hallsOpen ? 'open' : ''}`}>
              <div className="section-head" style={{ width: LEFT_W }}>
                <button className="twisty" aria-expanded={hallsOpen} aria-label={hallsOpen ? 'Skjul hallkalenderen' : 'Vis hallkalenderen'} onClick={() => setHallsOpen(!hallsOpen)}>
                  {hallsOpen ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                </button>
                Haller
                {!hallsOpen && <span className="section-meta">{halls.length} skjult</span>}
                {hallsOpen && (
                  <button className="link small" onClick={() => setAllHalls(!allHalls)}>
                    {allHalls ? 'Bare messehaller' : `Vis alle (${hallCount})`}
                  </button>
                )}
                {hallsOpen && (
                  <span className="legend">
                    {VENUE_PHASES.map((phase) => (
                      <i key={phase} className={`ph-${phase}`} title={PHASE_LABELS[phase]}>
                        {PHASE_CODES[phase]}
                      </i>
                    ))}
                  </span>
                )}
              </div>
              {hallsOpen && ws.venue.length === 0 && (
                <div className="section-hint" style={{ width: LEFT_W }}>
                  Ingen hallbookinger. Les inn <code>location_format</code> med «Les inn haller» øverst til høyre.
                </div>
              )}
              {hallsOpen && halls.map((hall) => <HallRow key={`hall:${hall}`} hall={hall} bars={hallBars.get(hall)} runs={hallLabels.get(hall)} cols={cols} zoom={zoom} />)}
            </div>

            {/* Bemanning is framed the same way; its heading always has the Avvik line under it. */}
            <div className="top-section staffing open">
              <div className="section-head" style={{ width: LEFT_W }}>
                <button
                  className="twisty"
                  aria-expanded={staffingOpen}
                  aria-label={staffingOpen ? 'Skjul bemanningen' : 'Vis bemanningen'}
                  onClick={() => {
                    // A selection in the staffing lines has nowhere to be once they are folded away.
                    if (staffingOpen && selection?.section === 'cap') setSelection(null)
                    setStaffingOpen(!staffingOpen)
                  }}
                >
                  {staffingOpen ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                </button>
                Bemanning <span className="muted">(FTE)</span>
                {staffingOpen ? (
                  <button className="link small" onClick={() => setCapacityOpen(!capacityOpen)}>
                    {capacityOpen ? 'Skjul detaljer' : 'Vis detaljer'}
                  </button>
                ) : (
                  <span className="section-meta">bare avvik vises</span>
                )}
              </div>
              {staffingOpen && capacityOpen && (
                <>
                  <BaseCrewRow cols={cols} baseCrew={settings.baseCrew} />
                  {capLanes.map((cap, lane) => (
                    <CapRow key={`cap:${cap.line.id}:${cap.field}`} cap={cap} lane={lane} cols={cols} actions={actions} {...editOf('cap', lane)} />
                  ))}
                </>
              )}
              <SumRows cols={cols} need={need} capacity={ws.capacity} settings={settings} deviationOnly={!staffingOpen} />
            </div>
            <div className="grid-row col-head" style={{ height: ROW_H }}>
              <div className="grid-label" style={{ width: LEFT_W }}>
                <span className="lbl-desc" title="Nivåene radene er gruppert etter">
                  {[...grouping, ...rowDimensions].map((d) => DIMENSION_LABELS[d]).join(' / ')}
                </span>
                <span className="lbl-phase">Fase</span>
                <span className="lbl-year">År</span>
                <span className="lbl-basis">Grunnlag</span>
                <span className="lbl-nums" title="Linjen under tallene viser hvor mye av behovet som er planlagt: blå underveis, grønn når det er dekket, oransje når det er planlagt klart mer enn behovet.">
                  <span className="lbl-num" title="Behov (FTE-dager)">
                    Behov
                  </span>
                  <span className="lbl-num" title="Planlagt (FTE-dager)">
                    Plan
                  </span>
                  <span className="lbl-num" title="Plan minus behov">
                    Δ
                  </span>
                </span>
              </div>
              {/* What the colours of the planning cells mean; stays beside the label column when scrolling sideways. */}
              <span className="phase-legend" style={{ left: LEFT_W }}>
                <span>
                  <i className="mon" /> Montering
                </span>
                <span>
                  <i className="dem" /> Demontering
                </span>
                <span title="FTE på en dag utenfor radens monterings- eller demonteringsdager i hallen">
                  <i className="outside" /> Utenfor
                </span>
              </span>
            </div>
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

      <div className="statusbar">
        {focusInfo ? (
          <>
            <span className="status-title">{focusInfo.title}</span>
            <span>{fmtDate(focusInfo.date)}</span>
            <span>{focusInfo.value === undefined ? '–' : `${formatFte(focusInfo.value, 2)}`}</span>
            {selectionSum !== null && <span>Sum markert: {formatFte(selectionSum, 2)}</span>}
            {notice && !preview && !fill && <span className="status-notice">{notice}</span>}
            {fill && <span className="status-notice">{fillInfo}</span>}
            {preview && (
              <span className="status-notice">
                {preview.shared
                  ? `Tegner: opptil ${formatFte(Math.max(...preview.perDay), 1)} FTE per dag over ${preview.target.length} ${preview.target.length === 1 ? 'arbeidsdag' : 'arbeidsdager'}`
                  : 'Tegner: ikke noe behov igjen å fordele her'}
              </span>
            )}
            {focusInfo.rowId && (
              <NoteEditor key={`${focusInfo.rowId}:${focusInfo.date}`} note={focusInfo.note} onSave={(note) => setAllocationNote(focusInfo.rowId!, focusInfo.date, note)} />
            )}
            {!focusInfo.rowId && focusInfo.note && <span className="note-text">Notat: {focusInfo.note}</span>}
          </>
        ) : notice ? (
          <span className="status-notice">{notice}</span>
        ) : (
          <span className="muted">Klikk en celle for å planlegge. Skriv tall (f.eks. 1,5), Enter for neste rad, dra eller Shift+klikk for å markere flere, Ctrl/Cmd+C/V for kopier og lim inn.</span>
        )}
      </div>

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
