import { competenceStyles, type FileCompetence } from '../domain/competences'
import { LINE_COLORS, type LineColor, type Workspace } from '../domain/types'
import { cell, column, dataRows, FileFormatError, firstSheetWith, readXlsx, text, writeXlsx } from './xlsx'

/**
 * The competences as a file: what «Eksporter» on Kompetanser writes and «Importer fra fil» reads. A row per
 * competence in the planner's order, with its short name and colour.
 */

export const COLOR_NAMES: Record<LineColor, string> = {
  'line-blue': 'Blå',
  'line-teal': 'Turkis',
  'line-green': 'Grønn',
  'line-amber': 'Gul',
  'line-rose': 'Rød',
  'line-violet': 'Fiolett',
  'line-slate': 'Grå',
  'line-orange': 'Oransje',
}

const NAME = 'Kompetanse'
const SHORT = 'Kort'
const COLOR = 'Farge'

const colorOf = (name: string): LineColor | undefined => LINE_COLORS.find((color) => COLOR_NAMES[color].toLowerCase() === name.toLowerCase())

export const writeKompetanserWorkbook = (ws: Workspace): Uint8Array =>
  writeXlsx([{ name: 'Kompetanser', head: [NAME, SHORT, COLOR], rows: competenceStyles(ws).map((style) => [style.label, style.shortLabel, COLOR_NAMES[style.color]]) }])

/** Reads a file of competences: a «Kompetanse» column, and optionally «Kort» and «Farge». A colour the app does not have is left out. */
export const readKompetanserWorkbook = (bytes: Uint8Array): FileCompetence[] => {
  const found = firstSheetWith(readXlsx(bytes).values(), [NAME], (sheet, header) => {
    const get = (row: number, name: string) => text(cell(sheet, row, column(header, name)))
    const rows = dataRows(sheet, header.row)
      .filter((row) => get(row, NAME))
      .map((row): FileCompetence => ({ label: get(row, NAME), ...(get(row, SHORT) ? { shortLabel: get(row, SHORT) } : {}), ...(colorOf(get(row, COLOR)) ? { color: colorOf(get(row, COLOR)) } : {}) }))
    return rows.length ? rows : null
  })
  if (!found) throw new FileFormatError('Fant ingen kompetanser. Filen må ha en kolonne «Kompetanse».')
  return found
}
