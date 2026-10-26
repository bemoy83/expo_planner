import { describe, expect, it } from 'vitest'
import { TWO_PROJECTS, withTwoProjects } from '../test/staffingFixture'
import { DEFAULT_SETTINGS, DEFAULT_WORKDAY, workTag, type Assignment, type VenueBooking, type Workspace } from './types'
import { buildWeekPlan } from './weekPlan'

/** The shared week plan: projects and places down, days across, a bar per work. */

const MON = '2026-10-12'
const WED = '2026-10-14'
const { first: FIRST, second: SECOND } = TWO_PROJECTS
const wd = DEFAULT_WORKDAY

const booking = (id: string, hall: string, eventName: string): VenueBooking => ({ id, hall, eventName, status: 'Bekreftet', phases: { assembly: { start: MON, end: '2026-10-14' }, event: { start: '2026-10-15', end: '2026-10-16' } } })
const base = withTwoProjects({ settings: DEFAULT_SETTINGS, venue: [], projects: [], demand: [], allocations: [], persons: [] })
const ws: Workspace = {
  ...base,
  allocations: [
    { ...base.allocations[0], id: 'first-b', hall: 'B', avdeling: 'Stands', fte: { [MON]: 1, [WED]: 1 } },
    { ...base.allocations[0], id: 'first-c', hall: 'C2', fte: { [MON]: 1 } },
    { ...base.allocations[1], hall: 'Ufordelt', fte: { [MON]: 1 } },
    base.allocations[2],
  ],
  venue: [booking('v1', 'D1', 'Hagemessen'), booking('v2', 'B1', 'Byggemessen'), booking('v3', 'B2', 'Byggemessen')],
  projects: [
    { name: 'Hagemessen', projectNo: SECOND },
    { name: 'Byggemessen', projectNo: FIRST },
  ],
  hallRules: { places: [{ name: 'B', halls: ['B1', 'B2'] }], phrases: [], choices: {} },
}
const block = (n: number, projectNo?: string, hall?: string): Assignment => ({ id: `b-${n}`, personId: `two-${n}`, date: MON, competence: 'vegger', start: wd.dayStart, end: wd.dayEnd, source: 'manual', ...workTag({ projectNo, hall }) })

describe('the week plan', () => {
  const plan = buildWeekPlan(ws, MON)

  it('has the seven days and a block per project of the week, in the order the phases begin', () => {
    expect(plan.dates).toHaveLength(7)
    expect(plan.dates[0]).toBe(MON)
    expect(plan.projects.map((p) => p.name).sort()).toEqual(['Byggemessen', 'Hagemessen'])
  })

  it('draws the phase over the days with its day count', () => {
    const first = plan.projects.find((p) => p.projectNo === FIRST)!
    expect(first.phases).toEqual([
      { phase: 'assembly', from: 0, to: 2, day: 1, of: 3 },
      { phase: 'event', from: 3, to: 4, day: 1, of: 2 },
    ])
  })

  it('has one line per competence, however many places and departments its rows have', () => {
    const first = plan.projects.find((p) => p.projectNo === FIRST)!
    expect(first.bars.map((b) => [b.competence, b.halls, b.avdelinger, b.runs])).toEqual([['vegger', ['B', 'C2'], ['Stands'], [{ from: 0, to: 0 }, { from: 2, to: 2 }]]])
    expect(first.places).toEqual(['B'])
  })

  it('flags the days that lack crew, and the days an order waits instead', () => {
    const first = plan.projects.find((p) => p.projectNo === FIRST)!
    expect(first.bars[0].flags).toEqual([{ state: 'short', days: [0, 2] }])
    const order = { id: 'o', supplierId: 's1', shift: 'dag' as const, competence: 'vegger', date: WED, fte: 2, start: wd.dayStart, end: wd.dayEnd, conf: null, projectNo: FIRST }
    const waiting = buildWeekPlan({ ...ws, hireOrders: [order] }, MON).projects.find((p) => p.projectNo === FIRST)!
    expect(waiting.bars[0].flags).toEqual([
      { state: 'short', days: [0] },
      { state: 'wait', days: [2] },
    ])
    expect(buildWeekPlan({ ...ws, hireOrders: [order] }, MON).attention.map((a) => [a.state, a.projectNo, a.days])).toContainEqual(['wait', FIRST, [2]])
  })

  it('has no flag where the staff cover the hours', () => {
    const staffed = buildWeekPlan({ ...ws, assignments: [block(1, FIRST, 'B'), block(2, FIRST, 'C2')] }, MON)
    expect(staffed.projects.find((p) => p.projectNo === FIRST)!.bars.map((b) => b.flags.map((f) => f.days))).toEqual([[[2]]])
  })

  it('keeps work for no project apart, rows without a number and blocks that went nowhere', () => {
    expect(plan.without.map((b) => [b.competence, b.runs])).toEqual([['vegger', [{ from: 0, to: 0 }]]])
    const extra = buildWeekPlan({ ...ws, persons: base.persons!.map((p) => ({ ...p, competences: ['vegger', 'rigg'] })), assignments: [{ ...block(1), competence: 'rigg' }] }, MON)
    expect(extra.without.map((b) => b.competence).sort()).toEqual(['rigg', 'vegger'])
  })
})
