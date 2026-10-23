import type { BudgetEntry } from '../domain/result'
import { cell, column, dataRows, FileFormatError, firstSheetWith, num, readXlsx, text, writeXlsx, type CellValue } from './xlsx'

/**
 * The budgets of Resultat as a file: what «Eksporter» writes and «Importer fra fil» reads. A row per project with its
 * budget of work hours, overhead included. The budget workbook («Budsjett arbeidstimer Production.xlsx») has the same
 * two columns among its others, so it is read as it is.
 */

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
  const found = firstSheetWith(readXlsx(bytes).values(), [NUMBER_NAMES, HOURS], (sheet, header) => {
    const number = column(header, NUMBER_NAMES)
    const hours = column(header, HOURS)
    const sums = new Map<string, BudgetEntry>()
    for (const row of dataRows(sheet, header.row)) {
      const projectNo = text(cell(sheet, row, number))
      const value = num(cell(sheet, row, hours))
      if (!projectNo || !value || value < 0) continue
      const entry = sums.get(projectNo.toLowerCase())
      if (entry) entry.hours += value
      else sums.set(projectNo.toLowerCase(), { projectNo, hours: value })
    }
    return sums.size ? [...sums.values()] : null
  })
  if (!found) throw new FileFormatError('Fant ingen budsjetter. Filen må ha kolonnene «Prosjektnr.» og «Budsjett arbeidstimer totalt».')
  return found
}
