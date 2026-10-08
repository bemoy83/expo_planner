import type { ISODate } from './dates'
import type { AllocationRow, Assignment, CompetenceStyle, Person, Unavailability, Workspace } from './types'

/** The data of the Bemanning mockup: invented people and one week of demand. For the tests only; nothing in the app reads it. */
export interface StaffingFixture {
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
    unavailability: unavailability.default as Unavailability[],
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
