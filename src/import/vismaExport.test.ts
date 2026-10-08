import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { KpiConfig } from '../domain/types'
import { buildVismaLines } from '../domain/visma'
import { readKpiWorkbook, readVismaExport } from './vismaExport'

/** Runs against the real exports, which are kept out of the repository; skipped where they are missing. */
const DIR = 'example_data/'
const FILES = {
  visma: `${DIR}utskrift_visma_21.09.26.xlsx`,
  mapping: `${DIR}Nøkkeltall Visma (mal) 2.0 – Kopi.xlsx`,
  rates: `${DIR}Kpier.xlsx`,
}
const available = Object.values(FILES).every((path) => existsSync(path))
const bytes = (path: string) => new Uint8Array(readFileSync(path))

describe.skipIf(!available)('Visma export (local data)', () => {
  const rows = available ? readVismaExport(bytes(FILES.visma)) : []
  const kpi = (available ? { ...readKpiWorkbook(bytes(FILES.mapping)), ...readKpiWorkbook(bytes(FILES.rates)) } : { workTypes: [], rates: [] }) as KpiConfig

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

  it('reads mapping and rates', () => {
    expect(kpi.workTypes.find((t) => t.name === 'FOGA-vegger')).toMatchObject({ unit: 'lm', competence: 'FOGA' })
    expect(kpi.rates.find((r) => r.name === 'FOGA-vegger' && r.unit === 'lm')).toMatchObject({ assembly: 7.01, dismantle: 11.5 })
  })

  it('calculates the raw hours the Nøkkeltall workbook gives', () => {
    const t = totals(buildVismaLines(rows, kpi, {}))
    expect(t.Teppefliser[0]).toBeCloseTo(121.802, 3)
    expect(t.Banner[0]).toBeCloseTo(127.733, 3)
    expect(t['Møbler'][1]).toBeCloseTo(36.097, 3)
    expect(t.Engangstepper).toEqual([expect.closeTo(33.27, 3), 0])
  })
})
