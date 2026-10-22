import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ISODate } from '../../domain/dates'
import { changeCount, changeOrders, confirmFewer, confirmOrders, coverage, dayKey, HOURS_NOISE, eraseOrders, fillGroup, groupKey, hireBoard, isWaiting, mergeOrders, orderGroups, ordersByDay, planOrders, rangeSummary, removeOrders, setWaiting, tagOrders, waitingHours, type Coverage, type HireBoard, type OrderGroup, type RangeSummary } from '../../domain/hire'
import { toggleSupplierCompetence, toggleSupplierShift } from '../../domain/suppliers'
import { numberKey } from '../../domain/projects'
import { sameProject, type CompetenceKey, type CompetenceStyle, type HireOrder, type Interval, type ShiftId, type Supplier } from '../../domain/types'
import { usePref } from '../../store/prefs'
import { useBemanning, type Density } from '../bemanning/BemanningScope'
import { isTyping } from '../dom'
import { heatScale } from '../kalender/heat'
import { useStableActions } from '../kalender/useStableActions'

/** The days picked on a competence, which the editor in its label works on, and the line of the editor that is picked. */
interface OpenDays {
  competence: CompetenceKey
  from: ISODate
  to: ISODate
  /** The key of an `OrderGroup`. */
  group: string | null
}

/** What a popover of the editor is about, and the button it opens under. */
interface OrderPop {
  kind: 'add' | 'supplier' | 'shift' | 'time' | 'answer'
  /** The line of the editor it belongs to; none for «+ Leverandør». */
  group: string | null
  at: DOMRect
}

/** What the side panel of Innleid shows: a supplier's order, what every supplier offers, or the help. */
type InnleidPanel = { kind: 'supplier'; id: string } | { kind: 'matrix' } | { kind: 'help' }

/** The tools of Innleid: pick days, order a supplier across days, or remove orders across days. */
export type HireTool = 'select' | 'paint' | 'erase'

/** A stroke across the days of a competence, or of a project's line under it, with the tool it was started with. */
interface DayDrag {
  competence: CompetenceKey
  /** The project of the line the stroke is on; none on the competence's own. */
  projectNo?: string
  mode: HireTool
  anchor: ISODate
  focus: ISODate
}

/** What a stroke would do, or the brush where the pointer is: the people a day would get, or the days whose orders would go. */
interface StrokePreview {
  competence: CompetenceKey
  projectNo?: string
  mode: 'paint' | 'erase'
  from: ISODate
  to: ISODate
  /** With the brush: the people ordered per day. */
  people: Map<ISODate, number>
  /** The supplier ordered, or the one whose orders go; none where every supplier's go. */
  supplierId: string | undefined
}

/** Innleid opens on the compact lines, where a folded competence is one line high whatever it has of orders. */
const cleanDensity = (stored: unknown): Density => (stored === 'detail' ? 'detail' : 'compact')

const NO_ORDERS: HireOrder[] = []
const NO_SUPPLIERS: Supplier[] = []

/** A project's line under the competence that is open: its days covered by the orders for it, against what the project lacks after the permanent staff. */
export interface HireProjectLine {
  projectNo: string
  name: string
  cover: (date: ISODate) => Coverage
  orders: (date: ISODate) => HireOrder[]
  /** The hours missing in the days in view. */
  missing: number
}

function useInnleidState(active: boolean) {
  const { ws, dates, balance, styles, updateStaffing, onShowDate, viewFrom, viewTo, projectBalance, kalenderProjects, projectName } = useBemanning()
  const orders = ws.hireOrders ?? NO_ORDERS
  const suppliers = ws.suppliers ?? NO_SUPPLIERS
  const wd = ws.settings.workday
  /** The hours of a competence a day that remain after the permanent staff: of a project, where one is given, counting its share of the untagged. */
  const restOf = useCallback(
    (competence: CompetenceKey, date: ISODate, projectNo?: string) => Math.max(0, projectNo ? projectBalance.of(competence, date, projectNo).remaining : balance.get(competence, date).remaining),
    [balance, projectBalance],
  )
  const board = useMemo<HireBoard>(() => hireBoard(active ? [...styles.keys()] : [], dates, restOf, orders, wd), [active, styles, dates, restOf, orders, wd])
  const rows = useMemo<CompetenceStyle[]>(() => board.competences.map((key) => styles.get(key)!), [board, styles])
  const scale = useMemo(() => heatScale([...board.deviations.values()].map((dev) => dev.value)), [board])
  const waiting = useMemo(() => waitingHours(orders, wd), [orders, wd])
  /** The orders per competence and day. */
  const ordersOn = useMemo(() => ordersByDay(orders), [orders])

  const [density, setDensity] = usePref<Density>('innleidDensity', 'compact', cleanDensity)
  const [stored, setOpen] = useState<OpenDays | null>(null)
  const [pop, setPop] = useState<OrderPop | null>(null)
  const [storedPanel, setPanel] = useState<InnleidPanel | null>(null)
  // A supplier that is removed has no panel.
  const panel = !active || (storedPanel?.kind === 'supplier' && !suppliers.some((supplier) => supplier.id === storedPanel.id)) ? null : storedPanel
  // The days a drag across a competence's line has reached, until the mouse is let go.
  const [drag, setDrag] = useState<DayDrag | null>(null)
  // The tool, and the supplier it works with: the one the brush orders, or the one whose orders «Tøm» removes (none: every supplier's).
  const [tool, setTool] = useState<HireTool>('select')
  const [brushId, setBrushId] = useState<string | null>(null)
  // The day under the pointer while the brush is held, to show what a click there would order.
  const [hover, setHover] = useState<{ competence: CompetenceKey; date: ISODate; projectNo?: string } | null>(null)
  const brush = suppliers.find((supplier) => supplier.id === brushId) ?? null
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
  // A competence that has left the board, or days outside the period, are not open.
  const open = active && stored && rows.some((style) => style.key === stored.competence) && dates.includes(stored.from) && dates.includes(stored.to) ? stored : null

  const openDates = useMemo(() => (open ? dates.slice(dates.indexOf(open.from), dates.indexOf(open.to) + 1) : []), [open, dates])
  const openOrders = useMemo(() => (open ? openDates.flatMap((date) => ordersOn.get(dayKey(open.competence, date)) ?? []) : []), [open, openDates, ordersOn])
  const groups = useMemo<OrderGroup[]>(() => orderGroups(openOrders, suppliers), [openOrders, suppliers])
  const summary = useMemo<RangeSummary | null>(() => (open ? rangeSummary(openDates.map((date) => board.cover(open.competence, date)), openOrders, wd) : null), [open, openDates, openOrders, board, wd])
  const picked = open?.group ? (groups.find((group) => group.key === open.group) ?? null) : null

  /**
   * The lines under the competence that is open: a project shown in the Kalender that lacks hours of it after the permanent
   * staff in the days in view, or has orders of it there. They come in the order their work does.
   */
  const projectLines = useMemo<HireProjectLine[]>(() => {
    if (!open) return []
    const competence = open.competence
    const view = dates.slice(viewFrom, viewTo + 1)
    const found = new Map<string, { projectNo: string; first: ISODate }>()
    const add = (projectNo: string, date: ISODate) => {
      const key = numberKey(projectNo)
      if (kalenderProjects.has(key) && !found.has(key)) found.set(key, { projectNo, first: date })
    }
    for (const date of view) {
      for (const p of projectBalance.get(competence, date).projects.values()) if (p.projectNo && p.remaining > HOURS_NOISE) add(p.projectNo, date)
      for (const order of ordersOn.get(dayKey(competence, date)) ?? []) if (order.projectNo) add(order.projectNo, date)
    }
    return [...found.values()]
      .sort((a, b) => a.first.localeCompare(b.first) || projectName(a.projectNo).localeCompare(projectName(b.projectNo), 'nb'))
      .map(({ projectNo }) => {
        const orders = (date: ISODate) => (ordersOn.get(dayKey(competence, date)) ?? NO_ORDERS).filter((order) => sameProject(order, { projectNo }))
        const cover = (date: ISODate) => coverage(restOf(competence, date, projectNo), orders(date), wd)
        return { projectNo, name: projectName(projectNo), orders, cover, missing: view.reduce((sum, date) => sum + Math.max(0, cover(date).remaining), 0) }
      })
  }, [open, dates, viewFrom, viewTo, projectBalance, ordersOn, kalenderProjects, projectName, restOf, wd])

  const setOrders = (change: (orders: HireOrder[]) => HireOrder[]) => updateStaffing((w) => ({ ...w, hireOrders: change(w.hireOrders ?? []) }))
  const idsOf = (group: OrderGroup) => group.orders.map((order) => order.id)
  const pick = (group: string | null) => setOpen((now) => now && { ...now, group })
  /** A line that gets another supplier or other times is another line: what was picked and the popover open on it go with it. */
  const follow = (group: OrderGroup, key: string) => {
    pick(key)
    setPop((now) => (now?.group === group.key ? { ...now, group: key } : now))
  }

  const span = (a: ISODate, b: ISODate) => (a <= b ? { from: a, to: b } : { from: b, to: a })
  const openOn = (competence: CompetenceKey, from: ISODate, to: ISODate = from) => {
    setPop(null)
    setOpen({ competence, ...span(from, to), group: null })
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
  /** Moves the days picked by a day, or with `extend` their end alone. */
  const stepDays = (by: number, extend: boolean) => {
    if (!open) return
    const from = dates.indexOf(open.from) + (extend ? 0 : by)
    const to = dates.indexOf(open.to) + by
    if (from < 0 || to >= dates.length || from > to) return
    setOpen({ ...open, from: dates[from], to: dates[to] })
    reveal(dates[by < 0 ? from : to])
  }
  /** The nearest day before or after the days picked where hours of the competence are missing. */
  const shortDay = (by: -1 | 1): ISODate | undefined => {
    if (!open) return undefined
    for (let at = dates.indexOf(by < 0 ? open.from : open.to) + by; at >= 0 && at < dates.length; at += by) if (board.cover(open.competence, dates[at]).state === 'short') return dates[at]
    return undefined
  }
  /** Goes to the previous or the next day that is short, and picks it alone. */
  const stepShort = (by: -1 | 1) => {
    const date = shortDay(by)
    if (!open || !date) return
    openOn(open.competence, date)
    reveal(date)
  }
  const stepCompetence = (by: number) => {
    if (!open) return
    const next = rows[(rows.findIndex((style) => style.key === open.competence) + by + rows.length) % rows.length]
    setOpen({ ...open, competence: next.key, group: null })
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
  /** I4: what the brush would order on the days: the supplier's people on those that are short, and nothing where none is. On a project's line, for the project. */
  const brushed = (competence: CompetenceKey, days: ISODate[], projectNo?: string) =>
    brush ? planOrders(orders, brush, { competence, ...(projectNo && { projectNo }) }, days, (date) => restOf(competence, date, projectNo), wd, true) : []
  const actions = useStableActions({
    /** A press on a day of a competence. Alt is the eraser for the stroke; with Velg and Shift the days picked reach to the day; else a stroke starts there. */
    dayDown: (competence: CompetenceKey, date: ISODate, shift: boolean, alt: boolean, projectNo?: string) => {
      const mode: HireTool = alt ? 'erase' : tool
      if (mode === 'select' && shift && open?.competence === competence) return openOn(competence, date <= open.from ? open.to : open.from, date)
      // A supplier that does not offer the competence orders nothing.
      if (mode === 'paint' && !brush?.competences.includes(competence)) return
      setPop(null)
      dragTo({ competence, ...(projectNo && { projectNo }), mode, anchor: date, focus: date })
    },
    dayEnter: (competence: CompetenceKey, date: ISODate, projectNo?: string) => {
      const now = dragNow.current
      if (now?.competence === competence && now.projectNo === projectNo && now.focus !== date) dragTo({ ...now, focus: date })
      if (!now && tool === 'paint') setHover({ competence, date, ...(projectNo && { projectNo }) })
    },
    rowsLeave: () => setHover(null),
    /** A press on the line of how far a day is covered, on a competence that is open, folds it. */
    fold,
    /** The mouse is let go: the days the stroke reached are picked, ordered or emptied. */
    dayUp: () => {
      const now = dragNow.current
      if (!now) return
      dragTo(null)
      const days = daysOf(now)
      if (now.mode === 'select') return openOn(now.competence, now.anchor, now.focus)
      if (now.mode === 'erase') return setOrders((list) => eraseOrders(list, now.competence, days, tool === 'erase' ? (brush?.id ?? undefined) : undefined, now.projectNo))
      const added = brushed(now.competence, days, now.projectNo)
      if (!added.length || !brush) return
      setOrders((list) => mergeOrders([...list, ...added]))
      // The days open with what was ordered picked, to adjust it.
      setOpen({ competence: now.competence, ...span(now.anchor, now.focus), group: groupKey(brush.id, added[0]) })
    },
    /**
     * A click on a competence's label opens it on a day that is in view, and moves nothing: the first of them that is
     * short, else the first with hours that remain or orders, else the first.
     */
    openFirst: (competence: CompetenceKey) => {
      const view = dates.slice(viewFrom, viewTo + 1)
      const first = view.find((date) => board.cover(competence, date).state === 'short') ?? view.find((date) => board.cover(competence, date).state !== 'none') ?? view[0]
      if (first) openOn(competence, first)
    },
  })
  useEffect(() => {
    window.addEventListener('mouseup', actions.dayUp)
    return () => window.removeEventListener('mouseup', actions.dayUp)
  }, [actions])

  /** «+ Leverandør»: the supplier is ordered for the days picked that are short, with the people that cover them. */
  const addSupplier = (supplier: Supplier) => {
    if (!open) return
    const added = planOrders(orders, supplier, open.competence, openDates, (date) => restOf(open.competence, date), wd)
    if (!added.length) return
    setOrders((list) => mergeOrders([...list, ...added]))
    pick(groupKey(supplier.id, added[0]))
  }
  const edits = {
    addSupplier,
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
  /** The panel of the supplier of the first order that waits. */
  const openFirstWaiting = () => {
    const first = [...orders].sort((a, b) => a.date.localeCompare(b.date)).find(isWaiting)
    if (first) setPanel({ kind: 'supplier', id: first.supplierId })
  }

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
    const people = new Map(mode === 'paint' ? brushed(at.competence, days, at.projectNo).map((order) => [order.date, order.fte]) : [])
    return { competence: at.competence, ...(at.projectNo && { projectNo: at.projectNo }), mode, from: days[0], to: days[days.length - 1], people, supplierId: mode === 'paint' ? brush?.id : tool === 'erase' ? brush?.id : undefined }
  }, [drag, hover, tool, brush, orders, dates, restOf, wd]) // eslint-disable-line react-hooks/exhaustive-deps

  const keys = useStableActions({
    down: (e: KeyboardEvent) => {
      if (!active || isTyping(e.target)) return
      const key = e.key
      if (!(e.metaKey || e.ctrlKey || e.altKey || pop)) {
        // The tools have their keys whether days are picked or not: V, B and T, and 1 to 9 for the supplier of the brush.
        const letter = key.toLowerCase()
        const number = /^[1-9]$/.test(key) ? suppliers[Number(key) - 1] : undefined
        if (letter === 'v' || letter === 't' || letter === 'b' || number) {
          e.preventDefault()
          if (number) return pickBrush(number.id), setTool('paint')
          return pickTool(letter === 'v' ? 'select' : letter === 't' ? 'erase' : tool === 'paint' ? 'select' : 'paint')
        }
        if (key === '?') return e.preventDefault(), setPanel(panel?.kind === 'help' ? null : { kind: 'help' })
        // Escape puts the tool away first, then closes the panel, then folds the editor.
        if (key === 'Escape' && tool !== 'select') return e.preventDefault(), pickTool('select')
        if (key === 'Escape' && panel) return e.preventDefault(), setPanel(null)
      }
      // Undo and redo are the app's own keys. A popover has the keys while it is open.
      if (e.metaKey || e.ctrlKey || e.altKey || pop || !open) return
      const at = picked ? groups.indexOf(picked) : -1
      const handled = (): boolean => {
        if (key === 'Escape') return fold(), true
        if (key === 'ArrowLeft' || key === 'ArrowRight') return stepDays(key === 'ArrowLeft' ? -1 : 1, e.shiftKey), true
        if (key === 'ArrowUp' || key === 'ArrowDown') {
          if (groups.length) pick(groups[Math.min(groups.length - 1, Math.max(0, at + (key === 'ArrowUp' ? -1 : 1)))].key)
          return true
        }
        if (!picked) return false
        if (key === '+' || key === '-') return edits.count(picked, key === '+' ? 1 : -1), true
        if (key === 'Delete' || key === 'Backspace') return edits.remove(picked), true
        if (key === 'Enter') {
          const button = document.querySelector<HTMLElement>(`[data-answer="${CSS.escape(picked.key)}"]`)
          if (button) setPop({ kind: 'answer', group: picked.key, at: button.getBoundingClientRect() })
          return true
        }
        return false
      }
      if (handled()) e.preventDefault()
    },
  })
  useEffect(() => {
    window.addEventListener('keydown', keys.down)
    return () => window.removeEventListener('keydown', keys.down)
  }, [keys])

  const dragDays = drag?.mode === 'select' ? span(drag.anchor, drag.focus) : null
  return {
    board, rows, scale, waiting, suppliers, orders, ordersOn, wd,
    tool, pickTool, brush, pickBrush, preview, density, setDensity,
    panel, setPanel, openSupplier, openFirstWaiting,
    open, openDates, groups, picked, summary, projectLines, projectName, pick, openOn, fold, stepDays, stepShort, shortBefore: shortDay(-1), shortAfter: shortDay(1), stepCompetence, openNextUnder,
    pop, setPop, edits, actions,
    /** The days a drag has reached on a competence. */
    dragOn: drag && dragDays ? { competence: drag.competence, projectNo: drag.projectNo, ...dragDays } : null,
  }
}

type InnleidState = ReturnType<typeof useInnleidState>
export type InnleidActions = InnleidState['actions']

const InnleidContext = createContext<InnleidState | null>(null)

/**
 * What the parts of Innleid share: the board of the period, the days picked on a competence with the lines of
 * their editor, and the edits of the orders. Nothing is worked out while Innleid is not shown.
 */
export function InnleidScope({ active, children }: { active: boolean; children: ReactNode }) {
  const state = useInnleidState(active)
  return <InnleidContext.Provider value={state}>{children}</InnleidContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useInnleid = (): InnleidState => {
  const state = useContext(InnleidContext)
  if (!state) throw new Error('Innleid is read outside its scope')
  return state
}
