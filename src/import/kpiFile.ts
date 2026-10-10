import { kpiRows, productTypeKey, productTypeName, type KpiFile } from '../domain/kpi'
import type { KpiConfig, KpiRate, VismaImport, WorkTypeRule } from '../domain/types'
import { vismaProductType } from './vismaExport'
import { dataRows, findHeader, isMarked, num, readXlsx, text, writeXlsx, type CellValue } from './xlsx'

/**
 * The KPI table as a file: what «Eksporter» on KPI writes and «Importer fra fil» reads. A row per product type and
 * unit, as in the table. The file is the planner's own copy of the setup, to keep or to edit in Excel and read back.
 */

export class KpiFormatError extends Error {}

const HEAD = ['Produkttype', 'Enhet', 'I bruk', 'Kompetanse', 'Montering', 'Demontering']
const IN_USE = 'Ja'

/** The headings a file may have for a column; the first found is read. `Kpier.xlsx` has the two from Visma. */
const NAMES = {
  productType: ['produkttype', 'produkttype 2'],
  competence: ['kompetanse', 'kompetansegruppe', 'kompetanse (nøkkelområde)'],
}

/** The setup as a workbook, a product type by its name. A rate of 0 is left empty. */
export const writeKpiWorkbook = (kpi: KpiConfig, visma: VismaImport[] = []): Uint8Array => {
  const rows = kpiRows(kpi, visma)
    // A type that only occurs in an export is not part of the setup yet.
    .filter((row) => row.lacking !== 'new')
    .sort((a, b) => a.name.localeCompare(b.name, 'nb') || Number(b.active) - Number(a.active) || a.unit.localeCompare(b.unit, 'nb'))
    .map((row): CellValue[] => [row.name, row.unit, row.active ? IN_USE : '', row.competence, row.assembly || null, row.dismantle || null])
  return writeXlsx([{ name: 'KPI', head: HEAD, rows }])
}

/**
 * Reads a KPI file: one the app has written, or `Kpier.xlsx`. A file with an «I bruk» column says which unit of a
 * product type is in use. Without the column, a product type with one unit is counted in it, and one with several
 * is left without a unit in use, for the planner to choose.
 */
export const readKpiWorkbook = (bytes: Uint8Array): KpiFile => {
  for (const sheet of readXlsx(bytes).values()) {
    const header = NAMES.productType.map((name) => findHeader(sheet, [name, 'enhet', 'montering', 'demontering'])).find(Boolean)
    if (!header) continue
    const column = (names: string[]) => names.map((name) => header.columns.get(name)).find((col) => col !== undefined)
    const columns = { productType: column(NAMES.productType)!, unit: header.columns.get('enhet')!, inUse: header.columns.get('i bruk'), competence: column(NAMES.competence), assembly: header.columns.get('montering')!, dismantle: header.columns.get('demontering')! }
    const rates: KpiRate[] = []
    const types = new Map<string, WorkTypeRule & { units: Set<string>; marked: string }>()
    for (const row of dataRows(sheet, header.row)) {
      const get = (col: number | undefined) => (col === undefined ? null : (sheet.rows.get(row)?.get(col) ?? null))
      const written = text(get(columns.productType))
      // `Kpier.xlsx` names a product type as Visma does, «14 [FOGA-vegger]»; a file the app has written has the name.
      const name = vismaProductType(written) || productTypeName(written)
      if (!name) continue
      const unit = text(get(columns.unit))
      const type = types.get(productTypeKey(name)) ?? { productType: name, unit: '', competence: '', units: new Set<string>(), marked: '' }
      type.competence ||= text(get(columns.competence))
      types.set(productTypeKey(name), type)
      // A row without a unit names the product type only: a rate cannot be without a unit.
      if (!unit) continue
      rates.push({ name, unit, assembly: num(get(columns.assembly)) ?? 0, dismantle: num(get(columns.dismantle)) ?? 0 })
      type.units.add(unit.toLowerCase())
      type.unit ||= unit
      if (isMarked(get(columns.inUse))) type.marked ||= unit
    }
    if (!types.size) continue
    const workTypes = [...types.values()].map(({ units, marked, ...rule }): WorkTypeRule => ({ ...rule, unit: marked || (units.size > 1 ? '' : rule.unit) }))
    return { workTypes, rates, unitsInUse: columns.inUse !== undefined }
  }
  throw new KpiFormatError('Fant ingen KPI-tabell. Filen må ha kolonnene «Produkttype», «Enhet», «Montering» og «Demontering».')
}
