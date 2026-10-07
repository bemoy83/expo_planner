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

export const FIXTURE_PROJECT = 'Testdata Bemanning'
const ROW_PREFIX = 'fixture-'

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
 * The workspace with the fixture in place of its people, absence, assignments and moved hours.
 * The demand becomes one planning row per competence under a project of its own, so the rest of the Kalender is left alone.
 */
export const withStaffingFixture = (workspace: Workspace, fixture: StaffingFixture): Workspace => {
  const kept = workspace.allocations.filter((row) => !row.id.startsWith(ROW_PREFIX))
  const firstOrder = Math.max(-1, ...kept.map((row) => row.order)) + 1
  const rows: AllocationRow[] = fixture.competences.map((style, index) => ({
    id: `${ROW_PREFIX}${style.key}`,
    order: firstOrder + index,
    projectName: FIXTURE_PROJECT,
    projectNo: '',
    refYear: '',
    competence: style.label,
    phase: 'Montering',
    basis: '',
    importedHours: null,
    fte: Object.fromEntries(fixture.demand.filter((d) => d.competence === style.key).map((d) => [d.date, d.hours / workspace.settings.hoursPerDay])),
    notes: {},
  }))
  return {
    ...workspace,
    allocations: [...kept, ...rows],
    persons: fixture.persons,
    unavailability: fixture.unavailability,
    assignments: fixture.assignments,
    demandAdjustments: [],
    competenceStyles: Object.fromEntries(fixture.competences.map((style) => [style.key, style])),
  }
}
