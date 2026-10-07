import { describe, expect, it } from 'vitest'
import { followCompetence, isSuggestedRow, suggestedRows } from './plannedRows'
import type { AllocationRow, DemandLine, KpiConfig } from './types'

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

describe('followCompetence', () => {
  const kpi = (competences: Record<string, string>): KpiConfig => ({ workTypes: Object.entries(competences).map(([name, competence]) => ({ name, productType: name, unit: 'm²', competence })), rates: [] })
  const before = kpi({ Teppefliser: 'Teppefliser', Gangtepper: 'Teppefliser', Banner: 'Banner' })
  // What Visma gives for the project, as the ledger holds it under each set-up.
  const demandOf = (config: KpiConfig) => [
    line({ id: 'fliser', workType: 'Teppefliser', competence: config.workTypes[0].competence }),
    line({ id: 'gang', workType: 'Gangtepper', competence: config.workTypes[1].competence, hall: 'Hall D' }),
  ]
  const planned = (id: string, overrides: Partial<AllocationRow> = {}) => realRow({ id, basis: 'Planlagt', phase: 'Montering', fte: { '2026-10-06': 2 }, ...overrides })

  it('moves a planned row to the competence its product type was given, with its FTE', () => {
    const after = kpi({ Teppefliser: 'Gulv', Gangtepper: 'Gulv', Banner: 'Banner' })
    const row = planned('r')
    expect(followCompetence([row], before, after, demandOf(before), demandOf(after))).toEqual([{ ...row, competence: 'Gulv' }])
  })

  it('leaves a row that still has demand under the old competence', () => {
    // Only Gangtepper in Hall D changes; the row for all halls still plans the Teppefliser in Hall C.
    const after = kpi({ Teppefliser: 'Teppefliser', Gangtepper: 'Gulv', Banner: 'Banner' })
    expect(followCompetence([planned('all')], before, after, demandOf(before), demandOf(after))).toEqual([])
    const hallD = planned('d', { hall: 'Hall D' })
    expect(followCompetence([planned('c', { hall: 'Hall C' }), hallD], before, after, demandOf(before), demandOf(after))).toEqual([{ ...hallD, competence: 'Gulv' }])
  })

  it('leaves rows of other competences, other bases, and rows that had no demand', () => {
    const after = kpi({ Teppefliser: 'Gulv', Gangtepper: 'Gulv', Banner: 'Banner' })
    const rows = [planned('banner', { competence: 'Banner' }), planned('history', { basis: 'Historikk Timer' }), planned('other', { projectNo: '26100' })]
    expect(followCompetence(rows, before, after, demandOf(before), demandOf(after))).toEqual([])
  })

  it('leaves a row when its lines went to two competences, or when the new place is already planned', () => {
    const split = kpi({ Teppefliser: 'Gulv', Gangtepper: 'Løpere', Banner: 'Banner' })
    expect(followCompetence([planned('all')], before, split, demandOf(before), demandOf(split))).toEqual([])
    const after = kpi({ Teppefliser: 'Gulv', Gangtepper: 'Gulv', Banner: 'Banner' })
    expect(followCompetence([planned('old'), planned('there', { competence: 'Gulv' })], before, after, demandOf(before), demandOf(after))).toEqual([])
  })

  it('does nothing when no competence changed', () => {
    expect(followCompetence([planned('r')], before, before, demandOf(before), demandOf(before))).toEqual([])
  })
})
