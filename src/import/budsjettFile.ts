import type { BudgetEntry } from '../domain/result'
import { dataRows, findHeader, num, readXlsx, text, writeXlsx, type CellValue } from './xlsx'

/**
 * The budgets of Resultat as a file: what «Eksporter» writes and «Importer fra fil» reads. A row per project with its
 * budget of work hours, overhead included. The budget workbook («Budsjett arbeidstimer Production.xlsx») has the same
 * two columns among its others, so it is read as it is.
 */

export class BudsjettFormatError extends Error {}

const NUMBER = 'Prosjektnr.'
const NAME = 'Prosjekt'
const HOURS = 'Budsjett arbeidstimer totalt'

const NUMBER_NAMES = ['prosjektnr.', 'prosjektnr', 'prosjektnummer']

/** The budgets as a workbook, by number, with the name of each project for the planner's own reading. */
export const writeBudsjettWorkbook = (entries: (BudgetEntry & { name: string })[]): Uint8Array => {
  const rows = [...entries].sort((a, b) => a.projectNo.localeCompare(b.projectNo, 'nb', { numeric: true })).map((entry): CellValue[] => [entry.projectNo, entry.name, entry.hours])
  return writeXlsx([{ name: 'Budsjett', head: [NUMBER, NAME, HOURS], rows }])
}

/**
 * Reads a file of budgets: the columns «Prosjektnr.» and «Budsjett arbeidstimer totalt». A project without hours, or
 * with nought, has no budget; one on several rows has the sum of them.
 */
export const readBudsjettWorkbook = (bytes: Uint8Array): BudgetEntry[] => {
  for (const sheet of readXlsx(bytes).values()) {
    const header = NUMBER_NAMES.map((name) => findHeader(sheet, [name, HOURS.toLowerCase()])).find(Boolean)
    if (!header) continue
    const number = NUMBER_NAMES.map((name) => header.columns.get(name)).find((col) => col !== undefined)!
    const hours = header.columns.get(HOURS.toLowerCase())!
    const sums = new Map<string, BudgetEntry>()
    for (const row of dataRows(sheet, header.row)) {
      const projectNo = text(sheet.rows.get(row)?.get(number) ?? null)
      const value = num(sheet.rows.get(row)?.get(hours) ?? null)
      if (!projectNo || !value || value < 0) continue
      const entry = sums.get(projectNo.toLowerCase())
      if (entry) entry.hours += value
      else sums.set(projectNo.toLowerCase(), { projectNo, hours: value })
    }
    if (sums.size) return [...sums.values()]
  }
  throw new BudsjettFormatError('Fant ingen budsjetter. Filen må ha kolonnene «Prosjektnr.» og «Budsjett arbeidstimer totalt».')
}
