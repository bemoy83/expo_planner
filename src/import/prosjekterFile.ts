import { numberYear, projectRef, refYear } from '../domain/projects'
import type { ProjectRef } from '../domain/types'
import { dataRows, findHeader, readXlsx, text, writeXlsx, type CellValue } from './xlsx'

/**
 * The project table as a file: what «Eksporter» on Prosjekter writes and «Importer fra fil» reads. A row per name a
 * project goes by, so a project with three names has three rows with the same number.
 */

export class ProsjekterFormatError extends Error {}

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
  for (const sheet of readXlsx(bytes).values()) {
    const header = NUMBER_NAMES.map((name) => findHeader(sheet, [name, NAME.toLowerCase()])).find(Boolean)
    if (!header) continue
    const number = NUMBER_NAMES.map((name) => header.columns.get(name)).find((col) => col !== undefined)!
    const name = header.columns.get(NAME.toLowerCase())!
    const year = header.columns.get(YEAR.toLowerCase())
    const projects = dataRows(sheet, header.row).flatMap((row): ProjectRef[] => {
      const get = (col: number | undefined) => (col === undefined ? null : (sheet.rows.get(row)?.get(col) ?? null))
      const projectNo = text(get(number))
      if (!projectNo || !text(get(name))) return []
      const of = /^\d{4}$/.test(text(get(year))) ? text(get(year)) : numberYear(projectNo)
      return [projectRef(text(get(name)), projectNo, of)]
    })
    if (projects.length) return projects
  }
  throw new ProsjekterFormatError('Fant ingen prosjekter. Filen må ha kolonnene «Prosjektnr.» og «Navn».')
}
