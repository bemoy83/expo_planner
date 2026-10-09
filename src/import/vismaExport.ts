import { NO_PRODUCT_TYPE, workTypeName } from '../domain/visma'
import type { KpiConfig, KpiRate, VismaRow, WorkTypeRule } from '../domain/types'
import { num, readXlsx, text, type CellValue, type Sheet } from './xlsx'

export class VismaFormatError extends Error {}

const lower = (value: CellValue) => text(value).toLowerCase()

/** Finds the first row that contains all the given headers and maps header name → column. */
const findHeader = (sheet: Sheet, required: string[]): { row: number; columns: Map<string, number> } | null => {
  const rows = [...sheet.rows.keys()].sort((a, b) => a - b).slice(0, 20)
  for (const row of rows) {
    const columns = new Map<string, number>()
    for (const [col, value] of sheet.rows.get(row)!) if (lower(value) && !columns.has(lower(value))) columns.set(lower(value), col)
    if (required.every((name) => columns.has(name))) return { row, columns }
  }
  return null
}

const dataRows = (sheet: Sheet, headerRow: number) => [...sheet.rows.keys()].filter((r) => r > headerRow).sort((a, b) => a - b)

/** Reads a Visma booking export (`utskrift_visma`). The total row and rows without a project are left out. */
export const readVismaExport = (bytes: Uint8Array): VismaRow[] => {
  for (const sheet of readXlsx(bytes).values()) {
    const header = findHeader(sheet, ['prosjekt', 'totalt antall', 'produkttype 2'])
    if (!header) continue
    const cell = (row: number, name: string) => {
      const col = header.columns.get(name)
      return col === undefined ? null : (sheet.rows.get(row)?.get(col) ?? null)
    }
    const rows: VismaRow[] = []
    for (const row of dataRows(sheet, header.row)) {
      const projectNo = text(cell(row, 'prosjekt'))
      if (!projectNo || projectNo === '0') continue
      rows.push({
        projectNo,
        eventName: text(cell(row, 'navn2')),
        stand: text(cell(row, 'stand')),
        transInfo: text(cell(row, 'trans.opplysn. 1')),
        customer: text(cell(row, 'navn')),
        avdeling: text(cell(row, 'avdeling')),
        orderNo: text(cell(row, 'ordrenr')),
        articleNo: text(cell(row, 'art.nr')),
        description: text(cell(row, 'beskrivelse')),
        quantity: num(cell(row, 'totalt antall')) ?? 0,
        productGroup: text(cell(row, 'varegr')),
        productType: text(cell(row, 'produkttype 2')),
      })
    }
    if (rows.length) return rows
  }
  throw new VismaFormatError('Fant ingen Visma-ordrelinjer. Filen må ha kolonnene «Prosjekt», «Totalt antall» og «Produkttype 2».')
}

/**
 * Reads the KPI file (`Kpier.xlsx`): a row per product type and unit with the rates, and the competence where the
 * file has a «Kompetansegruppe» column. A product type with one unit in the file is counted in it; one with several
 * is left without a unit in use, for the planner to choose.
 */
export const readKpiWorkbook = (bytes: Uint8Array): KpiConfig => {
  for (const sheet of readXlsx(bytes).values()) {
    const header = findHeader(sheet, ['produkttype 2', 'enhet', 'montering', 'demontering'])
    if (!header) continue
    const rates: KpiRate[] = []
    const types = new Map<string, WorkTypeRule & { units: Set<string> }>()
    for (const row of dataRows(sheet, header.row)) {
      const get = (name: string) => {
        const col = header.columns.get(name)
        return col === undefined ? null : (sheet.rows.get(row)?.get(col) ?? null)
      }
      const productType = text(get('produkttype 2'))
      const name = workTypeName(productType)
      // Rows without a bracketed type name cannot be matched to Visma lines.
      if (!productType || name === NO_PRODUCT_TYPE) continue
      const unit = text(get('enhet'))
      rates.push({ name, unit, assembly: num(get('montering')) ?? 0, dismantle: num(get('demontering')) ?? 0 })
      const type = types.get(name.toLowerCase()) ?? { name, productType, unit: '', competence: '', units: new Set<string>() }
      type.competence ||= text(get('kompetansegruppe'))
      if (unit) type.units.add(unit.toLowerCase())
      if (type.units.size === 1) type.unit ||= unit
      types.set(name.toLowerCase(), type)
    }
    if (!rates.length) continue
    const workTypes = [...types.values()].map(({ units, ...rule }): WorkTypeRule => (units.size > 1 ? { ...rule, unit: '' } : rule))
    return { workTypes, rates }
  }
  throw new VismaFormatError('Fant ingen KPI-tabell. Filen må ha kolonnene «Produkttype 2», «Enhet», «Montering» og «Demontering».')
}
