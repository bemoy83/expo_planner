import { describe, expect, it } from 'vitest'
import { competenceStyles, diffPersons, mergePersons } from '../domain/competences'
import { DEFAULT_SETTINGS, type Workspace } from '../domain/types'
import { PersonellFormatError, readPersonellWorkbook, writePersonellWorkbook } from './personellFile'
import { cellAt, dataRows, readXlsx, writeXlsx } from './xlsx'

const ws: Workspace = {
  settings: DEFAULT_SETTINGS,
  venue: [],
  projects: [],
  demand: [],
  allocations: [],
  kpi: { workTypes: [{ productType: '14 [FOGA-vegger]', unit: 'lm', competence: 'FOGA' }, { productType: '23 [Print]', unit: 'ordre', competence: 'Print' }], rates: [] },
  persons: [
    { id: 'p1', name: 'Anna', order: 0, active: true, competences: ['foga', 'print'], note: 'Leder' },
    { id: 'p2', name: 'Bjarne', order: 1, active: false, competences: ['print'] },
  ],
}

describe('the Personell file', () => {
  it('has a row per person and a column per competence', () => {
    const sheet = readXlsx(writePersonellWorkbook(ws)).get('Personell')!
    expect(dataRows(sheet, 0).map((row) => [0, 1, 2, 3, 4].map((col) => cellAt(sheet, row, col)))).toEqual([
      ['Navn', 'Aktiv', 'Notat', 'FOGA', 'Print'],
      ['Anna', 'Ja', 'Leder', 'x', 'x'],
      ['Bjarne', 'Nei', null, null, 'x'],
    ])
  })

  it('is read back as the people it was written from', () => {
    const read = readPersonellWorkbook(writePersonellWorkbook(ws))
    expect(read).toEqual([
      { name: 'Anna', active: true, note: 'Leder', competences: { FOGA: true, Print: true } },
      { name: 'Bjarne', active: false, note: '', competences: { FOGA: false, Print: true } },
    ])
    expect(diffPersons(ws, read)).toMatchObject({ added: 0, changed: 0, unchanged: 2, onlyInApp: 0, newCompetences: [] })
    expect(mergePersons(ws, read).persons).toEqual(ws.persons)
  })

  const file = (head: string[], ...rows: (string | number | null)[][]) => readPersonellWorkbook(writeXlsx([{ name: 'Ark1', head, rows }]))

  it('reads a file made by hand: only names and competences, any mark, a new competence', () => {
    const read = file(['Navn', 'FOGA', 'Rigging'], ['Anna', null, 'Ja'], [null, 'x', 'x'], ['Cecilie', 1, null])
    expect(read).toEqual([
      { name: 'Anna', competences: { FOGA: false, Rigging: true } },
      { name: 'Cecilie', competences: { FOGA: true, Rigging: false } },
    ])
    const merged = mergePersons(ws, read)
    // Anna keeps being active, her note and the competence the file has no column for.
    expect(merged.persons![0]).toEqual({ id: 'p1', name: 'Anna', order: 0, active: true, competences: ['print', 'rigging'], note: 'Leder' })
    expect(merged.persons![2]).toMatchObject({ name: 'Cecilie', active: true, competences: ['foga'] })
    expect(competenceStyles(merged).map((s) => s.label)).toEqual(['FOGA', 'Print', 'Rigging'])
  })

  it('takes an empty «Aktiv» as active, and refuses a file without names', () => {
    expect(file(['Navn', 'Aktiv'], ['Anna', null], ['Bjarne', 'nei']).map((p) => p.active)).toEqual([true, false])
    expect(() => file(['Fornavn', 'FOGA'], ['Anna', 'x'])).toThrow(PersonellFormatError)
    expect(() => file(['Navn', 'FOGA'])).toThrow(PersonellFormatError)
  })
})
