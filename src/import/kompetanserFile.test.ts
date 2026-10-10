import { describe, expect, it } from 'vitest'
import { competenceStyles, diffCompetenceStyles, mergeCompetenceStyles, setCompetenceStyle } from '../domain/competences'
import { DEFAULT_SETTINGS, type Workspace } from '../domain/types'
import { KompetanserFormatError, readKompetanserWorkbook, writeKompetanserWorkbook } from './kompetanserFile'
import { cellAt, dataRows, readXlsx, writeXlsx } from './xlsx'

const base: Workspace = {
  settings: DEFAULT_SETTINGS,
  venue: [],
  projects: [],
  demand: [],
  allocations: [],
  kpi: { workTypes: [{ productType: '14 [FOGA-vegger]', unit: 'lm', competence: 'FOGA' }, { productType: '23 [Print]', unit: 'ordre', competence: 'Print' }], rates: [] },
}
const ws: Workspace = { ...base, competenceStyles: setCompetenceStyle(base, 'print', { shortLabel: 'PR', color: 'line-rose' }) }

describe('the Kompetanser file', () => {
  it('has a row per competence in the planner\'s order, with the colour by name', () => {
    const sheet = readXlsx(writeKompetanserWorkbook(ws)).get('Kompetanser')!
    expect(dataRows(sheet, 0).map((row) => [0, 1, 2].map((col) => cellAt(sheet, row, col)))).toEqual([
      ['Kompetanse', 'Kort', 'Farge'],
      ['FOGA', 'FOGA', 'Blå'],
      ['Print', 'PR', 'Rød'],
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

  it('refuses a file without the column', () => {
    expect(() => file(['Navn'], ['Print'])).toThrow(KompetanserFormatError)
  })
})
