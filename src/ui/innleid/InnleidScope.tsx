import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { dayText, todayIso, type ISODate } from '../../domain/dates'
import { useWorkspace } from '../../store/workspaceStore'
import { HOURS_NOISE, hoursChange, strokeDays, changeCount, changeOrders, clearOrders, confirmFewer, confirmOrders, copyOrders, coverage, dayKey, hireBoard, isWaiting, laneFrom, lineKey, moveOrders, orderRuns, ordersByDay, paintOrders, pasteOrders, removeOrders, setWaiting, sharePerson, shareOrders, sharingOffers, splitPerson, stretchOrders, supplierLines, tagOrders, waitingHours, peopleMissingIn, urgentWaits, withPerson, type Coverage, type HireBoard, type HireLine, type LineDay, type LineRuns, type NeedOf, type OrderClip, type SupplierLine } from '../../domain/hire'
import { toggleSupplierCompetence, toggleSupplierShift } from '../../domain/suppliers'
import { NO_PROJECT, projectsWithWork } from '../../domain/staffing/projectBalance'
import { numberKey } from '../../domain/projects'
import { pushTo } from '../../domain/collections'
import { sameProject, type CompetenceKey, type CompetenceStyle, type HireOrder, type ShiftId, type Supplier } from '../../domain/types'
import { usePref } from '../../store/prefs'
import { useBemanning } from '../bemanning/BemanningScope'
import { pickKeys } from '../bemanning/useBemanningBalance'
import { projectDays, restDays } from '../bemanning/lineBalances'
import { DIVIDER_H, PERSON_H, shiftLine } from '../bemanning/layout'
import { strokeRange, type Rect, type Stroke } from '../bemanning/tools'
import { useBemanningKeys } from '../bemanning/useBemanningKeys'
import { useStrokeInput, useStrokeState } from '../bemanning/useStrokeInput'
import { useStableActions } from '../kalender/useStableActions'
import { useBrushPick } from '../bemanning/useBrushPick'
import { clamp } from '../../domain/numbers'
import { count } from '../dom'
import { hoursText } from '../format'

/** What the side panel of Innleid shows: the suppliers' orders to look over and confirm, one supplier's order, or the help. */
type InnleidPanel = { kind: 'control' } | { kind: 'supplier'; id: string } | { kind: 'help' }

/** Innleid opens on the compact lines, where a competence is one line high. */
const cleanFolded = (stored: unknown): string[] => (Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [])
const cleanCounts = (stored: unknown): Record<string, number> =>
  stored && typeof stored === 'object' ? Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] >= 0)) : {}

const NO_ORDERS: HireOrder[] = []
/** Whether a day of a line is inside a block of them. */
const within = (rect: Rect, row: number, col: number) => {
  const { rowFrom, rowTo, colFrom, colTo } = strokeRange({ mode: 'select', ...rect })
  return row >= rowFrom && row <= rowTo && col >= colFrom && col <= colTo
}
const NO_SUPPLIERS: Supplier[] = []
/** The most people a brush can carry. */
const MOST_PEOPLE = 99

/**
 * A line under the competence of the brush, as Faste has them: a project, with its days covered by its own orders and its share of
 * those for no project against what the project lacks after the permanent staff, and under the projects «Uten prosjekt».
 */
export interface HireProjectLine {
  /** `NO_PROJECT` for «Uten prosjekt». */
  projectNo: string
  name: string
  /** The line of what is on none of the projects. */
  rest: boolean
  cover: (date: ISODate) => Coverage
  orders: (date: ISODate) => HireOrder[]
  /** The hours missing in the days in view. */
  missing: number
}

/** A supplier's shift line as it lies among the suppliers: its runs in lanes, and where it is from the top of them. */
export interface ShiftRow {
  line: SupplierLine
  runs: LineRuns
  top: number
  height: number
}

/** A supplier as it is listed: dimmed under the divider where it lacks the brush's competence, with a name line where it has more than one shift. */
export interface SupplierBlock {
  supplier: Supplier
  dim: boolean
  /** The divider comes before it: the first of those without the brush's competence. */
  divider: boolean
  folded: boolean
  /** The top of its name line. */
  top: number
  rows: ShiftRow[]
}

/** What a stroke over the suppliers' lines would do, worked out from the orders without writing them. */
interface StrokePlan {
  orders: HireOrder[]
  /** With the brush: the lines that do not offer its competence. */
  skipped: number
  /** With the brush: the days it orders, after Shift has stopped it where the demand is met. */
  days: number
  /** A pulled end of a run takes days away: the orders it removes are still drawn, marked. */
  removes?: boolean
}

/** The popover of orders on the suppliers' lines: a run's, or those of the days selected, by their ids; the day clicked, for «Bare denne dagen». */
export interface OrderPop {
  ids: string[]
  date: ISODate
  at: DOMRect
}

/** The popover of a day of the demand: a competence's, or a project's line under it. */
export interface DemandPop {
  competence: CompetenceKey
  projectNo?: string
  date: ISODate
  x: number
  y: number
}

function useInnleidState(active: boolean, counted: boolean) {
  const bm = useBemanning()
  const { undo } = useWorkspace()
  const { ws, dates, cols, scrollRef, balance, styles, updateStaffing, onShowDate, onFocusDate, viewFrom, viewTo, projectBalance, kalenderProjects, projectName, toast } = bm
  const stored = ws.hireOrders ?? NO_ORDERS
  const suppliers = ws.suppliers ?? NO_SUPPLIERS
  const wd = ws.settings.workday
  const view = useMemo(() => dates.slice(viewFrom, viewTo + 1), [dates, viewFrom, viewTo])
  /** The hours of a competence a day that remain after the permanent staff: of a project, where one is given, counting its share of the untagged. */
  const restOf = useCallback(
    (competence: CompetenceKey, date: ISODate, projectNo?: string) => Math.max(0, projectNo ? projectBalance.of(competence, date, projectNo).remaining : balance.get(competence, date).remaining),
    [balance, projectBalance],
  )
  /** What a lane of orders needs on a day after the permanent staff: what «Slå sammen» shares a person by (slice 6). */
  const needOf = useCallback<NeedOf>((competence, projectNo, date) => restOf(competence, date, projectNo), [restOf])
  const board = useMemo<HireBoard>(() => hireBoard(counted ? [...styles.keys()] : [], dates, restOf, stored, wd), [counted, styles, dates, restOf, stored, wd])
  const rows = useMemo<CompetenceStyle[]>(() => board.competences.map((key) => styles.get(key)!), [board, styles])

  // ---- the brush: a competence, and under it maybe a project, with a count of people ------------------------------------------
  const [counts, setCounts] = usePref<Record<string, number>>('innleidCounts', {}, cleanCounts)
  const [folded, setFolded] = usePref<string[]>('innleidFolded', [], cleanFolded)
  const [storedPanel, setPanel] = useState<InnleidPanel | null>(null)
  // A supplier that is removed has no panel.
  const panel = !active || (storedPanel?.kind === 'supplier' && !suppliers.some((supplier) => supplier.id === storedPanel.id)) ? null : storedPanel
  const [selection, setSelection] = useState<Rect | null>(null)
  const [clip, setClip] = useState<OrderClip | null>(null)
  /** The line and day under the pointer, where a paste lands. */
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null)
  const [orderPop, setOrderPop] = useState<OrderPop | null>(null)
  const [demandPop, setDemandPop] = useState<DemandPop | null>(null)
  const strokeState = useStrokeState()
  const { stroke } = strokeState


  // ---- the lines of the brush's competence, for its project lines -------------------------------------------------------------
  /**
   * The lines of a competence that orders are made for: its projects with work in the days in view, as Bemanning has them
   * (`projectsWithWork`), and what is on none of them, worked out as Faste does (`restDays`).
   */
  const linesOf = useCallback(
    (competence: CompetenceKey, orders: HireOrder[]): HireLine[] => {
      const ordersOn = ordersByDay(orders)
      const ordered = (date: ISODate) => (ordersOn.get(dayKey(competence, date)) ?? NO_ORDERS).map((order) => order.projectNo)
      const projects = projectsWithWork(projectBalance, competence, view, kalenderProjects, projectName, ordered)
      const lines: HireLine[] = projects.map((projectNo) => ({ projectNo, restOf: (date) => restOf(competence, date, projectNo), holds: (order) => sameProject(order, { projectNo }) }))
      const rest = restDays(balance, projects.map((projectNo) => projectDays(projectBalance, projectNo)))
      lines.push({ restOf: (date) => Math.max(0, rest.get(competence, date).remaining), holds: (order) => !projects.some((projectNo) => sameProject(order, { projectNo })) })
      return lines
    },
    [view, balance, projectBalance, kalenderProjects, projectName, restOf],
  )
  const projectLinesOf = useCallback(
    (brush: CompetenceKey, orders: HireOrder[]): HireProjectLine[] => {
      const ordersOn = ordersByDay(orders)
      const lines = linesOf(brush, orders)
      // The orders of each line on a day: its own, and a person at a time of those for no project to the line that lacks the most (`shareOrders`).
      const shared = new Map<ISODate, HireOrder[][]>()
      const sharedOn = (date: ISODate) => {
        let list = shared.get(date)
        if (!list) {
          list = shareOrders(lines.map((line) => ({ rest: line.restOf(date), own: line.holds })), ordersOn.get(dayKey(brush, date)) ?? NO_ORDERS, wd)
          shared.set(date, list)
        }
        return list
      }
      const all = lines.map((line, at) => {
        const ordersOf = (date: ISODate) => sharedOn(date)[at]
        const cover = (date: ISODate) => coverage(line.restOf(date), ordersOf(date), wd)
        const rest = line.projectNo === undefined
        return { projectNo: line.projectNo ?? NO_PROJECT, name: rest ? 'Uten prosjekt' : projectName(line.projectNo!), rest, orders: ordersOf, cover, missing: peopleMissingIn(cover, view) }
      })
      const projects = all.filter((line) => !line.rest)
      const rest = all.find((line) => line.rest)!
      return projects.length && view.some((date) => rest.cover(date).state !== 'none') ? all : projects
    },
    [linesOf, view, projectName, wd],
  )

  // ---- the brush, as Faste's (`useBrushPick`): a competence, and under it maybe a project, with a count of people ---------------
  // The competences a supplier offers: the others cannot be the brush, and their lines are greyed.
  const offered = useMemo(() => new Set(suppliers.flatMap((supplier) => supplier.competences)), [suppliers])
  const isOffered = useCallback((competence: string) => offered.has(competence), [offered])
  const brushKeys = useMemo(() => bm.demandRows.map(({ style }) => style.key).filter(isOffered), [bm.demandRows, isOffered])
  const pick = useBrushPick({
    keys: brushKeys,
    linesOf: useCallback((competence: CompetenceKey) => projectLinesOf(competence, stored), [projectLinesOf, stored]),
    // R14: with no brush, Pensel takes the competence with the most missing in the days in view.
    fallback: () => {
      const missing = (key: CompetenceKey) => peopleMissingIn((date) => board.cover(key, date), view)
      return [...rows].filter((style) => isOffered(style.key)).sort((a, b) => missing(b.key) - missing(a.key))[0]?.key ?? null
    },
    noneText: 'Ingen kompetanse har restbehov i perioden.',
    toast,
    setSelection,
  })
  const { brush, project: brushProject, activeTool, pickBrush, clearBrush, pickProject, pickFromDemand, pickTool, stepLines } = pick
  const baseProjectLines = pick.lines
  // The people on the brush per competence; 0 is Auto, the people each day lacks (2026-10-27).
  const people = brush ? (counts[brush] ?? 1) : 1

  // The competence of the brush follows between Faste and Innleid (2026-10-26): taken from Faste when Innleid is shown, and handed back when it is left.
  const [shown, setShown] = useState(active)
  if (shown !== active) {
    setShown(active)
    if (active && bm.brush) pick.take(bm.brush, bm.brushProject)
  }
  useEffect(() => {
    if (active || !brush || brush === bm.brush || !bm.isStaffed(brush)) return
    bm.pickBrush(brush)
    if (activeTool !== 'paint') bm.pickTool('select')
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the suppliers' lines, in the order they are listed ---------------------------------------------------------------------
  const offers = useCallback((supplier: Supplier) => !brush || supplier.competences.includes(brush), [brush])
  const listed = useMemo(() => [...suppliers.filter(offers), ...suppliers.filter((supplier) => !offers(supplier))], [suppliers, offers])
  const able = useMemo(() => suppliers.filter(offers).length, [suppliers, offers])
  /** The shift lines a stroke can go over, from the top: those of a supplier that is folded are not shown. */
  const lineRefs = useMemo<SupplierLine[]>(() => listed.flatMap((supplier) => {
    const lines = supplierLines(supplier, stored)
    return lines.length > 1 && folded.includes(supplier.id) ? [] : lines
  }), [listed, stored, folded])

  // ---- what a stroke would do ------------------------------------------------------------------------------------------------
  const cellsOf = (s: Stroke): { lines: SupplierLine[]; days: ISODate[] } => {
    const { rowFrom, rowTo, colFrom, colTo } = strokeRange(s)
    return { lines: lineRefs.slice(rowFrom, rowTo + 1), days: dates.slice(colFrom, colTo + 1) }
  }
  /** What the brush's line lacks on a day after what is ordered: for the project of the brush, or the competence. */
  const lacking = (date: ISODate) => {
    if (!brush) return 0
    const line = brushProject ? baseProjectLines.find((one) => !one.rest && numberKey(one.projectNo) === numberKey(brushProject)) : undefined
    return (line ? line.cover(date) : board.cover(brush, date)).remaining
  }
  const rank = useMemo(() => {
    const order = new Map([...styles.keys()].map((key, at) => [key, at]))
    return (competence: string) => order.get(competence) ?? order.size
  }, [styles])
  /** The line and the day of a cell of the suppliers' lines. */
  const lineDayAt = (row: number, col: number): LineDay | null => (lineRefs[row] && dates[col] ? { supplierId: lineRefs[row].supplierId, shift: lineRefs[row].shift, date: dates[col] } : null)
  /** A pulled end of a run (R46 in Faste): its run as an end is taken hold of, over days off, and the orders as it leaves them. */
  const stretchPlan = (s: Stroke, orders: HireOrder[]): StrokePlan | null => {
    const line = lineRefs[s.row0]
    if (!line || !s.stretch) return null
    const lineOrders = stored.filter((order) => order.supplierId === line.supplierId && order.shift === line.shift)
    const grip = orderRuns(lineOrders, dates, rank).grips.find((run) => run.orders.some((order) => order.id === s.stretch!.blockId))
    if (!grip) return null
    const { edge } = s.stretch
    let to = dates[s.col1]
    const outward = edge === 'end' ? to > grip.to : to < grip.from
    if (outward && s.toDemand) {
      // With Shift, an end pulled outward goes no further than the last day the run's competence lacks hours on.
      const along = edge === 'end' ? dates.filter((date) => date > grip.to && date <= to) : dates.filter((date) => date >= to && date < grip.from).reverse()
      let last = along.length - 1
      while (last >= 0 && board.cover(grip.competence, along[last]).remaining <= 0) last--
      if (last < 0) return null
      to = along[last]
    }
    const next = stretchOrders(orders, grip, edge, to, dates, suppliers)
    if (next === orders) return null
    return { orders: next, skipped: 0, days: Math.abs(dates.indexOf(to) - dates.indexOf(edge === 'end' ? grip.to : grip.from)), removes: !outward }
  }
  const planOf = (s: Stroke, orders: HireOrder[]): StrokePlan | null => {
    if (s.mode === 'stretch') return stretchPlan(s, orders)
    if (s.mode === 'move') {
      const from = lineDayAt(s.row0, s.col0)
      const to = lineDayAt(s.row1, s.col1)
      if (!from || !to) return null
      const moved = moveOrders(orders, from, to, false, suppliers, wd)
      return moved.orders === orders ? null : { orders: moved.orders, skipped: moved.skipped, days: 1 }
    }
    const { lines, days } = cellsOf(s)
    if (s.mode === 'erase') return { orders: clearOrders(orders, lines.flatMap((line) => days.map((date) => ({ supplierId: line.supplierId, shift: line.shift, date })) satisfies LineDay[]), s.lane), skipped: 0, days: days.length }
    if (s.mode !== 'paint' || !brush) return null
    // Shift: the stroke goes no further than the last day the brush's line lacks hours on.
    const forward = s.col1 >= s.col0
    const along = forward ? days : [...days].reverse()
    let last = along.length - 1
    if (s.toDemand) while (last >= 0 && lacking(along[last]) <= 0) last--
    const reached = along.slice(0, last + 1)
    const painted = paintOrders(orders, { lines, competence: brush, ...(brushProject && { projectNo: brushProject }), dates: reached, count: people || 'auto', need: (date) => restOf(brush, date, brushProject ?? undefined) }, suppliers, wd)
    return { orders: painted.orders, skipped: painted.skipped, days: strokeDays(reached).length }
  }
  const plan = useMemo(() => (stroke && active ? planOf(stroke, stored) : null), [stroke, active, stored, lineRefs, brush, brushProject, people, suppliers, wd, dates, board, baseProjectLines, rank]) // eslint-disable-line react-hooks/exhaustive-deps
  /** The orders as they are drawn: as the stroke under way would leave them. */
  const orders = plan?.orders ?? stored
  const shownBoard = useMemo<HireBoard>(() => (plan ? hireBoard(counted ? [...styles.keys()] : [], dates, restOf, orders, wd) : board), [plan, board, counted, styles, dates, restOf, orders, wd])
  const projectLines = useMemo(() => (plan && brush ? projectLinesOf(brush, orders) : baseProjectLines), [plan, brush, projectLinesOf, orders, baseProjectLines])
  /** What the brush would order on the day under a still pointer, as Faste shows its time there: on the lines alone, the demand as it is. */
  const hovered = useMemo(
    () => (!stroke && active && activeTool === 'paint' && brush && hover ? planOf({ mode: 'paint', row0: hover.row, col0: hover.col, row1: hover.row, col1: hover.col }, stored) : null),
    [stroke, active, activeTool, brush, hover, stored, lineRefs, brushProject, people, suppliers, wd, dates], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const preview = plan ?? hovered
  /** The orders a stroke, or the brush under a still pointer, adds or changes, or takes away (Tøm): drawn as they would be. */
  const marked = useMemo(() => {
    if (!preview) return null
    const before = new Set(stored)
    const after = new Set(preview.orders)
    return stroke?.mode === 'erase' || preview.removes ? { going: (order: HireOrder) => !after.has(order) } : { coming: (order: HireOrder) => !before.has(order) }
  }, [preview, stored, stroke])

  // ---- the layout of the suppliers' lines, which a point of the pointer is measured against ------------------------------------
  const drawn = cols.dates
  // On a stroke of Tøm the orders it takes away are still drawn, marked, so the lines keep the lanes they have.
  const drawnOrders = stroke?.mode === 'erase' || plan?.removes ? stored : (hovered?.orders ?? orders)
  const blocks = useMemo<SupplierBlock[]>(() => {
    const byLine = new Map<string, HireOrder[]>()
    for (const order of drawnOrders) pushTo(byLine, lineKey(order.supplierId, order.shift), order)
    let top = 0
    return listed.map((supplier, at) => {
      const divider = at === able && able < listed.length
      if (divider) top += DIVIDER_H
      const lines = supplierLines(supplier, stored)
      // Every supplier has a name line over its shifts, which folds them, one shift or several (2026-10-27).
      const isFolded = folded.includes(supplier.id)
      const block: SupplierBlock = { supplier, dim: at >= able, divider, folded: isFolded, top, rows: [] }
      top += PERSON_H
      if (!isFolded)
        for (const line of lines) {
          const runs = orderRuns(byLine.get(line.key) ?? NO_ORDERS, drawn, rank)
          const height = shiftLine(runs.lanes.length).height
          block.rows.push({ line, runs, top, height })
          top += height
        }
      return block
    })
  }, [listed, able, stored, drawnOrders, folded, drawn, rank])
  const shiftRows = useMemo(() => blocks.flatMap((block) => block.rows), [blocks])
  /** The line under a point: the first that ends below it, so a point on a name line or the divider is the line under it. */
  const rowAt = (y: number) => {
    if (!shiftRows.length) return null
    const at = shiftRows.findIndex((row) => y < row.top + row.height)
    return at < 0 ? shiftRows.length - 1 : at
  }

  // ---- the stroke ------------------------------------------------------------------------------------------------------------
  const setOrders = (change: (orders: HireOrder[]) => HireOrder[]) => updateStaffing((w) => ({ ...w, hireOrders: change(w.hireOrders ?? []) }))
  const bodyRef = useRef<HTMLDivElement>(null)
  const panelOpen = useRef(false)
  useEffect(() => {
    panelOpen.current = panel !== null
  }, [panel])
  const label = (competence: CompetenceKey) => styles.get(competence)?.label ?? competence
  const nameOf = (id: string) => suppliers.find((supplier) => supplier.id === id)?.name ?? 'Leverandøren'
  /** What a press landed on: a run, with its orders and where it is, and the days selected before it. */
  const pressed = useRef<{ ids: string[]; at: DOMRect; selection: Rect | null } | null>(null)
  const input = useStrokeInput({
    wd,
    scrollRef,
    bodyRef,
    rowAt,
    colW: cols.colW,
    dates,
    stops: false,
    block: '.il-run',
    strokeState,
    activeTool,
    panelOpen,
    selection,
    setSelection,
    onFocusDate,
    paint: (s) => {
      const done = planOf(s, stored)
      if (!done || !brush) return
      if (done.orders !== stored) setOrders((list) => planOf(s, list)?.orders ?? list)
      const { lines } = cellsOf(s)
      if (done.skipped && done.skipped === lines.length) toast(`${lines.length === 1 ? 'Leverandøren' : 'Ingen av leverandørene'} tilbyr ${label(brush)}.`)
    },
    clear: (s) => setOrders((list) => planOf(s, list)?.orders ?? list),
    // A day's orders on a line dragged to another day or line, or copied there with Alt, as Faste moves a day's blocks.
    moveBlocks: (s, copy) => {
      const from = lineDayAt(s.row0, s.col0)
      const to = lineDayAt(s.row1, s.col1)
      if (!from || !to) return
      const moved = moveOrders(stored, from, to, copy, suppliers, wd)
      if (!moved.moved) return void (moved.skipped && toast(`${nameOf(to.supplierId)} tilbyr ikke kompetansen.`))
      setOrders((list) => moveOrders(list, from, to, copy, suppliers, wd).orders)
      if (moved.skipped) toast(`${count(moved.skipped, 'bestilling', 'bestillinger')} ble stående: ${nameOf(to.supplierId)} tilbyr ikke kompetansen.`)
    },
    finishStretch: () => {
      if (stroke?.mode === 'stretch') setOrders((list) => stretchPlan(stroke, list)?.orders ?? list)
    },
    // A click on a run selects its day and opens its popover; inside days selected before, the popover is for the orders of all of them.
    clicked: (s) => {
      const press = pressed.current
      pressed.current = null
      if (s.mode !== 'move' || !press?.ids.length) return
      const before = press.selection
      const inside = before && (before.row0 !== before.row1 || before.col0 !== before.col1) && within(before, s.row0, s.col0)
      // A click that opens the popover keeps its day selected, where a second click on a selected day would let go of it.
      setSelection(inside ? before : { row0: s.row0, col0: s.col0, row1: s.row0, col1: s.col0 })
      // A part of a shared person opens the whole person (slice 6), as every edit takes it.
      const ids = withPerson(stored, inside ? clearedIds(cellsOfRect(before)) : press.ids)
      setOrderPop({ ids, date: dates[s.col0], at: press.at })
    },
  })
  const { cancelStroke } = input

  /** The days of the lines of a block of them. */
  const cellsOfRect = (rect: Rect): LineDay[] => {
    const { lines, days } = cellsOf({ mode: 'select', ...rect })
    return lines.flatMap((line) => days.map((date) => ({ supplierId: line.supplierId, shift: line.shift, date })))
  }
  /** The days of the lines selected, to remove. */
  const selectionCells = (): LineDay[] => (selection ? cellsOfRect(selection) : [])
  /** The ids of the orders on some days of the lines. */
  const clearedIds = (cells: LineDay[]): string[] => {
    const left = new Set(clearOrders(stored, cells))
    return stored.filter((order) => !left.has(order)).map((order) => order.id)
  }
  const copySelection = () => {
    if (!selection) return toast('Velg dager med «Velg» for å kopiere dem.')
    const { rowFrom, rowTo, colFrom, colTo } = strokeRange({ mode: 'select', ...selection })
    const copied = copyOrders(stored, lineRefs.slice(rowFrom, rowTo + 1), dates.slice(colFrom, colTo + 1))
    if (!copied) return toast('Ingen bestillinger å kopiere i det som er valgt.')
    setClip(copied)
    toast(`Kopierte ${count(copied.items.length, 'bestilling', 'bestillinger')}`)
  }
  /** Pastes from the line and day under the pointer, else from the first day selected, as Faste does (R34). */
  const pasteClip = () => {
    const at = hover ?? (selection ? { row: Math.min(selection.row0, selection.row1), col: Math.min(selection.col0, selection.col1) } : null)
    if (!clip || !at) return
    const lines = lineRefs.slice(at.row)
    const days = dates.slice(at.col)
    const result = pasteOrders(stored, clip, lines, days, suppliers, wd)
    if (!result.pasted) return toast(`Ingenting ble limt inn fra ${dayText(dates[at.col])}: leverandørene tilbyr ikke kompetansen, eller det er ikke plass.`)
    setOrders((list) => pasteOrders(list, clip, lines, days, suppliers, wd).orders)
    toast(`Limte inn ${count(result.pasted, 'bestilling', 'bestillinger')} fra ${dayText(dates[at.col])}${result.skipped ? ` · ${result.skipped} hoppet over` : ''}`, { label: 'Angre', run: undo })
  }

  const stepCount = (delta: number) => brush && setCounts((now) => ({ ...now, [brush]: clamp((now[brush] ?? 1) + delta, 0, MOST_PEOPLE) }))

  /** Brings a day into view if it is not there already: nothing moves for a day the planner can see. */
  const reveal = (date: ISODate) => {
    const at = dates.indexOf(date)
    if (at < viewFrom || at > viewTo) onShowDate(date)
  }
  /** The next day that is short, from the days in view on: its first competence that is short is the brush, and the day is shown. */
  const openNextUnder = () => {
    const date = board.underDays.find((day) => day >= dates[viewFrom]) ?? board.underDays[0]
    const style = date && rows.find((row) => board.cover(row.key, date).state === 'short')
    if (!style) return
    pickBrush(style.key)
    reveal(date)
  }
  /** An order shown in the grid: its competence and project the brush, Velg, and its day on its line selected. */
  const showOrder = (order: HireOrder) => {
    pick.take(order.competence, order.projectNo?.trim() ? order.projectNo : null, 'select')
    const row = lineRefs.findIndex((line) => line.key === lineKey(order.supplierId, order.shift))
    const col = dates.indexOf(order.date)
    setSelection(row >= 0 && col >= 0 ? { row0: row, col0: col, row1: row, col1: col } : null)
    reveal(order.date)
  }

  const edits = {
    /** Every order of a supplier that waits is confirmed, in one step. */
    confirmAll: (supplierId: string) => setOrders((list) => confirmOrders(list, list.filter((order) => order.supplierId === supplierId && isWaiting(order)).map((order) => order.id))),
    /** An order's answer the other way: confirmed if it waits, waiting if it is confirmed. */
    toggleAnswer: (order: HireOrder) => setOrders((list) => (isWaiting(order) ? confirmOrders(list, [order.id]) : setWaiting(list, [order.id]))),
    offers: (supplierId: string, competence: CompetenceKey) => updateStaffing((w) => ({ ...w, suppliers: toggleSupplierCompetence(w.suppliers ?? [], supplierId, competence) })),
    shift: (supplierId: string, shift: ShiftId) => updateStaffing((w) => ({ ...w, suppliers: toggleSupplierShift(w.suppliers ?? [], supplierId, shift) })),
    count: (ids: string[], by: number) => setOrders((list) => changeCount(list, ids, by)),
    fewer: (ids: string[], people: number) => setOrders((list) => confirmFewer(list, ids, people)),
    times: (ids: string[], times: { start: number; end: number }) => setOrders((list) => changeOrders(list, ids, times)),
    waits: (ids: string[]) => setOrders((list) => setWaiting(list, ids)),
    confirm: (ids: string[]) => setOrders((list) => confirmOrders(list, ids)),
    tag: (ids: string[], projectNo: string | null) => setOrders((list) => tagOrders(list, ids, projectNo)),
    /** «Slå sammen»: the orders, a day at a time, one shared person, or as few as their lanes lack together. */
    share: (ids: string[]) => {
      const done = sharePerson(stored, ids, needOf, wd)
      if (!done.shared) return toast('Hver kompetanse må mangle timer uten disse bestillingene for å deles på én person.')
      setOrders((list) => sharePerson(list, ids, needOf, wd).orders)
    },
    split: (ids: string[]) => setOrders((list) => splitPerson(list, ids)),
    /** The days of a supplier's lines where «Slå sammen» makes fewer people. */
    sharings: (supplierId: string) => sharingOffers(stored, supplierId, needOf, wd),
    remove: (ids: string[]) => {
      setOrders((list) => removeOrders(list, ids))
      setOrderPop(null)
    },
  }
  /** The projects an order of a competence can be for: those with work in the days in view, as its project lines. */
  const projectsFor = (competence: CompetenceKey): string[] => linesOf(competence, stored).flatMap((line) => (line.projectNo ? [line.projectNo] : []))

  const actions = useStableActions({
    cellDown: (event: React.MouseEvent) => {
      const run = event.target instanceof Element && !event.altKey ? event.target.closest<HTMLElement>('.il-run') : null
      pressed.current = run ? { ids: (run.dataset.ids ?? '').split(' ').filter(Boolean), at: run.getBoundingClientRect(), selection } : null
      input.cellDown(event)
    },
    /** The pointer moved over the lines: the line and day under it is where a paste lands. */
    bodyMove: (event: React.MouseEvent) => {
      if ((!clip && activeTool !== 'paint') || stroke) return
      const at = input.cellAt(event.clientX, event.clientY)
      setHover((h) => (at && h && h.row === at.row && h.col === at.col ? h : at))
    },
    bodyLeave: () => setHover(null),
    pickFromDemand,
    pickProject: (projectNo: string) => pickProject(projectNo === brushProject ? null : projectNo),
    /** A click on a day of the demand makes its competence, or its project's line, the brush, and opens the day's balance, as in Faste. */
    pickDay: (competence: CompetenceKey, projectNo: string | undefined, date: ISODate, event: React.MouseEvent) => {
      if (competence !== brush) pickBrush(competence)
      if (projectNo && projectNo !== NO_PROJECT) pickProject(projectNo)
      onFocusDate(date)
      setDemandPop({ competence, ...(projectNo && { projectNo }), date, x: event.clientX, y: event.clientY })
    },
    openSupplier: (id: string) => setPanel((now) => (now?.kind === 'supplier' && now.id === id ? null : { kind: 'supplier', id })),
    fold: (id: string) => {
      setSelection(null)
      setFolded((now) => (now.includes(id) ? now.filter((one) => one !== id) : [...now, id]))
    },
  })

  // The keys are Faste's (2026-10-26): Escape, V, B and T, the brush by 1 to 9 and its count by + and −, the lines by ↑ and ↓, and Delete.
  useBemanningKeys({
    active,
    holdShift: input.holdShift,
    canCopy: selection !== null,
    canPaste: clip !== null,
    copy: copySelection,
    paste: pasteClip,
    popoverOpen: orderPop !== null || demandPop !== null,
    stroking: stroke !== null,
    cancelStroke,
    selection: selection !== null,
    dropSelection: () => setSelection(null),
    brushOrTool: brush !== null || pick.tool !== 'select',
    clearBrush,
    panel: panel !== null,
    closePanel: () => setPanel(null),
    fold: () => {},
    pickTool,
    brushKeys: pickKeys(bm.demandRows, isOffered),
    pickBrush,
    stepCount,
    canStepLines: brush !== null && projectLines.some((line) => !line.rest),
    stepLines,
    remove: orderPop ? () => edits.remove(orderPop.ids) : selection ? () => setOrders((list) => clearOrders(list, selectionCells())) : null,
    help: () => setPanel(panel?.kind === 'help' ? null : { kind: 'help' }),
  })

  /** What the pill over a stroke or the selection says. */
  const pill = useMemo(() => {
    if (!stroke) return null
    const { rowFrom, rowTo, colFrom, colTo } = strokeRange(stroke)
    const lines = count(rowTo - rowFrom + 1, 'linje', 'linjer')
    // The hours the stroke orders, or takes away, as the plan of it would leave the orders.
    const change = plan ? hoursChange(stored, plan.orders, wd) : 0
    const hours = Math.abs(change) > HOURS_NOISE ? [`${change > 0 ? '+' : '−'}${hoursText(Math.abs(change))} t`] : []
    if (stroke.mode === 'erase') {
      const lane = stroke.lane ? laneFrom(stroke.lane) : null
      return { mode: 'erase' as const, competence: lane?.competence, projectNo: lane?.projectNo, text: [count(colTo - colFrom + 1, 'dag', 'dager'), lines, ...hours, ...(lane ? ['Shift: alt'] : [])] }
    }
    if (stroke.mode === 'paint' && plan && brush) return { mode: 'paint' as const, competence: brush, projectNo: brushProject ?? undefined, text: [`${count(plan.days, 'dag', 'dager')} × ${lines}`, people ? `${people} pers.` : 'Auto: det som mangler', ...hours, ...(plan.skipped ? [`${plan.skipped} hoppes over`] : []), ...(stroke.toDemand ? ['til behovet er dekket'] : [])] }
    return null
  }, [stroke, plan, brush, brushProject, people, stored, wd])

  return {
    board: shownBoard, rows, waiting: useMemo(() => waitingHours(stored, wd), [stored, wd]), urgent: useMemo(() => urgentWaits(stored, todayIso()), [stored]), suppliers, orders, stored, wd, view,
    tool: activeTool, pickTool, brush, brushProject, people, stepCount, clearBrush, pickBrush, isOffered,
    panel, setPanel, openControl: () => setPanel({ kind: 'control' }), openNextUnder, showOrder,
    projectLines, projectName, blocks, shiftRows, lineRefs, able, bodyRef, stroke, selection, marked, pill, edits, actions,
    clip, orderPop, setOrderPop, demandPop, setDemandPop, projectsFor, pickProject,
  }
}

type InnleidState = ReturnType<typeof useInnleidState>
export type InnleidActions = InnleidState['actions']

const InnleidContext = createContext<InnleidState | null>(null)

/**
 * What the parts of Innleid share: the board of the period, the brush, the suppliers' lines with what a stroke over them would
 * do, and the edits of the orders. The board is worked out in both parts of Bemanning, for the Avvik line they share
 * (`counted`); the rest only while Innleid is shown (`active`).
 */
export function InnleidScope({ active, counted, children }: { active: boolean; counted: boolean; children: ReactNode }) {
  const state = useInnleidState(active, counted)
  return <InnleidContext.Provider value={state}>{children}</InnleidContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useInnleid = (): InnleidState => {
  const state = useContext(InnleidContext)
  if (!state) throw new Error('Innleid is read outside its scope')
  return state
}

