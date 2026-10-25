import { describe, expect, it } from 'vitest'
import { competenceStyles, diffCompetenceStyles, mergeCompetenceStyles, setCompetenceStyle } from '../domain/competences'
import { DEFAULT_SETTINGS, type Workspace } from '../domain/types'
import { readKompetanserWorkbook, writeKompetanserWorkbook } from './kompetanserFile'
import { cellAt, dataRows, FileFormatError, readXlsx, writeXlsx } from './xlsx'

const base: Workspace = {
  settings: DEFAULT_SETTINGS,
  venue: [],
  projects: [],
  demand: [],
  allocations: [],
  kpi: { workTypes: [{ productType: 'FOGA-vegger', unit: 'lm', competence: 'FOGA' }, { productType: 'Print', unit: 'ordre', competence: 'Print' }], rates: [] },
}
const styled: Workspace = { ...base, competenceStyles: setCompetenceStyle(base, 'print', { shortLabel: 'PR', color: 'line-rose' }) }
const ws: Workspace = { ...styled, competenceStyles: setCompetenceStyle(styled, 'foga', { stage: 'standbygging', next: 'print', minPerHall: 2 }) }

describe('the Kompetanser file', () => {
  it('has a row per competence in the planner\'s order, with the colour by name', () => {
    const sheet = readXlsx(writeKompetanserWorkbook(ws)).get('Kompetanser')!
    expect(dataRows(sheet, 0).map((row) => [0, 1, 2, 3, 4, 5].map((col) => cellAt(sheet, row, col)))).toEqual([
      ['Kompetanse', 'Kort', 'Farge', 'Trinn', 'Går videre til', 'Minst per hall'],
      ['FOGA', 'FOGA', 'Blå', 'Standbygging', 'Print', 2],
      ['Print', 'PR', 'Rød', null, null, null],
    ])
  })

  it('is read back as the styles it was written from', () => {
    const read = readKompetanserWorkbook(writeKompetanserWorkbook(ws))
    expect(diffCompetenceStyles(ws, read)).toEqual({ added: 0, changed: 0, unchanged: 2, onlyInApp: 0, inUse: 0 })
    expect(mergeCompetenceStyles(ws, read)).toEqual(ws.competenceStyles)
  })

  const file = (head: string[], ...rows: (string | null)[][]) => readKompetanserWorkbook(writeXlsx([{ name: 'Ark1', head, rows }]))

  it('reads a file made by hand: the order of the rows, a colour in any case, and one the app does not have', () => {
    const read = file(['Kompetanse', 'Farge'], ['Print', 'GRØNN'], ['Rigging', 'Rosa'], [null, 'Blå'])
    expect(read).toEqual([{ label: 'Print', color: 'line-green' }, { label: 'Rigging' }])
    const merged: Workspace = { ...ws, competenceStyles: mergeCompetenceStyles(ws, read) }
    expect(competenceStyles(merged).map((s) => `${s.label}/${s.shortLabel}/${s.color}`)).toEqual(['Print/PR/line-green', 'Rigging/RIG/line-teal', 'FOGA/FOGA/line-blue'])
  })

  it('reads a stage by its name in any case, and leaves out one the app does not have and a number that cannot be read', () => {
    expect(file(['Kompetanse', 'Trinn', 'Minst per hall'], ['Print', 'LØSØRE', '2'], ['FOGA', 'Tak', 'to'])).toEqual([{ label: 'Print', stage: 'losore', minPerHall: 2 }, { label: 'FOGA' }])
  })

  it('refuses a file without the column', () => {
    expect(() => file(['Navn'], ['Print'])).toThrow(FileFormatError)
  })
})
