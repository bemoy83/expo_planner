import { competenceStyles, type FileCompetence } from '../domain/competences'
import { parseDecimal } from '../domain/numbers'
import { LINE_COLORS, STAGES, type LineColor, type Stage, type Workspace } from '../domain/types'
import { cell, column, dataRows, FileFormatError, firstSheetWith, readXlsx, text, writeXlsx } from './xlsx'

/**
 * The competences as a file: what «Eksporter» on Kompetanser writes and «Importer fra fil» reads. A row per
 * competence in the planner's order, with its short name and colour, and what the planning engine knows of it.
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

export const STAGE_NAMES: Record<Stage, string> = {
  oppmerking: 'Oppmerking',
  gulv: 'Gulv',
  standbygging: 'Standbygging',
  tilvalg: 'Tilvalg',
  losore: 'Løsøre',
  lopende: 'Løpende',
  ekstra: 'Ekstra',
}

const NAME = 'Kompetanse'
const SHORT = 'Kort'
const COLOR = 'Farge'
const STAGE = 'Trinn'
const NEXT = 'Går videre til'
const MIN = 'Minst per hall'

const colorOf = (name: string): LineColor | undefined => LINE_COLORS.find((color) => COLOR_NAMES[color].toLowerCase() === name.toLowerCase())
/** A stage by its name, in any case; none for a name the app does not have. */
export const stageByName = (name: string): Stage | undefined => STAGES.find((stage) => STAGE_NAMES[stage].toLowerCase() === name.trim().toLowerCase())

export const writeKompetanserWorkbook = (ws: Workspace): Uint8Array => {
  const styles = competenceStyles(ws)
  const label = new Map(styles.map((style) => [style.key, style.label]))
  return writeXlsx([
    {
      name: 'Kompetanser',
      head: [NAME, SHORT, COLOR, STAGE, NEXT, MIN],
      rows: styles.map((style) => [style.label, style.shortLabel, COLOR_NAMES[style.color], style.stage ? STAGE_NAMES[style.stage] : '', (style.next && label.get(style.next)) ?? '', style.minPerHall ?? '']),
    },
  ])
}

/**
 * Reads a file of competences: a «Kompetanse» column, and optionally «Kort», «Farge», «Trinn», «Går videre til» and «Minst per hall».
 * A colour or a stage the app does not have, and a number that cannot be read, are left out.
 */
export const readKompetanserWorkbook = (bytes: Uint8Array): FileCompetence[] => {
  const found = firstSheetWith(readXlsx(bytes).values(), [NAME], (sheet, header) => {
    const get = (row: number, name: string) => text(cell(sheet, row, column(header, name)))
    const rows = dataRows(sheet, header.row)
      .filter((row) => get(row, NAME))
      .map((row): FileCompetence => {
        const min = parseDecimal(get(row, MIN))
        return {
          label: get(row, NAME),
          ...(get(row, SHORT) ? { shortLabel: get(row, SHORT) } : {}),
          ...(colorOf(get(row, COLOR)) ? { color: colorOf(get(row, COLOR)) } : {}),
          ...(stageByName(get(row, STAGE)) ? { stage: stageByName(get(row, STAGE)) } : {}),
          ...(get(row, NEXT) ? { next: get(row, NEXT) } : {}),
          ...(min && min > 0 ? { minPerHall: Math.round(min) } : {}),
        }
      })
    return rows.length ? rows : null
  })
  if (!found) throw new FileFormatError('Fant ingen kompetanser. Filen må ha en kolonne «Kompetanse».')
  return found
}
