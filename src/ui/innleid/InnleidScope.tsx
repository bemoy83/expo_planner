import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ISODate } from '../../domain/dates'
import { changeCount, changeOrders, clearOrders, confirmFewer, confirmOrders, coverage, dayKey, hireBoard, isWaiting, lineKey, orderRuns, ordersByDay, paintOrders, setWaiting, shareOrders, supplierLines, waitingHours, type Coverage, type HireBoard, type HireLine, laneFrom, type LineDay, type LineRuns, type SupplierLine } from '../../domain/hire'
import { toggleSupplierCompetence, toggleSupplierShift } from '../../domain/suppliers'
import { NO_PROJECT, projectsWithWork } from '../../domain/staffing/projectBalance'
import { numberKey } from '../../domain/projects'
import { pushTo } from '../../domain/collections'
import { sameProject, type CompetenceKey, type CompetenceStyle, type HireOrder, type ShiftId, type Supplier } from '../../domain/types'
import { usePref } from '../../store/prefs'
import { useBemanning, type Density } from '../bemanning/BemanningScope'
import { projectDays, restDays } from '../bemanning/lineBalances'
import { DIVIDER_H, shiftLine } from '../bemanning/layout'
import { strokeRange, type Rect, type Stroke } from '../bemanning/tools'
import { useBemanningKeys } from '../bemanning/useBemanningKeys'
import { useStrokeInput, useStrokeState } from '../bemanning/useStrokeInput'
import { useStableActions } from '../kalender/useStableActions'
import { ROW_H } from '../kalender/layout'
import { clamp } from '../../domain/numbers'
import { count } from '../dom'
import type { ToolKind } from '../toolKeys'

/** What the side panel of Innleid shows: the suppliers' orders to look over and confirm, one supplier's order, or the help. */
type InnleidPanel = { kind: 'control' } | { kind: 'supplier'; id: string } | { kind: 'help' }

/** The tools of Innleid, Faste's: select days, paint orders on the suppliers' lines, or empty them. */
export type HireTool = ToolKind

/** Innleid opens on the compact lines, where a competence is one line high. */
const cleanDensity = (stored: unknown): Density => (stored === 'detail' ? 'detail' : 'compact')
const cleanFolded = (stored: unknown): string[] => (Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [])
const cleanCounts = (stored: unknown): Record<string, number> =>
  stored && typeof stored === 'object' ? Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] >= 1)) : {}

const NO_ORDERS: HireOrder[] = []
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
  /** It has one line, which has its name. */
  single: boolean
  folded: boolean
  /** The top of its first line, the name line where it has one. */
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
}

function useInnleidState(active: boolean, counted: boolean) {
  const bm = useBemanning()
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
  const baseBoard = useMemo<HireBoard>(() => hireBoard(counted ? [...styles.keys()] : [], dates, restOf, stored, wd), [counted, styles, dates, restOf, stored, wd])
  const rows = useMemo<CompetenceStyle[]>(() => baseBoard.competences.map((key) => styles.get(key)!), [baseBoard, styles])

  // ---- the brush: a competence, and under it maybe a project, with a count of people ------------------------------------------
  const [tool, setTool] = useState<HireTool>('select')
  const [brushKey, setBrushKey] = useState<CompetenceKey | null>(null)
  const [brushProjectKey, setBrushProject] = useState<string | null>(null)
  const [counts, setCounts] = usePref<Record<string, number>>('innleidCounts', {}, cleanCounts)
  const brush = brushKey && rows.some((style) => style.key === brushKey) ? brushKey : null
  const activeTool: HireTool = tool === 'paint' && !brush ? 'select' : tool
  const people = brush ? (counts[brush] ?? 1) : 1
  const [density, setDensity] = usePref<Density>('innleidDensity', 'compact', cleanDensity)
  const [folded, setFolded] = usePref<string[]>('innleidFolded', [], cleanFolded)
  const [storedPanel, setPanel] = useState<InnleidPanel | null>(null)
  // A supplier that is removed has no panel.
  const panel = !active || (storedPanel?.kind === 'supplier' && !suppliers.some((supplier) => supplier.id === storedPanel.id)) ? null : storedPanel
  const [selection, setSelection] = useState<Rect | null>(null)
  const strokeState = useStrokeState()
  const { stroke } = strokeState

  // The competence of the brush follows between Faste and Innleid (2026-10-26): taken from Faste when Innleid is shown, and handed back when it is left.
  const [shown, setShown] = useState(active)
  if (shown !== active) {
    setShown(active)
    if (active && bm.brush) {
      setBrushKey(bm.brush)
      setBrushProject(bm.brushProject)
    }
  }
  useEffect(() => {
    if (active || !brush || brush === bm.brush || !bm.keyOf.has(brush)) return
    bm.pickBrush(brush)
    if (activeTool !== 'paint') bm.pickTool('select')
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

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
    (orders: HireOrder[]): HireProjectLine[] => {
      if (!brush) return []
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
        return { projectNo: line.projectNo ?? NO_PROJECT, name: rest ? 'Uten prosjekt' : projectName(line.projectNo!), rest, orders: ordersOf, cover, missing: view.reduce((sum, date) => sum + Math.max(0, cover(date).remaining), 0) }
      })
      const projects = all.filter((line) => !line.rest)
      const rest = all.find((line) => line.rest)!
      return projects.length && view.some((date) => rest.cover(date).state !== 'none') ? all : projects
    },
    [brush, linesOf, view, projectName, wd],
  )
  const baseProjectLines = useMemo(() => projectLinesOf(stored), [projectLinesOf, stored])
  const brushProject = brushProjectKey && baseProjectLines.some((line) => !line.rest && numberKey(line.projectNo) === numberKey(brushProjectKey)) ? brushProjectKey : null

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
  const board = baseBoard
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
  const planOf = (s: Stroke, orders: HireOrder[]): StrokePlan | null => {
    const { lines, days } = cellsOf(s)
    if (s.mode === 'erase') return { orders: clearOrders(orders, lines.flatMap((line) => days.map((date) => ({ supplierId: line.supplierId, shift: line.shift, date })) satisfies LineDay[]), s.lane ? laneFrom(s.lane) : undefined), skipped: 0, days: days.length }
    if (s.mode !== 'paint' || !brush) return null
    // Shift: the stroke goes no further than the last day the brush's line lacks hours on.
    const forward = s.col1 >= s.col0
    const along = forward ? days : [...days].reverse()
    let last = along.length - 1
    if (s.toDemand) while (last >= 0 && lacking(along[last]) <= 0) last--
    const reached = along.slice(0, last + 1)
    const painted = paintOrders(orders, { lines, competence: brush, ...(brushProject && { projectNo: brushProject }), dates: reached, count: people }, suppliers, wd)
    return { orders: painted.orders, skipped: painted.skipped, days: reached.length }
  }
  const plan = useMemo(() => (stroke && active ? planOf(stroke, stored) : null), [stroke, active, stored, lineRefs, brush, brushProject, people, suppliers, wd, dates, board, baseProjectLines]) // eslint-disable-line react-hooks/exhaustive-deps
  /** The orders as they are drawn: as the stroke under way would leave them. */
  const orders = plan?.orders ?? stored
  const shownBoard = useMemo<HireBoard>(() => (plan ? hireBoard(counted ? [...styles.keys()] : [], dates, restOf, orders, wd) : baseBoard), [plan, baseBoard, counted, styles, dates, restOf, orders, wd])
  const projectLines = useMemo(() => (plan ? projectLinesOf(orders) : baseProjectLines), [plan, projectLinesOf, orders, baseProjectLines])
  /** The orders a stroke adds or changes (the brush), or takes away (Tøm): drawn as they would be. */
  const marked = useMemo(() => {
    if (!plan) return null
    const before = new Set(stored)
    const after = new Set(plan.orders)
    return stroke?.mode === 'erase' ? { going: (order: HireOrder) => !after.has(order) } : { coming: (order: HireOrder) => !before.has(order) }
  }, [plan, stored, stroke])

  // ---- the layout of the suppliers' lines, which a point of the pointer is measured against ------------------------------------
  const drawn = cols.dates
  const rank = useMemo(() => {
    const order = new Map([...styles.keys()].map((key, at) => [key, at]))
    return (competence: string) => order.get(competence) ?? order.size
  }, [styles])
  // On a stroke of Tøm the orders it takes away are still drawn, marked, so the lines keep the lanes they have.
  const drawnOrders = stroke?.mode === 'erase' ? stored : orders
  const blocks = useMemo<SupplierBlock[]>(() => {
    const byLine = new Map<string, HireOrder[]>()
    for (const order of drawnOrders) pushTo(byLine, lineKey(order.supplierId, order.shift), order)
    let top = 0
    return listed.map((supplier, at) => {
      const divider = at === able && able < listed.length
      if (divider) top += DIVIDER_H
      const lines = supplierLines(supplier, stored)
      const single = lines.length === 1
      const isFolded = !single && folded.includes(supplier.id)
      const block: SupplierBlock = { supplier, dim: at >= able, divider, single, folded: isFolded, top, rows: [] }
      if (!single) top += ROW_H
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
  })
  const { cancelStroke } = input

  /** The days of the lines selected, to remove. */
  const selectionCells = (): LineDay[] => {
    if (!selection) return []
    const { lines, days } = cellsOf({ mode: 'select', ...selection })
    return lines.flatMap((line) => days.map((date) => ({ supplierId: line.supplierId, shift: line.shift, date })))
  }

  // ---- the brush picked, as in Faste (`useBrush`) ----------------------------------------------------------------------------
  const pickBrush = (competence: CompetenceKey) => {
    if (competence !== brush) setBrushProject(null)
    setBrushKey(competence)
    setTool('paint')
    setSelection(null)
  }
  const clearBrush = () => {
    setBrushKey(null)
    setBrushProject(null)
    setTool('select')
    setSelection(null)
  }
  /** A project's line under the brush's competence is made the brush, or the sum line where it is `null`. */
  const pickProject = (projectNo: string | null) => {
    setBrushProject(projectNo)
    setTool('paint')
    setSelection(null)
  }
  /** On the brush's competence, a pick goes from a project's line back to the sum line, and from the sum line out of focus. */
  const pickFromDemand = (competence: CompetenceKey) => (competence === brush ? (brushProject ? pickProject(null) : clearBrush()) : pickBrush(competence))
  /** R14: with no brush, Pensel takes the competence with the most missing in the days in view. */
  const pickTool = (next: HireTool) => {
    if (next === 'paint' && !brush) {
      const missing = (key: CompetenceKey) => view.reduce((sum, date) => sum + Math.max(0, board.cover(key, date).remaining), 0)
      const most = [...rows].sort((a, b) => missing(b.key) - missing(a.key))[0]
      if (!most) return toast('Ingen kompetanse har restbehov i perioden.')
      setBrushKey(most.key)
    }
    setTool(next)
  }
  /** The project lines a step up or down from the brush's, the sum line first. */
  const stepLines = (delta: number) => {
    const steps = [null, ...projectLines.filter((line) => !line.rest).map((line) => line.projectNo)]
    const at = steps.findIndex((projectNo) => projectNo === brushProject)
    pickProject(steps[clamp(at + delta, 0, steps.length - 1)])
  }
  const stepCount = (delta: number) => brush && setCounts((now) => ({ ...now, [brush]: clamp((now[brush] ?? 1) + delta, 1, MOST_PEOPLE) }))

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
    setBrushKey(order.competence)
    setBrushProject(order.projectNo?.trim() ? order.projectNo : null)
    setTool('select')
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
  }

  const actions = useStableActions({
    cellDown: (event: React.MouseEvent) => input.cellDown(event),
    pickFromDemand,
    pickProject: (projectNo: string) => pickProject(projectNo === brushProject ? null : projectNo),
    /** A click on a day of the demand makes its competence, or its project's line, the brush. */
    pickDay: (competence: CompetenceKey, projectNo: string | undefined) => {
      if (competence !== brush) pickBrush(competence)
      if (projectNo && projectNo !== NO_PROJECT) pickProject(projectNo)
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
    popoverOpen: false,
    stroking: stroke !== null,
    cancelStroke,
    selection: selection !== null,
    dropSelection: () => setSelection(null),
    brushOrTool: brush !== null || tool !== 'select',
    clearBrush,
    panel: panel !== null,
    closePanel: () => setPanel(null),
    fold: () => {},
    pickTool,
    brushKeys: rows.map((style) => style.key),
    pickBrush,
    stepCount,
    canStepLines: brush !== null && projectLines.some((line) => !line.rest),
    stepLines,
    remove: selection ? () => setOrders((list) => clearOrders(list, selectionCells())) : null,
    help: () => setPanel(panel?.kind === 'help' ? null : { kind: 'help' }),
  })

  /** What the pill over a stroke or the selection says. */
  const pill = useMemo(() => {
    if (!stroke) return null
    const { rowFrom, rowTo, colFrom, colTo } = strokeRange(stroke)
    const lines = count(rowTo - rowFrom + 1, 'linje', 'linjer')
    if (stroke.mode === 'erase') {
      const only = stroke.lane ? laneFrom(stroke.lane) : null
      return { mode: 'erase' as const, competence: only?.competence, projectNo: only?.projectNo, text: [count(colTo - colFrom + 1, 'dag', 'dager'), lines, ...(only ? ['Shift: alt'] : [])] }
    }
    if (stroke.mode === 'paint' && plan && brush) return { mode: 'paint' as const, competence: brush, projectNo: brushProject ?? undefined, text: [`${count(plan.days, 'dag', 'dager')} × ${lines}`, `${people} pers.`, ...(plan.skipped ? [`${plan.skipped} hoppes over`] : []), ...(stroke.toDemand ? ['til behovet er dekket'] : [])] }
    return null
  }, [stroke, plan, brush, brushProject, people])

  return {
    board: shownBoard, rows, waiting: useMemo(() => waitingHours(stored, wd), [stored, wd]), suppliers, orders, stored, wd, view,
    tool: activeTool, pickTool, brush, brushProject, people, stepCount, clearBrush, pickBrush, density, setDensity,
    panel, setPanel, openControl: () => setPanel({ kind: 'control' }), openNextUnder, showOrder,
    projectLines, projectName, blocks, shiftRows, lineRefs, able, bodyRef, stroke, selection, marked, pill, edits, actions,
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

