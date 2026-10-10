import { describe, expect, it } from 'vitest'
import { addKpiRow, diffKpi, EMPTY_KPI, kpiRows, linesWithoutProductType, mergeKpi, removeKpiRow, renameUnit, replaceKpi, setActiveUnit, setCompetence, setRate, productTypeKey, productTypeName } from './kpi'
import type { KpiConfig, VismaImport, VismaRow } from './types'

const kpi: KpiConfig = {
  workTypes: [
    { productType: 'FOGA-dragere', unit: 'lm', competence: 'FOGA' },
    { productType: 'Print', unit: 'ordre', competence: 'Print' },
    { productType: 'Skilt', unit: 'stk', competence: 'Skilting' },
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
    expect(rows.find((r) => r.name === 'Skilt')).toMatchObject({ lacking: 'rate', competence: 'Skilting', assembly: 0 })
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
    expect(added.workTypes.at(-1)).toEqual({ productType: 'Gangtepper', unit: 'm²', competence: 'Gangtepper' })
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
    expect(gone.workTypes.map((t) => t.productType)).toEqual(['FOGA-dragere', 'Skilt'])
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

  it('keeps the unit the planner has chosen when a file is read again', () => {
    const chosen = setActiveUnit(kpi, 'FOGA-dragere', 'stk')
    // As the KPI file is read: several units, so none in use; and a competence of its own.
    const again: KpiConfig = { workTypes: [{ productType: 'FOGA-dragere', unit: '', competence: 'Vegger' }], rates: kpi.rates.slice(0, 2) }
    expect(mergeKpi(chosen, again).workTypes[0]).toMatchObject({ unit: 'stk', competence: 'Vegger' })
    expect(replaceKpi(chosen, again).workTypes).toEqual([{ productType: 'FOGA-dragere', unit: 'stk', competence: 'Vegger' }])
    expect(diffKpi(chosen, again).workTypes).toMatchObject({ changed: 1, unchanged: 0 })
    expect(diffKpi(chosen, { ...again, workTypes: [{ ...again.workTypes[0], competence: 'FOGA' }] }).workTypes).toMatchObject({ changed: 0, unchanged: 1 })
    // A chosen unit the file no longer has rates for is not kept when the file replaces the table.
    const without: KpiConfig = { workTypes: [{ ...again.workTypes[0], unit: 'lm' }], rates: kpi.rates.slice(0, 1) }
    expect(replaceKpi(chosen, without).workTypes[0].unit).toBe('lm')
    expect(mergeKpi(chosen, without).workTypes[0].unit).toBe('stk')
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

describe('product types in the KPI table', () => {
  it('lists the product types of an export before anything is set up', () => {
    const rows = kpiRows(EMPTY_KPI, exportWith('FOGA-vegger', 'FOGA-vegger', 'Print', ''))
    expect(rows).toEqual([
      { name: 'FOGA-vegger', unit: '', competence: '', assembly: 0, dismantle: 0, active: false, lines: 2, configured: false, lacking: 'new' },
      { name: 'Print', unit: '', competence: '', assembly: 0, dismantle: 0, active: false, lines: 1, configured: false, lacking: 'new' },
    ])
    expect(linesWithoutProductType(exportWith('', 'FOGA-vegger', ''))).toBe(2)
  })

  it('sets a type up by giving it a unit or a competence, and puts the types not set up first', () => {
    const withUnit = renameUnit(EMPTY_KPI, 'FOGA-vegger', '', 'lm')
    expect(kpiRows(withUnit)[0]).toMatchObject({ unit: 'lm', active: true, lacking: 'competence' })
    const withBoth = setCompetence(withUnit, 'FOGA-vegger', 'lm', 'FOGA')
    expect(withBoth.workTypes).toEqual([{ productType: 'FOGA-vegger', unit: 'lm', competence: 'FOGA' }])
    const rows = kpiRows(withBoth, exportWith('FOGA-vegger', 'Print'))
    expect(rows.map((r) => `${r.name}:${r.configured}`)).toEqual(['Print:false', 'FOGA-vegger:true'])
    expect(rows[1]).toMatchObject({ name: 'FOGA-vegger', lines: 1, lacking: 'rate' })
  })

  it('says what each type lacks: a missing rate is flagged, not read as no work', () => {
    const lacking = (config: KpiConfig) => Object.fromEntries(kpiRows(config).map((r) => [r.name, r.lacking]))
    expect(lacking(kpi)).toEqual({ 'FOGA-dragere': null, Print: null, Skilt: 'rate' })
    // A rate of 0 for both phases is no rate.
    expect(lacking(setRate(kpi, 'Skilt', 'stk', { assembly: 0 })).Skilt).toBe('rate')
    expect(lacking(setRate(kpi, 'Skilt', 'stk', { assembly: 20 })).Skilt).toBeNull()
    expect(lacking(setActiveUnit(kpi, 'Skilt', '')).Skilt).toBe('unit')
    expect(lacking(setCompetence(kpi, 'Print', 'ordre', '')).Print).toBe('competence')
  })

  it('shows rates read in before any unit is chosen, with none in use', () => {
    const rows = kpiRows({ workTypes: [], rates: kpi.rates }, exportWith('Print'))
    expect(rows.map((r) => `${r.name}/${r.unit}/${r.active}/${r.lacking}`)).toEqual(['FOGA-dragere/lm/false/no-unit-in-use', 'FOGA-dragere/stk/false/no-unit-in-use', 'Print/ordre/false/no-unit-in-use'])
    expect(rows[2]).toMatchObject({ lines: 1, name: 'Print' })
  })

  it('lists a type whose unit is still to be chosen by its rates, with its competence', () => {
    const read: KpiConfig = { workTypes: [{ ...kpi.workTypes[0], unit: '' }], rates: kpi.rates.slice(0, 2) }
    const rows = kpiRows(read)
    expect(rows.map((r) => `${r.unit}/${r.active}/${r.competence}/${r.lacking}`)).toEqual(['lm/false/FOGA/no-unit-in-use', 'stk/false/FOGA/no-unit-in-use'])
    const chosen = kpiRows(setActiveUnit(read, 'FOGA-dragere', 'stk'))
    expect(chosen.map((r) => `${r.unit}/${r.active}/${r.competence}/${r.lacking}`)).toEqual(['stk/true/FOGA/null', 'lm/false/FOGA/null'])
  })

  it('renames a unit with its rates, and hands over to a unit that is already there', () => {
    const renamed = renameUnit(kpi, 'FOGA-dragere', 'lm', 'm')
    expect(renamed.workTypes[0].unit).toBe('m')
    expect(renamed.rates[0]).toEqual({ name: 'FOGA-dragere', unit: 'm', assembly: 35, dismantle: 35 })
    const other = renameUnit(kpi, 'FOGA-dragere', 'stk', 'par')
    expect(other.workTypes).toEqual(kpi.workTypes)
    expect(other.rates[1].unit).toBe('par')
    const handed = renameUnit(kpi, 'FOGA-dragere', 'lm', 'stk')
    expect(handed.workTypes[0].unit).toBe('stk')
    expect(handed.rates).toEqual(kpi.rates)
    expect(renameUnit(kpi, 'FOGA-dragere', 'stk', 'lm')).toBe(kpi)
    // The unit of a rate with no unit in use is renamed without choosing it.
    const ratesOnly = { workTypes: [], rates: kpi.rates }
    expect(renameUnit(ratesOnly, 'Print', 'ordre', 'stands')).toEqual({ workTypes: [], rates: [...kpi.rates.slice(0, 2), { ...kpi.rates[2], unit: 'stands' }] })
  })
})

describe('the name of a product type', () => {
  it('is matched whatever its case and the spaces around it', () => {
    expect(productTypeName('  FOGA   vegger ')).toBe('FOGA vegger')
    expect(productTypeKey(' Foga-Vegger')).toBe(productTypeKey('FOGA-vegger'))
    const set = setRate(kpi, 'print', 'ordre', { dismantle: 2 })
    expect(set.rates).toHaveLength(3)
    expect(set.rates[2]).toEqual({ name: 'Print', unit: 'ordre', assembly: 1, dismantle: 2 })
    expect(setActiveUnit(kpi, 'foga-dragere', 'stk').workTypes[0]).toEqual({ productType: 'FOGA-dragere', unit: 'stk', competence: 'FOGA' })
  })

  it('keeps types whose names differ only by a number apart, and sets one up from its row under that name', () => {
    const visma = exportWith('5999 Diverse', '6999 Diverse')
    const rows = kpiRows(EMPTY_KPI, visma)
    expect(rows.map((r) => r.name)).toEqual(['5999 Diverse', '6999 Diverse'])
    const setUp = setRate(renameUnit(EMPTY_KPI, rows[0].name, '', 'stk'), rows[0].name, 'stk', { assembly: 4 })
    expect(setUp).toEqual({ workTypes: [{ productType: '5999 Diverse', unit: 'stk', competence: '' }], rates: [{ name: '5999 Diverse', unit: 'stk', assembly: 4, dismantle: 0 }] })
    expect(kpiRows(setUp, visma).map((r) => `${r.name}/${r.unit}/${r.lacking}`)).toEqual(['6999 Diverse//new', '5999 Diverse/stk/competence'])
    expect(addKpiRow(setUp, { name: '5999 diverse', unit: 'lm', competence: '', assembly: 1, dismantle: 1 }).workTypes).toEqual(setUp.workTypes)
  })
})
