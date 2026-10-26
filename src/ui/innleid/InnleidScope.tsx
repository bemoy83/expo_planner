import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ISODate } from '../../domain/dates'
import { changeCount, changeOrders, confirmFewer, confirmOrders, coverage, dayKey, fillGroup, groupKey, hireBoard, isWaiting, mergeOrders, orderGroups, ordersByDay, planAcross, eraseOrders, removeOrders, setWaiting, tagOrders, waitingHours, type Coverage, type HireBoard, type HireLine, type OrderGroup } from '../../domain/hire'
import { toggleSupplierCompetence, toggleSupplierShift } from '../../domain/suppliers'
import { NO_PROJECT, projectsWithWork } from '../../domain/staffing/projectBalance'
import { sameProject, type CompetenceKey, type CompetenceStyle, type HireOrder, type Interval, type ShiftId, type Supplier } from '../../domain/types'
import { usePref } from '../../store/prefs'
import { useBemanning, type Density } from '../bemanning/BemanningScope'
import { projectDays, restDays } from '../bemanning/lineBalances'
import { useStableActions } from '../kalender/useStableActions'
import { daysAcross, useFollowPointer } from '../bemanning/useFollowPointer'
import { clamp } from '../../domain/numbers'
import type { ToolKind } from '../toolKeys'
import { useBemanningKeys } from '../bemanning/useBemanningKeys'

/** The competence that is open, the days picked on it that the editor in its label works on (none where it is opened by its name), and the line of the editor that is picked. */
interface OpenDays {
  competence: CompetenceKey
  /** The line under the competence the days were picked on: a project, or `NO_PROJECT` for «Uten prosjekt»; none on the competence's own. */
  projectNo?: string
  from: ISODate | null
  to: ISODate | null
  /** The key of an `OrderGroup`. */
  group: string | null
}

/** What a popover of the editor is about, and the button it opens under. */
interface OrderPop {
  kind: 'brush' | 'more' | 'supplier' | 'shift' | 'time' | 'answer'
  /** The line of the editor it belongs to; none for the supplier of the brush. */
  group: string | null
  at: DOMRect
}

/** What the side panel of Innleid shows: the suppliers' orders to look over and confirm, one supplier's order, or the help. */
type InnleidPanel = { kind: 'control' } | { kind: 'supplier'; id: string } | { kind: 'help' }

/** The tools of Innleid: pick days, order a supplier across days, or remove orders across days. */
export type HireTool = ToolKind

/** A stroke across the days of a competence, or of a line under it, with the tool it was started with. */
interface DayDrag {
  competence: CompetenceKey
  /** The line under the competence the stroke is on (see `OpenDays`); none on the competence's own. */
  projectNo?: string
  mode: HireTool
  anchor: ISODate
  focus: ISODate
}

/** What a stroke would do, or the brush where the pointer is: the orders it would add, or the days whose orders would go. */
export interface StrokePreview {
  competence: CompetenceKey
  projectNo?: string
  mode: 'paint' | 'erase'
  from: ISODate
  to: ISODate
  /** With the brush: the orders it would add. */
  added: HireOrder[]
  /** The supplier ordered, or the one whose orders go; none where every supplier's go. */
  supplierId: string | undefined
}

/** Innleid opens on the compact lines, where a folded competence is one line high whatever it has of orders. */
const cleanDensity = (stored: unknown): Density => (stored === 'detail' ? 'detail' : 'compact')

const NO_ORDERS: HireOrder[] = []
const NO_SUPPLIERS: Supplier[] = []

/**
 * A line under the competence that is open, as Faste has them: a project, with its days covered by the orders for it against
 * what the project lacks after the permanent staff, and under the projects «Uten prosjekt», what is on none of them.
 */
export interface HireProjectLine {
  /** `NO_PROJECT` for «Uten prosjekt». */
  projectNo: string
  name: string
  /** The line of what is on none of the projects. */
  rest: boolean
  cover: (date: ISODate) => Coverage
  orders: (date: ISODate) => HireOrder[]
  holds: (order: HireOrder) => boolean
  /** The hours missing in the days in view. */
  missing: number
}

function useInnleidState(active: boolean, counted: boolean) {
  const { ws, dates, cols, scrollRef, balance, styles, updateStaffing, onShowDate, viewFrom, viewTo, projectBalance, kalenderProjects, projectName } = useBemanning()
  const orders = ws.hireOrders ?? NO_ORDERS
  const suppliers = ws.suppliers ?? NO_SUPPLIERS
  const wd = ws.settings.workday
  /** The hours of a competence a day that remain after the permanent staff: of a project, where one is given, counting its share of the untagged. */
  const restOf = useCallback(
    (competence: CompetenceKey, date: ISODate, projectNo?: string) => Math.max(0, projectNo ? projectBalance.of(competence, date, projectNo).remaining : balance.get(competence, date).remaining),
    [balance, projectBalance],
  )
  /** The orders per competence and day. */
  const ordersOn = useMemo(() => ordersByDay(orders), [orders])
  /**
   * The lines of a competence that orders are made for: its projects with work in the days in view, as Bemanning has them
   * (`projectsWithWork`), and what is on none of them, worked out as Faste does (`restDays`).
   */
  const linesOf = useCallback(
    (competence: CompetenceKey): HireLine[] => {
      const view = dates.slice(viewFrom, viewTo + 1)
      const ordered = (date: ISODate) => (ordersOn.get(dayKey(competence, date)) ?? NO_ORDERS).map((order) => order.projectNo)
      const projects = projectsWithWork(projectBalance, competence, view, kalenderProjects, projectName, ordered)
      const lines: HireLine[] = projects.map((projectNo) => ({ projectNo, restOf: (date) => restOf(competence, date, projectNo), holds: (order) => sameProject(order, { projectNo }) }))
      // What is on none of the projects, as Faste's line «Uten prosjekt» has it (`restDays`).
      const rest = restDays(balance, projects.map((projectNo) => projectDays(projectBalance, projectNo)))
      lines.push({
        restOf: (date) => Math.max(0, rest.get(competence, date).remaining),
        holds: (order) => !projects.some((projectNo) => sameProject(order, { projectNo })),
      })
      return lines
    },
    [dates, viewFrom, viewTo, ordersOn, balance, projectBalance, kalenderProjects, projectName, restOf],
  )
  /** The lines a stroke works on: on the competence's own line all of them, on a line under it that one. */
  const linesFor = (competence: CompetenceKey, projectNo?: string): HireLine[] => {
    const lines = linesOf(competence)
    return projectNo === undefined ? lines : lines.filter((line) => (line.projectNo ?? NO_PROJECT) === projectNo)
  }
  const board = useMemo<HireBoard>(() => hireBoard(counted ? [...styles.keys()] : [], dates, restOf, orders, wd), [counted, styles, dates, restOf, orders, wd])
  const rows = useMemo<CompetenceStyle[]>(() => board.competences.map((key) => styles.get(key)!), [board, styles])
  const waiting = useMemo(() => waitingHours(orders, wd), [orders, wd])

  const [density, setDensity] = usePref<Density>('innleidDensity', 'compact', cleanDensity)
  const [stored, setOpen] = useState<OpenDays | null>(null)
  const [pop, setPop] = useState<OrderPop | null>(null)
  const [storedPanel, setPanel] = useState<InnleidPanel | null>(null)
  // A supplier that is removed has no panel.
  const panel = !active || (storedPanel?.kind === 'supplier' && !suppliers.some((supplier) => supplier.id === storedPanel.id)) ? null : storedPanel
  // The days a drag across a competence's line has reached, until the mouse is let go.
  const [drag, setDrag] = useState<DayDrag | null>(null)
  // The tool, and the supplier the brush orders from.
  const [tool, setTool] = useState<HireTool>('select')
  const [brushId, setBrushId] = useState<string | null>(null)
  // The supplier whose orders «Tøm» removes, apart from the brush's: every supplier's until one is picked for it.
  const [eraseId, setEraseId] = useState<string | null>(null)
  // The day under the pointer while the brush is held, to show what a click there would order.
  const [hover, setHover] = useState<{ competence: CompetenceKey; date: ISODate; projectNo?: string } | null>(null)
  const brush = suppliers.find((supplier) => supplier.id === brushId) ?? null
  const eraseFrom = suppliers.some((supplier) => supplier.id === eraseId) ? (eraseId ?? undefined) : undefined
  const pickTool = (next: HireTool) => {
    setTool(next)
    setHover(null)
    // The brush needs a supplier: the one last picked, else the first.
    if (next === 'paint' && !brush) setBrushId(suppliers[0]?.id ?? null)
  }
  const pickBrush = (id: string | null) => {
    setBrushId(id)
    if (id && tool === 'select') setTool('paint')
  }
  /** The brush put away: no supplier is picked, and Velg is back. */
  const dropBrush = () => {
    setBrushId(null)
    setTool('select')
    setHover(null)
  }
  /** The supplier picked in the editor is the brush, whatever tool is held: picking orders nothing, a stroke does. Picked again, it is put away. */
  const brushWith = (id: string) => {
    if (tool === 'paint' && brushId === id) return dropBrush()
    setBrushId(id)
    setTool('paint')
    setHover(null)
  }
  // A competence that has left the board, or days outside the period, are not open.
  const open = active && stored && rows.some((style) => style.key === stored.competence) && (stored.from === null || dates.includes(stored.from)) && (stored.to === null || dates.includes(stored.to)) ? stored : null

  const openDates = useMemo(() => (open?.from && open.to ? dates.slice(dates.indexOf(open.from), dates.indexOf(open.to) + 1) : []), [open, dates])
  /** The lines under the competence that is open: what each lacks after the permanent staff, and its orders. «Uten prosjekt» is there where it has hours or orders in view, and there are projects above it. */
  const openCompetence = open?.competence
  const projectLines = useMemo<HireProjectLine[]>(() => {
    if (!openCompetence) return []
    const view = dates.slice(viewFrom, viewTo + 1)
    const lines = linesOf(openCompetence).map((line) => {
      const orders = (date: ISODate) => (ordersOn.get(dayKey(openCompetence, date)) ?? NO_ORDERS).filter(line.holds)
      const cover = (date: ISODate) => coverage(line.restOf(date), orders(date), wd)
      const rest = line.projectNo === undefined
      return { projectNo: line.projectNo ?? NO_PROJECT, name: rest ? 'Uten prosjekt' : projectName(line.projectNo!), rest, orders, cover, holds: line.holds, missing: view.reduce((sum, date) => sum + Math.max(0, cover(date).remaining), 0) }
    })
    const projects = lines.filter((line) => !line.rest)
    const rest = lines.find((line) => line.rest)!
    return projects.length && view.some((date) => rest.cover(date).state !== 'none') ? lines : projects
  }, [openCompetence, linesOf, dates, viewFrom, viewTo, ordersOn, projectName, wd])
  /** The line the days are picked on, whose orders the editor lists; none where they are picked on the competence's own. */
  const openLine = open?.projectNo === undefined ? undefined : projectLines.find((line) => line.projectNo === open.projectNo)
  const openOrders = useMemo(() => (open ? openDates.flatMap((date) => ordersOn.get(dayKey(open.competence, date)) ?? []).filter((order) => !openLine || openLine.holds(order)) : []), [open, openDates, ordersOn, openLine])
  const groups = useMemo<OrderGroup[]>(() => orderGroups(openOrders, suppliers), [openOrders, suppliers])
  const picked = open?.group ? (groups.find((group) => group.key === open.group) ?? null) : null

  const setOrders = (change: (orders: HireOrder[]) => HireOrder[]) => updateStaffing((w) => ({ ...w, hireOrders: change(w.hireOrders ?? []) }))
  const idsOf = (group: OrderGroup) => group.orders.map((order) => order.id)
  const pick = (group: string | null) => setOpen((now) => now && { ...now, group })
  /** A line that gets another supplier or other times is another line: what was picked and the popover open on it go with it. */
  const follow = (group: OrderGroup, key: string) => {
    pick(key)
    setPop((now) => (now?.group === group.key ? { ...now, group: key } : now))
  }

  const span = (a: ISODate, b: ISODate) => (a <= b ? { from: a, to: b } : { from: b, to: a })
  const openOn = (competence: CompetenceKey, from: ISODate, to: ISODate = from, projectNo?: string) => {
    setPop(null)
    setOpen({ competence, ...(projectNo !== undefined && { projectNo }), ...span(from, to), group: null })
  }
  const fold = () => {
    setPop(null)
    setOpen(null)
  }
  /** Brings a day into view if it is not there already: nothing moves for a day the planner can see. */
  const reveal = (date: ISODate) => {
    const at = dates.indexOf(date)
    if (at < viewFrom || at > viewTo) onShowDate(date)
  }
  // The drag is also kept where the next event reads it at once: a press and its release can come before the press is drawn.
  const dragNow = useRef<DayDrag | null>(null)
  const dragTo = (next: DayDrag | null) => {
    dragNow.current = next
    setDrag(next)
  }
  const daysOf = (stroke: { anchor: ISODate; focus: ISODate }) => {
    const { from, to } = span(stroke.anchor, stroke.focus)
    return dates.slice(dates.indexOf(from), dates.indexOf(to) + 1)
  }
  /**
   * I4: what the brush would order on the days: on each that is short the supplier's people for each line that lacks hours, tagged with its
   * project; one person a day where none is, as a supplier added on top. On a line under the competence, for that line alone.
   */
  const brushed = (competence: CompetenceKey, days: ISODate[], projectNo?: string) => (brush ? planAcross(orders, brush, competence, linesFor(competence, projectNo), days, wd) : [])
  // A stroke follows the pointer as Faste's does (`useFollowPointer`): along the line it was started on, wherever the pointer goes, with the grid scrolled on near its edges.
  const panelOpen = useRef(false)
  useEffect(() => {
    panelOpen.current = panel !== null
  }, [panel])
  const followed = useFollowPointer(scrollRef, panelOpen, {
    move: (x: number) => {
      const now = dragNow.current
      const el = scrollRef.current
      if (!now || !el) return
      const date = dates[clamp(Math.floor(daysAcross(el, x, cols.colW)), 0, dates.length - 1)]
      if (date !== now.focus) dragTo({ ...now, focus: date })
    },
    up: () => actions.dayUp(),
  })
  const actions = useStableActions({
    /** A press on a day of a competence starts a stroke there by the tool; Alt is the eraser for the stroke. */
    dayDown: (competence: CompetenceKey, date: ISODate, alt: boolean, projectNo: string | undefined, x: number, y: number) => {
      const mode: HireTool = alt ? 'erase' : tool
      // A supplier that does not offer the competence orders nothing.
      if (mode === 'paint' && !brush?.competences.includes(competence)) return
      setPop(null)
      setHover(null)
      dragTo({ competence, ...(projectNo !== undefined && { projectNo }), mode, anchor: date, focus: date })
      followed.follow(x, y)
    },
    /** The pointer over a day while the brush is held, and no stroke is under way: what a click there would order. */
    dayEnter: (competence: CompetenceKey, date: ISODate, projectNo?: string) => {
      if (!dragNow.current && tool === 'paint') setHover({ competence, date, ...(projectNo !== undefined && { projectNo }) })
    },
    rowsLeave: () => setHover(null),
    /** The mouse is let go: the days the stroke reached are picked, ordered or emptied. */
    dayUp: () => {
      followed.stop()
      const now = dragNow.current
      if (!now) return
      dragTo(null)
      const days = daysOf(now)
      if (now.mode === 'select') {
        // As in Faste, a click on the one day that is picked lets go of it.
        const same = now.anchor === now.focus && open?.competence === now.competence && open.projectNo === now.projectNo && open.from === now.anchor && open.to === now.anchor
        return same ? setOpen({ ...open, from: null, to: null, group: null }) : openOn(now.competence, now.anchor, now.focus, now.projectNo)
      }
      // The eraser removes the orders of the line it is drawn on, of the supplier picked for «Tøm», or of all.
      if (now.mode === 'erase') return setOrders((list) => eraseOrders(list, now.competence, days, tool === 'erase' ? eraseFrom : undefined, now.projectNo === undefined ? undefined : linesFor(now.competence, now.projectNo)[0]?.holds))
      const added = brushed(now.competence, days, now.projectNo)
      if (!added.length || !brush) return
      setOrders((list) => mergeOrders([...list, ...added]))
      // The days open with what was ordered picked, to adjust it.
      setOpen({ competence: now.competence, ...(now.projectNo !== undefined && { projectNo: now.projectNo }), ...span(now.anchor, now.focus), group: groupKey(brush.id, added[0]) })
    },
    /** A click on a competence's label opens it with no days picked, and moves nothing: the days are picked in the grid (the planner's word, 2026-10-24). */
    openCompetence: (competence: CompetenceKey) => {
      setPop(null)
      setOpen({ competence, from: null, to: null, group: null })
    },
    /** A click on the name of a line under the open competence picks its days as they are, on that line, or back on the competence's own if it is the line picked. */
    openLine: (projectNo: string) => {
      if (!open) return
      setPop(null)
      setOpen({ competence: open.competence, ...(open.projectNo !== projectNo && { projectNo }), from: open.from, to: open.to, group: null })
    },
  })
  const edits = {
    count: (group: OrderGroup, by: number) => setOrders((list) => changeCount(list, idsOf(group), by)),
    supplier: (group: OrderGroup, supplierId: string) => {
      setOrders((list) => changeOrders(list, idsOf(group), { supplierId }))
      follow(group, groupKey(supplierId, group))
    },
    times: (group: OrderGroup, times: Interval) => {
      if (times.start === times.end) return
      setOrders((list) => changeOrders(list, idsOf(group), times))
      follow(group, groupKey(group.supplierId, { ...times, projectNo: group.projectNo }))
    },
    waits: (group: OrderGroup) => setOrders((list) => setWaiting(list, idsOf(group))),
    confirm: (group: OrderGroup) => setOrders((list) => confirmOrders(list, idsOf(group))),
    fewer: (ids: string[], people: number) => setOrders((list) => confirmFewer(list, ids, people)),
    remove: (group: OrderGroup) => {
      setPop(null)
      setOrders((list) => removeOrders(list, idsOf(group)))
      if (open?.group === group.key) pick(null)
    },
    /** Every order of a supplier that waits is confirmed, in one step. */
    confirmAll: (supplierId: string) => setOrders((list) => confirmOrders(list, list.filter((order) => order.supplierId === supplierId && isWaiting(order)).map((order) => order.id))),
    /** An order's answer the other way: confirmed if it waits, waiting if it is confirmed. */
    toggleAnswer: (order: HireOrder) => setOrders((list) => (isWaiting(order) ? confirmOrders(list, [order.id]) : setWaiting(list, [order.id]))),
    offers: (supplierId: string, competence: CompetenceKey) => updateStaffing((w) => ({ ...w, suppliers: toggleSupplierCompetence(w.suppliers ?? [], supplierId, competence) })),
    shift: (supplierId: string, shift: ShiftId) => updateStaffing((w) => ({ ...w, suppliers: toggleSupplierShift(w.suppliers ?? [], supplierId, shift) })),
    fill: (group: OrderGroup) => open && setOrders((list) => mergeOrders([...list, ...fillGroup(group, open.competence, openDates)])),
    /** The project a line's people are for, or none. */
    project: (group: OrderGroup, projectNo: string | null) => {
      setOrders((list) => tagOrders(list, idsOf(group), projectNo))
      follow(group, groupKey(group.supplierId, { start: group.start, end: group.end, ...(projectNo && { projectNo }) }))
    },
  }

  /** A supplier's panel, with the supplier as the brush. */
  const openSupplier = (id: string) => {
    setPanel({ kind: 'supplier', id })
    pickBrush(id)
  }
  /** The control panel, where the orders are looked over and confirmed. */
  const openControl = () => setPanel({ kind: 'control' })

  /** Opens the next day that is short, on its first competence that is: the first from the days in view on, else the first of the period. */
  const openNextUnder = () => {
    const date = board.underDays.find((day) => day >= dates[viewFrom]) ?? board.underDays[0]
    const style = date && rows.find((row) => board.cover(row.key, date).state === 'short')
    if (!style) return
    openOn(style.key, date)
    reveal(date)
  }

  const preview = useMemo<StrokePreview | null>(() => {
    const at = drag && drag.mode !== 'select' ? drag : !drag && hover && tool === 'paint' ? { competence: hover.competence, projectNo: hover.projectNo, mode: 'paint' as const, anchor: hover.date, focus: hover.date } : null
    if (!at) return null
    const days = daysOf(at)
    const mode = at.mode === 'erase' ? 'erase' : 'paint'
    return { competence: at.competence, ...(at.projectNo !== undefined && { projectNo: at.projectNo }), mode, from: days[0], to: days[days.length - 1], added: mode === 'paint' ? brushed(at.competence, days, at.projectNo) : [], supplierId: mode === 'paint' ? brush?.id : tool === 'erase' ? eraseFrom : undefined }
  }, [drag, hover, tool, brush, eraseFrom, orders, dates, linesOf, wd]) // eslint-disable-line react-hooks/exhaustive-deps

  /** The line under the open competence a step up or down from the one picked, keeping the days that are picked. */
  const stepLines = (delta: number) => {
    if (!open) return
    const at = projectLines.findIndex((line) => line.projectNo === open.projectNo)
    const next = projectLines[clamp(at + delta, 0, projectLines.length - 1)]
    if (next) setOpen({ ...open, projectNo: next.projectNo, group: null })
  }
  /** Delete removes the order line picked, else the orders of the days picked, on the line they are picked on. */
  const remove = picked
    ? () => edits.remove(picked)
    : open && openDates.length
      ? () => setOrders((list) => eraseOrders(list, open.competence, openDates, undefined, openLine?.holds))
      : null
  // The keys are Faste's (2026-10-26): Escape, V, B and T, the brush by 1 to 9, the lines by ↑ and ↓, and Delete.
  useBemanningKeys({
    active,
    holdShift: () => {},
    popoverOpen: !!pop,
    stroking: drag !== null,
    cancelStroke: () => {
      followed.stop()
      dragTo(null)
    },
    selection: !!open?.from,
    dropSelection: () => open && setOpen({ ...open, from: null, to: null, group: null }),
    brushOrTool: tool !== 'select' || brushId !== null,
    clearBrush: dropBrush,
    panel: panel !== null,
    closePanel: () => setPanel(null),
    fold,
    pickTool,
    brushKeys: suppliers.map((supplier) => supplier.id),
    pickBrush: (id) => {
      setBrushId(id)
      setTool('paint')
    },
    canStepLines: !!open && projectLines.length > 0,
    stepLines,
    remove,
    help: () => setPanel(panel?.kind === 'help' ? null : { kind: 'help' }),
  })

  const dragDays = drag?.mode === 'select' ? span(drag.anchor, drag.focus) : null
  return {
    board, rows, waiting, suppliers, orders, ordersOn, wd,
    tool, pickTool, brush, pickBrush, brushWith, dropBrush, eraseFrom, pickErase: setEraseId, preview, density, setDensity,
    panel, setPanel, openSupplier, openControl,
    open, openDates, openLine, groups, picked, projectLines, projectName, pick, openOn, fold, openNextUnder,
    pop, setPop, edits, actions,
    /** A stroke is under way, from the press to the let-go. */
    stroking: drag !== null,
    /** The days a drag has reached on a competence. */
    dragOn: drag && dragDays ? { competence: drag.competence, projectNo: drag.projectNo, ...dragDays } : null,
  }
}

type InnleidState = ReturnType<typeof useInnleidState>
export type InnleidActions = InnleidState['actions']

const InnleidContext = createContext<InnleidState | null>(null)

/**
 * What the parts of Innleid share: the board of the period, the days picked on a competence with the lines of
 * their editor, and the edits of the orders. The board is worked out in both parts of Bemanning, for the Avvik line
 * they share (`counted`); the rest only while Innleid is shown (`active`).
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
