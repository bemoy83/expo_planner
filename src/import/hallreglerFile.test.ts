import { describe, expect, it } from 'vitest'
import { diffHallSetup, mergeHallSetup, replaceHallSetup, withAlias, type HallSetup } from '../domain/locations'
import { HallreglerFormatError, readHallreglerWorkbook, writeHallreglerWorkbook } from './hallreglerFile'
import { cellAt, dataRows, readXlsx, writeXlsx } from './xlsx'

const setup: HallSetup = {
  rules: {
    places: [{ name: 'B', halls: ['B1', 'B2'] }, { name: 'Nordfløy', halls: ['C', 'E'], collects: false }],
    phrases: [{ text: 'scene', hall: 'C' }, { text: 'øst', hall: 'Nordfløy' }],
    seeded: true,
    lettersSeeded: true,
  },
  aliases: withAlias(withAlias({}, 'a', 'A1'), 'Inng øst', 'E', '26100'),
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
    expect(read.rules.places).toEqual([{ name: 'B', halls: ['B1', 'B2'] }, { name: 'Nordfløy', halls: ['C', 'E'], collects: false }])
    expect(read.rules.phrases).toEqual(setup.rules.phrases)
    expect(read.aliases).toEqual(setup.aliases)
    expect(diffHallSetup(setup, read)).toEqual({ places: { added: 0, changed: 0, unchanged: 2, onlyInApp: 0 }, phrases: { added: 0, changed: 0, unchanged: 2, onlyInApp: 0 }, choices: { added: 0, changed: 0, unchanged: 2, onlyInApp: 0 } })
  })

  it('reads a file with one of the sheets, and says what a file must hold when it has none', () => {
    const onlyPlaces = readHallreglerWorkbook(writeXlsx([{ name: 'Ark1', head: ['Sted', 'Står for'], rows: [['Vest', 'D1; D2'], ['', 'C']] }]))
    expect(onlyPlaces).toEqual({ rules: { places: [{ name: 'Vest', halls: ['D1', 'D2'] }], phrases: [] }, aliases: {} })
    expect(() => readHallreglerWorkbook(writeXlsx([{ name: 'Ark1', head: ['Navn', 'Aktiv'], rows: [['Anna', 'Ja']] }]))).toThrow(HallreglerFormatError)
  })

  it('merges a file into the setup: the file wins, what only the app has is kept, and the file\'s word rules come first', () => {
    const file: HallSetup = { rules: { places: [{ name: 'b', halls: ['B1', 'B2', 'B3'] }, { name: 'Vest', halls: ['D1'] }], phrases: [{ text: 'Øst', hall: 'E' }, { text: 'kafé', hall: 'C' }] }, aliases: { a: 'A1', bakrom: 'C' } }
    expect(diffHallSetup(setup, file)).toEqual({ places: { added: 1, changed: 1, unchanged: 0, onlyInApp: 1 }, phrases: { added: 1, changed: 1, unchanged: 0, onlyInApp: 1 }, choices: { added: 1, changed: 0, unchanged: 1, onlyInApp: 1 } })
    const merged = mergeHallSetup(setup, file)
    expect(merged.rules.places.map((place) => [place.name, place.halls.length])).toEqual([['b', 3], ['Nordfløy', 2], ['Vest', 1]])
    expect(merged.rules.phrases.map((phrase) => phrase.text)).toEqual(['Øst', 'kafé', 'scene'])
    expect(Object.keys(merged.aliases).sort()).toEqual(['26100\tinng øst', 'a', 'bakrom'])
    // Replaced, the setup is the file's, and no examples are put in beside it.
    expect(replaceHallSetup(file)).toEqual({ rules: { ...file.rules, seeded: true, lettersSeeded: true }, aliases: file.aliases })
  })
})
