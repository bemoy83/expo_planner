import { choiceKey, hallChoices } from '../domain/locations'
import type { HallRules } from '../domain/types'
import { dataRows, findHeader, isMarked, readXlsx, text, writeXlsx, type Sheet } from './xlsx'

/**
 * The hall rules as a file: what «Eksporter» on Hallregler writes and «Importer fra fil» reads. A sheet for each of
 * the four lists: the places with their halls, the word rules in the order they are tried, the choices for texts, and
 * the areas with their halls.
 */

export class HallreglerFormatError extends Error {}

const PLACE = 'Sted'
const HALLS = 'Står for'
const COLLECTS = 'Samler hallene'
const NUMBER = 'Nr.'
const WORDS = 'Inneholder'
const COUNTS = 'Teller under'
const TEXT = 'Hall/sted'
const PROJECT = 'Prosjektnr.'
const AREA = 'Område'
const AREA_HALLS = 'Haller'
const YES = 'Ja'
const NO = 'Nei'
/** How a choice for lines without a Hall/Sted is written, since an empty cell reads as no row. */
const BLANK = '(tom)'

/** The setup as a workbook. A choice for every project has no project number. */
export const writeHallreglerWorkbook = (rules: HallRules): Uint8Array =>
  writeXlsx([
    { name: 'Steder', head: [PLACE, HALLS, COLLECTS], rows: rules.places.map((place) => [place.name, place.halls.join(', '), place.collects === false ? NO : YES]) },
    { name: 'Ord', head: [NUMBER, WORDS, COUNTS], rows: rules.phrases.map((phrase, index) => [index + 1, phrase.text, phrase.hall]) },
    { name: 'Valg', head: [TEXT, PROJECT, COUNTS], rows: hallChoices(rules.choices).map((choice) => [choice.text || BLANK, choice.projectNo ?? '', choice.hall]) },
    { name: 'Områder', head: [AREA, AREA_HALLS], rows: (rules.areas ?? []).map((area) => [area.name, area.halls.join(', ')]) },
  ])

/** The rows of the first sheet that has the headings, each as a function from a heading to its text. */
const rowsWith = (sheets: Sheet[], required: string[]): ((name: string) => string)[] | null => {
  for (const sheet of sheets) {
    const header = findHeader(sheet, required.map((name) => name.toLowerCase()))
    if (!header) continue
    return dataRows(sheet, header.row).map((row) => (name: string) => {
      const col = header.columns.get(name.toLowerCase())
      return col === undefined ? '' : text(sheet.rows.get(row)?.get(col) ?? null)
    })
  }
  return null
}

/**
 * Reads a file of hall rules: the sheets it has of the four, found by their headings. Places are «Sted» and «Står
 * for», the halls with commas between; word rules «Inneholder» and «Teller under», in the order of the rows; choices
 * «Hall/sted» and «Teller under», with «Prosjektnr.» where the choice is for one project. A place with an empty
 * «Samler hallene» collects its halls. Areas are «Område» and «Haller»; a file without that sheet says nothing of areas.
 */
export const readHallreglerWorkbook = (bytes: Uint8Array): HallRules => {
  const sheets = [...readXlsx(bytes).values()]
  const places = rowsWith(sheets, [PLACE, HALLS])
  const phrases = rowsWith(sheets, [WORDS, COUNTS])
  const choices = rowsWith(sheets, [TEXT, COUNTS])
  const areas = rowsWith(sheets, [AREA, AREA_HALLS])
  if (!places && !phrases && !choices && !areas) throw new HallreglerFormatError('Fant ingen hallregler. Filen må ha et ark med kolonnene «Sted» og «Står for», «Inneholder» og «Teller under», «Hall/sted» og «Teller under», eller «Område» og «Haller».')
  const hallList = (cell: string) => cell.split(/[,;]+/).map((hall) => hall.trim()).filter(Boolean)
  return {
    places: (places ?? [])
      .filter((get) => get(PLACE))
      .map((get) => {
        return { name: get(PLACE), halls: hallList(get(HALLS)), ...(get(COLLECTS) && !isMarked(get(COLLECTS)) ? { collects: false } : {}) }
      }),
    phrases: (phrases ?? []).filter((get) => get(WORDS) && get(COUNTS)).map((get) => ({ text: get(WORDS), hall: get(COUNTS) })),
    choices: Object.fromEntries((choices ?? []).filter((get) => get(TEXT) && get(COUNTS)).map((get) => [choiceKey(get(TEXT) === BLANK ? '' : get(TEXT), get(PROJECT) || undefined), get(COUNTS)])),
    ...(areas ? { areas: areas.filter((get) => get(AREA)).map((get) => ({ name: get(AREA), halls: hallList(get(AREA_HALLS)) })) } : {}),
  }
}
