import { describe, expect, it } from 'vitest'
import { diffHallRules, mergeHallRules, NO_HALL_RULES, withChoice } from '../domain/locations'
import type { HallRules } from '../domain/types'
import { HallreglerFormatError, readHallreglerWorkbook, writeHallreglerWorkbook } from './hallreglerFile'
import { cellAt, dataRows, readXlsx, writeXlsx } from './xlsx'

const setup: HallRules = {
  places: [{ name: 'B', halls: ['B1', 'B2'] }, { name: 'Nordfløy', halls: ['C', 'E'], collects: false }],
  phrases: [{ text: 'scene', hall: 'C' }, { text: 'øst', hall: 'Nordfløy' }],
  choices: withChoice(withChoice(NO_HALL_RULES, 'a', 'A1'), 'Inng øst', 'E', '26100').choices,
}

describe('the Hallregler file', () => {
  it('has a sheet for the places, the word rules in their order, and the choices', () => {
    const sheets = readXlsx(writeHallreglerWorkbook(setup))
    const rows = (name: string) => dataRows(sheets.get(name)!, 0).map((row) => [0, 1, 2].map((col) => cellAt(sheets.get(name)!, row, col)))
    expect(rows('Steder')).toEqual([['Sted', 'Står for', 'Samler hallene'], ['B', 'B1, B2', 'Ja'], ['Nordfløy', 'C, E', 'Nei']])
    expect(rows('Ord')).toEqual([['Nr.', 'Inneholder', 'Teller under'], [1, 'scene', 'C'], [2, 'øst', 'Nordfløy']])
    expect(rows('Valg')).toEqual([['Hall/sted', 'Prosjektnr.', 'Teller under'], ['a', null, 'A1'], ['inng øst', '26100', 'E']])
  })

  it('is read back as the setup it was written from', () => {
    const read = readHallreglerWorkbook(writeHallreglerWorkbook(setup))
    expect(read).toEqual(setup)
    expect(diffHallRules(setup, read)).toEqual({ places: { added: 0, changed: 0, unchanged: 2, onlyInApp: 0 }, phrases: { added: 0, changed: 0, unchanged: 2, onlyInApp: 0 }, choices: { added: 0, changed: 0, unchanged: 2, onlyInApp: 0 } })
  })

  it('keeps a choice for lines without a Hall/Sted through the file', () => {
    const blank = withChoice({ ...setup, choices: {} }, '', 'C', '26100')
    expect(readHallreglerWorkbook(writeHallreglerWorkbook(blank)).choices).toEqual(blank.choices)
  })

  it('reads a file with one of the sheets, and says what a file must hold when it has none', () => {
    const onlyPlaces = readHallreglerWorkbook(writeXlsx([{ name: 'Ark1', head: ['Sted', 'Står for'], rows: [['Vest', 'D1; D2'], ['', 'C']] }]))
    expect(onlyPlaces).toEqual({ places: [{ name: 'Vest', halls: ['D1', 'D2'] }], phrases: [], choices: {} })
    expect(() => readHallreglerWorkbook(writeXlsx([{ name: 'Ark1', head: ['Navn', 'Aktiv'], rows: [['Anna', 'Ja']] }]))).toThrow(HallreglerFormatError)
  })

  it('merges a file into the setup: the file wins, what only the app has is kept, and the file\'s word rules come first', () => {
    const file: HallRules = { places: [{ name: 'b', halls: ['B1', 'B2', 'B3'] }, { name: 'Vest', halls: ['D1'] }], phrases: [{ text: 'Øst', hall: 'E' }, { text: 'kafé', hall: 'C' }], choices: { a: 'A1', bakrom: 'C' } }
    expect(diffHallRules(setup, file)).toEqual({ places: { added: 1, changed: 1, unchanged: 0, onlyInApp: 1 }, phrases: { added: 1, changed: 1, unchanged: 0, onlyInApp: 1 }, choices: { added: 1, changed: 0, unchanged: 1, onlyInApp: 1 } })
    const merged = mergeHallRules(setup, file)
    expect(merged.places.map((place) => [place.name, place.halls.length])).toEqual([['b', 3], ['Nordfløy', 2], ['Vest', 1]])
    expect(merged.phrases.map((phrase) => phrase.text)).toEqual(['Øst', 'kafé', 'scene'])
    expect(Object.keys(merged.choices).sort()).toEqual(['26100\tinng øst', 'a', 'bakrom'])
  })
})
