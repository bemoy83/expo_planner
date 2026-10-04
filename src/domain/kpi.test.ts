import { describe, expect, it } from 'vitest'
import { addKpiRow, addWorkType, diffKpi, EMPTY_KPI, kpiRows, linesWithoutProductType, mergeKpi, removeKpiRow, removeWorkType, replaceKpi, setActiveUnit, setCompetence, setRate, workTypeRows } from './kpi'
import type { KpiConfig, VismaImport, VismaRow } from './types'

const kpi: KpiConfig = {
  workTypes: [
    { name: 'FOGA-dragere', productType: '12 [FOGA-dragere]', unit: 'lm', competence: 'FOGA' },
    { name: 'Print', productType: '23 [Print]', unit: 'ordre', competence: 'Print' },
    { name: 'Skilt', productType: '11 [Skilt]', unit: 'stk', competence: 'Skilting' },
  ],
  rates: [
    { name: 'FOGA-dragere', unit: 'lm', assembly: 35, dismantle: 35 },
    { name: 'FOGA-dragere', unit: 'stk', assembly: 16, dismantle: 25 },
    { name: 'Print', unit: 'ordre', assembly: 1, dismantle: 0 },
  ],
}

describe('KPI table', () => {
  it('shows one row per work type and unit, marking the unit in use', () => {
    const rows = kpiRows(kpi)
    expect(rows.map((r) => `${r.name}/${r.unit}/${r.active ? 'i bruk' : '-'}`)).toEqual(['FOGA-dragere/lm/i bruk', 'FOGA-dragere/stk/-', 'Print/ordre/i bruk', 'Skilt/stk/i bruk'])
    expect(rows.find((r) => r.name === 'Skilt')).toMatchObject({ missingRate: true, competence: 'Skilting' })
    expect(rows[1].competence).toBe('FOGA')
  })

  it('edits rates, the unit in use and the competence', () => {
    expect(setRate(kpi, 'Print', 'ordre', { dismantle: 2 }).rates[2]).toEqual({ name: 'Print', unit: 'ordre', assembly: 1, dismantle: 2 })
    expect(setRate(kpi, 'Skilt', 'stk', { assembly: 20 }).rates.at(-1)).toEqual({ name: 'Skilt', unit: 'stk', assembly: 20, dismantle: 0 })
    expect(setActiveUnit(kpi, 'foga-dragere', 'stk').workTypes[0].unit).toBe('stk')
    expect(setCompetence(kpi, 'Print', 'ordre', 'Profilering').workTypes[1].competence).toBe('Profilering')
  })

  it('adds a new work type, or a second unit without changing the one in use', () => {
    const added = addKpiRow(kpi, { name: 'Gangtepper', unit: 'm²', competence: 'Gangtepper', assembly: 60, dismantle: 90 })
    expect(added.workTypes.at(-1)).toMatchObject({ name: 'Gangtepper', unit: 'm²', competence: 'Gangtepper' })
    expect(added.rates.at(-1)).toMatchObject({ assembly: 60, dismantle: 90 })
    const second = addKpiRow(kpi, { name: 'Print', unit: 'stk', competence: '', assembly: 4, dismantle: 0 })
    expect(second.workTypes).toEqual(kpi.workTypes)
    expect(second.rates).toHaveLength(4)
  })

  it('removes a unit and hands over to another, or removes the work type with its last unit', () => {
    const switched = removeKpiRow(kpi, 'FOGA-dragere', 'lm')
    expect(switched.workTypes[0].unit).toBe('stk')
    expect(switched.rates).toHaveLength(2)
    const gone = removeKpiRow(kpi, 'Print', 'ordre')
    expect(gone.workTypes.map((t) => t.name)).toEqual(['FOGA-dragere', 'Skilt'])
  })
})

describe('KPI import', () => {
  const file: Partial<KpiConfig> = {
    rates: [
      { name: 'Print', unit: 'ordre', assembly: 2, dismantle: 0 },
      { name: 'FOGA-dragere', unit: 'lm', assembly: 35, dismantle: 35 },
      { name: 'Banner', unit: 'm²', assembly: 20, dismantle: 28 },
    ],
  }

  it('reports what a file would change', () => {
    expect(diffKpi(kpi, file)).toEqual({
      workTypes: { added: 0, changed: 0, onlyInApp: 0, unchanged: 0 },
      rates: { added: 1, changed: 1, onlyInApp: 1, unchanged: 1 },
    })
  })

  it('merges: the file wins, rows only in the app stay', () => {
    const merged = mergeKpi(kpi, file)
    expect(merged.rates).toHaveLength(4)
    expect(merged.rates.find((r) => r.name === 'Print')!.assembly).toBe(2)
    expect(merged.rates.find((r) => r.unit === 'stk')).toBeDefined()
    expect(merged.workTypes).toEqual(kpi.workTypes)
  })

  it('replaces only the parts the file contains', () => {
    const replaced = replaceKpi(kpi, file)
    expect(replaced.rates).toEqual(file.rates)
    expect(replaced.workTypes).toBe(kpi.workTypes)
  })
})

const vismaRow = (productType: string): VismaRow => ({
  projectNo: '26970',
  eventName: 'VVS 2026',
  stand: 'C01-01',
  transInfo: '',
  customer: '',
  avdeling: '65',
  orderNo: '',
  articleNo: '',
  description: '',
  quantity: 1,
  productGroup: '',
  productType,
})
const exportWith = (...types: string[]): VismaImport[] => [{ projectNo: '26970', eventName: 'VVS 2026', fileName: 'x', importedAt: '', rows: types.map(vismaRow) }]

describe('product-type table', () => {
  it('lists the product types of an export before anything is set up', () => {
    const rows = workTypeRows(EMPTY_KPI, exportWith('14 [FOGA-vegger]', '14 [FOGA-vegger]', '23 [Print]', '0'))
    expect(rows).toEqual([
      { name: 'FOGA-vegger', productType: '14 [FOGA-vegger]', unit: '', competence: '', lines: 2, configured: false, hasRate: false },
      { name: 'Print', productType: '23 [Print]', unit: '', competence: '', lines: 1, configured: false, hasRate: false },
    ])
    expect(linesWithoutProductType(exportWith('0', '14 [FOGA-vegger]', ''))).toBe(2)
  })

  it('sets a type up by giving it a unit or a competence', () => {
    const withUnit = setActiveUnit(EMPTY_KPI, 'FOGA-vegger', 'lm')
    const withBoth = setCompetence(withUnit, 'FOGA-vegger', 'lm', 'FOGA')
    expect(withBoth.workTypes).toEqual([{ name: 'FOGA-vegger', productType: '[FOGA-vegger]', unit: 'lm', competence: 'FOGA' }])
    const rows = workTypeRows(withBoth, exportWith('14 [FOGA-vegger]', '23 [Print]'))
    expect(rows.map((r) => `${r.name}:${r.configured}`)).toEqual(['Print:false', 'FOGA-vegger:true'])
    expect(rows[1]).toMatchObject({ productType: '14 [FOGA-vegger]', lines: 1, hasRate: false })
  })

  it('shows which types have a rate for the unit in use', () => {
    const rows = workTypeRows(kpi, [])
    expect(rows.map((r) => `${r.name}:${r.hasRate}`)).toEqual(['FOGA-dragere:true', 'Print:true', 'Skilt:false'])
  })

  it('adds and removes types without touching the rates', () => {
    const added = addWorkType(kpi, { name: 'Gangtepper', unit: 'm²', competence: 'Gangtepper' })
    expect(added.workTypes).toHaveLength(4)
    expect(addWorkType(added, { name: 'gangtepper', unit: 'stk', competence: '' })).toBe(added)
    const removed = removeWorkType(kpi, 'Print')
    expect(removed.workTypes.map((t) => t.name)).toEqual(['FOGA-dragere', 'Skilt'])
    expect(removed.rates).toBe(kpi.rates)
  })
})
