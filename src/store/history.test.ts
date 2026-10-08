import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type AllocationRow, type Workspace } from '../domain/types'
import type { Assignment, DemandLine, Person, VismaImport } from '../domain/types'
import { applyChange, changeWrites, emptyChange, isEmptyChange, recordAllocation, recordLedger, recordSettings, recordStaffing } from './history'

const row = (id: string, order: number, fte: Record<string, number> = {}): AllocationRow => ({
  id,
  order,
  projectName: 'VVS 2026',
  projectNo: '26970',
  refYear: '2026',
  competence: 'FOGA',
  phase: 'Montering',
  basis: 'Planlagt',
  fte,
  notes: {},
})

const base: Workspace = {
  settings: DEFAULT_SETTINGS,
  venue: [],
  projects: [],
  demand: [],
  allocations: [row('a', 0, { '2026-10-05': 2 }), row('b', 1)],
}

describe('undo history', () => {
  it('merges several edits to one row into a single step', () => {
    const step = emptyChange()
    const first = row('a', 0, { '2026-10-05': 3 })
    const second = row('a', 0, { '2026-10-05': 3, '2026-10-06': 3 })
    recordAllocation(step, 'a', base.allocations[0], first)
    recordAllocation(step, 'a', first, second)
    const after: Workspace = { ...base, allocations: [second, base.allocations[1]] }

    expect(applyChange(after, step, 'undo').allocations).toEqual(base.allocations)
    expect(applyChange(base, step, 'redo').allocations).toEqual(after.allocations)
  })

  it('restores a deleted row in its original position', () => {
    const step = emptyChange()
    recordAllocation(step, 'a', base.allocations[0], null)
    const after: Workspace = { ...base, allocations: [base.allocations[1]] }

    expect(applyChange(after, step, 'undo').allocations.map((r) => r.id)).toEqual(['a', 'b'])
    expect(changeWrites(step, 'undo').putAllocations.map((r) => r.id)).toEqual(['a'])
    expect(changeWrites(step, 'redo').deleteAllocations).toEqual(['a'])
  })

  it('removes an added row on undo', () => {
    const step = emptyChange()
    const added = row('c', 2)
    recordAllocation(step, 'c', null, added)
    const after: Workspace = { ...base, allocations: [...base.allocations, added] }

    expect(applyChange(after, step, 'undo').allocations.map((r) => r.id)).toEqual(['a', 'b'])
    expect(changeWrites(step, 'undo').deleteAllocations).toEqual(['c'])
  })

  it('reverts settings', () => {
    const step = emptyChange()
    const settings = { ...DEFAULT_SETTINGS, baseCrew: 19 }
    recordSettings(step, base.settings, settings)
    const after: Workspace = { ...base, settings }

    const undone = applyChange(after, step, 'undo')
    expect(undone.settings.baseCrew).toBe(21)
    expect(applyChange(undone, step, 'redo').settings.baseCrew).toBe(19)
  })

  it('treats a step that changed nothing as empty', () => {
    const step = emptyChange()
    expect(isEmptyChange(step)).toBe(true)
    recordAllocation(step, 'a', base.allocations[0], base.allocations[0])
    expect(isEmptyChange(step)).toBe(true)
    recordAllocation(step, 'a', base.allocations[0], row('a', 0))
    expect(isEmptyChange(step)).toBe(false)
  })

  const demandLine = (id: string, basis: string): DemandLine => ({
    id,
    projectNo: '26970',
    projectName: 'VVS 2026',
    eventYear: '2026',
    source: 'visma per reg. dato',
    workType: 'FOGA-vegger',
    quantity: 10,
    unit: 'lm',
    stand: '',
    hall: 'Hall C',
    competence: 'FOGA',
    basis,
    assemblyHours: 1,
    dismantleHours: 1,
    comment: '',
  })

  it('undoes a Visma import together with the decisions and lines it changed', () => {
    const own = demandLine('own', 'Planlagt')
    const before: Workspace = { ...base, demand: [demandLine('old', 'visma per reg. dato'), own], overrides: {}, visma: [] }
    const imported: VismaImport = { projectNo: '26970', eventName: 'VVS 2026', fileName: 'x.xlsx', importedAt: '', rows: [] }
    const after: Workspace = { ...before, demand: [own, demandLine('new', 'Planlagt')], overrides: { k: { inPlan: true } }, visma: [imported] }
    const step = emptyChange()
    recordLedger(step, before, after)

    expect(isEmptyChange(step)).toBe(false)
    expect(step.demand.has('own')).toBe(false)
    const undone = applyChange(after, step, 'undo')
    expect(undone.demand.map((l) => l.id).sort()).toEqual(['old', 'own'])
    expect(undone.overrides).toEqual({})
    expect(undone.visma).toEqual([])
    expect(changeWrites(step, 'undo')).toMatchObject({ deleteDemand: ['new'], deleteVisma: ['26970'], overrides: {} })
    expect(applyChange(undone, step, 'redo').visma).toEqual([imported])
  })

  it('restores the KPI setup, or removes it when there was none', () => {
    const kpi = { workTypes: [], rates: [] }
    const step = emptyChange()
    recordLedger(step, base, { ...base, kpi })
    expect(applyChange({ ...base, kpi }, step, 'undo').kpi).toBeUndefined()
    expect(changeWrites(step, 'undo').kpi).toBeNull()
    expect(changeWrites(step, 'redo').kpi).toBe(kpi)
  })

  const person = (id: string, order: number, competences: string[] = ['foga']): Person => ({ id, name: id, order, active: true, competences })
  const block = (id: string, personId: string, start = 420, end = 900): Assignment => ({ id, personId, date: '2026-10-12', competence: 'foga', start, end, source: 'manual' })

  it('undoes a staffing change across people, assignments, absence and moved hours as one step', () => {
    const anna = person('anna', 0)
    const before: Workspace = { ...base, persons: [anna, person('ola', 1)], assignments: [block('s1', 'anna'), block('s2', 'ola')], unavailability: [], demandAdjustments: [], competenceStyles: {} }
    const shorter = block('s1', 'anna', 420, 660)
    const after: Workspace = {
      ...before,
      persons: [anna, person('kari', 2)],
      assignments: [shorter, block('s3', 'kari')],
      unavailability: [{ id: 'u1', personId: 'anna', date: '2026-10-13', kind: 'syk' }],
      demandAdjustments: [{ id: 'd1', competence: 'foga', date: '2026-10-13', hours: 3, reason: 'carry', fromDate: '2026-10-12', createdAt: '' }],
      competenceStyles: { foga: { key: 'foga', label: 'FOGA', shortLabel: 'FOGA', color: 'line-teal', order: 0 } },
    }
    const step = emptyChange()
    recordStaffing(step, before, after)

    expect(step.persons.has('anna')).toBe(false)
    const undone = applyChange(after, step, 'undo')
    expect(undone.persons?.map((p) => p.id)).toEqual(['anna', 'ola'])
    expect(undone.assignments?.map((a) => a.id).sort()).toEqual(['s1', 's2'])
    expect(undone.assignments?.find((a) => a.id === 's1')?.end).toBe(900)
    expect(undone.unavailability).toEqual([])
    expect(undone.demandAdjustments).toEqual([])
    expect(undone.competenceStyles).toEqual({})
    expect(changeWrites(step, 'undo').staffing).toMatchObject({ deletePersons: ['kari'], deleteAssignments: ['s3'], deleteUnavailability: ['u1'], deleteAdjustments: ['d1'], competenceStyles: {} })
    expect(changeWrites(step, 'undo').staffing.putAssignments.map((a) => a.id).sort()).toEqual(['s1', 's2'])

    const redone = applyChange(undone, step, 'redo')
    expect(redone.persons).toEqual(after.persons)
    expect([...(redone.assignments ?? [])].sort((a, b) => a.id.localeCompare(b.id))).toEqual(after.assignments)
    expect(redone.unavailability).toEqual(after.unavailability)
    expect(redone.demandAdjustments).toEqual(after.demandAdjustments)
    expect(redone.competenceStyles).toEqual(after.competenceStyles)
  })

  it('treats a staffing change that changed nothing as empty', () => {
    const ws: Workspace = { ...base, persons: [person('anna', 0)], assignments: [block('s1', 'anna')] }
    const step = emptyChange()
    recordStaffing(step, ws, { ...ws })
    expect(isEmptyChange(step)).toBe(true)
    recordStaffing(step, ws, { ...ws, assignments: [] })
    expect(isEmptyChange(step)).toBe(false)
  })
})
