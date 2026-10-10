import { describe, expect, it } from 'vitest'
import { competenceUse, replaceCompetence, supersededCompetences, addCompetence, addPerson, competenceStyles, isUnusedCompetence, moveCompetence, removeCompetence, removePerson, setCompetenceStyle, togglePersonCompetence, updatePerson } from './competences'
import { DEFAULT_SETTINGS, LINE_COLORS, type AllocationRow, type Workspace } from './types'

const row = (competence: string): AllocationRow => ({ id: `row-${competence}`, order: 0, projectName: 'VVS 2026', projectNo: '26970', refYear: '2026', competence, phase: 'Montering', basis: 'Planlagt', fte: {}, notes: {} })

const base: Workspace = {
  settings: DEFAULT_SETTINGS,
  venue: [],
  projects: [],
  demand: [],
  allocations: [row('Teppefliser'), row('FOGA'), row(' foga'), row('')],
  kpi: { workTypes: [{ productType: 'Skilt', unit: 'stk', competence: 'Skilting' }], rates: [] },
  persons: [{ id: 'p1', name: 'Anna', order: 0, active: true, competences: ['banner'] }],
}

describe('competence styles', () => {
  it('lists every competence in use once, alphabetically, each with its own colour', () => {
    const styles = competenceStyles(base)
    expect(styles.map((s) => s.label)).toEqual(['banner', 'FOGA', 'Skilting', 'Teppefliser'])
    expect(styles.map((s) => s.key)).toEqual(['banner', 'foga', 'skilting', 'teppefliser'])
    expect(styles.map((s) => s.shortLabel)).toEqual(['BAN', 'FOGA', 'SKI', 'TEP'])
    expect(styles.map((s) => s.color)).toEqual(LINE_COLORS.slice(0, 4))
    expect(styles.map((s) => s.order)).toEqual([0, 1, 2, 3])
  })

  it('stores all styles on the first edit, so a competence that comes later takes a free colour at the end', () => {
    const stored = setCompetenceStyle(base, 'foga', { label: 'Foga-vegger', shortLabel: 'FOGAV', color: 'line-rose' })
    expect(Object.keys(stored).sort()).toEqual(['banner', 'foga', 'skilting', 'teppefliser'])
    expect(stored.foga).toMatchObject({ label: 'Foga-vegger', shortLabel: 'FOGA', color: 'line-rose', order: 1 })
    const later: Workspace = { ...base, competenceStyles: stored, allocations: [...base.allocations, row('Annet')] }
    const styles = competenceStyles(later)
    expect(styles.map((s) => s.key)).toEqual(['banner', 'foga', 'skilting', 'teppefliser', 'annet'])
    expect(styles[4].color).toBe('line-teal')
  })

  it('reuses the least used colour when there are more competences than colours', () => {
    const many: Workspace = { ...base, allocations: 'abcdefghij'.split('').map(row), kpi: undefined, persons: [] }
    const colors = competenceStyles(many).map((s) => s.color)
    expect(new Set(colors.slice(0, 8)).size).toBe(8)
    expect(colors.slice(8)).toEqual(LINE_COLORS.slice(0, 2))
  })

  it('moves a competence and renumbers the rest', () => {
    const moved = moveCompetence(base, 'teppefliser', 0)
    expect(Object.values(moved).sort((a, b) => a.order - b.order).map((s) => s.key)).toEqual(['teppefliser', 'banner', 'foga', 'skilting'])
    expect(moveCompetence(base, 'banner', 0)).toEqual({})
  })

  it('adds a competence by hand, and removes it only while nothing uses it', () => {
    expect(addCompetence(base, 'foga ')).toBeNull()
    expect(addCompetence(base, '  ')).toBeNull()
    const stored = addCompetence(base, 'Rigging')!
    const ws: Workspace = { ...base, competenceStyles: stored }
    expect(competenceStyles(ws).at(-1)).toMatchObject({ key: 'rigging', label: 'Rigging', shortLabel: 'RIG', order: 4 })
    expect(isUnusedCompetence(ws, 'rigging')).toBe(true)
    expect(isUnusedCompetence(ws, 'foga')).toBe(false)
    expect(isUnusedCompetence({ ...ws, persons: togglePersonCompetence(ws.persons!, 'p1', 'rigging') }, 'rigging')).toBe(false)
    expect(Object.keys(removeCompetence(ws, 'rigging'))).not.toContain('rigging')
  })
})

describe('people', () => {
  it('adds a person at the end, active and without competences', () => {
    const persons = addPerson(base.persons!, ' Ola ', 'p2')
    expect(persons[1]).toEqual({ id: 'p2', name: 'Ola', order: 1, active: true, competences: [] })
  })

  it('edits a person and toggles a competence', () => {
    const persons = updatePerson(base.persons!, 'p1', { active: false, note: 'Deltid' })
    expect(persons[0]).toMatchObject({ name: 'Anna', active: false, note: 'Deltid' })
    expect(togglePersonCompetence(persons, 'p1', 'foga')[0].competences).toEqual(['banner', 'foga'])
    expect(togglePersonCompetence(persons, 'p1', 'banner')[0].competences).toEqual([])
  })

  it('removes a person with their absence and assignments', () => {
    const ws: Workspace = {
      ...base,
      persons: addPerson(base.persons!, 'Ola', 'p2'),
      unavailability: [{ id: 'u1', personId: 'p1', date: '2026-10-12', kind: 'ferie' }],
      assignments: [
        { id: 's1', personId: 'p1', date: '2026-10-13', competence: 'banner', start: 420, end: 900, source: 'manual' },
        { id: 's2', personId: 'p2', date: '2026-10-13', competence: 'banner', start: 420, end: 900, source: 'manual' },
      ],
    }
    const after = removePerson(ws, 'p1')
    expect(after.persons!.map((p) => p.id)).toEqual(['p2'])
    expect(after.unavailability).toEqual([])
    expect(after.assignments!.map((a) => a.id)).toEqual(['s2'])
  })
})

describe('a competence that is replaced', () => {
  const kpiOf = (competences: Record<string, string>) => ({ workTypes: Object.entries(competences).map(([name, competence]) => ({ productType: name, unit: 'stk', competence })), rates: [] })
  const before = kpiOf({ Skilt: 'Skilting', Bannere: 'Skilting', Fliser: 'Teppefliser' })
  const staffed: Workspace = {
    ...base,
    allocations: [row('Teppefliser')],
    persons: [
      { id: 'p1', name: 'Anna', order: 0, active: true, competences: ['skilting', 'teppefliser'] },
      { id: 'p2', name: 'Bo', order: 1, active: true, competences: ['skilting', 'print'] },
      { id: 'p3', name: 'Cato', order: 2, active: true, competences: ['teppefliser'] },
    ],
    assignments: [
      { id: 'a1', personId: 'p1', date: '2026-10-12', competence: 'skilting', start: 420, end: 900, source: 'manual' },
      { id: 'a2', personId: 'p3', date: '2026-10-12', competence: 'teppefliser', start: 420, end: 900, source: 'manual' },
    ],
    demandAdjustments: [{ id: 'adj', competence: 'skilting', date: '2026-10-13', hours: 3, reason: 'carry', createdAt: '' }],
  }

  it('is one that every product type left for the same other competence, and that no data names any more', () => {
    expect(supersededCompetences(before, { ...staffed, kpi: kpiOf({ Skilt: 'Print', Bannere: 'Print', Fliser: 'Teppefliser' }) })).toEqual([{ from: 'skilting', to: 'Print' }])
    // One product type still has it.
    expect(supersededCompetences(before, { ...staffed, kpi: kpiOf({ Skilt: 'Print', Bannere: 'Skilting', Fliser: 'Teppefliser' }) })).toEqual([])
    // They went to two competences.
    expect(supersededCompetences(before, { ...staffed, kpi: kpiOf({ Skilt: 'Print', Bannere: 'Banner', Fliser: 'Teppefliser' }) })).toEqual([])
    // A planning row still names it.
    expect(supersededCompetences(before, { ...staffed, allocations: [row('Skilting')], kpi: kpiOf({ Skilt: 'Print', Bannere: 'Print', Fliser: 'Teppefliser' }) })).toEqual([])
    expect(supersededCompetences(before, { ...staffed, kpi: before })).toEqual([])
  })

  it('gives the people who had it the new one, with their blocks and moved hours', () => {
    const next = replaceCompetence(staffed, 'skilting', 'Print')
    expect(next.persons!.map((p) => p.competences)).toEqual([['print', 'teppefliser'], ['print'], ['teppefliser']])
    expect(next.persons![2]).toBe(staffed.persons![2])
    expect(next.assignments!.map((a) => a.competence)).toEqual(['print', 'teppefliser'])
    expect(next.demandAdjustments![0].competence).toBe('print')
    expect(replaceCompetence(staffed, 'skilting', 'Skilting ')).toBe(staffed)
  })

  it('hands its colour and place to the new one, unless that has its own', () => {
    const styled: Workspace = { ...staffed, competenceStyles: setCompetenceStyle(staffed, 'skilting', { color: 'line-rose' }) }
    const order = styled.competenceStyles!.skilting.order
    const next = replaceCompetence(styled, 'skilting', 'Print')
    expect(next.competenceStyles!.skilting).toBeUndefined()
    expect(next.competenceStyles!.print).toMatchObject({ key: 'print', color: styled.competenceStyles!.print.color })
    const fresh = replaceCompetence(styled, 'skilting', 'Folie')
    expect(fresh.competenceStyles!.folie).toMatchObject({ key: 'folie', label: 'Folie', shortLabel: 'FOL', color: 'line-rose', order })
  })
})

describe('competenceUse', () => {
  it('counts what names a competence, and finds nothing for one added by hand', () => {
    const ws: Workspace = { ...base, assignments: [{ id: 'a', personId: 'p1', date: '2026-10-12', competence: 'banner', start: 420, end: 900, source: 'manual' }] }
    expect(competenceUse(ws, 'foga')).toEqual({ productTypes: 0, demandLines: 0, rows: 2, people: 0, blocks: 0 })
    expect(competenceUse(ws, 'skilting')).toMatchObject({ productTypes: 1, rows: 0 })
    expect(competenceUse(ws, 'banner')).toMatchObject({ people: 1, blocks: 1 })
    const use = competenceUse(ws, 'ny')
    expect(Object.values(use).every((n) => n === 0)).toBe(true)
    expect(isUnusedCompetence({ ...ws, competenceStyles: addCompetence(ws, 'Ny')! }, 'ny')).toBe(true)
  })
})
