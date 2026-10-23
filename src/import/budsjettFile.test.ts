import { describe, expect, it } from 'vitest'
import { readBudsjettWorkbook, writeBudsjettWorkbook } from './budsjettFile'
import { cellAt, dataRows, FileFormatError, readXlsx, writeXlsx } from './xlsx'

const entries = [
  { projectNo: '26970', name: 'VVS 2026', hours: 480 },
  { projectNo: '26100', name: 'Hage 2026', hours: 120.5 },
]

describe('the Budsjett file', () => {
  it('has a row per project, by number', () => {
    const sheet = readXlsx(writeBudsjettWorkbook(entries)).get('Budsjett')!
    expect(dataRows(sheet, 0).map((row) => [0, 1, 2].map((col) => cellAt(sheet, row, col)))).toEqual([
      ['Prosjektnr.', 'Prosjekt', 'Budsjett arbeidstimer totalt'],
      ['26100', 'Hage 2026', 120.5],
      ['26970', 'VVS 2026', 480],
    ])
  })

  it('is read back as the budgets it was written from', () => {
    expect(readBudsjettWorkbook(writeBudsjettWorkbook(entries))).toEqual(expect.arrayContaining(entries.map(({ projectNo, hours }) => ({ projectNo, hours }))))
  })

  it('reads the two columns among others, leaves out projects without hours and sums a project on several rows', () => {
    const file = writeXlsx([
      {
        name: 'Ark1',
        head: ['Prosjekt/event', 'Prosjektnr.', 'Budsjett arbeidstimer totalt', 'Budsjett montering'],
        rows: [
          ['VVS 2026', 26970, 400, 200],
          ['VVS 2026 tillegg', 26970, 80, 40],
          ['Hage 2026', 26100, 0, 0],
          ['Uten nummer', null, 50, 25],
        ],
      },
    ])
    expect(readBudsjettWorkbook(file)).toEqual([{ projectNo: '26970', hours: 480 }])
  })

  it('says what a file must hold when it is something else', () => {
    expect(() => readBudsjettWorkbook(writeXlsx([{ name: 'Ark1', head: ['Navn', 'Aktiv'], rows: [['Anna', 'Ja']] }]))).toThrow(FileFormatError)
  })
})
