import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { KpiConfig } from '../domain/types'
import { setActiveUnit } from '../domain/kpi'
import { buildVismaLines } from '../domain/visma'
import { readKpiWorkbook } from './kpiFile'
import { readVismaExport, vismaHall, vismaProductType } from './vismaExport'

describe('a product type as Visma writes it', () => {
  it('is read as its name: the text in the brackets, without brackets of its own', () => {
    expect(vismaProductType('14 [FOGA-vegger]')).toBe('FOGA-vegger')
    expect(vismaProductType('1 [5999 [Diverse]]')).toBe('5999 Diverse')
    expect(vismaProductType('2 [6999 [Diverse]]')).not.toBe(vismaProductType('1 [5999 [Diverse]]'))
  })

  it('is none where the text has no brackets', () => {
    expect(vismaProductType('0')).toBe('')
    expect(vismaProductType('')).toBe('')
  })
})

describe('the Hall/Sted of a booking line', () => {
  it('is the hall of its stand, or its free text where it has no stand', () => {
    expect(vismaHall('C04-44', '')).toBe('Hall C')
    expect(vismaHall('', 'Hall C og D')).toBe('Hall C og D')
  })
})

/** Runs against the real exports, which are kept out of the repository; skipped where they are missing. */
const DIR = 'example_data/'
const FILES = {
  visma: `${DIR}utskrift_visma_21.09.26.xlsx`,
  rates: `${DIR}Kpier.xlsx`,
}
const available = Object.values(FILES).every((path) => existsSync(path))
const bytes = (path: string) => new Uint8Array(readFileSync(path))

describe.skipIf(!available)('Visma export (local data)', () => {
  const rows = available ? readVismaExport(bytes(FILES.visma)) : []
  const kpi: KpiConfig = available ? readKpiWorkbook(bytes(FILES.rates)) : { workTypes: [], rates: [] }

  const totals = (lines: { competence: string; assemblyHours: number; dismantleHours: number }[]) => {
    const out: Record<string, [number, number]> = {}
    for (const line of lines) {
      const t = (out[line.competence] ??= [0, 0])
      t[0] += line.assemblyHours
      t[1] += line.dismantleHours
    }
    return out
  }

  it('reads the booking lines without the total row', () => {
    expect(rows).toHaveLength(784)
    expect(new Set(rows.map((r) => r.projectNo))).toEqual(new Set(['26970']))
  })

  it('reads product types, competences and rates from the one KPI file', () => {
    expect(kpi.workTypes.find((t) => t.productType === 'FOGA-vegger')).toMatchObject({ unit: 'lm', competence: 'FOGA' })
    // A product type with rates for two units is left for the planner to choose.
    expect(kpi.workTypes.find((t) => t.productType === 'FOGA-dragere')).toMatchObject({ unit: '', competence: 'FOGA' })
    expect(kpi.workTypes.filter((t) => !t.unit)).toHaveLength(9)
    expect(kpi.rates.find((r) => r.name === 'FOGA-vegger' && r.unit === 'lm')).toMatchObject({ assembly: 7.01, dismantle: 11.5 })
  })

  it('leaves the lines of a product type without a chosen unit without hours, flagged', () => {
    const open = buildVismaLines(rows, kpi, {}).filter((line) => line.workType === 'FOGA-dragere')
    expect(open.length).toBeGreaterThan(0)
    expect(open.every((line) => line.issue === 'no-rate' && line.assemblyHours === 0)).toBe(true)
  })

  it('calculates the raw hours the Nøkkeltall workbook gives, once the units are chosen', () => {
    // The units the workbook counted these product types in; the rest of the nine are counted per piece.
    const units: Record<string, string> = { 'FOGA-dragere': 'lm', 'FOGA-løsøre': 'ordre', Print: 'ordre', 'Tepper-løsøre': 'ordre' }
    const chosen = kpi.workTypes.filter((t) => !t.unit).reduce((config, t) => setActiveUnit(config, t.productType, units[t.productType] ?? 'stk'), kpi)
    const t = totals(buildVismaLines(rows, chosen, {}))
    expect(t.Teppefliser[0]).toBeCloseTo(121.802, 3)
    expect(t.Banner[0]).toBeCloseTo(127.733, 3)
    expect(t['Møbler'][1]).toBeCloseTo(36.097, 3)
    expect(t.Engangstepper).toEqual([expect.closeTo(33.27, 3), 0])
  })
})
