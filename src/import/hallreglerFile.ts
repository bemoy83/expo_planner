import { aliasKey, hallChoices, type HallSetup } from '../domain/locations'
import type { HallRules } from '../domain/types'
import { dataRows, findHeader, isMarked, readXlsx, text, writeXlsx, type Sheet } from './xlsx'

/**
 * The hall rules as a file: what «Eksporter» on Hallregler writes and «Importer fra fil» reads. A sheet for each of
 * the three lists: the places with their halls, the word rules in the order they are tried, and the choices for texts.
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
const YES = 'Ja'
const NO = 'Nei'

/** The setup as a workbook. A choice for every project has no project number. */
export const writeHallreglerWorkbook = ({ rules, aliases }: HallSetup): Uint8Array =>
  writeXlsx([
    { name: 'Steder', head: [PLACE, HALLS, COLLECTS], rows: rules.places.map((place) => [place.name, place.halls.join(', '), place.collects === false ? NO : YES]) },
    { name: 'Ord', head: [NUMBER, WORDS, COUNTS], rows: rules.phrases.map((phrase, index) => [index + 1, phrase.text, phrase.hall]) },
    { name: 'Valg', head: [TEXT, PROJECT, COUNTS], rows: hallChoices(aliases).map((choice) => [choice.text, choice.projectNo ?? '', choice.hall]) },
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
 * Reads a file of hall rules: the sheets it has of the three, found by their headings. Places are «Sted» and «Står
 * for», the halls with commas between; word rules «Inneholder» and «Teller under», in the order of the rows; choices
 * «Hall/sted» and «Teller under», with «Prosjektnr.» where the choice is for one project. A place with an empty
 * «Samler hallene» collects its halls.
 */
export const readHallreglerWorkbook = (bytes: Uint8Array): HallSetup => {
  const sheets = [...readXlsx(bytes).values()]
  const places = rowsWith(sheets, [PLACE, HALLS])
  const phrases = rowsWith(sheets, [WORDS, COUNTS])
  const choices = rowsWith(sheets, [TEXT, COUNTS])
  if (!places && !phrases && !choices) throw new HallreglerFormatError('Fant ingen hallregler. Filen må ha et ark med kolonnene «Sted» og «Står for», «Inneholder» og «Teller under», eller «Hall/sted» og «Teller under».')
  const rules: HallRules = {
    places: (places ?? [])
      .filter((get) => get(PLACE))
      .map((get) => {
        const halls = get(HALLS).split(/[,;]+/).map((hall) => hall.trim()).filter(Boolean)
        return { name: get(PLACE), halls, ...(get(COLLECTS) && !isMarked(get(COLLECTS)) ? { collects: false } : {}) }
      }),
    phrases: (phrases ?? []).filter((get) => get(WORDS) && get(COUNTS)).map((get) => ({ text: get(WORDS), hall: get(COUNTS) })),
  }
  const aliases = Object.fromEntries((choices ?? []).filter((get) => get(TEXT) && get(COUNTS)).map((get) => [aliasKey(get(TEXT), get(PROJECT) || undefined), get(COUNTS)]))
  return { rules, aliases }
}
