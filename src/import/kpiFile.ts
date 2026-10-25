import { kpiRows, productTypeKey, productTypeName, type KpiFile } from '../domain/kpi'
import type { ExcludedArticle, KpiConfig, KpiRate, VismaImport, WorkTypeRule } from '../domain/types'
import { STAGE_NAMES, stageByName } from './kompetanserFile'
import { vismaProductType } from './vismaExport'
import { cell, column, dataRows, FileFormatError, firstSheetWith, isMarked, num, readXlsx, text, writeXlsx, type CellValue, type Sheet } from './xlsx'

/**
 * The KPI table as a file: what «Eksporter» on KPI writes and «Importer fra fil» reads. A row per product type and
 * unit, as in the table. The file is the planner's own copy of the setup, to keep or to edit in Excel and read back.
 */

const HEAD = ['Produkttype', 'Enhet', 'I bruk', 'Kompetanse', 'Montering', 'Demontering', 'Trinn']
/** The sheet of the article numbers left out. It is always written, so that a file read back says the list is empty. */
const ARTICLES = 'Utelatte artikler'
const ARTICLE_HEAD = ['Art.nr', 'Merknad']
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
    .map((row): CellValue[] => [row.name, row.unit, row.active ? IN_USE : '', row.competence, row.assembly || null, row.dismantle || null, row.stage ? STAGE_NAMES[row.stage] : null])
  const articles = (kpi.excludedArticles ?? []).map((article): CellValue[] => [article.articleNo, article.note])
  return writeXlsx([
    { name: 'KPI', head: HEAD, rows },
    { name: ARTICLES, head: ARTICLE_HEAD, rows: articles },
  ])
}

/**
 * Reads a KPI file: one the app has written, or `Kpier.xlsx`. A file with an «I bruk» column says which unit of a
 * product type is in use. Without the column, a product type with one unit is counted in it, and one with several
 * is left without a unit in use, for the planner to choose.
 */
export const readKpiWorkbook = (bytes: Uint8Array): KpiFile => {
  const sheets = [...readXlsx(bytes).values()]
  const table = readKpiTable(sheets)
  const excludedArticles = readArticles(sheets)
  return excludedArticles ? { ...table, excludedArticles } : table
}

/** The article numbers left out, from the sheet the app writes them in; undefined where the file has none. */
const readArticles = (sheets: Sheet[]): ExcludedArticle[] | undefined =>
  firstSheetWith(sheets, ARTICLE_HEAD, (sheet, header) => {
    const get = (row: number, name: string) => text(cell(sheet, row, column(header, name)))
    return dataRows(sheet, header.row)
      .map((row) => ({ articleNo: get(row, 'art.nr'), note: get(row, 'merknad') }))
      .filter((article) => article.articleNo)
  }) ?? undefined

const readKpiTable = (sheets: Sheet[]): KpiFile => {
  const found = firstSheetWith(sheets, [NAMES.productType, 'enhet', 'montering', 'demontering'], (sheet, header): KpiFile | null => {
    const columns = { productType: column(header, NAMES.productType), unit: column(header, 'enhet'), inUse: column(header, 'i bruk'), competence: column(header, NAMES.competence), assembly: column(header, 'montering'), dismantle: column(header, 'demontering'), stage: column(header, 'trinn') }
    const rates: KpiRate[] = []
    const types = new Map<string, WorkTypeRule & { units: Set<string>; marked: string }>()
    for (const row of dataRows(sheet, header.row)) {
      const get = (col: number | undefined) => cell(sheet, row, col)
      const written = text(get(columns.productType))
      // `Kpier.xlsx` names a product type as Visma does, «14 [FOGA-vegger]»; a file the app has written has the name.
      const name = vismaProductType(written) || productTypeName(written)
      if (!name) continue
      const unit = text(get(columns.unit))
      const type = types.get(productTypeKey(name)) ?? { productType: name, unit: '', competence: '', units: new Set<string>(), marked: '' }
      type.competence ||= text(get(columns.competence))
      type.stage ||= stageByName(text(get(columns.stage)))
      types.set(productTypeKey(name), type)
      // A row without a unit names the product type only: a rate cannot be without a unit.
      if (!unit) continue
      rates.push({ name, unit, assembly: num(get(columns.assembly)) ?? 0, dismantle: num(get(columns.dismantle)) ?? 0 })
      type.units.add(unit.toLowerCase())
      type.unit ||= unit
      if (isMarked(get(columns.inUse))) type.marked ||= unit
    }
    if (!types.size) return null
    const workTypes = [...types.values()].map(({ units, marked, stage, ...rule }): WorkTypeRule => ({ ...rule, ...(stage ? { stage } : {}), unit: marked || (units.size > 1 ? '' : rule.unit) }))
    return { workTypes, rates, unitsInUse: columns.inUse !== undefined }
  })
  if (!found) throw new FileFormatError('Fant ingen KPI-tabell. Filen må ha kolonnene «Produkttype», «Enhet», «Montering» og «Demontering».')
  return found
}
