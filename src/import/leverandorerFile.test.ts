import { describe, expect, it } from 'vitest'
import { diffSuppliers, mergeSuppliers } from '../domain/suppliers'
import { DEFAULT_SETTINGS, type Workspace } from '../domain/types'
import { readLeverandorerWorkbook, writeLeverandorerWorkbook } from './leverandorerFile'
import { cellAt, dataRows, FileFormatError, readXlsx, writeXlsx } from './xlsx'

const ws: Workspace = {
  settings: DEFAULT_SETTINGS,
  venue: [],
  projects: [],
  demand: [],
  allocations: [],
  kpi: { workTypes: [{ productType: 'Vegg', unit: 'lm', competence: 'Vegger' }, { productType: 'Teppe', unit: 'm2', competence: 'Tepper' }], rates: [] },
  suppliers: [
    { id: 's1', name: 'Manpower', order: 0, competences: ['vegger', 'tepper'], shifts: ['dag', 'kveld', 'natt'], rate: 545, contact: 'Line', note: 'Fast avtale' },
    { id: 's2', name: 'StandBygg', order: 1, competences: ['vegger'], shifts: ['dag'] },
  ],
}

describe('the Leverandører file', () => {
  it('has a row per supplier, a column per shift and a column per competence', () => {
    const sheet = readXlsx(writeLeverandorerWorkbook(ws)).get('Leverandører')!
    expect(dataRows(sheet, 0).map((row) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((col) => cellAt(sheet, row, col)))).toEqual([
      ['Navn', 'Kontakt', 'Kr per time', 'Notat', 'Dag', 'Kveld', 'Natt', 'Tepper', 'Vegger'],
      ['Manpower', 'Line', 545, 'Fast avtale', 'x', 'x', 'x', 'x', 'x'],
      ['StandBygg', null, null, null, 'x', null, null, null, 'x'],
    ])
  })

  it('is read back as the suppliers it was written from', () => {
    const read = readLeverandorerWorkbook(writeLeverandorerWorkbook(ws))
    expect(read[1]).toEqual({ name: 'StandBygg', contact: '', rate: 0, note: '', shifts: { dag: true, kveld: false, natt: false }, competences: { Tepper: false, Vegger: true } })
    expect(diffSuppliers(ws, read)).toMatchObject({ added: 0, changed: 0, unchanged: 2, onlyInApp: 0, newCompetences: [] })
    expect(mergeSuppliers(ws, read).suppliers).toEqual(ws.suppliers)
  })

  const file = (head: string[], ...rows: (string | number | null)[][]) => readLeverandorerWorkbook(writeXlsx([{ name: 'Ark1', head, rows }]))

  it('reads a file made by hand: names and competences only, and leaves the rest alone', () => {
    const read = file(['Navn', 'Vegger', 'Rigg'], ['Manpower', null, 'Ja'], [null, 'x', 'x'], ['Nordic Crew', 1, null])
    expect(read).toEqual([
      { name: 'Manpower', shifts: {}, competences: { Vegger: false, Rigg: true } },
      { name: 'Nordic Crew', shifts: {}, competences: { Vegger: true, Rigg: false } },
    ])
    const merged = mergeSuppliers(ws, read)
    expect(merged.suppliers![0]).toEqual({ ...ws.suppliers![0], competences: ['tepper', 'rigg'] })
    expect(merged.suppliers![2]).toMatchObject({ name: 'Nordic Crew', competences: ['vegger'], shifts: ['dag', 'kveld', 'natt'] })
  })

  it('refuses a file without a name column', () => {
    expect(() => file(['Leverandør', 'Vegger'], ['Manpower', 'x'])).toThrow(FileFormatError)
  })
})
