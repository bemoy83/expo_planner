import { describe, expect, it } from 'vitest'
import { setCompetenceStyle } from '../competences'
import { DEFAULT_SETTINGS, type AllocationRow, type Assignment, type CompetenceStyle, type HireOrder, type Workspace } from '../types'
import { hireCost, projectScore, scorePlan, stageOrderOf, stagesOf, WEIGHTS, weightsOf } from './score'

/**
 * The score of a plan, and the planner's own choices between pairs of plans (2026-10-25), which the weights are to
 * agree with: the first plan of each pair is the one he picked.
 */

const MON = '2026-10-12'
const TUE = '2026-10-13'
const WED = '2026-10-14'
const THU = '2026-10-15'
const FRI = '2026-10-16'
const WEEK = [MON, TUE, WED, THU, FRI]
const PROJECT = '26001'

/** A clock time of the day as minutes: «7:00» is 420. */
const at = (time: string) => {
  const [h, m = '0'] = time.split(':')
  return Number(h) * 60 + Number(m)
}

/** The competences in the planner's order, the hardest to replace first. */
const ORDER: [string, Partial<CompetenceStyle>][] = [
  ['banner', {}],
  ['snekker', {}],
  ['tepper', { stage: 'gulv', next: 'møbler' }],
  ['møbler', { stage: 'losore' }],
  ['foga', { stage: 'standbygging' }],
  ['oppmerking', { stage: 'oppmerking', minPerHall: 2 }],
]

const PEOPLE = [
  { id: 'kari', name: 'Kari', order: 0, competences: ['foga', 'banner'] },
  { id: 'ola', name: 'Ola', order: 1, competences: ['foga', 'tepper', 'møbler'] },
  { id: 'p1', name: 'Per', order: 2, competences: ['foga', 'oppmerking'] },
  { id: 'p2', name: 'Pål', order: 3, competences: ['foga', 'oppmerking'] },
]

const styled = (): Workspace => {
  let ws: Workspace = { settings: DEFAULT_SETTINGS, venue: [], projects: [], demand: [], allocations: ORDER.map(([key]) => row(key, 'B1', {})), persons: PEOPLE }
  ORDER.forEach(([key, style], index) => {
    ws = { ...ws, competenceStyles: setCompetenceStyle(ws, key, style) }
    const styles = Object.values(ws.competenceStyles!).sort((a, b) => a.order - b.order).map((s) => s.key)
    const from = styles.indexOf(key)
    if (from !== index) {
      styles.splice(index, 0, ...styles.splice(from, 1))
      ws = { ...ws, competenceStyles: Object.fromEntries(styles.map((k, order) => [k, { ...ws.competenceStyles![k], order }])) }
    }
  })
  return ws
}

/** A planning row of the project: FTE by day. */
function row(competence: string, hall: string, fte: Record<string, number>, phase: AllocationRow['phase'] = 'Montering'): AllocationRow {
  return { id: `row-${competence}-${hall}-${phase}`, order: 0, projectName: 'Testmessen 2026', projectNo: PROJECT, refYear: '', competence, phase, basis: 'Planlagt', hall, fte, notes: {} }
}

let n = 0
/** A block of a person for the project, in a hall. */
const block = (personId: string, date: string, competence: string, from = '7:00', to = '15:00', hall = 'B1'): Assignment => ({
  id: `b${n++}`,
  personId,
  date,
  competence,
  start: at(from),
  end: at(to),
  source: 'manual',
  projectNo: PROJECT,
  hall,
})

/** People hired for the project. */
const hire = (date: string, competence: string, from = '7:00', to = '15:00', people = 1): HireOrder => ({
  id: `o${n++}`,
  supplierId: 's1',
  competence,
  date,
  fte: people,
  start: at(from),
  end: at(to),
  conf: people,
  projectNo: PROJECT,
})

const BASE = styled()
const plan = (allocations: AllocationRow[], assignments: Assignment[], hireOrders: HireOrder[] = []): Workspace => ({ ...BASE, allocations, assignments, hireOrders })
/** The build-up of the project is the whole week, unless a test says otherwise. */
const score = (ws: Workspace, window: string[] = WEEK) => scorePlan(ws, WEEK, () => new Set(window))
const total = (ws: Workspace, window?: string[]) => score(ws, window).total

describe('the parts of the score', () => {
  it('costs nothing for a plan the permanent staff cover in normal time', () => {
    expect(score(plan([row('foga', 'B1', { [MON]: 1 })], [block('kari', MON, 'foga')]))).toMatchObject({ total: 0, findings: [] })
  })

  it('counts an hour nobody covers dearest of all', () => {
    const s = score(plan([row('foga', 'B1', { [MON]: 2 })], [block('kari', MON, 'foga')]))
    expect(s.findings).toEqual([expect.objectContaining({ kind: 'uncovered', hours: 7.5, cost: 75, projectNo: PROJECT, competence: 'foga' })])
  })

  it('counts demand put on no day as uncovered too, when it is asked to', () => {
    const empty = row('foga', 'B1', {})
    const s = scorePlan(plan([empty], []), WEEK, () => new Set([TUE, WED]), WEIGHTS, { rows: [empty], required: () => 2 })
    expect(s.findings).toEqual([expect.objectContaining({ kind: 'uncovered', unplanned: true, hours: 15, date: TUE, hall: 'B1' })])
    expect(score(plan([empty], [])).total).toBe(0)
  })

  it('costs a hired hour more the harder the competence is to replace', () => {
    const cost = hireCost(Object.values(BASE.competenceStyles!).sort((a, b) => a.order - b.order))
    expect(cost('banner')).toBe(WEIGHTS.hireHardest)
    expect(cost('oppmerking')).toBe(WEIGHTS.hireEasiest)
    expect(cost('snekker')).toBeLessThan(cost('banner'))
  })

  it('pays a hired person for three hours at least', () => {
    const s = score(plan([row('foga', 'B1', { [MON]: 1 / 7.5 })], [], [hire(MON, 'foga', '7:00', '8:00')]))
    expect(s.findings.filter((f) => !f.started)).toEqual([expect.objectContaining({ kind: 'hire', hours: 3 })])
  })

  it('counts a switch of competence, hall or project, but not a team going on along its chain', () => {
    const switches = (...blocks: Assignment[]) => score(plan([], blocks)).findings.filter((f) => f.kind === 'switch').map((f) => f.switched)
    expect(switches(block('ola', MON, 'foga'), block('ola', TUE, 'tepper'))).toEqual(['competence'])
    expect(switches(block('ola', MON, 'tepper'), block('ola', TUE, 'møbler'))).toEqual([])
    expect(switches(block('ola', MON, 'foga'), block('ola', TUE, 'foga', '7:00', '15:00', 'C1'))).toEqual(['hall'])
    expect(switches(block('ola', MON, 'foga'), { ...block('ola', TUE, 'foga'), projectNo: '26002' })).toEqual(['project'])
  })

  it('counts a day of work in a hall outside the window once, however many rows have it', () => {
    const s = score(plan([row('foga', 'B1', { [MON]: 1 }), row('tepper', 'B1', { [MON]: 1 })], [block('kari', MON, 'foga'), block('ola', MON, 'tepper')]), [TUE])
    expect(s.findings.filter((f) => f.kind === 'outside')).toEqual([expect.objectContaining({ date: MON, hall: 'B1', cost: WEIGHTS.outsideWindow })])
  })

  it('counts the days a stage starts before the stage it comes after, and the other way in a tear-down', () => {
    const early = plan([row('tepper', 'B1', { [TUE]: 1 }), row('foga', 'B1', { [MON]: 1, [TUE]: 1 })], [])
    expect(score(early).findings.filter((f) => f.kind === 'stage')).toEqual([expect.objectContaining({ stage: 'standbygging', date: MON, cost: WEIGHTS.stageDay })])
    const down = plan([row('tepper', 'B1', { [MON]: 1 }, 'Demontering'), row('foga', 'B1', { [TUE]: 1 }, 'Demontering')], [])
    expect(score(down).findings.filter((f) => f.kind === 'stage').length).toBeGreaterThan(0)
  })

  it('counts a person short of the fewest a competence is done by in a hall', () => {
    const one = score(plan([row('oppmerking', 'B1', { [MON]: 1 })], [block('p1', MON, 'oppmerking')]))
    expect(one.findings.filter((f) => f.kind === 'minimum')).toEqual([expect.objectContaining({ hall: 'B1', cost: WEIGHTS.belowMinimum })])
    expect(score(plan([row('oppmerking', 'B1', { [MON]: 2 })], [block('p1', MON, 'oppmerking'), block('p2', MON, 'oppmerking')])).findings).toEqual([])
  })

  it('gives a project its own findings', () => {
    const s = score(plan([row('foga', 'B1', { [MON]: 2 })], [block('kari', MON, 'foga')]))
    expect(projectScore(s, ' 26001').total).toBe(s.total)
    expect(projectScore(s, '26002').total).toBe(0)
  })
})

describe('the planner\'s choices', () => {
  it('1. a scarce competence: Kari goes to banner and FOGA is hired, rather than banner being hired', () => {
    const rows = [row('foga', 'B1', { [MON]: 1, [TUE]: 1 }), row('banner', 'B1', { [TUE]: 1 })]
    const picked = plan(rows, [block('kari', MON, 'foga'), block('kari', TUE, 'banner')], [hire(TUE, 'foga')])
    const other = plan(rows, [block('kari', MON, 'foga'), block('kari', TUE, 'foga')], [hire(TUE, 'banner')])
    expect(total(picked)).toBeLessThan(total(other))
  })

  it('2. a short switch: carpet is hired for two hours, rather than Ola leaving FOGA for them', () => {
    const rows = [row('foga', 'B1', { [TUE]: 1 }), row('tepper', 'B1', { [TUE]: 2 / 7.5 })]
    const picked = plan(rows, [block('ola', TUE, 'foga')], [hire(TUE, 'tepper', '7:00', '9:00')])
    const other = plan(rows, [block('ola', TUE, 'foga', '7:00', '13:00'), block('ola', TUE, 'tepper', '13:00', '15:00')], [hire(TUE, 'foga', '13:00', '15:00')])
    expect(total(picked)).toBeLessThan(total(other))
  })

  it('3. overtime or hire: two take an hour and a half of overtime each, rather than one hired for half a day', () => {
    const rows = [row('foga', 'B1', { [TUE]: 18 / 7.5 })]
    const picked = plan(rows, [block('p1', TUE, 'foga', '7:00', '16:30'), block('p2', TUE, 'foga', '7:00', '16:30')])
    const other = plan(rows, [block('p1', TUE, 'foga'), block('p2', TUE, 'foga')], [hire(TUE, 'foga', '7:00', '10:45')])
    expect(total(picked)).toBeLessThan(total(other))
  })

  it('3. but a whole day short is hired, not spread as overtime', () => {
    const rows = [row('foga', 'B1', { [TUE]: 5 })]
    const crew = ['kari', 'ola', 'p1', 'p2']
    const overtime = plan(rows, crew.map((p) => block(p, TUE, 'foga', '7:00', '16:52')))
    const hired = plan(rows, crew.map((p) => block(p, TUE, 'foga')), [hire(TUE, 'foga')])
    expect(total(hired)).toBeLessThan(total(overtime))
  })

  it('4. an earlier start or hire: the crew starts a day before the window, rather than 15 hours being hired', () => {
    const picked = plan([row('foga', 'B1', { [MON]: 2, [TUE]: 2, [WED]: 2 })], ['p1', 'p2'].flatMap((p) => [MON, TUE, WED].map((d) => block(p, d, 'foga'))))
    const other = plan([row('foga', 'B1', { [TUE]: 3, [WED]: 3 })], ['p1', 'p2'].flatMap((p) => [TUE, WED].map((d) => block(p, d, 'foga'))), [hire(TUE, 'foga'), hire(WED, 'foga')])
    expect(total(picked, [TUE, WED])).toBeLessThan(total(other, [TUE, WED]))
  })

  it('5. an earlier start or overtime: the crew starts a day before, rather than four people taking overtime', () => {
    const picked = plan([row('foga', 'B1', { [MON]: 0.8, [TUE]: 2, [WED]: 2 })], [block('p1', MON, 'foga', '7:00', '13:30'), ...['p1', 'p2'].flatMap((p) => [TUE, WED].map((d) => block(p, d, 'foga')))])
    const other = plan([row('foga', 'B1', { [TUE]: 2.4, [WED]: 2.4 })], ['p1', 'p2'].flatMap((p) => [TUE, WED].map((d) => block(p, d, 'foga', '7:00', '16:30'))))
    expect(total(picked, [TUE, WED])).toBeLessThan(total(other, [TUE, WED]))
  })

  it('6. a switch of hall or hire: Kari stays in her hall and the other hall hires, rather than both hiring', () => {
    const rows = [row('foga', 'B1', Object.fromEntries(WEEK.map((d) => [d, 1]))), row('foga', 'C1', { [WED]: 4 / 7.5 })]
    const kariInB = WEEK.map((d) => block('kari', d, 'foga'))
    const picked = plan(rows, kariInB, [hire(WED, 'foga', '7:00', '11:00')])
    const moved = kariInB.flatMap((b) => (b.date === WED ? [{ ...b, end: at('10:30') }, block('kari', WED, 'foga', '10:30', '15:00', 'C1')] : [b]))
    const other = plan(rows, moved, [hire(WED, 'foga', '7:00', '11:00')])
    expect(total(picked)).toBeLessThan(total(other))
  })
})

describe('the planner\'s choices about hire (2026-10-25)', () => {
  const week = (fte: number[]) => Object.fromEntries(WEEK.map((d, i) => [d, fte[i]]).filter(([, v]) => v))
  const hired = (days: string[]) => days.map((d) => hire(d, 'foga'))

  it('counts a start for a hired person who was not there the working day before, and none over a weekend', () => {
    const s = score(plan([row('foga', 'B1', week([1, 1, 0, 1, 1]))], [], hired([MON, TUE, THU, FRI])))
    expect(s.findings.filter((f) => f.started)).toEqual([expect.objectContaining({ date: MON, started: 1 }), expect.objectContaining({ date: THU, started: 1 })])
    const friday = plan([row('foga', 'B1', { [FRI]: 1, '2026-10-19': 1 })], [], hired([FRI, '2026-10-19']))
    expect(scorePlan(friday, [...WEEK, '2026-10-19'], () => new Set([...WEEK, '2026-10-19'])).findings.filter((f) => f.started)).toHaveLength(1)
  })

  it('1. two hired for two days each, rather than one for five with a day almost without work', () => {
    const picked = plan([row('foga', 'B1', week([1, 1, 0, 1, 1]))], [], hired([MON, TUE, THU, FRI]))
    const other = plan([row('foga', 'B1', week([1, 1, 0.1, 1, 0.9]))], [], hired(WEEK))
    expect(total(picked)).toBeLessThan(total(other))
  })

  it('2. the same hired person to the next hall, rather than a new one: a start costs more than a switch of hall', () => {
    expect(WEIGHTS.hireStart).toBeGreaterThan(WEIGHTS.hallSwitch)
  })

  it('3. a hired person let go over two quiet days and a new one taken, rather than kept on', () => {
    const rows = [row('foga', 'B1', week([1, 0.1, 0.1, 1, 1]))]
    const picked = plan(rows, [block('kari', TUE, 'foga', '7:00', '7:45'), block('kari', WED, 'foga', '7:00', '7:45')], hired([MON, THU, FRI]))
    const other = plan(rows, [], hired(WEEK))
    expect(total(picked)).toBeLessThan(total(other))
  })
})

describe('the rules the planner sets', () => {
  it('takes his weights where he has set them, and the defaults for the rest', () => {
    const weights = weightsOf({ engine: { weights: { uncovered: 20, hallSwitch: -1, unknown: 5 } } })
    expect(weights.uncovered).toBe(20)
    expect(weights.hallSwitch).toBe(WEIGHTS.hallSwitch)
    expect(weights).not.toHaveProperty('unknown')
    expect(scorePlan({ ...plan([row('foga', 'B1', { [MON]: 1 })], []), settings: { ...BASE.settings, engine: { weights: { uncovered: 20 } } } }, WEEK, () => new Set(WEEK)).total).toBe(150)
  })

  it('takes his order of the stages, every stage once, and a tear-down the other way round', () => {
    const order = stageOrderOf({ engine: { stageOrder: ['gulv', 'oppmerking', 'gulv', 'lopende'] } })
    expect(order).toEqual(['gulv', 'oppmerking', 'standbygging', 'tilvalg', 'losore'])
    expect(stagesOf('Demontering', order)[0]).toBe('losore')
    expect(stageOrderOf({})).toEqual(['oppmerking', 'gulv', 'standbygging', 'tilvalg', 'losore'])
  })
})
