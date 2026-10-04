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
 * Reads KPI reference data from either workbook the planner keeps:
 * the mapping (product type → unit and nøkkelområde) and/or the rates (montering and demontering per unit).
 */
export const readKpiWorkbook = (bytes: Uint8Array): Partial<KpiConfig> => {
  const result: Partial<KpiConfig> = {}
  for (const sheet of readXlsx(bytes).values()) {
    const rateHeader = findHeader(sheet, ['produkttype 2', 'enhet', 'montering', 'demontering'])
    if (rateHeader && !result.rates) {
      const rates: KpiRate[] = []
      for (const row of dataRows(sheet, rateHeader.row)) {
        const get = (name: string) => sheet.rows.get(row)?.get(rateHeader.columns.get(name)!) ?? null
        const productType = text(get('produkttype 2'))
        if (!productType || workTypeName(productType) === NO_PRODUCT_TYPE) continue
        rates.push({ name: workTypeName(productType), unit: text(get('enhet')), assembly: num(get('montering')) ?? 0, dismantle: num(get('demontering')) ?? 0 })
      }
      if (rates.length) result.rates = rates
      continue
    }
    const mapHeader = findHeader(sheet, ['produkttype 2', 'enhet', 'nøkkelområder'])
    if (mapHeader && !result.workTypes) {
      const seen = new Set<string>()
      const workTypes: WorkTypeRule[] = []
      for (const row of dataRows(sheet, mapHeader.row)) {
        const get = (name: string) => sheet.rows.get(row)?.get(mapHeader.columns.get(name)!) ?? null
        const productType = text(get('produkttype 2'))
        const name = workTypeName(productType)
        // Rows without a bracketed type name cannot be matched to Visma lines.
        if (!productType || name === NO_PRODUCT_TYPE || seen.has(name.toLowerCase())) continue
        seen.add(name.toLowerCase())
        workTypes.push({ name, productType, unit: text(get('enhet')), competence: text(get('nøkkelområder')) })
      }
      if (workTypes.length) result.workTypes = workTypes
    }
  }
  if (!result.rates && !result.workTypes) {
    throw new VismaFormatError('Fant ingen KPI-tabell. Filen må ha «Produkttype 2» og «Enhet» sammen med «Nøkkelområder» eller «Montering»/«Demontering».')
  }
  return result
}
