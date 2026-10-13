import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ISODate } from '../../domain/dates'
import { changeCount, changeOrders, confirmFewer, confirmOrders, fillGroup, hireBoard, mergeOrders, orderGroups, planOrders, rangeSummary, removeOrders, setWaiting, waitingHours, type HireBoard, type OrderGroup, type RangeSummary } from '../../domain/hire'
import type { CompetenceKey, CompetenceStyle, HireOrder, Interval, Supplier } from '../../domain/types'
import { useBemanning } from '../bemanning/BemanningScope'
import { isTyping } from '../dom'
import { heatScale } from '../kalender/heat'
import { useStableActions } from '../kalender/useStableActions'

/** The two parts of Bemanning: the permanent staff, and the people hired for what they leave. */
export type CrewPart = 'faste' | 'innleid'
// eslint-disable-next-line react-refresh/only-export-components
export const cleanCrewPart = (stored: unknown): CrewPart => (stored === 'innleid' ? 'innleid' : 'faste')

/** The days picked on a competence, which the editor in its label works on, and the line of the editor that is picked. */
export interface OpenDays {
  competence: CompetenceKey
  from: ISODate
  to: ISODate
  /** The key of an `OrderGroup`. */
  group: string | null
}

/** What a popover of the editor is about, and the button it opens under. */
export interface OrderPop {
  kind: 'add' | 'supplier' | 'shift' | 'time' | 'answer'
  /** The line of the editor it belongs to; none for «+ Leverandør». */
  group: string | null
  at: DOMRect
}

const NO_ORDERS: HireOrder[] = []
const NO_SUPPLIERS: Supplier[] = []

function useInnleidState(active: boolean) {
  const { ws, dates, balance, styles, updateStaffing, onShowDate } = useBemanning()
  const orders = ws.hireOrders ?? NO_ORDERS
  const suppliers = ws.suppliers ?? NO_SUPPLIERS
  const wd = ws.settings.workday
  const restOf = useCallback((competence: CompetenceKey, date: ISODate) => Math.max(0, balance.get(competence, date).remaining), [balance])
  const board = useMemo<HireBoard>(() => hireBoard(active ? [...styles.keys()] : [], dates, restOf, orders, wd), [active, styles, dates, restOf, orders, wd])
  const rows = useMemo<CompetenceStyle[]>(() => board.competences.map((key) => styles.get(key)!), [board, styles])
  const scale = useMemo(() => heatScale([...board.deviations.values()].map((dev) => dev.value)), [board])
  const waiting = useMemo(() => waitingHours(orders, wd), [orders, wd])
  /** The orders per competence and day. */
  const ordersOn = useMemo(() => {
    const map = new Map<string, HireOrder[]>()
    for (const order of orders) map.set(`${order.competence}|${order.date}`, [...(map.get(`${order.competence}|${order.date}`) ?? []), order])
    return map
  }, [orders])

  const [stored, setOpen] = useState<OpenDays | null>(null)
  const [pop, setPop] = useState<OrderPop | null>(null)
  // The days a drag across a competence's line has reached, until the mouse is let go.
  const [drag, setDrag] = useState<{ competence: CompetenceKey; anchor: ISODate; focus: ISODate } | null>(null)
  // A competence that has left the board, or days outside the period, are not open.
  const open = active && stored && rows.some((style) => style.key === stored.competence) && dates.includes(stored.from) && dates.includes(stored.to) ? stored : null

  const openDates = useMemo(() => (open ? dates.slice(dates.indexOf(open.from), dates.indexOf(open.to) + 1) : []), [open, dates])
  const openOrders = useMemo(() => (open ? openDates.flatMap((date) => ordersOn.get(`${open.competence}|${date}`) ?? []) : []), [open, openDates, ordersOn])
  const groups = useMemo<OrderGroup[]>(() => orderGroups(openOrders, suppliers), [openOrders, suppliers])
  const summary = useMemo<RangeSummary | null>(() => (open ? rangeSummary(openDates.map((date) => board.cover(open.competence, date)), openOrders, wd) : null), [open, openDates, openOrders, board, wd])
  const picked = open?.group ? (groups.find((group) => group.key === open.group) ?? null) : null

  const setOrders = (change: (orders: HireOrder[]) => HireOrder[]) => updateStaffing((w) => ({ ...w, hireOrders: change(w.hireOrders ?? []) }))
  const idsOf = (group: OrderGroup) => group.orders.map((order) => order.id)
  const keyOf = (supplierId: string, times: Interval) => `${supplierId}|${times.start}|${times.end}`
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
  /** Moves the days picked by a day, or with `extend` their end alone. */
  const stepDays = (by: number, extend: boolean) => {
    if (!open) return
    const from = dates.indexOf(open.from) + (extend ? 0 : by)
    const to = dates.indexOf(open.to) + by
    if (from >= 0 && to < dates.length && from <= to) setOpen({ ...open, from: dates[from], to: dates[to] })
  }
  const stepCompetence = (by: number) => {
    if (!open) return
    const next = rows[(rows.findIndex((style) => style.key === open.competence) + by + rows.length) % rows.length]
    setOpen({ ...open, competence: next.key, group: null })
  }

  // The drag is also kept where the next event reads it at once: a press and its release can come before the press is drawn.
  const dragNow = useRef<typeof drag>(null)
  const dragTo = (next: typeof drag) => {
    dragNow.current = next
    setDrag(next)
  }
  const actions = useStableActions({
    /** A press on a day of a competence: with Shift the days picked reach to it, else a drag starts there. */
    dayDown: (competence: CompetenceKey, date: ISODate, shift: boolean) => {
      if (shift && open?.competence === competence) return openOn(competence, date <= open.from ? open.to : open.from, date)
      dragTo({ competence, anchor: date, focus: date })
    },
    dayEnter: (competence: CompetenceKey, date: ISODate) => {
      const now = dragNow.current
      if (now?.competence === competence && now.focus !== date) dragTo({ ...now, focus: date })
    },
    /** The mouse is let go: the days the drag reached are picked. */
    dayUp: () => {
      const now = dragNow.current
      if (!now) return
      dragTo(null)
      openOn(now.competence, now.anchor, now.focus)
    },
    /** A click on a competence's label opens it on its first day that is short, else on the first with orders or hours. */
    openFirst: (competence: CompetenceKey) => {
      const first = dates.find((date) => board.cover(competence, date).state === 'short') ?? dates.find((date) => board.cover(competence, date).state !== 'none')
      if (!first) return
      openOn(competence, first)
      onShowDate(first)
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
    pick(keyOf(supplier.id, added[0]))
  }
  const edits = {
    addSupplier,
    count: (group: OrderGroup, by: number) => setOrders((list) => changeCount(list, idsOf(group), by)),
    supplier: (group: OrderGroup, supplierId: string) => {
      setOrders((list) => changeOrders(list, idsOf(group), { supplierId }))
      follow(group, keyOf(supplierId, group))
    },
    times: (group: OrderGroup, times: Interval) => {
      if (times.start === times.end) return
      setOrders((list) => changeOrders(list, idsOf(group), times))
      follow(group, keyOf(group.supplierId, times))
    },
    waits: (group: OrderGroup) => setOrders((list) => setWaiting(list, idsOf(group))),
    confirm: (group: OrderGroup) => setOrders((list) => confirmOrders(list, idsOf(group))),
    fewer: (ids: string[], people: number) => setOrders((list) => confirmFewer(list, ids, people)),
    remove: (group: OrderGroup) => {
      setPop(null)
      setOrders((list) => removeOrders(list, idsOf(group)))
      if (open?.group === group.key) pick(null)
    },
    fill: (group: OrderGroup) => open && setOrders((list) => mergeOrders([...list, ...fillGroup(group, open.competence, openDates)])),
  }

  /** Opens the first day that is short, on its first competence that is. */
  const openFirstUnder = () => {
    const date = board.underDays[0]
    const style = date && rows.find((row) => board.cover(row.key, date).state === 'short')
    if (!style) return
    openOn(style.key, date)
    onShowDate(date)
  }

  const keys = useStableActions({
    down: (e: KeyboardEvent) => {
      if (!active || isTyping(e.target)) return
      const key = e.key
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

  const dragDays = drag ? span(drag.anchor, drag.focus) : null
  return {
    board, rows, scale, waiting, suppliers, orders, ordersOn, wd,
    open, openDates, openOrders, groups, picked, summary, pick, openOn, fold, stepDays, stepCompetence, openFirstUnder,
    pop, setPop, edits, actions,
    /** The days a drag has reached on a competence. */
    dragOn: drag && dragDays ? { competence: drag.competence, ...dragDays } : null,
  }
}

export type InnleidState = ReturnType<typeof useInnleidState>
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
