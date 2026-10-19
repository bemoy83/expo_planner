import { describe, expect, it } from 'vitest'
import { buildVismaLines } from '../domain/visma'
import { exportWindow } from '../domain/venueImport'
import { readBudsjettWorkbook } from '../import/budsjettFile'
import { readKpiWorkbook } from '../import/kpiFile'
import { readLeverandorerWorkbook } from '../import/leverandorerFile'
import { readPersonellWorkbook } from '../import/personellFile'
import { readVenyouExport } from '../import/venyouExport'
import { readVismaExport } from '../import/vismaExport'
import { DEMO_EVENTS, DEMO_FILES, DEMO_HALLS, DEMO_PEOPLE, DEMO_PRODUCT_TYPES, demoFiles, type DemoFile } from './demoData'

const files = new Map(demoFiles().map((file) => [file.kind, file.bytes]))
const bytes = (kind: DemoFile) => files.get(kind)!

describe('the invented season', () => {
  const bookings = readVenyouExport(bytes('venyou'))
  const rows = readVismaExport(bytes('visma'))
  const kpi = readKpiWorkbook(bytes('kpi'))

  it('is the same each time it is made', () => {
    expect(demoFiles().map((file) => file.bytes)).toEqual([...files.values()])
  })

  it('reads as a Venyou export: a booking per hall and event, and one for maintenance, in the period of its name', () => {
    expect(bookings).toHaveLength(DEMO_EVENTS.reduce((sum, event) => sum + event.halls.length, 0) + 1)
    expect(new Set(bookings.map((b) => b.hall))).toEqual(new Set(DEMO_HALLS))
    expect(new Set(bookings.map((b) => b.status))).toEqual(new Set(['Confirmed', 'Preliminary', 'Maintenance']))
    const fair = bookings.find((b) => b.eventName === 'Byggemessen 2026' && b.hall === 'C')!
    expect(fair.phases).toMatchObject({ assembly: { start: '2026-10-07', end: '2026-10-12' }, event: { start: '2026-10-14', end: '2026-10-16' }, dismantle: { start: '2026-10-18', end: '2026-10-20' } })
    expect(exportWindow(DEMO_FILES.venyou, bookings)).toEqual({ from: '2026-09-01', to: '2027-06-30' })
  })

  it('reads as a Visma export of eight projects, named as their events in Venyou', () => {
    const projects = new Map(rows.map((row) => [row.projectNo, row.eventName]))
    expect(projects.size).toBe(8)
    for (const [projectNo, name] of projects) expect(DEMO_EVENTS.find((event) => event.projectNo === projectNo)?.name).toBe(name)
  })

  it('reads as a KPI file, with a type of several units left for the planner and the freight left out', () => {
    expect(kpi.workTypes).toHaveLength(DEMO_PRODUCT_TYPES.length)
    expect(kpi.workTypes.find((t) => t.productType === 'Dragere')).toMatchObject({ unit: '', competence: 'Vegger' })
    expect(kpi.workTypes.find((t) => t.productType === 'Print')).toMatchObject({ unit: 'ordre', competence: 'Grafikk' })
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

  it('reads as the planner’s own tables of staff, suppliers and budgets', () => {
    expect(readPersonellWorkbook(bytes('personell')).map((p) => p.name)).toEqual(DEMO_PEOPLE.map(([name]) => name))
    const suppliers = readLeverandorerWorkbook(bytes('leverandorer'))
    expect(suppliers).toHaveLength(4)
    expect(suppliers.every((s) => !s.contact)).toBe(true)
    expect(readBudsjettWorkbook(bytes('budsjett'))).toHaveLength(8)
  })
})
