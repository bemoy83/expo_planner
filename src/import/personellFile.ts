import { competenceStyles, type FilePerson } from '../domain/competences'
import type { Workspace } from '../domain/types'
import { cell, column, dataRows, FileFormatError, firstSheetWith, isMarked, readXlsx, text, writeXlsx, type CellValue } from './xlsx'

/**
 * The permanent staff as a file: what «Eksporter» on Personell writes and «Importer fra fil» reads. A row per person
 * and a column per competence, marked where the person has it. People are told apart by their names.
 */

const NAME = 'Navn'
const NOTE = 'Notat'
const MARK = 'x'
/** Headings only a file of suppliers has: such a file read here would make its rate and its shifts competences of people. */
const SUPPLIER_HEADINGS = ['kontakt', 'kr per time']

/** The staff as a workbook, with a column for every competence, in the planner's order. */
export const writePersonellWorkbook = (ws: Workspace): Uint8Array => {
  const styles = competenceStyles(ws)
  const rows = (ws.persons ?? []).map((person): CellValue[] => [person.name, person.note ?? '', ...styles.map((style) => (person.competences.includes(style.key) ? MARK : ''))])
  return writeXlsx([{ name: 'Personell', head: [NAME, NOTE, ...styles.map((style) => style.label)], rows }])
}

/**
 * Reads a file of people: a «Navn» column, and optionally «Notat». Every other column with a heading
 * is a competence, held by the people whose cell is marked.
 */
export const readPersonellWorkbook = (bytes: Uint8Array): FilePerson[] => {
  const found = firstSheetWith(readXlsx(bytes).values(), [NAME], (sheet, header) => {
    if (SUPPLIER_HEADINGS.some((heading) => header.columns.has(heading))) throw new FileFormatError('Dette er en fil med leverandører. Les den inn på Mannskap › Innleid.')
    const name = column(header, NAME)
    const note = column(header, NOTE)
    // The headings as they are spelled in the file name the competences.
    const competences = [...sheet.rows.get(header.row)!].filter(([col, value]) => ![name, note].includes(col) && text(value)).map(([col, value]) => ({ col, label: text(value) }))
    const people = dataRows(sheet, header.row).flatMap((row): FilePerson[] => {
      const get = (col: number | undefined) => cell(sheet, row, col)
      if (!text(get(name))) return []
      return [
        {
          name: text(get(name)),
          ...(note === undefined ? {} : { note: text(get(note)) }),
          competences: Object.fromEntries(competences.map(({ col, label }) => [label, isMarked(get(col))])),
        },
      ]
    })
    return people.length ? people : null
  })
  if (!found) throw new FileFormatError('Fant ingen personer. Filen må ha en kolonne «Navn», og en kolonne per kompetanse.')
  return found
}
