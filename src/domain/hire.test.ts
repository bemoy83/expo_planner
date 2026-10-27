import { describe, expect, it } from 'vitest'
import { laneFrom, laneOf, partName, supplierDays, supplierWaits, supplierWeek, clearOrders, copyOrders, lineKey, moveOrders, orderRuns, paintOrders, pasteOrders, shareOrders, stretchOrders, strokeDays, supplierLines, changeCount, changeOrders, confirmFewer, confirmOrders, coverage, coverFigure, peopleMissingIn, isUrgent, urgentWaits, orderedLabel, deviation,  hireBoard, hiredFte, hoursChange, hiredLine, hireHours, mergeOrders, orderText, ordersByDay, setWaiting, shiftOf, shiftText, shiftTimes, supplierOrders, supplierReview, supplierTotals, timesText, waitingHours } from './hire'
import { capacityForDate } from './calc'
import { DEFAULT_SETTINGS, DEFAULT_WORKDAY, type HireOrder, type Supplier } from './types'

const wd = DEFAULT_WORKDAY
const DAG = { start: 420, end: 900 }
const KVELD = { start: 900, end: 1380 }

const supplier = (id: string, name: string, competences: string[], shifts: Supplier['shifts'] = ['dag', 'kveld', 'natt']): Supplier => ({ id, name, order: Number(id.slice(1)), competences, shifts })
const manpower = supplier('k1', 'Manpower', ['vegger', 'tepper'])
const nordic = supplier('k3', 'Nordic Crew', ['vegger', 'rigg'])
const standbygg = supplier('k5', 'StandBygg', ['vegger', 'elektro'], ['dag'])

const order = (id: string, supplierId: string, competence: string, date: string, fte: number, conf: number | null, times = DAG): HireOrder => ({ id, supplierId, shift: shiftOf(times, wd) ?? 'dag', competence, date, fte, ...times, conf })

describe('shifts and paid hours', () => {
  it('has the three shifts go round the clock from the normal day', () => {
    expect(shiftTimes('dag', wd)).toEqual(DAG)
    expect(shiftTimes('kveld', wd)).toEqual(KVELD)
    expect(shiftTimes('natt', wd)).toEqual({ start: 1380, end: 420 })
    expect(shiftOf({ start: 1380, end: 420 }, wd)).toBe('natt')
    expect(shiftOf({ start: 480, end: 900 }, wd)).toBeNull()
  })

  it('names an order by its shift, with its own times beside it where they are not the shift\'s', () => {
    expect(shiftText({ ...KVELD, shift: 'kveld' }, wd)).toBe('Kveld')
    expect(shiftText({ start: 480, end: 900, shift: 'dag' }, wd)).toBe('Dag 08:00–15:00')
    expect(timesText({ start: 1380, end: 420 })).toBe('23:00–07:00')
  })

  it('pays a shift of six hours or more less the lunch, through the night too', () => {
    expect(hireHours(DAG, wd)).toBe(7.5)
    expect(hireHours({ start: 1380, end: 420 }, wd)).toBe(7.5)
    expect(hireHours({ start: 420, end: 720 }, wd)).toBe(5)
  })
})

describe('coverage of a competence on a day (I1)', () => {
  it('is covered when the confirmed people give the hours that remain (A1)', () => {
    const cover = coverage(30, [order('b2', 'k1', 'vegger', '2026-10-08', 4, 4)], wd)
    expect(cover).toMatchObject({ planned: 30, confirmed: 30, remaining: 0, state: 'ok' })
    expect(coverFigure(cover)).toBeNull()
  })

  it('lacks everything without orders (A2), and is nothing where nothing remains', () => {
    // Innleid counts in whole people of a normal day: 60 hours is 8 people.
    expect(coverFigure(coverage(60, [], wd))).toBe(-8)
    expect(coverage(60, [], wd).state).toBe('short')
    expect(coverage(0, [], wd).state).toBe('none')
    expect(coverage(-7.5, [], wd)).toMatchObject({ rest: 0, state: 'none' })
    expect(peopleMissingIn((date) => (date === '2026-10-08' ? coverage(60, [], wd) : coverage(0, [order('b2', 'k1', 'vegger', date, 4, 4)], wd)), ['2026-10-08', '2026-10-09'])).toBe(8)
  })

  it('counts an order that waits as ordered, but not as confirmed', () => {
    expect(coverage(30, [order('a', 'k1', 'vegger', '2026-10-08', 2, 2), order('b', 'k5', 'vegger', '2026-10-08', 2, null)], wd)).toMatchObject({ planned: 30, confirmed: 15, state: 'ok' })
  })

  it('is over from one person of the shortest order, and shows the people over, rounded up from the hours (A4, A8)', () => {
    const over = coverage(7.5, [order('b11', 'k4', 'elektro', '2026-10-07', 3, 3)], wd)
    expect(over.state).toBe('over')
    expect(coverFigure(over)).toBe(2)
    const within = coverage(4, [order('a', 'k4', 'elektro', '2026-10-07', 1, 1)], wd)
    expect(within.state).toBe('ok')
    expect(coverFigure(within)).toBeNull()
  })

  it('lacks the hours of the people a supplier could not send (A7)', () => {
    const fewer = confirmFewer([order('b2', 'k1', 'vegger', '2026-10-08', 4, 4)], ['b2'], 3)
    expect(fewer).toEqual([{ ...order('b2', 'k1', 'vegger', '2026-10-08', 3, 3), asked: 4 }])
    expect(coverFigure(coverage(30, fewer, wd))).toBe(-1)
  })
})

describe('answers that are urgent', () => {
  it('are those that wait on today and the next two days, never on a day gone by', () => {
    expect(['2026-10-07', '2026-10-08', '2026-10-10', '2026-10-11'].map((date) => isUrgent(date, '2026-10-08'))).toEqual([false, true, true, false])
    expect(urgentWaits([order('a', 'k1', 'vegger', '2026-10-09', 2, 2)], '2026-10-08')).toBe(false)
    expect(urgentWaits([order('a', 'k1', 'vegger', '2026-10-09', 2, null)], '2026-10-08')).toBe(true)
    expect(urgentWaits([order('a', 'k1', 'vegger', '2026-10-12', 2, null)], '2026-10-08')).toBe(false)
  })
})

describe('the label of a day', () => {
  const day = (id: string, supplierId: string, fte: number, conf: number | null) => order(id, supplierId, 'vegger', 'd', fte, conf)

  it('fills what remains from the left, the confirmed first and those that wait after, with a rule between the orders', () => {
    const orders = [day('w', 'k1', 1, null), day('c', 'k5', 2, 2)]
    const { segs, rules, of } = orderedLabel(coverage(30, orders, wd), orders, wd, [manpower, standbygg])
    expect(segs).toEqual([
      { kind: 'covered', from: 0, width: 0.5 },
      { kind: 'waiting', from: 0.5, width: 0.25 },
    ])
    expect(rules).toEqual([0.5])
    // The people ordered, waiting or not, of those the hours that remain after the permanent staff ask for.
    expect(of).toEqual({ done: 3, need: 4 })
  })

  it('has what is ordered past what remains as the tail of over, which waits where its order does', () => {
    const orders = [day('c', 'k1', 1, 1), day('w', 'k5', 2, null)]
    const { segs } = orderedLabel(coverage(15, orders, wd), orders, wd, [manpower, standbygg])
    expect(segs).toEqual([
      { kind: 'covered', from: 0, width: 1 / 3 },
      { kind: 'waiting', from: 1 / 3, width: 1 / 3 },
      { kind: 'surplusWaiting', from: 2 / 3, width: 1 / 3 },
    ])
  })

  it('is all over where nothing remains, and drops the rules where an order is too thin to see', () => {
    const none = [day('c', 'k1', 1, 1)]
    expect(orderedLabel(coverage(0, none, wd), none, wd).segs).toEqual([{ kind: 'surplus', from: 0, width: 1 }])
    const thin = [day('a', 'k1', 30, 30), day('b', 'k5', 1, 1)]
    expect(orderedLabel(coverage(232.5, thin, wd), thin, wd).rules).toEqual([])
  })
})

describe('Avvik of a day (I2)', () => {
  const ok = coverage(15, [order('a', 'k1', 'vegger', 'd', 2, 2)], wd)
  const short = coverage(30, [order('b', 'k1', 'tepper', 'd', 1, null)], wd)
  const over = coverage(7.5, [order('c', 'k4', 'elektro', 'd', 3, 3)], wd)

  it('is empty without demand and orders', () => {
    expect(deviation([coverage(0, [], wd)])).toEqual({ state: 'none', value: 0, pending: 0 })
  })

  it('is ok without a figure when every competence is covered exactly (A3)', () => {
    expect(deviation([ok, coverage(7.5, [order('d', 'k4', 'elektro', 'd', 1, 1)], wd)])).toEqual({ state: 'ok', value: 0, pending: 0 })
  })

  it('is over by the hours over (A4)', () => {
    expect(deviation([ok, over])).toEqual({ state: 'over', value: 15, pending: 0 })
  })

  it('is under when a competence is short, whatever another has over, and says what waits (A6)', () => {
    expect(deviation([ok, short, over])).toEqual({ state: 'under', value: -30, pending: 7.5 })
  })

  it('counts only the confirmed orders: what waits leaves the day short until it is answered', () => {
    expect(deviation([coverage(15, [order('e', 'k1', 'vegger', 'd', 2, null)], wd)])).toEqual({ state: 'under', value: -15, pending: 15 })
    expect(deviation([coverage(15, [order('e', 'k1', 'vegger', 'd', 1, 1), order('f', 'k2', 'vegger', 'd', 1, null)], wd)])).toEqual({ state: 'under', value: -7.5, pending: 7.5 })
  })
})


describe('one order per supplier, shift, competence, project and day (I5)', () => {
  it('adds the people of two that are the same, and waits while one of them does', () => {
    const merged = mergeOrders([order('a', 'k1', 'vegger', 'd1', 2, 2), order('b', 'k1', 'vegger', 'd1', 1, null), order('c', 'k1', 'vegger', 'd1', 1, 1, KVELD)])
    expect(merged).toEqual([order('a', 'k1', 'vegger', 'd1', 3, null), order('c', 'k1', 'vegger', 'd1', 1, 1, KVELD)])
    expect(mergeOrders([order('a', 'k1', 'vegger', 'd1', 2, 2), order('b', 'k1', 'vegger', 'd1', 1, 1)])[0]).toMatchObject({ fte: 3, conf: 3 })
  })

  it('leaves the list as it is when no two are the same', () => {
    const orders = [order('a', 'k1', 'vegger', 'd1', 2, 2), order('b', 'k3', 'vegger', 'd1', 1, null)]
    expect(mergeOrders(orders)).toBe(orders)
  })

  it('leaves an order on its shift when its times change, so it merges with no other', () => {
    const orders = [order('a', 'k1', 'vegger', 'd1', 2, 2), order('b', 'k1', 'vegger', 'd1', 1, 1, KVELD)]
    expect(changeOrders(orders, ['b'], DAG)).toEqual([orders[0], { ...orders[1], ...DAG, conf: null }])
  })

  it('merges orders of one key whatever their times, keeping the first one\'s', () => {
    const own = { ...order('b', 'k1', 'vegger', 'd1', 1, 1), start: 600, end: 1080 }
    expect(mergeOrders([order('a', 'k1', 'vegger', 'd1', 2, 2), own])).toEqual([order('a', 'k1', 'vegger', 'd1', 3, 3)])
  })
})

describe('answers and counts (I6, I7)', () => {
  const orders = [order('a', 'k1', 'vegger', 'd1', 4, null)]

  it('confirms what was asked, and waits again', () => {
    const confirmed = confirmOrders(orders, ['a'])
    expect(confirmed[0].conf).toBe(4)
    expect(setWaiting(confirmed, ['a'])[0].conf).toBeNull()
  })

  it('keeps what was asked when fewer come, and forgets it when all do after all', () => {
    const fewer = confirmFewer(orders, ['a'], 2)
    expect(fewer[0]).toMatchObject({ fte: 2, conf: 2, asked: 4 })
    expect(confirmFewer(fewer, ['a'], 9)[0]).toEqual(order('a', 'k1', 'vegger', 'd1', 4, 4))
    expect(confirmFewer(fewer, ['a'], 0)[0]).toMatchObject({ fte: 1, conf: 1, asked: 4 })
  })

  it('sets a confirmed order to waiting when its count is raised, and keeps it confirmed when lowered (A14)', () => {
    const confirmed = confirmOrders(orders, ['a'])
    expect(changeCount(confirmed, ['a'], 1)[0]).toEqual(order('a', 'k1', 'vegger', 'd1', 5, null))
    expect(changeCount(confirmed, ['a'], -1)[0]).toEqual(order('a', 'k1', 'vegger', 'd1', 3, 3))
    expect(changeCount([order('a', 'k1', 'vegger', 'd1', 1, null)], ['a'], -1)[0].fte).toBe(1)
  })

  it('asks again when the supplier is changed', () => {
    expect(changeOrders(confirmOrders(orders, ['a']), ['a'], { supplierId: 'k3' })[0]).toEqual(order('a', 'k3', 'vegger', 'd1', 4, null))
  })
})


describe('the order to send and what waits (I9, I10)', () => {
  const orders = [order('a', 'k1', 'tepper', '2026-10-09', 2, null), order('b', 'k1', 'vegger', '2026-10-08', 4, 4), order('c', 'k1', 'vegger', '2026-10-09', 1, 1, KVELD), order('d', 'k3', 'vegger', '2026-10-08', 9, null), order('e', 'k1', 'vegger', '2026-10-09', 3, 3)]

  it('lists a supplier per day, by competence and then by time', () => {
    const competences = [
      { key: 'vegger', label: 'Vegger' },
      { key: 'tepper', label: 'Tepper' },
    ]
    expect(orderText(manpower, orders, competences)).toBe(
      ['Bestilling – Manpower', 'tor 8. okt', '  Vegger: 4 pers. Dag 07:00–15:00', 'fre 9. okt', '  Vegger: 3 pers. Dag 07:00–15:00', '  Vegger: 1 pers. Kveld 15:00–23:00', '  Tepper: 2 pers. Dag 07:00–15:00'].join('\n'),
    )
  })

  it('sums what a supplier is ordered for, with the cost at its rate', () => {
    expect(supplierTotals({ ...manpower, rate: 500 }, orders, wd)).toEqual({ people: 10, hours: 75, cost: 37500, confirmed: 3, waiting: 1 })
    expect(supplierTotals(nordic, orders, wd)).toMatchObject({ people: 9, cost: null, confirmed: 0, waiting: 1 })
  })

  it('lists the orders of a supplier by day, competence and time, and the orders per competence and day', () => {
    expect(supplierOrders(manpower, orders, [{ key: 'vegger' }, { key: 'tepper' }]).map((o) => o.id)).toEqual(['b', 'e', 'c', 'a'])
    expect([...ordersByDay(orders)].map(([key, list]) => [key, list.map((o) => o.id)])).toEqual([
      ['tepper|2026-10-09', ['a']],
      ['vegger|2026-10-08', ['b', 'd']],
      ['vegger|2026-10-09', ['c', 'e']],
    ])
  })

  it('lists the suppliers to confirm: those that wait soonest first, then the confirmed, and none without orders', () => {
    const orders = [order('a', 'k1', 'vegger', '2026-10-09', 1, 1), order('b', 'k3', 'vegger', '2026-10-10', 1, null), order('c', 'k5', 'vegger', '2026-10-08', 2, null), order('d', 'k5', 'vegger', '2026-10-07', 1, 1)]
    const review = supplierReview([manpower, nordic, standbygg, supplier('k9', 'Tom', ['vegger'])], orders, [{ key: 'vegger' }])
    expect(review.map((r) => [r.supplier.id, r.orders.map((o) => o.id), r.waiting.map((o) => o.id), r.firstWaiting])).toEqual([
      ['k5', ['d', 'c'], ['c'], '2026-10-08'],
      ['k3', ['b'], ['b'], '2026-10-10'],
      ['k1', ['a'], [], null],
    ])
  })

  it('sums the hours of the orders that wait', () => {
    expect(waitingHours(orders, wd)).toBe(11 * 7.5)
  })
})

describe('the board of Innleid', () => {
  const rest: Record<string, number> = { 'vegger|d1': 30, 'vegger|d2': 15, 'elektro|d2': 7.5, 'rigg|d3': 0 }
  const orders = [order('a', 'k1', 'vegger', 'd1', 4, null), order('b', 'k4', 'elektro', 'd2', 3, 3), order('c', 'k3', 'lys', 'd3', 1, 1)]
  const board = hireBoard(['vegger', 'tepper', 'elektro', 'rigg', 'lys'], ['d1', 'd2', 'd3', 'd4'], (competence, date) => rest[`${competence}|${date}`] ?? 0, orders, wd)

  it('lists the competences with hours that remain or with orders, in the order given', () => {
    expect(board.competences).toEqual(['vegger', 'elektro', 'lys'])
  })

  it('has the cover of each competence and day, and none where nothing is', () => {
    expect(board.cover('vegger', 'd1')).toMatchObject({ rest: 30, planned: 30, confirmed: 0, state: 'ok' })
    expect(board.cover('vegger', 'd2').state).toBe('short')
    expect(board.cover('lys', 'd3')).toMatchObject({ rest: 0, state: 'over' })
    expect(board.cover('vegger', 'd4').state).toBe('none')
  })

  it('has the Avvik of the days that have something, by the confirmed orders, and the days nothing is ordered for', () => {
    expect([...board.deviations.keys()]).toEqual(['d1', 'd2', 'd3'])
    expect(board.deviations.get('d1')).toEqual({ state: 'under', value: -30, pending: 30 })
    expect(board.deviations.get('d2')).toEqual({ state: 'under', value: -15, pending: 0 })
    expect(board.deviations.get('d3')).toEqual({ state: 'over', value: 7.5, pending: 0 })
    expect(board.underDays).toEqual(['d2'])
  })
})

describe('the orders in the plan', () => {
  const ws = {
    settings: DEFAULT_SETTINGS,
    hireOrders: [order('a', 'k1', 'vegger', '2026-10-08', 4, 4), order('b', 'k3', 'rigg', '2026-10-08', 2, 2, { start: 420, end: 720 }), order('c', 'k1', 'tepper', '2026-10-08', 3, null), order('d', 'k3', 'rigg', '2026-10-09', 1, 1, { start: 1380, end: 420 })],
  }

  it('counts the confirmed orders as FTE per day, over the competences, and gives those that wait apart', () => {
    // 4 people a whole day and 2 for five hours: 4 + 10 / 7,5.
    expect(hiredFte(ws)).toEqual({ confirmed: { '2026-10-08': 5.33, '2026-10-09': 1 }, waiting: { '2026-10-08': 3 } })
  })

  it('is a staffing line that is added to «Tilgjengelig»', () => {
    const line = hiredLine(hiredFte(ws).confirmed)
    expect(line).toMatchObject({ group: 'added', values: { '2026-10-08': 5.33, '2026-10-09': 1 } })
    expect(capacityForDate('2026-10-08', [line], DEFAULT_SETTINGS)).toMatchObject({ base: 21, added: 5.33, available: 26.33 })
    expect(hiredFte({ settings: DEFAULT_SETTINGS }).confirmed).toEqual({})
  })
})

describe('orders painted on the suppliers\' lines', () => {
  // Monday 2026-10-12 to Monday 2026-10-19, a weekend between.
  const MON = '2026-10-12'
  const TUE = '2026-10-13'
  const WED = '2026-10-14'
  const FRI = '2026-10-16'
  const SAT = '2026-10-17'
  const SUN = '2026-10-18'
  const NEXT = '2026-10-19'
  const WEEK = [MON, TUE, WED, '2026-10-15', FRI, SAT, SUN, NEXT]
  const suppliers = [manpower, nordic, standbygg]
  let n = 0
  const id = () => `n${n++}`
  const on = (supplierId: string, shift: 'dag' | 'kveld', date: string, fte: number, conf: number | null, competence = 'vegger', projectNo?: string): HireOrder => ({
    id: `${supplierId}-${shift}-${date}-${competence}-${projectNo ?? ''}`,
    supplierId,
    shift,
    competence,
    date,
    fte,
    ...(shift === 'dag' ? DAG : KVELD),
    conf,
    ...(projectNo && { projectNo }),
  })

  it('gives a supplier a line per shift it offers, and keeps one it no longer offers while that has orders', () => {
    expect(supplierLines(standbygg, []).map((line) => line.key)).toEqual([lineKey('k5', 'dag')])
    const lines = supplierLines(standbygg, [on('k5', 'kveld', MON, 1, null, 'tepper')])
    expect(lines.map(({ shift, offered, stale }) => [shift, offered, stale])).toEqual([
      ['dag', true, []],
      ['kveld', false, ['tepper']],
    ])
    expect(supplierLines({ ...standbygg, shifts: [] }, [])).toEqual([])
  })

  it('fills the working days of a stroke, or its days off where it has nothing else', () => {
    expect(strokeDays([FRI, SAT, SUN, NEXT])).toEqual([FRI, NEXT])
    expect(strokeDays([SAT, SUN])).toEqual([SAT, SUN])
  })

  it('orders the brush\'s count on every line and day of a stroke, waiting, at the shift\'s times, and skips a supplier without the competence', () => {
    const { orders, skipped } = paintOrders([], { lines: [{ supplierId: 'k1', shift: 'kveld' }, { supplierId: 'k3', shift: 'dag' }, { supplierId: 'k5', shift: 'dag' }], competence: 'tepper', dates: [FRI, SAT, SUN, NEXT], count: 3 }, suppliers, wd, id)
    expect(skipped).toBe(2)
    expect(orders.map(({ supplierId, shift, date, fte, start, conf }) => [supplierId, shift, date, fte, start, conf])).toEqual([
      ['k1', 'kveld', FRI, 3, KVELD.start, null],
      ['k1', 'kveld', NEXT, 3, KVELD.start, null],
    ])
  })

  it('sets the count of an order on the same key, by I7: more waits again, fewer stays confirmed, what was asked is forgotten', () => {
    const paint = (count: number, list: HireOrder[]) => paintOrders(list, { lines: [{ supplierId: 'k1', shift: 'dag' }], competence: 'vegger', dates: [MON], count }, suppliers, wd, id).orders
    const confirmed = [{ ...on('k1', 'dag', MON, 2, 2), asked: 3 }]
    expect(paint(4, confirmed)).toEqual([{ ...on('k1', 'dag', MON, 4, null) }])
    expect(paint(1, confirmed)).toEqual([{ ...on('k1', 'dag', MON, 1, 1) }])
    expect(paint(2, confirmed)).toBe(confirmed)
  })

  it('with Auto orders on each day the whole people of the line\'s shift that are still missing, counting the other orders and the lines before it', () => {
    const dag = hireHours(DAG, wd)
    const need = (date: string) => (date === MON ? 2.5 * dag : date === TUE ? dag : 0)
    const auto = (list: HireOrder[], lines = [{ supplierId: 'k1', shift: 'dag' as const }]) => paintOrders(list, { lines, competence: 'vegger', dates: [MON, TUE], count: 'auto', need }, suppliers, wd, id).orders
    expect(auto([]).map((order) => [order.date, order.fte])).toEqual([
      [MON, 3],
      [TUE, 1],
    ])
    // Another supplier covers one person on Monday; the key's own order is not counted against itself, and Tuesday is covered.
    const before = [on('k3', 'dag', MON, 1, 1), on('k1', 'dag', MON, 5, null), on('k3', 'dag', TUE, 1, null)]
    expect(auto(before).map((order) => [order.supplierId, order.date, order.fte])).toEqual([
      ['k3', MON, 1],
      ['k1', MON, 2],
      ['k3', TUE, 1],
    ])
    // Two lines in one stroke: the first takes what is missing, the second gets none.
    expect(auto([], [{ supplierId: 'k1', shift: 'dag' }, { supplierId: 'k3', shift: 'dag' }]).map((order) => [order.supplierId, order.date, order.fte])).toEqual([
      ['k1', MON, 3],
      ['k1', TUE, 1],
    ])
  })

  it('keeps a project\'s order and one for no project apart', () => {
    const first = [on('k1', 'dag', MON, 2, 2)]
    const { orders } = paintOrders(first, { lines: [{ supplierId: 'k1', shift: 'dag' }], competence: 'vegger', projectNo: '26101', dates: [MON], count: 1 }, suppliers, wd, id)
    expect(orders.map((order) => [order.projectNo, order.fte])).toEqual([
      [undefined, 2],
      ['26101', 1],
    ])
  })

  it('writes a lane as text and reads it back', () => {
    expect(laneFrom(laneOf({ competence: 'vegger', projectNo: ' 26101 ' }))).toEqual({ competence: 'vegger', projectNo: '26101' })
    expect(laneFrom(laneOf({ competence: 'vegger' }))).toEqual({ competence: 'vegger' })
  })

  it('counts the people of a supplier per day over its shifts and competences, and those that wait', () => {
    const days = supplierDays([on('k1', 'dag', MON, 2, 2), on('k1', 'kveld', MON, 1, null, 'tepper'), on('k1', 'dag', TUE, 1, null), on('k3', 'dag', MON, 3, 3)], wd)
    const dag = hireHours(DAG, wd)
    const kveld = hireHours(KVELD, wd)
    expect(days.get('k1')?.get(MON)).toEqual({ people: 3, waiting: 1, hours: 2 * dag + kveld, waitingHours: kveld, parts: [{ competence: 'vegger', people: 2, waiting: 0 }, { competence: 'tepper', people: 1, waiting: 1 }] })
    expect(days.get('k1')?.get(TUE)).toEqual({ people: 1, waiting: 1, hours: dag, waitingHours: dag, parts: [{ competence: 'vegger', people: 1, waiting: 1 }] })
    expect(days.get('k3')?.get(MON)).toEqual({ people: 3, waiting: 0, hours: 3 * dag, waitingHours: 0, parts: [{ competence: 'vegger', people: 3, waiting: 0 }] })
    // In the order of the list of competences, whatever was ordered first.
    expect(supplierDays([on('k1', 'dag', MON, 2, 2), on('k1', 'kveld', MON, 1, null, 'tepper')], wd, ['tepper', 'vegger']).get('k1')?.get(MON)?.parts.map((part) => part.competence)).toEqual(['tepper', 'vegger'])
    expect([1, 2, 3].map(partName)).toEqual(['label', 'short', null])
    // The week of the name line, and the marks after the name: what waits, and whether it is urgent.
    expect(supplierWeek(days.get('k1'), [MON, TUE])).toEqual({ hours: 3 * dag + kveld, waiting: dag + kveld })
    expect(supplierWeek(undefined, [MON])).toEqual({ hours: 0, waiting: 0 })
    expect(supplierWaits(days.get('k1'), TUE)).toEqual({ waits: true, urgent: true })
    expect(supplierWaits(days.get('k3'), MON)).toEqual({ waits: false, urgent: false })
  })

  it('empties the days of lines of every order on them, or of one competence and project', () => {
    const orders = [on('k1', 'dag', MON, 1, null), on('k1', 'dag', MON, 1, null, 'tepper'), on('k1', 'kveld', MON, 1, null), on('k1', 'dag', TUE, 1, null)]
    expect(clearOrders(orders, [{ supplierId: 'k1', shift: 'dag', date: MON }])).toEqual(orders.slice(2))
    expect(clearOrders(orders, [{ supplierId: 'k3', shift: 'dag', date: MON }])).toBe(orders)
    expect(clearOrders(orders, [{ supplierId: 'k1', shift: 'dag', date: MON }], { competence: 'tepper' })).toEqual([orders[0], ...orders.slice(2)])
    expect(clearOrders(orders, [{ supplierId: 'k1', shift: 'dag', date: MON }], { competence: 'tepper', projectNo: '26101' })).toBe(orders)
  })

  it('draws runs in lanes by the competences\' order, broken by a change or a weekend, and pulled over an empty weekend', () => {
    const orders = [on('k1', 'dag', MON, 2, 2), on('k1', 'dag', TUE, 2, 2), on('k1', 'dag', WED, 2, null), on('k1', 'dag', FRI, 2, null), on('k1', 'dag', NEXT, 2, null), on('k1', 'dag', TUE, 1, null, 'tepper')]
    const rank = (competence: string) => ['tepper', 'vegger'].indexOf(competence)
    const { lanes, runs, grips } = orderRuns(orders, WEEK, rank)
    expect(lanes.map((lane) => lane.competence)).toEqual(['tepper', 'vegger'])
    expect(runs.map(({ lane, from, to, waits }) => [lane, from, to, waits])).toEqual([
      [0, TUE, TUE, true],
      [1, MON, TUE, false],
      [1, WED, WED, true],
      [1, FRI, FRI, true],
      [1, NEXT, NEXT, true],
    ])
    // Thursday is empty, so only the weekend is gone over.
    expect(grips.filter((run) => run.lane === 1).map(({ from, to }) => [from, to])).toEqual([
      [MON, TUE],
      [WED, WED],
      [FRI, NEXT],
    ])
  })

  it('stretches a run outward over working days, waiting, and inward to the day at the other end at most', () => {
    const run = orderRuns([on('k1', 'dag', MON, 2, 2), on('k1', 'dag', TUE, 2, 2)], WEEK, () => 0).grips[0]
    const out = stretchOrders(run.orders, run, 'end', NEXT, WEEK, suppliers, id)
    expect(out.map((order) => [order.date, order.conf])).toEqual([
      [MON, 2],
      [TUE, 2],
      [WED, null],
      ['2026-10-15', null],
      [FRI, null],
      [NEXT, null],
    ])
    expect(stretchOrders(run.orders, run, 'end', MON, WEEK, suppliers, id).map((order) => order.date)).toEqual([MON])
    expect(stretchOrders(run.orders, run, 'start', NEXT, WEEK, suppliers, id).map((order) => order.date)).toEqual([TUE])
  })

  it('pastes on other lines with their shift and its times, in place of what is there, and skips a supplier without the competence', () => {
    const own = { ...on('k1', 'dag', MON, 2, 2), start: 600, end: 1080 }
    const clip = copyOrders([own, on('k1', 'dag', TUE, 1, 1, 'tepper')], [{ supplierId: 'k1', shift: 'dag' }], [MON, TUE])!
    expect(clip.items.map((item) => [item.line, item.day])).toEqual([
      [0, 0],
      [0, 1],
    ])
    const there = on('k3', 'kveld', WED, 5, 5)
    const result = pasteOrders([there], clip, [{ supplierId: 'k3', shift: 'kveld' }], [WED, '2026-10-15'], suppliers, wd, id)
    expect(result).toMatchObject({ pasted: 1, skipped: 1 })
    expect(result.orders.map(({ supplierId, shift, date, fte, start, end, conf }) => [supplierId, shift, date, fte, start, end, conf])).toEqual([['k3', 'kveld', WED, 2, KVELD.start, KVELD.end, null]])
    // On the same shift, an order keeps its own times.
    expect(pasteOrders([], clip, [{ supplierId: 'k3', shift: 'dag' }], [WED], suppliers, wd, id).orders[0]).toMatchObject({ start: 600, end: 1080 })
  })

  it('moves a day\'s orders to another line and day, or copies them, and leaves those that cannot go', () => {
    const orders = [on('k1', 'dag', MON, 2, 2), on('k1', 'dag', MON, 1, 1, 'tepper')]
    const moved = moveOrders(orders, { supplierId: 'k1', shift: 'dag', date: MON }, { supplierId: 'k3', shift: 'dag', date: TUE }, false, suppliers, wd, id)
    expect(moved).toMatchObject({ moved: 1, skipped: 1 })
    expect(moved.orders.map(({ supplierId, date, competence, conf }) => [supplierId, date, competence, conf])).toEqual([
      ['k3', TUE, 'vegger', null],
      ['k1', MON, 'tepper', 1],
    ])
    const copied = moveOrders(orders, { supplierId: 'k1', shift: 'dag', date: MON }, { supplierId: 'k1', shift: 'dag', date: TUE }, true, suppliers, wd, id)
    expect(copied.orders).toHaveLength(4)
    // Confirmed with fewer, «2/3»: moved, it asks for the three again.
    const fewer = { ...on('k1', 'dag', MON, 2, 2), asked: 3 }
    expect(moveOrders([fewer], { supplierId: 'k1', shift: 'dag', date: MON }, { supplierId: 'k1', shift: 'dag', date: TUE }, false, suppliers, wd, id).orders[0]).toMatchObject({ fte: 3, conf: null })
    expect(moveOrders(orders, { supplierId: 'k1', shift: 'dag', date: MON }, { supplierId: 'k1', shift: 'dag', date: MON }, false, suppliers, wd, id).orders).toBe(orders)
  })

  it('shares the orders for no project on the lines by what each lacks after its own, and gives what none lacks to the last', () => {
    // 7.5 hours a person on the day shift.
    const lines = [
      { rest: 15, own: (order: HireOrder) => order.projectNo === 'A' },
      { rest: 7.5, own: (order: HireOrder) => order.projectNo === 'B' },
      { rest: 0, own: (order: HireOrder) => !['A', 'B'].includes(order.projectNo ?? '') },
    ]
    const hours = (list: HireOrder[]) => list.reduce((sum, order) => sum + order.fte * hireHours(order, wd), 0)
    const tagged = on('k1', 'dag', MON, 1, 1, 'vegger', 'A')
    // A lacks 7.5 after its own, B 7.5: the two people for no project go one to each.
    expect(shareOrders(lines, [tagged, on('k3', 'dag', MON, 2, null)], wd).map(hours)).toEqual([15, 7.5, 0])
    // Four people: 15 hours more than A and B lack, which go to the last line.
    expect(shareOrders(lines, [tagged, on('k3', 'dag', MON, 4, null)], wd).map(hours)).toEqual([15, 7.5, 15])
    expect(shareOrders(lines, [tagged], wd)).toEqual([[tagged], [], []])
    // Whole people, the confirmed first: A lacks 7.5 and B 7.5, so the confirmed person goes to A, and of the two who
    // wait one goes to B and the last, which none lacks, to the last line.
    const confirmed = on('k3', 'dag', MON, 1, 1)
    const waiting = on('k1', 'dag', MON, 2, null)
    const shared = shareOrders(lines, [tagged, waiting, confirmed], wd)
    expect(shared.map((list) => list.map(({ supplierId, fte, conf }) => [supplierId, fte, conf]))).toEqual([
      [['k1', 1, 1], ['k3', 1, 1]],
      [['k1', 1, null]],
      [['k1', 1, null]],
    ])
  })
})

describe('the hours a change orders', () => {
  it('counts what is added or changed less what is taken away or changed', () => {
    const a = order('a', 'k1', 'vegger', 'd1', 2, null)
    const b = order('b', 'k1', 'vegger', 'd2', 1, 1)
    const more = { ...a, fte: 3 }
    expect(hoursChange([a, b], [a, b], wd)).toBe(0)
    expect(hoursChange([a], [a, b], wd)).toBe(7.5)
    expect(hoursChange([a, b], [more, b], wd)).toBe(7.5)
    expect(hoursChange([a, b], [b], wd)).toBe(-15)
  })
})
