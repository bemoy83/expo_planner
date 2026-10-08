import { describe, expect, it } from 'vitest'
import { competenceKey, DEFAULT_SETTINGS, type Workspace } from './types'
import { loadStaffingFixture, withStaffingFixture } from './staffingFixture'

const empty: Workspace = { settings: DEFAULT_SETTINGS, venue: [], projects: [], demand: [], allocations: [] }

describe('staffing fixture', () => {
  it('holds 20 people whose competences all have a style', async () => {
    const fixture = await loadStaffingFixture()
    const keys = new Set(fixture.competences.map((c) => c.key))
    expect(fixture.persons).toHaveLength(20)
    expect(fixture.competences).toHaveLength(6)
    expect(fixture.persons.every((p) => p.competences.every((c) => keys.has(c)))).toBe(true)
    expect(fixture.assignments.every((a) => keys.has(a.competence))).toBe(true)
  })

  it('puts the demand in the Kalender as planning rows, so it can be derived again', async () => {
    const fixture = await loadStaffingFixture()
    const ws = withStaffingFixture(empty, fixture)
    expect(ws.allocations).toHaveLength(fixture.competences.length)
    const hours = (competence: string, date: string) =>
      ws.allocations.filter((row) => competenceKey(row.competence) === competence).reduce((sum, row) => sum + (row.fte[date] ?? 0) * ws.settings.hoursPerDay, 0)
    for (const d of fixture.demand) expect(hours(d.competence, d.date)).toBeCloseTo(d.hours)
    expect(hours('teppefliser', '2026-10-12')).toBe(37.5)
  })
})
