import { numberYear, projectRef, refYear } from '../domain/projects'
import type { ProjectRef } from '../domain/types'
import { cell, column, dataRows, FileFormatError, firstSheetWith, readXlsx, text, writeXlsx, type CellValue } from './xlsx'

/**
 * The project table as a file: what «Eksporter» on Prosjekter writes and «Importer fra fil» reads. A row per name a
 * project goes by, so a project with three names has three rows with the same number.
 */

const NUMBER = 'Prosjektnr.'
const YEAR = 'År'
const NAME = 'Navn'

/** The headings a file may have for the number; `Prosjekt.xlsx` has the first. */
const NUMBER_NAMES = ['prosjektnr.', 'prosjektnr', 'prosjektnummer']

/** The table as a workbook, the latest year first, the names of a project together. */
export const writeProsjekterWorkbook = (projects: ProjectRef[]): Uint8Array => {
  const rows = [...projects]
    .sort((a, b) => refYear(b).localeCompare(refYear(a)) || a.projectNo.localeCompare(b.projectNo, 'nb'))
    .map((ref): CellValue[] => [ref.projectNo, refYear(ref) ? Number(refYear(ref)) : null, ref.name])
  return writeXlsx([{ name: 'Prosjekter', head: [NUMBER, YEAR, NAME], rows }])
}

/**
 * Reads a file of projects: the columns «Prosjektnr.» and «Navn», and optionally «År». Without a year, a name
 * is for the year its number begins with, as in `Prosjekt.xlsx`.
 */
export const readProsjekterWorkbook = (bytes: Uint8Array): ProjectRef[] => {
  const found = firstSheetWith(readXlsx(bytes).values(), [NUMBER_NAMES, NAME], (sheet, header) => {
    const number = column(header, NUMBER_NAMES)
    const name = column(header, NAME)
    const year = column(header, YEAR)
    const projects = dataRows(sheet, header.row).flatMap((row): ProjectRef[] => {
      const get = (col: number | undefined) => cell(sheet, row, col)
      const projectNo = text(get(number))
      if (!projectNo || !text(get(name))) return []
      const of = /^\d{4}$/.test(text(get(year))) ? text(get(year)) : numberYear(projectNo)
      return [projectRef(text(get(name)), projectNo, of)]
    })
    return projects.length ? projects : null
  })
  if (!found) throw new FileFormatError('Fant ingen prosjekter. Filen må ha kolonnene «Prosjektnr.» og «Navn».')
  return found
}
