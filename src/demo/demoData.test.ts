import { describe, expect, it } from 'vitest'
import { buildVismaLines } from '../domain/visma'
import { exportWindow } from '../domain/venueImport'
import { readBudsjettWorkbook } from '../import/budsjettFile'
import { readKompetanserWorkbook } from '../import/kompetanserFile'
import { readKpiWorkbook } from '../import/kpiFile'
import { readLeverandorerWorkbook } from '../import/leverandorerFile'
import { readPersonellWorkbook } from '../import/personellFile'
import { readVenyouExport } from '../import/venyouExport'
import { readVismaExport } from '../import/vismaExport'
import { readXlsx } from '../import/xlsx'
import { DEMO_COMPETENCES, DEMO_EVENTS, DEMO_FILES, DEMO_HALLS, DEMO_PEOPLE, DEMO_PRODUCT_TYPES, DEMO_SUPPLIERS, demoFiles, type DemoFile } from './demoData'

const files = new Map(demoFiles().map((file) => [file.kind, file.bytes]))
const bytes = (kind: DemoFile) => files.get(kind)!

describe('the invented season', () => {
  const bookings = readVenyouExport(bytes('venyou'))
  const rows = readVismaExport(bytes('visma'))
  const kpi = readKpiWorkbook(bytes('kpi'))

  it('is the same each time it is made', () => {
    // The files' own dates differ by when they are made; what they hold does not.
    const sheets = (all: Uint8Array[]) => all.map((bytes) => [...readXlsx(bytes).values()].map((sheet) => [...sheet.rows].map(([r, cells]) => [r, [...cells]])))
    expect(sheets(demoFiles().map((file) => file.bytes))).toEqual(sheets([...files.values()]))
  })

  it('reads as a Venyou export: a booking per hall and event, and one for maintenance, in the period of its name', () => {
    expect(bookings).toHaveLength(DEMO_EVENTS.reduce((sum, event) => sum + event.halls.length, 0) + 1)
    expect(new Set(bookings.map((b) => b.hall))).toEqual(new Set(DEMO_HALLS))
    expect(new Set(bookings.map((b) => b.status))).toEqual(new Set(['Confirmed', 'Preliminary', 'Maintenance']))
    const fair = bookings.find((b) => b.eventName === 'Byggemessen 2026' && b.hall === 'C')!
    expect(fair.phases).toMatchObject({ assembly: { start: '2026-10-07', end: '2026-10-12' }, event: { start: '2026-10-14', end: '2026-10-16' }, dismantle: { start: '2026-10-18', end: '2026-10-20' } })
    expect(exportWindow(DEMO_FILES.venyou, bookings)).toEqual({ from: '2026-09-01', to: '2027-06-30' })
  })

  it('reads as a Visma export of the events with stands, named as they are in Venyou', () => {
    const projects = new Map(rows.map((row) => [row.projectNo, row.eventName]))
    expect(projects.size).toBe(DEMO_EVENTS.filter((event) => event.stands > 0).length)
    for (const [projectNo, name] of projects) expect(DEMO_EVENTS.find((event) => event.projectNo === projectNo)?.name).toBe(name)
  })

  it('reads as a KPI file, with a type of several units left for the planner and the freight left out', () => {
    expect(kpi.workTypes).toHaveLength(DEMO_PRODUCT_TYPES.length)
    expect(kpi.workTypes.find((t) => t.productType === 'FOGA-dragere')).toMatchObject({ unit: '', competence: 'FOGA' })
    expect(kpi.workTypes.find((t) => t.productType === 'Print')).toMatchObject({ unit: 'ordre', competence: 'Profilering' })
    expect(kpi.excludedArticles).toEqual([{ articleNo: '9002', note: 'Frakt' }])
  })

  it('gives most demand lines hours, and leaves some for the planner to resolve', () => {
    const lines = buildVismaLines(rows, kpi, {})
    const issues = new Set(lines.map((line) => line.issue))
    expect(issues).toEqual(new Set([null, 'no-product-type', 'unknown-work-type', 'no-rate']))
    expect(lines.filter((line) => !line.issue).length).toBeGreaterThan(lines.length / 2)
    // A free-text place, a hall named in words and one that names none, is there to be placed.
    expect(lines.some((line) => line.hall === 'Inngangsparti')).toBe(true)
    // The freight is not read at all.
    expect(lines.some((line) => line.key.includes('frakt'))).toBe(false)
    expect(lines.some((line) => line.key.includes('montering etter avtale'))).toBe(true)
  })

  it('reads as the planner’s own tables of competences, staff, suppliers and budgets', () => {
    expect(readKompetanserWorkbook(bytes('kompetanser'))).toEqual(expect.arrayContaining([{ label: 'FOGA', shortLabel: 'FOGA', color: 'line-blue', stage: 'standbygging', next: 'Innredning' }, { label: 'Oppmerking', shortLabel: 'OPP', color: 'line-slate', stage: 'oppmerking', minPerHall: 2 }]))
    expect(readKompetanserWorkbook(bytes('kompetanser')).map((c) => c.label)).toEqual(DEMO_COMPETENCES)
    const people = readPersonellWorkbook(bytes('personell'))
    expect(people.map((p) => p.name)).toEqual(DEMO_PEOPLE.map(([name]) => name))
    expect(new Set(people.map((p) => p.name)).size).toBe(20)
    // Every competence has people, and everyone has at least one.
    for (const competence of DEMO_COMPETENCES) expect(people.some((p) => p.competences[competence])).toBe(true)
    expect(people.every((p) => Object.values(p.competences).some(Boolean))).toBe(true)
    // The staff follows the demand: the walls, which take the most hours, have more people than the furniture; and whoever knows FOGA does the interior fitting.
    const many = (competence: string) => people.filter((p) => p.competences[competence]).length
    expect(many('FOGA')).toBeGreaterThan(many('Møbler'))
    expect(people.filter((p) => p.competences.FOGA).every((p) => p.competences.Innredning)).toBe(true)
    const suppliers = readLeverandorerWorkbook(bytes('leverandorer'))
    expect(suppliers).toHaveLength(DEMO_SUPPLIERS.length)
    expect(suppliers.every((s) => !s.contact)).toBe(true)
    expect(readBudsjettWorkbook(bytes('budsjett')).length).toBe(DEMO_EVENTS.filter((event) => event.stands).length - 1)
  })
})
