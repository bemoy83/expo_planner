import { describe, expect, it } from 'vitest'
import { readProsjekterWorkbook, writeProsjekterWorkbook } from './prosjekterFile'
import { cellAt, dataRows, FileFormatError, readXlsx, writeXlsx } from './xlsx'

const projects = [
  { name: 'VVS 2026', projectNo: '26970' },
  { name: 'Oslo Motor Show', projectNo: '27400' },
  { name: 'VVS DAGENE 2026', projectNo: '26970' },
  { name: 'Hage', projectNo: '25HAG', year: '2026' },
]

describe('the Prosjekter file', () => {
  it('has a row per name, the latest year first and the names of a project together', () => {
    const sheet = readXlsx(writeProsjekterWorkbook(projects)).get('Prosjekter')!
    expect(dataRows(sheet, 0).map((row) => [0, 1, 2].map((col) => cellAt(sheet, row, col)))).toEqual([
      ['Prosjektnr.', 'År', 'Navn'],
      ['27400', 2027, 'Oslo Motor Show'],
      ['25HAG', 2026, 'Hage'],
      ['26970', 2026, 'VVS 2026'],
      ['26970', 2026, 'VVS DAGENE 2026'],
    ])
  })

  it('is read back as the table it was written from', () => {
    const read = readProsjekterWorkbook(writeProsjekterWorkbook(projects))
    expect(read).toHaveLength(4)
    expect(read).toEqual(expect.arrayContaining(projects))
  })

  it('reads a file without a year: the name is for the year of its number', () => {
    const file = writeXlsx([{ name: 'Ark1', head: ['Navn', 'Prosjektnr.'], rows: [['VVS 2026', 26970], ['Uten nummer', null], ['Hage', '26HAG']] }])
    expect(readProsjekterWorkbook(file)).toEqual([{ name: 'VVS 2026', projectNo: '26970' }, { name: 'Hage', projectNo: '26HAG' }])
  })

  it('says what a file must hold when it is something else', () => {
    expect(() => readProsjekterWorkbook(writeXlsx([{ name: 'Ark1', head: ['Navn', 'Aktiv'], rows: [['Anna', 'Ja']] }]))).toThrow(FileFormatError)
  })
})
