import { describe, expect, it } from 'vitest'
import { competenceKey, DEFAULT_SETTINGS, type Workspace } from './types'
import { FIXTURE_PROJECT, loadStaffingFixture, withStaffingFixture } from './staffingFixture'

const empty: Workspace = { settings: DEFAULT_SETTINGS, venue: [], projects: [], demand: [], allocations: [], capacity: [] }

describe('staffing fixture', () => {
  it('holds 20 people whose competences all have a style', async () => {
    const fixture = await loadStaffingFixture()
    const keys = new Set(fixture.competences.map((c) => c.key))
    expect(fixture.persons).toHaveLength(20)
    expect(fixture.competences).toHaveLength(6)
    expect(fixture.persons.every((p) => p.competences.every((c) => keys.has(c)))).toBe(true)
    expect(fixture.assignments.every((a) => keys.has(a.competence))).toBe(true)
  })

  it('puts the demand in the Kalender as rows of its own project, so it can be derived again', async () => {
    const fixture = await loadStaffingFixture()
    const ws = withStaffingFixture(empty, fixture)
    expect(ws.allocations.every((row) => row.projectName === FIXTURE_PROJECT)).toBe(true)
    const hours = (competence: string, date: string) =>
      ws.allocations.filter((row) => competenceKey(row.competence) === competence).reduce((sum, row) => sum + (row.fte[date] ?? 0) * ws.settings.hoursPerDay, 0)
    for (const d of fixture.demand) expect(hours(d.competence, d.date)).toBeCloseTo(d.hours)
    expect(hours('teppefliser', '2026-10-12')).toBe(37.5)
  })

  it('replaces an earlier load and leaves other planning rows alone', async () => {
    const fixture = await loadStaffingFixture()
    const own = { id: 'row-1', order: 0, projectName: 'VVS 2026', projectNo: '26970', refYear: '2026', competence: 'FOGA', phase: 'Montering' as const, basis: 'Planlagt', importedHours: null, fte: {}, notes: {} }
    const once = withStaffingFixture({ ...empty, allocations: [own] }, fixture)
    const twice = withStaffingFixture(once, fixture)
    expect(twice.allocations).toHaveLength(1 + fixture.competences.length)
    expect(twice.allocations[0]).toBe(own)
    expect(twice.persons).toHaveLength(20)
  })
})
