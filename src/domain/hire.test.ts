import { describe, expect, it } from 'vitest'
import { changeCount, changeOrders, confirmFewer, confirmOrders, coverage, coveredBy, coverFigure, coverLines, orderedLabel, deviation, eraseOrders, fillGroup, groupWaits, hireBoard, hiredFte, hiredLine, hireHours, mergeOrders, orderGroups, orderText, ordersByDay, planAcross, planOrders, setWaiting, shiftOf, shiftText, shiftTimes, supplierOrders, supplierReview, supplierTotals, timesText, waitingHours } from './hire'
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

  it('names an order by its shift, or by its own times', () => {
    expect(shiftText(KVELD, wd)).toBe('Kveld')
    expect(shiftText({ start: 480, end: 900 }, wd)).toBe('08:00–15:00')
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

describe('the label of a day', () => {
  const day = (id: string, supplierId: string, fte: number, conf: number | null) => order(id, supplierId, 'vegger', 'd', fte, conf)

  it('fills what remains from the left, the confirmed first and those that wait after, with a rule between the orders', () => {
    const orders = [day('w', 'k1', 1, null), day('c', 'k5', 2, 2)]
    const { segs, rules } = orderedLabel(coverage(30, orders, wd), orders, wd, [manpower, standbygg])
    expect(segs).toEqual([
      { kind: 'covered', from: 0, width: 0.5 },
      { kind: 'waiting', from: 0.5, width: 0.25 },
    ])
    expect(rules).toEqual([0.5])
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

  it('names the supplier with the most confirmed for a project, and counts the others', () => {
    expect(coveredBy([])).toBeNull()
    expect(coveredBy([day('a', 'k1', 1, 1), day('b', 'k5', 3, null), day('c', 'k3', 1, 1), day('d', 'k3', 1, 1)])).toEqual({ supplierId: 'k3', people: 2, waits: false, more: 2, moreWaits: true })
    expect(coveredBy([day('a', 'k1', 1, null), day('b', 'k5', 3, null)])).toEqual({ supplierId: 'k5', people: 3, waits: true, more: 1, moreWaits: true })
  })

  it('lists an open day per supplier and project, the confirmed first', () => {
    const lines = coverLines([{ ...day('a', 'k5', 1, null), projectNo: '2026-1' }, { ...day('b', 'k1', 2, 2), projectNo: '2026-2' }, { ...day('c', 'k1', 1, 1), projectNo: '2026-1' }, { ...day('d', 'k1', 1, 1), projectNo: '2026-1' }], [manpower, standbygg], (no) => (no === '2026-1' ? 'Hage' : 'VVS'))
    expect(lines.map(({ supplierId, projectNo, people, waits }) => [supplierId, projectNo, people, waits])).toEqual([
      ['k1', '2026-1', 2, false],
      ['k1', '2026-2', 2, false],
      ['k5', '2026-1', 1, true],
    ])
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

  it('orders what each project lacks for it, and what is on no project line without one (I3 over lines)', () => {
    seq = 0
    const lines = [
      { projectNo: '2026-1', restOf: rest({ d1: 15, d2: 0 }), holds: (o: HireOrder) => o.projectNo === '2026-1' },
      { restOf: rest({ d1: 7.5, d2: 7.5 }), holds: (o: HireOrder) => !o.projectNo },
    ]
    const orders = [{ ...order('a', 'k3', 'vegger', 'd1', 1, 1), projectNo: '2026-1' }]
    expect(planAcross(orders, manpower, 'vegger', lines, ['d1', 'd2'], wd, makeId).map((o) => [o.date, o.projectNo, o.fte])).toEqual([
      ['d1', '2026-1', 1],
      ['d1', undefined, 1],
      ['d2', undefined, 1],
    ])
  })

  it('gives one person a day to the first line with hours where none lacks anything', () => {
    const lines = [
      { projectNo: '2026-1', restOf: rest({ d2: 7.5 }), holds: (o: HireOrder) => o.projectNo === '2026-1' },
      { projectNo: '2026-2', restOf: rest({ d1: 7.5 }), holds: (o: HireOrder) => o.projectNo === '2026-2' },
    ]
    const orders = [{ ...order('a', 'k3', 'vegger', 'd1', 1, 1), projectNo: '2026-2' }, { ...order('b', 'k3', 'vegger', 'd2', 1, 1), projectNo: '2026-1' }]
    expect(planAcross(orders, manpower, 'vegger', lines, ['d1', 'd2', 'd3'], wd, makeId).map((o) => [o.date, o.projectNo, o.fte])).toEqual([
      ['d1', '2026-2', 1],
      ['d2', '2026-1', 1],
      ['d3', '2026-2', 1],
    ])
    expect(planAcross(orders, manpower, 'elektro', lines, ['d1'], wd, makeId)).toEqual([])
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
