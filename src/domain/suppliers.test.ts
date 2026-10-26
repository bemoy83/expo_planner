import { describe, expect, it } from 'vitest'
import { competenceStyles, renameCompetence } from './competences'
import { addSupplier, diffSuppliers, type FileSupplier, isSupplierNameTaken, mergeSuppliers, removeSupplier, replaceSuppliers, toggleSupplierCompetence, toggleSupplierShift } from './suppliers'
import { DEFAULT_SETTINGS, type Workspace } from './types'

const ws: Workspace = {
  settings: DEFAULT_SETTINGS,
  venue: [],
  projects: [],
  demand: [],
  allocations: [],
  kpi: { workTypes: [{ productType: 'Vegg', unit: 'lm', competence: 'Vegger' }], rates: [] },
  suppliers: [
    { id: 's1', name: 'Manpower', order: 0, competences: ['vegger'], shifts: ['dag', 'kveld'], rate: 545, contact: 'Line' },
    { id: 's2', name: 'Adecco', order: 1, competences: [], shifts: ['dag'] },
  ],
  hireOrders: [
    { id: 'o1', supplierId: 's1', shift: 'dag', competence: 'vegger', date: '2026-10-08', fte: 2, start: 420, end: 900, conf: null },
    { id: 'o2', supplierId: 's2', shift: 'dag', competence: 'vegger', date: '2026-10-08', fte: 1, start: 420, end: 900, conf: 1 },
  ],
}

describe('suppliers', () => {
  it('adds one last, with every shift, and knows a name that is taken', () => {
    const added = addSupplier(ws.suppliers!, ' Nordic Crew ', 's3')
    expect(added[2]).toEqual({ id: 's3', name: 'Nordic Crew', order: 2, competences: [], shifts: ['dag', 'kveld', 'natt'] })
    expect(isSupplierNameTaken(ws.suppliers!, 'manpower ')).toBe(true)
    expect(isSupplierNameTaken(ws.suppliers!, 'manpower', 's1')).toBe(false)
  })

  it('toggles a competence, and a shift in the order of the day', () => {
    expect(toggleSupplierCompetence(ws.suppliers!, 's2', 'vegger')[1].competences).toEqual(['vegger'])
    expect(toggleSupplierShift(ws.suppliers!, 's2', 'natt')[1].shifts).toEqual(['dag', 'natt'])
    expect(toggleSupplierShift(toggleSupplierShift(ws.suppliers!, 's2', 'natt'), 's2', 'kveld')[1].shifts).toEqual(['dag', 'kveld', 'natt'])
    expect(toggleSupplierShift(ws.suppliers!, 's1', 'dag')[0].shifts).toEqual(['kveld'])
  })

  it('is removed with its orders', () => {
    const next = removeSupplier(ws, 's1')
    expect(next.suppliers!.map((s) => s.id)).toEqual(['s2'])
    expect(next.hireOrders!.map((o) => o.id)).toEqual(['o2'])
  })

  it('is a use of its competences, which are renamed with them', () => {
    const only: Workspace = { ...ws, kpi: undefined }
    expect(competenceStyles(only).map((style) => style.key)).toEqual(['vegger'])
    const renamed = renameCompetence(ws, 'vegger', 'Messevegger')!
    expect(renamed.suppliers![0].competences).toEqual(['messevegger'])
    expect(renamed.hireOrders!.map((o) => o.competence)).toEqual(['messevegger', 'messevegger'])
  })
})

describe('suppliers from a file', () => {
  const file: FileSupplier[] = [
    { name: 'manpower', rate: 560, contact: '', shifts: { natt: true }, competences: { Vegger: false, Rigg: true } },
    { name: 'Nordic Crew', shifts: { dag: true, kveld: false, natt: false }, competences: { Rigg: true } },
  ]

  it('counts what a file would change', () => {
    expect(diffSuppliers(ws, file)).toEqual({ added: 1, changed: 1, unchanged: 0, onlyInApp: 1, lostOrders: 1, newCompetences: ['Rigg'] })
  })

  it('merges by name: what the file says wins, the rest is kept, new ones come last', () => {
    const merged = mergeSuppliers(ws, file)
    expect(merged.suppliers).toEqual([
      { id: 's1', name: 'Manpower', order: 0, competences: ['rigg'], shifts: ['dag', 'kveld', 'natt'], rate: 560 },
      ws.suppliers![1],
      { id: expect.any(String), name: 'Nordic Crew', order: 2, competences: ['rigg'], shifts: ['dag'] },
    ])
    expect(competenceStyles(merged).map((style) => style.label)).toContain('Rigg')
    expect(mergeSuppliers(merged, file).suppliers).toEqual(merged.suppliers)
    expect(diffSuppliers(merged, file)).toMatchObject({ added: 0, changed: 0, unchanged: 2 })
  })

  it('replaces: the file order, and suppliers it lacks go with their orders', () => {
    const replaced = replaceSuppliers(ws, [file[1], file[0]])
    expect(replaced.suppliers!.map((s) => [s.name, s.order])).toEqual([
      ['Nordic Crew', 0],
      ['Manpower', 1],
    ])
    expect(replaced.hireOrders!.map((o) => o.id)).toEqual(['o1'])
  })
})
