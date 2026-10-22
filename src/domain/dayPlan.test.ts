import { describe, expect, it } from 'vitest'
import { buildDayPlan } from './dayPlan'
import { TWO_PROJECTS, withTwoProjects } from './staffingFixture'
import { DEFAULT_SETTINGS, DEFAULT_WORKDAY, workTag, type Assignment, type VenueBooking, type Workspace } from './types'

/** The day plan: the cards of the projects of a day and the people with their blocks, as `workPlace.test.ts` sets the week. */

const MON = '2026-10-12'
const SUN = '2026-10-18'
const { first: FIRST, second: SECOND } = TWO_PROJECTS
const wd = DEFAULT_WORKDAY

const booking = (id: string, hall: string, eventName: string, start: string, end: string): VenueBooking => ({ id, hall, eventName, status: 'Bekreftet', phases: { assembly: { start, end }, event: { start: '2026-10-15', end: '2026-10-16' } } })
const base = withTwoProjects({ settings: DEFAULT_SETTINGS, venue: [], projects: [], demand: [], allocations: [], persons: [] })
const ws: Workspace = {
  ...base,
  allocations: [
    { ...base.allocations[0], id: 'first-b', hall: 'B', fte: { [MON]: 1 }, notes: { [MON]: 'Veggene mot B2 først' } },
    { ...base.allocations[0], id: 'first-c', hall: 'C2', fte: { [MON]: 1 } },
    { ...base.allocations[1], hall: 'Ufordelt' },
    base.allocations[2],
  ],
  venue: [booking('v1', 'D1', 'Hagemessen', MON, '2026-10-14'), booking('v3', 'B1', 'Byggemessen', MON, '2026-10-14')],
  projects: [
    { name: 'Hagemessen', projectNo: SECOND },
    { name: 'Byggemessen', projectNo: FIRST },
  ],
  hallRules: { places: [], phrases: [], choices: {} },
  suppliers: [{ id: 's1', name: 'Messehjelp AS', order: 0, competences: ['vegger'], shifts: ['dag'], rate: 0, contact: '' } as never],
}

const block = (person: number, projectNo?: string, hall?: string, extra: Partial<Assignment> = {}): Assignment => ({ id: `b-${person}-${extra.start ?? 'day'}`, personId: `two-${person}`, date: MON, competence: 'vegger', start: wd.dayStart, end: wd.dayEnd, source: 'manual', ...workTag({ projectNo, hall }), ...extra })
const staffed = (...assignments: Assignment[]): Workspace => ({ ...ws, assignments })

describe('the day plan', () => {
  it('has a card per project that has demand, with its phase, notes and coverage', () => {
    const plan = buildDayPlan(staffed(block(1, FIRST, 'B'), block(2, SECOND)), MON)
    expect(plan.projects.map((p) => p.projectNo).sort()).toEqual([SECOND, FIRST].sort())
    const first = plan.projects.find((p) => p.projectNo === FIRST)!
    expect(first.name).toBe('Byggemessen')
    expect(first.phase).toMatchObject({ label: 'Montering', day: 1, of: 3, next: { label: 'Arrangement' } })
    expect(first.notes).toEqual([{ competence: 'vegger', hall: 'B', text: 'Veggene mot B2 først' }])
    expect(first.coverage).toEqual([{ competence: 'vegger', state: 'short', waiting: [] }])
    expect(plan.projects.find((p) => p.projectNo === SECOND)!.coverage[0].state).toBe('ok')
  })

  it('puts a fitter on one row, with the blocks of a split day in order and the place of each', () => {
    const morning = block(1, FIRST, 'B', { end: 660, id: 'am' })
    const afternoon = block(1, SECOND, undefined, { start: 720, end: 900, id: 'pm' })
    const plan = buildDayPlan(staffed(morning, afternoon), MON)
    const rows = plan.rows.filter((r) => r.kind === 'fitter')
    expect(rows).toHaveLength(1)
    expect(rows[0].kind === 'fitter' && rows[0].blocks.map((b) => [b.projectNo, b.hall, b.start])).toEqual([
      [FIRST, 'B', wd.dayStart],
      [SECOND, 'D1', 720],
    ])
    expect(plan.fitters).toBe(1)
  })

  it('shows a supplier under its project, and what waits does not cover', () => {
    const order = { id: 'o1', supplierId: 's1', competence: 'vegger', date: MON, fte: 3, start: wd.dayStart, end: wd.dayEnd, conf: null, projectNo: FIRST }
    const plan = buildDayPlan({ ...staffed(), hireOrders: [order] }, MON)
    const hired = plan.rows.find((r) => r.kind === 'hired')!
    expect(hired).toMatchObject({ kind: 'hired', name: 'Messehjelp AS', people: 3, waiting: true, projectNo: FIRST })
    expect(plan.waiting).toBe(3)
    expect(plan.hired).toBe(0)
    expect(plan.projects.find((p) => p.projectNo === FIRST)!.coverage[0]).toEqual({ competence: 'vegger', state: 'wait', waiting: ['Messehjelp AS'] })
  })

  it('lists people without a project apart, the absent, and the idle only on a working day', () => {
    // Nothing lacks hours of Rigg, so the block of person 1 is for no project and no place; person 2 has a place.
    const w: Workspace = {
      ...staffed(block(1, undefined, undefined, { competence: 'rigg' }), block(2, FIRST, 'B')),
      persons: base.persons!.map((p) => ({ ...p, competences: ['vegger', 'rigg'] })),
      unavailability: [{ id: 'u', personId: 'two-3', date: MON }],
    }
    const plan = buildDayPlan(w, MON)
    expect(plan.unplaced.map((f) => f.personId)).toEqual(['two-1'])
    expect(plan.away.map((a) => [a.personId, a.away, a.idle])).toEqual([
      ['two-3', true, true],
      ['two-4', false, true],
    ])
    expect(buildDayPlan(w, SUN).away).toEqual([])
  })

  it('keeps a person with blocks of both kinds on one row', () => {
    const w: Workspace = {
      ...staffed(block(2, FIRST, 'B'), block(2, undefined, undefined, { competence: 'rigg', start: 960, end: 1020, id: 'late' })),
      persons: base.persons!.map((p) => ({ ...p, competences: ['vegger', 'rigg'] })),
    }
    const plan = buildDayPlan(w, MON)
    expect(plan.unplaced).toEqual([])
    const row = plan.rows.find((r) => r.kind === 'fitter')!
    expect(row.kind === 'fitter' && row.blocks.map((b) => b.projectNo)).toEqual([FIRST, ''])
  })
})
