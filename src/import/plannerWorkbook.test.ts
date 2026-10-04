import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildDemandIndex, capacityForDate, dailyNeed, requiredHours } from '../domain/calc'
import { normalizeDate } from '../domain/dates'
import { readPlannerWorkbook } from './plannerWorkbook'
import { num, readXlsx, text } from './xlsx'

/**
 * Checks the importer against the real planner workbook. The workbook holds customer data and is
 * not committed, so this suite only runs where `example_data/` exists locally.
 */
const PATH = 'example_data/Bemanning_Behov_24 måneder.xlsx'
const available = existsSync(PATH)

describe.skipIf(!available)('planner workbook import (local data)', () => {
  const bytes = available ? new Uint8Array(readFileSync(PATH)) : new Uint8Array()
  const workspace = available ? readPlannerWorkbook(bytes, 'Bemanning_Behov_24 måneder.xlsx') : null!
  const kalender = available ? readXlsx(bytes, ['Kalender']).get('Kalender')! : null!

  /** Excel's cached values for a Kalender row labelled in column P, keyed by date. */
  const excelRow = (label: string) => {
    const dateRow = [...kalender.rows].find(([, cells]) => text(cells.get(15) ?? null) === 'Dato')!
    const row = [...kalender.rows].find(([, cells]) => text(cells.get(15) ?? null) === label)!
    const out = new Map<string, number>()
    for (const [col, value] of dateRow[1]) {
      const date = col > 15 ? normalizeDate(value) : null
      if (date) out.set(date, num(row[1].get(col) ?? null) ?? 0)
    }
    return out
  }

  it('reads settings and the calendar range', () => {
    expect(workspace.settings).toMatchObject({ baseCrew: 21, hoursPerDay: 7.5, calendarStart: '2026-01-01', calendarEnd: '2027-12-31' })
  })

  it('reads the source tables', () => {
    expect(workspace.venue.length).toBeGreaterThan(800)
    expect(workspace.projects.length).toBeGreaterThan(300)
    expect(workspace.demand.length).toBeGreaterThan(5000)
    expect(workspace.allocations.length).toBeGreaterThan(1400)
    expect(workspace.capacity.map((line) => line.label)).toContain('Innleid (FTE)')
    expect(workspace.capacity.filter((line) => line.group === 'overtime')).toHaveLength(2)
  })

  it('recomputes required hours the way the TIMER column does', () => {
    const index = buildDemandIndex(workspace.demand)
    const comparable = workspace.allocations.filter((row) => row.importedHours !== null && row.phase)
    const mismatches = comparable.filter((row) => Math.abs((requiredHours(index, row) ?? 0) - row.importedHours!) > 1e-6)
    expect(comparable.length).toBeGreaterThan(1300)
    expect(mismatches.map((row) => `${row.id} ${row.projectName} ${row.competence}`)).toEqual([])
  })

  it('matches the daily need row in Excel', () => {
    const excel = excelRow('Planlagt dagsbehov (FTE)')
    const need = dailyNeed(workspace.allocations)
    for (const [date, value] of excel) expect(need.get(date) ?? 0, date).toBeCloseTo(value, 6)
  })

  it('matches available staffing in Excel', () => {
    const excel = excelRow('Tilgjengelig bemanning (FTE)')
    for (const [date, value] of excel) {
      expect(capacityForDate(date, workspace.capacity, workspace.settings).available, date).toBeCloseTo(value, 6)
    }
  })

  it('reads the «Exclude» column as hidden hall bookings', () => {
    expect(Object.keys(workspace.hiddenVenue ?? {}).length).toBeGreaterThan(20)
    expect(workspace.venue.every((booking) => !('excluded' in booking))).toBe(true)
  })

  it('keeps cell notes', () => {
    const notes = workspace.capacity.flatMap((line) => Object.values(line.notes))
    expect(notes.length).toBeGreaterThan(50)
  })
})
