import { describe, expect, it } from 'vitest'
import { diffKpi, kpiRows, mergeKpi, replaceKpi, setActiveUnit } from '../domain/kpi'
import type { KpiConfig, VismaImport } from '../domain/types'
import { KpiFormatError, readKpiWorkbook, writeKpiWorkbook } from './kpiFile'
import { cellAt, dataRows, readXlsx, writeXlsx } from './xlsx'

const kpi: KpiConfig = {
  workTypes: [
    { productType: '12 [FOGA-dragere]', unit: 'stk', competence: 'FOGA' },
    { productType: '23 [Print]', unit: 'ordre', competence: 'Print' },
    { productType: 'Egen type', unit: 'stk', competence: 'Skilting' },
    { productType: '1 [5999 [Diverse]]', unit: 'ordre', competence: 'Diverse' },
  ],
  rates: [
    { name: 'FOGA-dragere', unit: 'lm', assembly: 35, dismantle: 35 },
    { name: 'FOGA-dragere', unit: 'stk', assembly: 16, dismantle: 25 },
    { name: 'Print', unit: 'ordre', assembly: 1, dismantle: 0 },
    { name: '5999 [Diverse', unit: 'ordre', assembly: 0.53, dismantle: 0.91 },
  ],
}

const table = (bytes: Uint8Array) => {
  const sheet = readXlsx(bytes).get('KPI')!
  return dataRows(sheet, 0).map((row) => [0, 1, 2, 3, 4, 5].map((col) => cellAt(sheet, row, col)))
}

describe('the KPI file', () => {
  it('has a row per product type and unit, with the unit in use marked', () => {
    expect(table(writeKpiWorkbook(kpi))).toEqual([
      ['Produkttype', 'Enhet', 'I bruk', 'Kompetanse', 'Montering', 'Demontering'],
      ['1 [5999 [Diverse]]', 'ordre', 'Ja', 'Diverse', 0.53, 0.91],
      ['Egen type', 'stk', 'Ja', 'Skilting', null, null],
      ['12 [FOGA-dragere]', 'stk', 'Ja', 'FOGA', 16, 25],
      ['12 [FOGA-dragere]', 'lm', null, 'FOGA', 35, 35],
      ['23 [Print]', 'ordre', 'Ja', 'Print', 1, null],
    ])
  })

  it('is read back as the setup it was written from', () => {
    const read = readKpiWorkbook(writeKpiWorkbook(kpi))
    expect(read.unitsInUse).toBe(true)
    expect(kpiRows(read)).toEqual(kpiRows(kpi))
    expect(diffKpi(kpi, read)).toEqual({ workTypes: { added: 0, changed: 0, onlyInApp: 0, unchanged: 4 }, rates: { added: 1, changed: 0, onlyInApp: 0, unchanged: 4 } })
    // The one rate that is new is the empty one of a type that had none; the table is the same.
    expect(kpiRows(replaceKpi(kpi, read))).toEqual(kpiRows(kpi))
    expect(kpiRows(mergeKpi(kpi, read))).toEqual(kpiRows(kpi))
  })

  it('writes a type the exports name as Visma has it, and leaves out one that is not set up', () => {
    const visma: VismaImport[] = [{ projectNo: '1', eventName: 'VVS 2026', fileName: 'x', importedAt: '', rows: ['7 [Egen type]', '31 [Teppefliser]'].map((productType) => ({ projectNo: '1', eventName: 'VVS 2026', stand: '', transInfo: '', customer: '', avdeling: '', orderNo: '', articleNo: '', description: '', quantity: 1, productGroup: '', productType })) }]
    const names = table(writeKpiWorkbook(kpi, visma)).map((row) => row[0])
    expect(names).toContain('7 [Egen type]')
    expect(names).not.toContain('31 [Teppefliser]')
  })

  it('takes the unit in use from a file that marks it, over the one chosen in the app', () => {
    const edited = readKpiWorkbook(writeKpiWorkbook(setActiveUnit(kpi, 'FOGA-dragere', 'lm')))
    const unit = (config: KpiConfig) => config.workTypes.find((rule) => rule.productType === '12 [FOGA-dragere]')!.unit
    expect(unit(mergeKpi(kpi, edited))).toBe('lm')
    expect(unit(replaceKpi(kpi, edited))).toBe('lm')
    expect(diffKpi(kpi, edited).workTypes).toMatchObject({ changed: 1, unchanged: 3 })
  })

  const file = (head: string[], ...rows: (string | number | null)[][]) => readKpiWorkbook(writeXlsx([{ name: 'Ark1', head, rows }]))

  it('reads a file edited by hand: names without number and brackets, other marks, a comma for the decimals', () => {
    const read = file(['Produkttype', 'Enhet', 'I bruk', 'Kompetanse', 'Montering', 'Demontering'], ['FOGA-dragere', 'lm', 'x', 'FOGA', '7,5', null], ['foga-dragere', 'stk', null, null, 16, 25], ['5999 Diverse', 'ordre', null, 'Diverse', 1, 1], [null, 'stk', 'Ja', 'Tom', 1, 1])
    expect(read.workTypes).toEqual([
      { productType: 'FOGA-dragere', unit: 'lm', competence: 'FOGA' },
      { productType: '5999 Diverse', unit: 'ordre', competence: 'Diverse' },
    ])
    expect(read.rates[0]).toEqual({ name: 'FOGA-dragere', unit: 'lm', assembly: 7.5, dismantle: 0 })
    // Merged, the rows land on the types of the setup, whatever form their names have.
    const merged = mergeKpi(kpi, read)
    expect(merged.workTypes).toHaveLength(4)
    expect(merged.rates).toHaveLength(4)
    expect(kpiRows(merged).find((row) => row.name === 'FOGA-dragere' && row.unit === 'lm')).toMatchObject({ active: true, assembly: 7.5 })
  })

  it('reads a file with the headings of Visma and no unit in use: the planner chooses among several', () => {
    const read = file(['Produkttype 2', 'Kompetansegruppe', 'Enhet', 'Montering', 'Demontering'], ['12 [FOGA-dragere]', 'FOGA', 'lm', 35, 35], ['12 [FOGA-dragere]', 'FOGA', 'stk', 16, 25], ['23 [Print]', 'Print', 'ordre', 1, 0])
    expect(read.unitsInUse).toBe(false)
    expect(read.workTypes).toEqual([
      { productType: '12 [FOGA-dragere]', unit: '', competence: 'FOGA' },
      { productType: '23 [Print]', unit: 'ordre', competence: 'Print' },
    ])
    // The unit chosen in the app is kept.
    expect(mergeKpi(kpi, read).workTypes[0]).toMatchObject({ productType: '12 [FOGA-dragere]', unit: 'stk' })
  })

  it('refuses a file without the columns', () => {
    expect(() => file(['Produkttype', 'Enhet'], ['Print', 'ordre'])).toThrow(KpiFormatError)
  })
})
