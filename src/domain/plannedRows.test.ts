import { describe, expect, it } from 'vitest'
import { isSuggestedRow, suggestedRows } from './plannedRows'
import type { AllocationRow, DemandLine } from './types'

const line = (overrides: Partial<DemandLine>): DemandLine => ({
  id: 'd',
  projectNo: '26970',
  projectName: 'VVS 2026',
  eventYear: '2026',
  source: 'visma per reg. dato',
  workType: 'Teppefliser',
  quantity: 100,
  unit: 'm²',
  stand: '',
  hall: 'Hall C',
  competence: 'Teppefliser',
  basis: 'Planlagt',
  assemblyHours: 10,
  dismantleHours: 5,
  comment: '',
  ...overrides,
})

const realRow = (overrides: Partial<AllocationRow>): AllocationRow => ({
  id: 'r',
  order: 0,
  projectName: 'VVS DAGENE 2026',
  projectNo: '26970',
  refYear: '2026',
  competence: 'Teppefliser',
  phase: 'Montering',
  basis: 'Planlagt',
  importedHours: null,
  fte: {},
  notes: {},
  ...overrides,
})

describe('rows suggested from planned demand', () => {
  it('gives one row per phase, hall, competence and department that has planned hours', () => {
    const rows = suggestedRows(
      [line({ avdeling: '64' }), line({ id: 'd2', hall: 'Hall D', avdeling: '64' }), line({ id: 'd3', avdeling: '64', workType: 'Nålefilt' }), line({ id: 'd4', competence: 'Print', workType: 'Print', dismantleHours: 0 })],
      [],
    )
    expect(rows.map((r) => `${r.competence}/${r.phase}/${r.hall}/${r.avdeling}`)).toEqual([
      'Teppefliser/Montering/Hall C/64',
      'Teppefliser/Demontering/Hall C/64',
      'Teppefliser/Montering/Hall D/64',
      'Teppefliser/Demontering/Hall D/64',
      'Print/Montering/Hall C/',
    ])
    expect(rows[0]).toMatchObject({ projectNo: '26970', refYear: '2026', basis: 'Planlagt', fte: {} })
    expect(rows.every(isSuggestedRow)).toBe(true)
  })

  it('leaves out demand that is not taken into the plan', () => {
    expect(suggestedRows([line({ basis: 'visma per reg. dato' }), line({ basis: 'Historikk Timer' })], [])).toEqual([])
  })

  it('does not repeat a row that already exists', () => {
    const rows = suggestedRows([line({})], [realRow({}), realRow({ id: 'other', competence: 'teppefliser', phase: 'Demontering', basis: 'visma per reg. dato' })])
    expect(rows.map((r) => `${r.competence}/${r.phase}`)).toEqual(['Teppefliser/Demontering'])
  })

  it('does not split demand that a row for all halls already plans', () => {
    const demand = [line({ avdeling: '64' }), line({ id: 'd2', hall: 'Hall D', avdeling: '65' })]
    expect(suggestedRows(demand, [realRow({}), realRow({ id: 'dem', phase: 'Demontering', hall: 'Hall C' })]).map((r) => `${r.phase}/${r.hall}`)).toEqual(['Demontering/Hall D'])
    expect(suggestedRows(demand, [realRow({ hall: 'Hall C', avdeling: '64' })]).map((r) => `${r.phase}/${r.hall}`)).toEqual(['Demontering/Hall C', 'Montering/Hall D', 'Demontering/Hall D'])
  })
})
