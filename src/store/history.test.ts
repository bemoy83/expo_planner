import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type AllocationRow, type CapacityLine, type Workspace } from '../domain/types'
import { applyChange, changeWrites, emptyChange, isEmptyChange, recordAllocation, recordCapacity, recordSettings } from './history'

const row = (id: string, order: number, fte: Record<string, number> = {}): AllocationRow => ({
  id,
  order,
  projectName: 'VVS 2026',
  projectNo: '26970',
  refYear: '2026',
  competence: 'FOGA',
  phase: 'Montering',
  basis: 'Planlagt',
  importedHours: null,
  fte,
  notes: {},
})
const line = (values: Record<string, number>): CapacityLine => ({ id: 'hired', order: 0, label: 'Innleid (FTE)', group: 'added', values, notes: {} })

const base: Workspace = {
  settings: DEFAULT_SETTINGS,
  venue: [],
  projects: [],
  demand: [],
  allocations: [row('a', 0, { '2026-10-05': 2 }), row('b', 1)],
  capacity: [line({})],
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

  it('reverts staffing lines and settings', () => {
    const step = emptyChange()
    const edited = line({ '2026-10-05': 4 })
    const settings = { ...DEFAULT_SETTINGS, baseCrew: 19 }
    recordCapacity(step, base.capacity[0], edited)
    recordSettings(step, base.settings, settings)
    const after: Workspace = { ...base, capacity: [edited], settings }

    const undone = applyChange(after, step, 'undo')
    expect(undone.capacity[0].values).toEqual({})
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
})
