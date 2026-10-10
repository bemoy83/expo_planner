import { competenceStyles, type FilePerson } from '../domain/competences'
import type { Workspace } from '../domain/types'
import { dataRows, findHeader, isMarked, readXlsx, text, writeXlsx, type CellValue } from './xlsx'

/**
 * The permanent staff as a file: what «Eksporter» on Personell writes and «Importer fra fil» reads. A row per person
 * and a column per competence, marked where the person has it. People are told apart by their names.
 */

export class PersonellFormatError extends Error {}

const NAME = 'Navn'
const ACTIVE = 'Aktiv'
const NOTE = 'Notat'
const MARK = 'x'
const YES = 'Ja'
const NO = 'Nei'

/** The staff as a workbook, with a column for every competence, in the planner's order. */
export const writePersonellWorkbook = (ws: Workspace): Uint8Array => {
  const styles = competenceStyles(ws)
  const rows = (ws.persons ?? []).map((person): CellValue[] => [person.name, person.active ? YES : NO, person.note ?? '', ...styles.map((style) => (person.competences.includes(style.key) ? MARK : ''))])
  return writeXlsx([{ name: 'Personell', head: [NAME, ACTIVE, NOTE, ...styles.map((style) => style.label)], rows }])
}

/**
 * Reads a file of people: a «Navn» column, and optionally «Aktiv» and «Notat». Every other column with a heading
 * is a competence, held by the people whose cell is marked. A person with an empty «Aktiv» is active.
 */
export const readPersonellWorkbook = (bytes: Uint8Array): FilePerson[] => {
  for (const sheet of readXlsx(bytes).values()) {
    const header = findHeader(sheet, [NAME.toLowerCase()])
    if (!header) continue
    const name = header.columns.get(NAME.toLowerCase())!
    const active = header.columns.get(ACTIVE.toLowerCase())
    const note = header.columns.get(NOTE.toLowerCase())
    // The headings as they are spelled in the file name the competences.
    const competences = [...sheet.rows.get(header.row)!].filter(([col, value]) => ![name, active, note].includes(col) && text(value)).map(([col, value]) => ({ col, label: text(value) }))
    const people = dataRows(sheet, header.row).flatMap((row): FilePerson[] => {
      const get = (col: number | undefined) => (col === undefined ? null : (sheet.rows.get(row)?.get(col) ?? null))
      if (!text(get(name))) return []
      return [
        {
          name: text(get(name)),
          ...(active === undefined ? {} : { active: text(get(active)) === '' || isMarked(get(active)) }),
          ...(note === undefined ? {} : { note: text(get(note)) }),
          competences: Object.fromEntries(competences.map(({ col, label }) => [label, isMarked(get(col))])),
        },
      ]
    })
    if (people.length) return people
  }
  throw new PersonellFormatError('Fant ingen personer. Filen må ha en kolonne «Navn», og en kolonne per kompetanse.')
}
