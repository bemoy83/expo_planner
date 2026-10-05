import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { capacityForDate, dailyNeed, formatFte, requiredHours, rowTotals, sumValues } from '../../domain/calc'
import { calendarRange } from '../../domain/calendarRange'
import { dateRange, daysBetween, isoWeek, MONTHS_NB, WEEKDAYS_NB, weekdayIndex, type ISODate } from '../../domain/dates'
import { dayType, holidayName } from '../../domain/holidays'
import type { AllocationRow, CapacityLine } from '../../domain/types'
import { buildHallCalendar, dominantEntry, hallNames, hallRuns, PHASE_CODES, PHASE_LABELS, splitEntries } from '../../domain/venue'
import { locateRows } from '../../domain/locations'
import { isSuggestedRow, suggestedRows } from '../../domain/plannedRows'
import { shareOverDays, spread } from '../../domain/spread'
import { venueEvents } from '../../domain/projects'
import { visibleVenue } from '../../domain/venueImport'
import { useWorkspace } from '../../store/workspaceStore'
import { AllocationDialog } from '../AllocationDialog'
import { LEFT_W, OVERSCAN_COLS, OVERSCAN_ROWS, parseCellInput, ROW_H, ZOOM_WIDTHS, type Zoom } from './layout'
import { GroupingBar } from './GroupingBar'
import { buildGroups, buildItems, cleanGrouping, DEFAULT_GROUPING, DIMENSION_LABELS, dimensionValue, EMPTY_FILTER, pathKeys, projectKey, type Dimension, type GridItem, type GroupNode, type RowFilter } from './rows'

type Section = 'alloc' | 'cap'
interface Cell {
  lane: number
  col: number
}
interface Selection {
  section: Section
  anchor: Cell
  focus: Cell
}
/** A line of the planning grid that takes FTE: a row, or a level whose number is shared out to its rows. */
interface AllocLane {
  /** Position in the list of grid items. */
  index: number
  row?: AllocationRow
  node?: GroupNode
}
interface CapLane {
  line: CapacityLine
  field: 'values' | 'hours'
  label: string
}

const todayIso = (): ISODate => new Date().toISOString().slice(0, 10)

const loadPref = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(`expo-planner:${key}`)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
const savePref = (key: string, value: unknown) => {
  try {
    localStorage.setItem(`expo-planner:${key}`, JSON.stringify(value))
  } catch {
    // preferences are a convenience only
  }
}

const rangeOf = (sel: Selection) => ({
  lane0: Math.min(sel.anchor.lane, sel.focus.lane),
  lane1: Math.max(sel.anchor.lane, sel.focus.lane),
  col0: Math.min(sel.anchor.col, sel.focus.col),
  col1: Math.max(sel.anchor.col, sel.focus.col),
})

/** An event's name in the hall calendar may run on past a short event, up to this far, where the hall is free. */
const HALL_LABEL_MAX_W = 260
const HALL_LABEL_MAX_COLS = 10
/** Roughly the width of one letter of an event's name. */
const HALL_LABEL_CHAR_W = 6.6

/** How far each level of the hierarchy is indented in the label column. */
const INDENT = 14

/** A row described by the given properties, e.g. «Hall C · Avd. 64». */
const describeRow = (row: AllocationRow, dimensions: Dimension[]): string =>
  dimensions.map((d) => (d === 'project' ? row.projectName : dimensionValue(row, d).label)).join(' · ')

const fmtDate = (date: ISODate) => {
  const [y, m, d] = date.split('-')
  return `${WEEKDAYS_NB[weekdayIndex(date)].toLowerCase()} ${d}.${m}.${y}`
}

export function Kalender() {
  const { workspace, demandIndex, locatedDemand, setAllocationFte, setSuggestedFte, setCapacityValue, setAllocationNote, removeAllocation, undo, redo, canUndo, canRedo } = useWorkspace()
  const ws = workspace!
  const { settings } = ws

  const [zoom, setZoom] = useState<Zoom>(() => loadPref('zoom', 'normal'))
  const [filter, setFilter] = useState<RowFilter>(() => loadPref('filter', EMPTY_FILTER))
  const [grouping, setGrouping] = useState<Dimension[]>(() => cleanGrouping(loadPref<unknown>('grouping', DEFAULT_GROUPING)))
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(loadPref<string[]>('collapsedLevels', [])))
  const [entry, setEntry] = useState<Set<string>>(() => new Set(loadPref<string[]>('entryLevels', [])))
  const [hallsOpen, setHallsOpen] = useState(() => loadPref('hallsOpen', true))
  const [allHalls, setAllHalls] = useState(() => loadPref('allHalls', false))
  const [capacityOpen, setCapacityOpen] = useState(() => loadPref('capacityOpen', false))
  const [onlyInView, setOnlyInView] = useState(() => loadPref('onlyInView', true))
  const [selection, setSelection] = useState<Selection | null>(null)
  // With the pencil, drawing across days on a row shares out what is left of its demand over those days.
  const [tool, setTool] = useState<'select' | 'pencil'>('select')
  const [notice, setNotice] = useState<string | null>(null)
  const dragging = useRef<Section | null>(null)
  const [drawing, setDrawing] = useState(false)
  const selectionRef = useRef<Selection | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ row?: AllocationRow; projectName?: string; projectNo?: string } | null>(null)
  const [viewport, setViewport] = useState({ left: 0, top: 0, width: 1200, height: 800 })
  const [topHeight, setTopHeight] = useState(0)
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)

  useEffect(() => savePref('zoom', zoom), [zoom])
  useEffect(() => savePref('filter', filter), [filter])
  useEffect(() => savePref('grouping', grouping), [grouping])
  useEffect(() => savePref('collapsedLevels', [...collapsed]), [collapsed])
  useEffect(() => savePref('entryLevels', [...entry]), [entry])
  useEffect(() => savePref('hallsOpen', hallsOpen), [hallsOpen])
  useEffect(() => savePref('allHalls', allHalls), [allHalls])
  useEffect(() => savePref('capacityOpen', capacityOpen), [capacityOpen])
  useEffect(() => savePref('onlyInView', onlyInView), [onlyInView])

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
    const labels = new Map<string, { eventName: string; col: number; span: number; room: number }[]>()
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
  const items = useMemo(
    () => buildItems(rows, events, demandIndex, settings, filter, collapsed, inViewOnly ? { from: winFrom, to: winTo } : undefined, grouping, entry),
    [rows, events, demandIndex, settings, filter, collapsed, inViewOnly, winFrom, winTo, grouping, entry],
  )
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
  const visibleDates = dates.slice(c0, c1 + 1)
  const firstVisibleCol = Math.min(dates.length - 1, Math.ceil(viewport.left / colW))
  const topPinned = topHeight < viewport.height * 0.65
  const r0 = Math.max(0, Math.floor((viewport.top - (topPinned ? 0 : topHeight)) / ROW_H) - OVERSCAN_ROWS)
  const r1 = Math.min(items.length, Math.ceil((viewport.top + viewport.height - topHeight) / ROW_H) + OVERSCAN_ROWS)

  const ensureVisible = useCallback(
    (section: Section, cell: Cell) => {
      const el = scrollRef.current
      if (!el) return
      const x = cell.col * colW
      if (x < el.scrollLeft) el.scrollLeft = x
      else if (x + colW > el.scrollLeft + el.clientWidth - LEFT_W) el.scrollLeft = x + colW - (el.clientWidth - LEFT_W)
      if (section === 'alloc') {
        const index = allocLanes[cell.lane]?.index ?? 0
        const y = index * ROW_H
        if (y < el.scrollTop) el.scrollTop = topPinned ? y : topHeight + y
        else if (topHeight + y + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = topHeight + y + ROW_H - el.clientHeight
      }
    },
    [colW, allocLanes, topHeight, topPinned],
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
   * drawn span is shared over the working days in the span, in halves. Weekends and holidays inside the
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
      let left = 0
      for (let lane = lane0; lane <= lane1; lane++) {
        const { row, node } = allocLanes[lane] ?? {}
        if (!row && !node) continue
        const required = node ? node.totals.requiredFte : (rowTotals(demandIndex, row!, settings).requiredFte ?? 0)
        const planned = node ? node.totals.plannedFte : sumValues(row!.fte)
        const onTarget = target.reduce((sum, date) => sum + ((node ? node.daily.get(date) : row!.fte[date]) ?? 0), 0)
        const remaining = required - (planned - onTarget)
        const parts = shareOverDays(remaining, target.length)
        if (parts.length) {
          lanes.push({ lane, parts })
          left += remaining
        } else withoutDemand += 1
      }
      const perDay = target.map((_, i) => lanes.reduce((sum, l) => sum + l.parts[i], 0))
      return { target, lanes, withoutDemand, left, shared: perDay.reduce((a, b) => a + b, 0), perDay }
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

  // While a stroke is being drawn, what it would give: shown in the cells and summed in the status bar.
  const preview = useMemo(() => (drawing && tool === 'pencil' ? strokeFor(selection) : null), [drawing, tool, strokeFor, selection])
  const ghost = useMemo(() => {
    const cells = new Map<string, number>()
    for (const { lane, parts } of preview?.lanes ?? []) preview!.target.forEach((date, i) => cells.set(`${lane}|${date}`, parts[i]))
    return cells
  }, [preview])

  // A drag ends wherever the mouse is released. While it lasts, the grid follows the mouse past its edges.
  useEffect(() => {
    let mouseX: number | null = null
    const onMove = (e: MouseEvent) => {
      mouseX = dragging.current ? e.clientX : null
    }
    const onUp = () => {
      const section = dragging.current
      dragging.current = null
      mouseX = null
      setDrawing(false)
      if (section === 'alloc' && tool === 'pencil') drawDemand()
    }
    const timer = setInterval(() => {
      const el = scrollRef.current
      if (!el || mouseX === null || !dragging.current) return
      const rect = el.getBoundingClientRect()
      const step = mouseX > rect.right - 24 ? colW : mouseX < rect.left + LEFT_W + 24 ? -colW : 0
      if (!step) return
      el.scrollLeft += step
      // No cell is entered while the grid moves under a still mouse, so the selection follows the scroll.
      const col = Math.max(0, Math.min(dates.length - 1, Math.floor((Math.min(Math.max(mouseX, rect.left + LEFT_W), rect.right - 1) - rect.left - LEFT_W + el.scrollLeft) / colW)))
      setSelection((sel) => (sel && sel.focus.col !== col ? { ...sel, focus: { ...sel.focus, col } } : sel))
    }, 60)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      clearInterval(timer)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [tool, drawDemand, colW, dates.length])

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

  const isSelected = (section: Section, lane: number, col: number) => {
    if (!selection || selection.section !== section) return false
    const { lane0, lane1, col0, col1 } = rangeOf(selection)
    return lane >= lane0 && lane <= lane1 && col >= col0 && col <= col1
  }
  const isFocus = (section: Section, lane: number, col: number) =>
    selection?.section === section && selection.focus.lane === lane && selection.focus.col === col

  // ---- rendering helpers --------------------------------------------------------------------
  const dayClass = (date: ISODate) => {
    const type = dayType(date)
    return `day ${type !== 'arbeidsdag' ? type : ''} ${date === today ? 'today' : ''} ${date.endsWith('-01') ? 'month-start' : ''}`
  }

  const row = (key: string, label: ReactNode, cells: (date: ISODate, col: number) => ReactNode, className = '', overlay?: ReactNode) => (
    <div className={`grid-row ${className}`} key={key} style={{ height: ROW_H }}>
      <div className="grid-label" style={{ width: LEFT_W }}>
        {label}
      </div>
      <div className="grid-spacer" style={{ width: c0 * colW }} />
      {visibleDates.map((date, i) => cells(date, c0 + i))}
      {overlay}
    </div>
  )

  const valueCell = (section: Section, lane: number, date: ISODate, col: number, value: number | undefined, note?: string, extraClass = '') => {
    const focus = isFocus(section, lane, col)
    // During a pencil stroke the cell shows what the stroke would put there.
    const drawn = section === 'alloc' ? ghost.get(`${lane}|${date}`) : undefined
    return (
      <div
        key={date}
        className={`${dayClass(date)} cell editable ${isSelected(section, lane, col) ? 'selected' : ''} ${focus ? 'focus' : ''} ${value ? 'filled' : ''} ${extraClass} ${note ? 'has-note' : ''} ${drawn !== undefined ? 'drawn' : ''}`}
        style={{ width: colW }}
        title={note}
        onMouseDown={(e) => {
          e.preventDefault()
          select(section, { lane, col }, e.shiftKey)
          if (e.button === 0 && !(e.target instanceof HTMLInputElement)) {
            dragging.current = section
            setDrawing(section === 'alloc' && tool === 'pencil')
          }
        }}
        onMouseEnter={() => {
          if (dragging.current === section) setSelection((sel) => (sel?.section === section ? { ...sel, focus: { lane, col } } : sel))
        }}
        onDoubleClick={() => setDraft(value === undefined ? '' : String(value).replace('.', ','))}
      >
        {focus && draft !== null ? (
          <input
            className="cell-input"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commitDraft()}
            onKeyDown={(e) => {
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
            }}
          />
        ) : drawn !== undefined ? (
          formatFte(drawn || undefined)
        ) : (
          formatFte(value)
        )}
      </div>
    )
  }

  const readCell = (date: ISODate, value: number | undefined, className = '', title?: string) => (
    <div key={date} className={`${dayClass(date)} cell ${className}`} style={{ width: colW }} title={title}>
      {formatFte(value)}
    </div>
  )

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

  const renderItem = (item: GridItem) => {
    if (item.kind === 'group') {
      const { node } = item
      const project = node.project
      const delta = node.totals.plannedFte - node.totals.requiredFte
      return row(
        `g:${node.key}`,
        <>
          <button className="twisty" style={{ marginLeft: node.depth * INDENT }} onClick={() => (item.entry ? toggleEntry(node.key) : toggleGroup(node.key))} aria-label={item.collapsed ? 'Vis rader' : 'Skjul rader'}>
            {item.collapsed ? '▸' : '▾'}
          </button>
          {project ? (
            <span
              className="lbl-project"
              title={`${project.projectName}${project.projectNo ? '' : ' – uten prosjektnummer, settes på Haller-fanen'}${project.venue ? '' : ' – ikke koblet til et arrangement i hallkalenderen. Sett prosjektnummeret på arrangementet på Haller-fanen.'}`}
            >
              {project.projectName} <span className="muted">{project.projectNo || 'uten nr.'}</span>
              {!project.venue && <span className="unlinked"> ikke i hallkalenderen</span>}
            </span>
          ) : (
            <span className={`lbl-project lbl-level ${node.dimension === 'phase' ? (node.label === 'Demontering' ? 'dem' : node.label === 'Montering' ? 'mon' : '') : ''}`} title={`${DIMENSION_LABELS[node.dimension]}: ${node.label}`}>
              {node.label} <span className="muted count">{node.rows.length}</span>
            </span>
          )}
          {node.rows.length ? (
            <>
              <span className="lbl-num">{formatFte(node.totals.requiredFte)}</span>
              <span className="lbl-num">{formatFte(node.totals.plannedFte)}</span>
              <span className={`lbl-num delta ${deltaClass(delta)}`}>{formatFte(delta)}</span>
            </>
          ) : (
            <span className="muted small no-rows">ingen rader</span>
          )}
          <span className="row-slot">
            {node.rows.length > 0 && (
              <button
                className={`row-action level-mode ${item.entry ? 'entry' : ''}`}
                aria-pressed={item.entry}
                title={
                  item.entry
                    ? 'Du skriver FTE på dette nivået; tallet fordeles på radene under etter behov. Klikk for å gå tilbake til sum.'
                    : 'Nivået viser summen av radene under. Klikk for å skrive FTE her og få det fordelt på radene under etter behov.'
                }
                onClick={() => toggleEntry(node.key)}
              >
                {item.entry ? '✎' : 'Σ'}
              </button>
            )}
            {project && (
              <button className="row-action" title="Legg til rad i prosjektet" onClick={() => setDialog({ projectName: project.projectName, projectNo: project.projectNo })}>
                +
              </button>
            )}
          </span>
        </>,
        (date, col) => {
          const inSpan = project?.venue && date >= project.venue.start && date <= project.venue.end ? 'in-span' : ''
          return item.entry ? valueCell('alloc', laneOfRow.get(`level:${node.key}`)!, date, col, node.daily.get(date), undefined, `group-cell ${inSpan}`) : readCell(date, node.daily.get(date), `group-cell ${inSpan}`)
        },
        `group-row depth-${Math.min(node.depth, 3)} ${node.rows.length ? '' : 'empty-group'} ${item.entry ? 'entry-level' : ''}`,
      )
    }
    const { row: r, totals } = item
    const lane = laneOfRow.get(r.id)!
    const description = [item.lead, describeRow(r, rowDimensions)].filter(Boolean).join(' · ')
    return row(
      r.id,
      <>
        <span className="lbl-desc" style={{ paddingLeft: 18 + item.depth * INDENT }} title={describeRow(r, ['project', 'competence', 'hall', 'avdeling'])}>
          {description || <em className="muted">rad</em>}
        </span>
        <span className={`lbl-phase ${r.phase === 'Demontering' ? 'dem' : 'mon'}`} title={r.phase}>
          {r.phase === 'Montering' ? 'M' : r.phase === 'Demontering' ? 'D' : '–'}
        </span>
        <span className="lbl-year">{r.refYear}</span>
        <span className="lbl-basis" title={r.basis}>
          {r.basis}
        </span>
        <span className="lbl-num" title={totals.requiredHours === null ? '' : `${formatFte(totals.requiredHours, 2)} timer`}>
          {formatFte(totals.requiredFte)}
        </span>
        <span className="lbl-num">{formatFte(totals.plannedFte)}</span>
        <span className={`lbl-num delta ${deltaClass(totals.deltaFte)}`}>{formatFte(totals.deltaFte)}</span>
        <span className="row-slot row-actions">
          {/* A suggested row is not stored yet, so there is nothing to edit or delete. */}
          {!isSuggestedRow(r) && (
            <>
              <button className="row-action" title="Endre rad" onClick={() => setDialog({ row: r })}>
                ✎
              </button>
              <button
                className="row-action"
                title="Slett rad"
                onClick={() => {
                  if (confirm(`Slette raden ${rowTitle(r)}?`)) removeAllocation(r.id)
                }}
              >
                ×
              </button>
            </>
          )}
        </span>
      </>,
      (date, col) => valueCell('alloc', lane, date, col, r.fte[date], r.notes[date], r.phase === 'Demontering' ? 'dem' : 'mon'),
      'alloc-row',
    )
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

  // ---- render ---------------------------------------------------------------------------------
  return (
    <div className={`kalender ${tool === 'pencil' ? 'pencil' : ''}`}>
      <div className="toolbar">
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
        <input className="search" type="search" placeholder="Søk i rader" value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} />
        {(filter.project || filter.competence || filter.search) && (
          <button className="link" onClick={() => setFilter(EMPTY_FILTER)}>
            Nullstill
          </button>
        )}
        <label className="check" title="Skjul prosjekter som ikke har noen planleggingsrader ennå">
          <input type="checkbox" checked={!!filter.onlyWithRows} onChange={(e) => setFilter({ ...filter, onlyWithRows: e.target.checked })} />
          Bare med rader
        </label>
        <label className="check" title="Vis bare prosjekter som foregår eller har planlagte dager i datoene som vises">
          <input type="checkbox" checked={onlyInView} onChange={(e) => setOnlyInView(e.target.checked)} />
          Bare prosjekter i visningen
        </label>
        <span className="toolbar-gap" />
        <button onClick={undo} disabled={!canUndo} title="Angre (Ctrl/Cmd+Z)">
          ↶ Angre
        </button>
        <button onClick={redo} disabled={!canRedo} title="Gjør om (Ctrl/Cmd+Shift+Z)">
          ↷ Gjør om
        </button>
        <button onClick={() => setCollapsed(new Set())}>Utvid alle</button>
        <button title="Fold sammen til øverste nivå" onClick={() => setCollapsed(new Set(items.flatMap((i) => (i.kind === 'group' && i.node.depth === 0 ? [i.node.key] : []))))}>
          Fold alle
        </button>
        <button
          className={tool === 'pencil' ? 'tool active' : 'tool'}
          aria-pressed={tool === 'pencil'}
          title="Tegn over dager på en rad: det som gjenstår av radens behov fordeles på arbeidsdagene du tegner over, i halve FTE. Klikk igjen for å slå av."
          onClick={() => setTool(tool === 'pencil' ? 'select' : 'pencil')}
        >
          ✏ Fordel behov
        </button>
        <button onClick={() => scrollToDate(today)}>I dag</button>
        <input
          type="date"
          aria-label="Gå til dato"
          min={range.start}
          max={range.end}
          onChange={(e) => e.target.value && scrollToDate(e.target.value, 2)}
        />
        <select value={zoom} aria-label="Kolonnebredde" onChange={(e) => setZoom(e.target.value as Zoom)}>
          <option value="compact">Smal</option>
          <option value="normal">Normal</option>
          <option value="wide">Bred</option>
        </select>
        <button className="primary" onClick={() => setDialog(allGroups.filter((g) => g.key === filter.project).map((g) => ({ projectName: g.projectName, projectNo: g.projectNo }))[0] ?? {})}>
          + Ny rad
        </button>
      </div>

      <GroupingBar
        grouping={grouping}
        onChange={(next) => {
          // Lanes are positions in the list, so a selection would land on other rows after regrouping.
          setSelection(null)
          setGrouping(next)
        }}
      />

      <div className="grid-scroll" ref={scrollRef} tabIndex={0} onScroll={onScroll} onKeyDown={onKeyDown} onCopy={onCopy} onPaste={onPaste}>
        <div className="grid-canvas" style={{ width: LEFT_W + dates.length * colW }}>
          {/* The top block stays pinned like Excel's frozen rows, unless it would cover most of the screen. */}
          <div className={`grid-top ${topPinned ? 'pinned' : ''}`} ref={topRef}>
            {row(
              'months',
              <span className="lbl-title">{zoom === 'compact' ? '' : 'Uke / måned'}</span>,
              (date) => (
                <div key={date} className={`${dayClass(date)} cell head`} style={{ width: colW }}>
                  {date.endsWith('-01') ? <span className="month-label">{`${MONTHS_NB[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`}</span> : weekdayIndex(date) === 0 ? <span className="week-label">u{isoWeek(date)}</span> : null}
                </div>
              ),
              'head-row',
            )}
            {row(
              'days',
              <span className="lbl-title">Dato</span>,
              (date) => (
                <div key={date} className={`${dayClass(date)} cell head day-head`} style={{ width: colW }} title={`${fmtDate(date)}${holidayName(date) ? ` – ${holidayName(date)}` : ''}`}>
                  <span className="wd">{WEEKDAYS_NB[weekdayIndex(date)].slice(0, zoom === 'compact' ? 1 : 3).toLowerCase()}</span>
                  <span className="dn">{Number(date.slice(8))}</span>
                </div>
              ),
              'head-row tall',
            )}

            <div className="section-head" style={{ width: LEFT_W }}>
              <button className="twisty" onClick={() => setHallsOpen(!hallsOpen)}>
                {hallsOpen ? '▾' : '▸'}
              </button>
              Haller
              {hallsOpen && (
                <button className="link small" onClick={() => setAllHalls(!allHalls)}>
                  {allHalls ? 'Bare messehaller' : `Vis alle (${hallCount})`}
                </button>
              )}
              <span className="legend">
                <i className="ph-assembly" /> Montering <i className="ph-movingIn" /> Inn/utflytting <i className="ph-event" /> Arrangement <i className="ph-dismantle" /> Demontering
              </span>
            </div>
            {hallsOpen && ws.venue.length === 0 && (
              <div className="section-hint" style={{ width: LEFT_W }}>
                Ingen hallbookinger. Les inn <code>location_format</code> med «Oppdater haller (Venyou)».
              </div>
            )}
            {hallsOpen &&
              halls.map((hall) => {
                const days = hallCalendar.get(hall)
                // Names of the events in or near the visible dates, each with the width it may take.
                const labels = (hallLabels.get(hall) ?? [])
                  .filter((run) => run.col <= c1 && run.col + Math.max(run.span, Math.min(run.room, HALL_LABEL_MAX_COLS)) > c0)
                  .map((run) => {
                    const width = Math.min(run.room * colW, Math.max(run.span * colW, HALL_LABEL_MAX_W)) - 2
                    // Roughly the columns the text covers, so the phase letters under it can be left out.
                    const covered = Math.ceil(Math.min(width, run.eventName.length * HALL_LABEL_CHAR_W + 6) / colW)
                    return { ...run, width, covered }
                  })
                return row(
                  `hall:${hall}`,
                  <span className="lbl-hall">{hall}</span>,
                  (date, col) => {
                    const entries = days?.get(date)
                    if (!entries?.length) return <div key={date} className={`${dayClass(date)} cell hall`} style={{ width: colW }} />
                    const main = dominantEntry(entries)
                    const underLabel = labels.some((label) => col >= label.col && col < label.col + label.covered)
                    const title = entries.map((e) => `${e.eventName} – ${PHASE_LABELS[e.phase]}`).join('\n')
                    // Wide columns have room to show both events on a day the hall is shared.
                    const split = zoom === 'wide' ? splitEntries(entries) : null
                    if (split)
                      return (
                        <div key={date} className={`${dayClass(date)} cell hall split`} style={{ width: colW }} title={title}>
                          {split.map((entry) => (
                            <span key={entry.eventName} className={`half ph-${entry.phase}`}>
                              {!underLabel && <span className="phase-code">{PHASE_CODES[entry.phase]}</span>}
                            </span>
                          ))}
                        </div>
                      )
                    return (
                      <div key={date} className={`${dayClass(date)} cell hall ph-${main.phase} ${entries.length > 1 ? 'multi' : ''}`} style={{ width: colW }} title={title}>
                        {!underLabel && zoom !== 'compact' ? <span className="phase-code">{PHASE_CODES[main.phase]}</span> : null}
                      </div>
                    )
                  },
                  'hall-row',
                  labels.map((label) => (
                    <span key={`${label.eventName}:${label.col}`} className="hall-label" style={{ left: LEFT_W + label.col * colW, maxWidth: label.width }}>
                      {label.eventName}
                    </span>
                  )),
                )
              })}

            <div className="section-head" style={{ width: LEFT_W }}>
              <button className="twisty" onClick={() => setCapacityOpen(!capacityOpen)}>
                {capacityOpen ? '▾' : '▸'}
              </button>
              Bemanning <span className="muted">(FTE)</span>
              <button className="link small" onClick={() => setCapacityOpen(!capacityOpen)}>
                {capacityOpen ? 'Skjul detaljer' : 'Vis detaljer'}
              </button>
            </div>
            {capacityOpen && (
              <>
                {row('base', <span className="lbl-cap">Faste (FTE)</span>, (date) => readCell(date, dayType(date) === 'arbeidsdag' ? settings.baseCrew : undefined, 'cap-cell'), 'cap-row')}
                {capLanes.map((cap, lane) =>
                  row(
                    `cap:${cap.line.id}:${cap.field}`,
                    <span className={`lbl-cap group-${cap.line.group}`}>{cap.label}</span>,
                    (date, col) => valueCell('cap', lane, date, col, cap.line[cap.field]?.[date], cap.field === 'values' ? cap.line.notes[date] : undefined, 'cap-cell'),
                    `cap-row group-${cap.line.group}`,
                  ),
                )}
              </>
            )}
            {row('need', <span className="lbl-cap strong">Planlagt behov</span>, (date) => readCell(date, need.get(date), 'sum-cell'), 'sum-row')}
            {row(
              'available',
              <span className="lbl-cap strong">Tilgjengelig</span>,
              (date) => {
                const cap = capacityForDate(date, ws.capacity, settings)
                return readCell(date, cap.available || undefined, 'sum-cell', `Faste ${formatFte(cap.base)} + innleid/fag ${formatFte(cap.added)} + overtid ${formatFte(cap.overtime)} − utilgjengelig ${formatFte(cap.unavailable)}`)
              },
              'sum-row',
            )}
            {row(
              'deviation',
              <span className="lbl-cap strong">Avvik</span>,
              (date) => {
                const dev = capacityForDate(date, ws.capacity, settings).available - (need.get(date) ?? 0)
                const n = need.get(date) ?? 0
                return readCell(date, n || dev ? dev : undefined, `sum-cell dev ${dev < -0.05 ? 'neg' : dev > 0.05 && n ? 'pos' : ''}`)
              },
              'sum-row deviation-row',
            )}
            <div className="grid-row col-head" style={{ height: ROW_H }}>
              <div className="grid-label" style={{ width: LEFT_W }}>
                <span className="lbl-desc" title="Nivåene radene er gruppert etter">
                  {[...grouping, ...rowDimensions].map((d) => DIMENSION_LABELS[d]).join(' / ')}
                </span>
                <span className="lbl-phase">Fase</span>
                <span className="lbl-year">År</span>
                <span className="lbl-basis">Grunnlag</span>
                <span className="lbl-num" title="Behov (FTE-dager)">
                  Behov
                </span>
                <span className="lbl-num" title="Planlagt (FTE-dager)">
                  Plan
                </span>
                <span className="lbl-num" title="Plan minus behov">
                  Δ
                </span>
              </div>
            </div>
          </div>

          <div className="grid-alloc" style={{ height: items.length * ROW_H }}>
            <div style={{ height: r0 * ROW_H }} />
            {items.slice(r0, r1).map(renderItem)}
          </div>
          {items.length === 0 && (
            <p className="empty-rows">{rows.length === 0
                ? 'Ingen planleggingsrader ennå. Bruk «+ Ny rad» for å legge til en rad for et prosjekt.'
                : inViewOnly
                  ? 'Ingen prosjekter har planlagte dager i denne perioden. Slå av «Bare prosjekter i visningen» for å se alle.'
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
            {notice && !preview && <span className="status-notice">{notice}</span>}
            {preview && (
              <span className="status-notice">
                {preview.shared
                  ? `Tegner: ${preview.target.length} ${preview.target.length === 1 ? 'arbeidsdag' : 'arbeidsdager'} · opptil ${formatFte(Math.max(...preview.perDay), 1)} FTE/dag · ${formatFte(preview.shared, 1)} FTE-dager = ${formatFte(preview.shared * settings.hoursPerDay, 1)} t (behov igjen ${formatFte(preview.left * settings.hoursPerDay, 1)} t)`
                  : 'Tegner: ikke noe behov igjen å fordele her'}
              </span>
            )}
            {focusInfo.rowId && (
              <NoteEditor key={`${focusInfo.rowId}:${focusInfo.date}`} note={focusInfo.note} onSave={(note) => setAllocationNote(focusInfo.rowId!, focusInfo.date, note)} />
            )}
            {!focusInfo.rowId && focusInfo.note && <span className="note-text">Notat: {focusInfo.note}</span>}
          </>
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

const rowTitle = (row: AllocationRow) => `${describeRow(row, ['project', 'competence', 'hall', 'avdeling'])} · ${row.phase}`

const deltaClass = (delta: number | null) => (delta === null ? '' : delta < -0.05 ? 'under' : delta > 0.05 ? 'over' : 'ok')

function NoteEditor({ note, onSave }: { note: string; onSave: (note: string) => void }) {
  const [value, setValue] = useState(note)
  return (
    <input
      className="note-input"
      placeholder="Notat for cellen"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value !== note && onSave(value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}
