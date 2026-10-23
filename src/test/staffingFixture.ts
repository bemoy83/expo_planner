import type { ISODate } from '../domain/dates'
import type { AllocationRow, Assignment, CompetenceStyle, Person, Unavailability, Workspace } from '../domain/types'

/** The data of the Bemanning mockup: invented people and one week of demand. For the tests only; nothing in the app reads it. */
interface StaffingFixture {
  persons: Person[]
  competences: CompetenceStyle[]
  assignments: Assignment[]
  unavailability: Unavailability[]
  /** Hours per competence and day, as Bemanning derives them from the Kalender. */
  demand: { competence: string; date: ISODate; hours: number }[]
}

const FIXTURE_PROJECT = 'Testdata Bemanning'

/** Reads the fixture files. */
export const loadStaffingFixture = async (): Promise<StaffingFixture> => {
  const [persons, competences, assignments, unavailability, demand] = await Promise.all([
    import('../../design_docs/bemanning/fixtures/persons.json'),
    import('../../design_docs/bemanning/fixtures/competences.json'),
    import('../../design_docs/bemanning/fixtures/assignments.json'),
    import('../../design_docs/bemanning/fixtures/unavailability.json'),
    import('../../design_docs/bemanning/fixtures/demand.json'),
  ])
  return {
    persons: persons.default,
    competences: competences.default as CompetenceStyle[],
    assignments: assignments.default as Assignment[],
    // The mockup's absence has a kind and a note, which the app no longer stores.
    unavailability: (unavailability.default as (Unavailability & { kind?: string; note?: string })[]).map(({ kind: _kind, note: _note, ...u }) => u),
    demand: demand.default,
  }
}

/**
 * The workspace with the fixture as its people, absence and assignments.
 * The demand becomes one planning row per competence, which is where Bemanning reads its demand from.
 */
export const withStaffingFixture = (workspace: Workspace, fixture: StaffingFixture): Workspace => {
  const rows: AllocationRow[] = fixture.competences.map((style, index) => ({
    id: `fixture-${style.key}`,
    order: index,
    projectName: FIXTURE_PROJECT,
    projectNo: '',
    refYear: '',
    competence: style.label,
    phase: 'Montering',
    basis: '',
    fte: Object.fromEntries(fixture.demand.filter((d) => d.competence === style.key).map((d) => [d.date, d.hours / workspace.settings.hoursPerDay])),
    notes: {},
  }))
  return {
    ...workspace,
    allocations: rows,
    persons: fixture.persons,
    unavailability: fixture.unavailability,
    assignments: fixture.assignments,
    demandAdjustments: [],
    competenceStyles: Object.fromEntries(fixture.competences.map((style) => [style.key, style])),
  }
}

/** The two projects of `withTwoProjects`, built up in the same week with the same competence. */
export const TWO_PROJECTS = { first: '26102', second: '26101' } as const

/**
 * A small invented week of two projects that are built up at the same time, for the tests of the project balance:
 * walls for both on Monday and Tuesday of week 42, and walls without a project on Monday. Four people have walls.
 * Demand per day: Monday 15 h for the first, 7,5 for the second and 7,5 without a project; Tuesday 15 and 15.
 */
export const withTwoProjects = (workspace: Workspace): Workspace => {
  const row = (id: string, projectNo: string, fte: Record<ISODate, number>): AllocationRow => ({
    id,
    order: 0,
    projectName: projectNo ? `Prosjekt ${projectNo}` : 'Uten nummer',
    projectNo,
    refYear: '',
    competence: 'Vegger',
    phase: 'Montering',
    basis: '',
    fte,
    notes: {},
  })
  return {
    ...workspace,
    allocations: [
      row('two-first', TWO_PROJECTS.first, { '2026-10-12': 2, '2026-10-13': 2 }),
      row('two-second', TWO_PROJECTS.second, { '2026-10-12': 1, '2026-10-13': 2 }),
      row('two-none', '', { '2026-10-12': 1 }),
    ],
    persons: ['Kari', 'Ola', 'Per', 'Siri'].map((name, index) => ({ id: `two-${index + 1}`, name, order: index, competences: ['vegger'] })),
    unavailability: [],
    assignments: [],
    demandAdjustments: [],
    hireOrders: [],
  }
}
