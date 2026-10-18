import { describe, expect, it } from 'vitest'
import { budgetOf, budgetsRenumbered, diffBudgets, mergeBudgets, projectHours, replaceBudgets, seasonRows, seasonTotals, withBudget } from './result'
import { DEFAULT_SETTINGS, type AllocationRow, type DemandLine, type ProjectRef, type VenueBooking, type Workspace } from './types'
import { venueKey } from './venueImport'

const booking = (eventName: string, hall: string, phases: VenueBooking['phases']): VenueBooking => ({ id: `${eventName}-${hall}`, hall, eventName, status: 'Bekreftet', phases })
const row = (projectNo: string, phase: AllocationRow['phase'], fte: Record<string, number>, competence = 'Vegger'): AllocationRow => ({
  id: `${projectNo}-${phase}-${competence}`,
  order: 0,
  projectName: projectNo === '26970' ? 'VVS 2026' : 'Hage 2026',
  projectNo,
  refYear: '',
  competence,
  phase,
  basis: 'Planlagt',
  fte,
  notes: {},
})

const venue = [
  booking('VVS 2026', 'C', { assembly: { start: '2026-10-19', end: '2026-10-22' }, event: { start: '2026-10-23', end: '2026-10-25' }, dismantle: { start: '2026-10-26', end: '2026-10-27' } }),
  booking('VVS 2026', 'D1', { assembly: { start: '2026-10-20', end: '2026-10-22' }, event: { start: '2026-10-23', end: '2026-10-25' }, dismantle: { start: '2026-10-26', end: '2026-10-26' } }),
  booking('Hage 2026', 'B1', { assembly: { start: '2026-04-07', end: '2026-04-09' }, event: { start: '2026-04-10', end: '2026-04-12' } }),
]
const projects: ProjectRef[] = [
  { name: 'VVS 2026', projectNo: '26970' },
  { name: 'Hage 2026', projectNo: '26100' },
]
const ws = (patch: Partial<Workspace> = {}): Pick<Workspace, 'venue' | 'hiddenVenue' | 'projects' | 'allocations' | 'budgets' | 'settings'> => ({
  venue,
  hiddenVenue: {},
  projects,
  allocations: [row('26970', 'Montering', { '2026-10-19': 2, '2026-10-20': 2 }), row('26970', 'Demontering', { '2026-10-26': 2 })],
  budgets: { '26970': 100 },
  settings: DEFAULT_SETTINGS,
  ...patch,
})

describe('seasonRows', () => {
  it('gives a row per project, by build-up, with its hall days counted once over its halls', () => {
    const rows = seasonRows(ws())
    expect(rows.map((r) => r.projectNo)).toEqual(['26100', '26970'])
    const vvs = rows[1]
    expect(vvs).toMatchObject({ name: 'VVS 2026', year: '2026', start: '2026-10-19', halls: ['C', 'D1'], days: { assembly: 4, event: 3, dismantle: 2 } })
  })

  it('counts the plan in hours and compares it with overhead added against the budget', () => {
    const vvs = seasonRows(ws()).find((r) => r.projectNo === '26970')!
    // 6 FTE-days × 7,5 hours, of which 4 are build-up.
    expect(vvs.planned).toEqual({ Montering: 30, Demontering: 15, other: 0 })
    expect(vvs.plannedTotal).toBe(45)
    expect(vvs.withOverhead).toBeCloseTo(49.5)
    expect(vvs.deviation).toBeCloseTo(50.5)
    expect(vvs.deviationShare).toBeCloseTo(0.505)
  })

  it('takes the overhead from the settings', () => {
    const vvs = seasonRows(ws({ settings: { ...DEFAULT_SETTINGS, overhead: 0 } })).find((r) => r.projectNo === '26970')!
    expect(vvs.deviation).toBe(55)
  })

  it('has no deviation without a budget, and a negative one where the plan is over it', () => {
    const rows = seasonRows(ws({ budgets: { '26970': 40 } }))
    expect(rows.find((r) => r.projectNo === '26100')).toMatchObject({ budget: null, deviation: null, deviationShare: null })
    expect(rows.find((r) => r.projectNo === '26970')!.deviation).toBeCloseTo(-9.5)
  })

  it('lists a project that has a budget or a plan alone, and leaves out bookings hidden from the Kalender', () => {
    const hidden = Object.fromEntries(venue.filter((b) => b.eventName === 'Hage 2026').map((b) => [venueKey(b), true as const]))
    const rows = seasonRows(ws({ hiddenVenue: hidden, budgets: { '26970': 100, '27500': 30 } }))
    expect(rows.map((r) => r.projectNo)).toEqual(['26970', '27500'])
    expect(rows[1]).toMatchObject({ year: '2027', start: '', halls: [] })
  })

  it('counts rows without a work phase in the total alone, and leaves out rows without a number', () => {
    const rows = seasonRows(ws({ allocations: [row('26970', '', { '2026-10-19': 1 }), row('', 'Montering', { '2026-10-19': 3 })] }))
    expect(rows.find((r) => r.projectNo === '26970')!.planned).toEqual({ Montering: 0, Demontering: 0, other: 7.5 })
    expect(rows).toHaveLength(2)
  })
})

describe('seasonTotals', () => {
  it('sums the plan of every row and compares the budgets with the plan of the projects that have one', () => {
    const rows = seasonRows(ws({ allocations: [...ws().allocations, row('26100', 'Montering', { '2026-04-07': 2 })] }))
    const totals = seasonTotals(rows)
    expect(totals).toMatchObject({ projects: 2, budgeted: 1, budget: 100, plannedTotal: 60 })
    expect(totals.withOverhead).toBeCloseTo(66)
    expect(totals.deviation).toBeCloseTo(50.5)
  })

  it('has no deviation when no project has a budget', () => {
    expect(seasonTotals(seasonRows(ws({ budgets: {} }))).deviation).toBeNull()
  })
})

describe('budgets', () => {
  it('sets, changes and removes a budget, whatever case the number is written in', () => {
    const budgets = withBudget({ '26VAM': 10 }, '26vam', 12)
    expect(budgets).toEqual({ '26vam': 12 })
    expect(budgetOf(budgets, '26VAM')).toBe(12)
    expect(withBudget(budgets, '26VAM', null)).toEqual({})
    expect(withBudget(budgets, '26VAM', 0)).toEqual({})
  })

  it('follows a project to its new number', () => {
    expect(budgetsRenumbered({ '26XYZ': 80, '26100': 5 }, '26xyz', '26231')).toEqual({ '26100': 5, '26231': 80 })
    expect(budgetsRenumbered({ '26100': 5 }, '26XYZ', '26231')).toEqual({ '26100': 5 })
  })

  it('merges or replaces from a file, and says what it would change', () => {
    const app = { '26100': 5, '26970': 100 }
    const file = [
      { projectNo: '26970', hours: 120 },
      { projectNo: '26231', hours: 40 },
    ]
    expect(mergeBudgets(app, file)).toEqual({ '26100': 5, '26970': 120, '26231': 40 })
    expect(replaceBudgets(file)).toEqual({ '26970': 120, '26231': 40 })
    expect(diffBudgets(app, file)).toEqual({ added: 1, changed: 1, unchanged: 0, onlyInApp: 1 })
  })
})

describe('projectHours', () => {
  it('sets the demand of the plan beside the hours planned, per competence and work phase', () => {
    const demand = [
      { projectNo: '26970', competence: 'Vegger', basis: 'Planlagt', assemblyHours: 40, dismantleHours: 12 },
      { projectNo: '26970', competence: 'Elektro', basis: 'Planlagt', assemblyHours: 8, dismantleHours: 0 },
      { projectNo: '26970', competence: 'Elektro', basis: 'visma per reg. dato', assemblyHours: 99, dismantleHours: 0 },
      { projectNo: '26100', competence: 'Vegger', basis: 'Planlagt', assemblyHours: 99, dismantleHours: 0 },
    ] as DemandLine[]
    const hours = projectHours({ demand, allocations: ws().allocations, settings: DEFAULT_SETTINGS }, '26970')
    expect(hours).toEqual([
      { competence: 'Elektro', demand: { Montering: 8, Demontering: 0, other: 0 }, planned: { Montering: 0, Demontering: 0, other: 0 } },
      { competence: 'Vegger', demand: { Montering: 40, Demontering: 12, other: 0 }, planned: { Montering: 30, Demontering: 15, other: 0 } },
    ])
  })
})
