import { describe, expect, it } from 'vitest'
import { changeCount, changeOrders, confirmFewer, confirmOrders, coverage, coverFigure, dayChips, deviation, eraseOrders, fillGroup, groupWaits, hireBoard, hiredFte, hiredLine, hireHours, mergeOrders, orderGroups, orderText, planOrders, rangeSummary, setWaiting, shiftOf, shiftTimes, supplierTotals, waitingHours } from './hire'
import { capacityForDate } from './calc'
import { DEFAULT_SETTINGS, DEFAULT_WORKDAY, type HireOrder, type Supplier } from './types'

const wd = DEFAULT_WORKDAY
const DAG = { start: 420, end: 900 }
const KVELD = { start: 900, end: 1380 }

const supplier = (id: string, name: string, competences: string[], shifts: Supplier['shifts'] = ['dag', 'kveld', 'natt']): Supplier => ({ id, name, order: Number(id.slice(1)), competences, shifts })
const manpower = supplier('k1', 'Manpower', ['vegger', 'tepper'])
const nordic = supplier('k3', 'Nordic Crew', ['vegger', 'rigg'])
const standbygg = supplier('k5', 'StandBygg', ['vegger', 'elektro'], ['dag'])

const order = (id: string, supplierId: string, competence: string, date: string, fte: number, conf: number | null, times = DAG): HireOrder => ({ id, supplierId, competence, date, fte, ...times, conf })

let seq = 0
const makeId = () => `n${++seq}`

describe('shifts and paid hours', () => {
  it('has the three shifts go round the clock from the normal day', () => {
    expect(shiftTimes('dag', wd)).toEqual(DAG)
    expect(shiftTimes('kveld', wd)).toEqual(KVELD)
    expect(shiftTimes('natt', wd)).toEqual({ start: 1380, end: 420 })
    expect(shiftOf({ start: 1380, end: 420 }, wd)).toBe('natt')
    expect(shiftOf({ start: 480, end: 900 }, wd)).toBeNull()
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
    expect(coverFigure(coverage(60, [], wd))).toBe(-60)
    expect(coverage(60, [], wd).state).toBe('short')
    expect(coverage(0, [], wd).state).toBe('none')
    expect(coverage(-7.5, [], wd)).toMatchObject({ rest: 0, state: 'none' })
  })

  it('counts an order that waits as ordered, but not as confirmed', () => {
    expect(coverage(30, [order('a', 'k1', 'vegger', '2026-10-08', 2, 2), order('b', 'k5', 'vegger', '2026-10-08', 2, null)], wd)).toMatchObject({ planned: 30, confirmed: 15, state: 'ok' })
  })

  it('is over from one person of the shortest order, and shows the hours over before that (A4, A8)', () => {
    const over = coverage(7.5, [order('b11', 'k4', 'elektro', '2026-10-07', 3, 3)], wd)
    expect(over.state).toBe('over')
    expect(coverFigure(over)).toBe(15)
    const within = coverage(4, [order('a', 'k4', 'elektro', '2026-10-07', 1, 1)], wd)
    expect(within.state).toBe('ok')
    expect(coverFigure(within)).toBe(3.5)
  })

  it('lacks the hours of the people a supplier could not send (A7)', () => {
    const fewer = confirmFewer([order('b2', 'k1', 'vegger', '2026-10-08', 4, 4)], ['b2'], 3)
    expect(fewer).toEqual([{ ...order('b2', 'k1', 'vegger', '2026-10-08', 3, 3), asked: 4 }])
    expect(coverFigure(coverage(30, fewer, wd))).toBe(-7.5)
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
    expect(deviation([ok, short, over])).toEqual({ state: 'under', value: -22.5, pending: 7.5 })
  })
})

describe('ordering (I3, I4)', () => {
  const rest = (hours: Record<string, number>) => (date: string) => hours[date] ?? 0

  it('fills the count to cover what is missing, waiting for an answer (A10)', () => {
    seq = 0
    expect(planOrders([], manpower, 'vegger', ['d1'], rest({ d1: 45 }), wd, false, makeId)).toEqual([order('n1', 'k1', 'vegger', 'd1', 6, null)])
    expect(planOrders([], manpower, 'vegger', ['d1'], rest({ d1: 50 }), wd, false, makeId)[0].fte).toBe(7)
  })

  it('orders the short days only, and with the brush nothing where none is short (A11)', () => {
    const orders = [order('a', 'k3', 'vegger', 'd2', 4, null)]
    const planned = planOrders(orders, manpower, 'vegger', ['d1', 'd2', 'd3'], rest({ d1: 15, d2: 30, d3: 0 }), wd, true, makeId)
    expect(planned.map((o) => [o.date, o.fte])).toEqual([['d1', 2]])
    expect(planOrders(orders, manpower, 'vegger', ['d2', 'd3'], rest({ d2: 30 }), wd, true, makeId)).toEqual([])
    expect(planOrders(orders, manpower, 'vegger', ['d2', 'd3'], rest({ d2: 30 }), wd, false, makeId).map((o) => [o.date, o.fte])).toEqual([
      ['d2', 1],
      ['d3', 1],
    ])
  })

  it('takes the first shift the supplier is not ordered for on the days', () => {
    const orders = [order('a', 'k1', 'vegger', 'd1', 2, null)]
    expect(planOrders(orders, manpower, 'vegger', ['d1'], rest({ d1: 30 }), wd, false, makeId)[0]).toMatchObject({ ...KVELD, fte: 2 })
    expect(planOrders([order('a', 'k5', 'vegger', 'd1', 2, null)], standbygg, 'vegger', ['d1'], rest({ d1: 30 }), wd, false, makeId)[0]).toMatchObject(DAG)
  })

  it('orders nothing from a supplier that does not offer the competence', () => {
    expect(planOrders([], manpower, 'elektro', ['d1'], rest({ d1: 30 }), wd)).toEqual([])
  })

  it('erases the orders of a competence in the days, of all suppliers or of one (A12)', () => {
    const orders = [order('a', 'k1', 'vegger', 'd1', 2, null), order('b', 'k3', 'vegger', 'd1', 1, 1), order('c', 'k1', 'tepper', 'd1', 1, null), order('d', 'k1', 'vegger', 'd3', 1, null)]
    expect(eraseOrders(orders, 'vegger', ['d1', 'd2']).map((o) => o.id)).toEqual(['c', 'd'])
    expect(eraseOrders(orders, 'vegger', ['d1', 'd2'], 'k1').map((o) => o.id)).toEqual(['b', 'c', 'd'])
    expect(eraseOrders(orders, 'rigg', ['d1'])).toBe(orders)
  })
})

describe('one order per supplier, competence, day and time (I5)', () => {
  it('adds the people of two that are the same, and waits while one of them does', () => {
    const merged = mergeOrders([order('a', 'k1', 'vegger', 'd1', 2, 2), order('b', 'k1', 'vegger', 'd1', 1, null), order('c', 'k1', 'vegger', 'd1', 1, 1, KVELD)])
    expect(merged).toEqual([order('a', 'k1', 'vegger', 'd1', 3, null), order('c', 'k1', 'vegger', 'd1', 1, 1, KVELD)])
    expect(mergeOrders([order('a', 'k1', 'vegger', 'd1', 2, 2), order('b', 'k1', 'vegger', 'd1', 1, 1)])[0]).toMatchObject({ fte: 3, conf: 3 })
  })

  it('leaves the list as it is when no two are the same', () => {
    const orders = [order('a', 'k1', 'vegger', 'd1', 2, 2), order('b', 'k3', 'vegger', 'd1', 1, null)]
    expect(mergeOrders(orders)).toBe(orders)
  })

  it('merges an order moved onto the time of another', () => {
    const orders = [order('a', 'k1', 'vegger', 'd1', 2, 2), order('b', 'k1', 'vegger', 'd1', 1, 1, KVELD)]
    expect(changeOrders(orders, ['b'], DAG)).toEqual([order('a', 'k1', 'vegger', 'd1', 3, null)])
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

describe('the lines of the editor (I8)', () => {
  const orders = [order('a', 'k3', 'vegger', 'd1', 1, 1), order('b', 'k1', 'vegger', 'd1', 2, 2, KVELD), order('c', 'k1', 'vegger', 'd1', 4, 4), order('d', 'k1', 'vegger', 'd2', 2, null), order('e', 'k1', 'vegger', 'd3', 2, 2)]

  it('gathers the orders by supplier and time, in the suppliers order and then by time (A13)', () => {
    const groups = orderGroups(orders, [manpower, nordic])
    expect(groups.map((group) => group.orders.map((o) => o.id))).toEqual([['c', 'd', 'e'], ['b'], ['a']])
    expect(groups.map(groupWaits)).toEqual([true, false, false])
  })

  it('fills the days a group lacks with its median count', () => {
    seq = 0
    const [group] = orderGroups(orders, [manpower, nordic])
    expect(fillGroup(group, 'vegger', ['d1', 'd2', 'd3', 'd4'], makeId)).toEqual([order('n1', 'k1', 'vegger', 'd4', 2, null)])
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
      ['Bestilling – Manpower', 'tor 8. okt', '  Vegger: 4 pers. 07:00–15:00', 'fre 9. okt', '  Vegger: 3 pers. 07:00–15:00', '  Vegger: 1 pers. 15:00–23:00', '  Tepper: 2 pers. 07:00–15:00'].join('\n'),
    )
  })

  it('sums what a supplier is ordered for, with the cost at its rate', () => {
    expect(supplierTotals({ ...manpower, rate: 500 }, orders, wd)).toEqual({ people: 10, hours: 75, cost: 37500, confirmed: 3, waiting: 1 })
    expect(supplierTotals(nordic, orders, wd)).toMatchObject({ people: 9, cost: null, confirmed: 0, waiting: 1 })
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

  it('has the Avvik of the days that have something, and the days that are under', () => {
    expect([...board.deviations.keys()]).toEqual(['d1', 'd2', 'd3'])
    expect(board.deviations.get('d1')).toEqual({ state: 'ok', value: 0, pending: 30 })
    expect(board.deviations.get('d2')).toEqual({ state: 'under', value: -15, pending: 0 })
    expect(board.deviations.get('d3')).toEqual({ state: 'over', value: 7.5, pending: 0 })
    expect(board.underDays).toEqual(['d2'])
  })
})

describe('the chips of a day and the sum of a range', () => {
  const orders = [order('a', 'k3', 'vegger', 'd1', 1, 1), order('b', 'k1', 'vegger', 'd1', 2, null, KVELD), order('c', 'k1', 'vegger', 'd1', 4, 4)]

  it('has one chip per supplier with its times summed, or one per time (A13)', () => {
    expect(dayChips(orders, [manpower, nordic]).map((chip) => [chip.key, chip.fte, chip.waits])).toEqual([
      ['k1', 6, true],
      ['k3', 1, false],
    ])
    expect(dayChips(orders, [manpower, nordic], true).map((chip) => [chip.supplierId, chip.fte, chip.waits])).toEqual([
      ['k1', 4, false],
      ['k1', 2, true],
      ['k3', 1, false],
    ])
  })

  it('sums the days picked: what is missing, and the people on a day shift that would cover it', () => {
    const covers = [coverage(60, orders, wd), coverage(22, [], wd)]
    expect(rangeSummary(covers, orders, wd)).toEqual({ rest: 82, planned: 52.5, short: 29.5, over: 0, people: 7, peopleShort: 4 })
    expect(rangeSummary([coverage(45, orders, wd)], orders, wd)).toMatchObject({ short: 0, over: 7.5, peopleShort: 0 })
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
    const line = hiredLine(ws)
    expect(line).toMatchObject({ group: 'added', values: { '2026-10-08': 5.33, '2026-10-09': 1 } })
    expect(capacityForDate('2026-10-08', [line], DEFAULT_SETTINGS)).toMatchObject({ base: 21, added: 5.33, available: 26.33 })
    expect(hiredLine({ settings: DEFAULT_SETTINGS }).values).toEqual({})
  })
})
