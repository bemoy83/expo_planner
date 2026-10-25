import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type AllocationRow, type Assignment, type HireOrder, type Workspace } from '../types'
import { toOrder } from './toOrder'

const MON = '2026-10-12'
const TUE = '2026-10-13'

const row = (competence: string, fte: Record<string, number>, projectNo = '26001'): AllocationRow => ({ id: `r-${competence}-${projectNo}`, order: 0, projectName: 'Messe', projectNo, refYear: '2026', competence, phase: 'Montering', basis: 'Planlagt', hall: 'B1', fte, notes: {} })
const block = (personId: string, date: string, competence: string): Assignment => ({ id: `${personId}-${date}`, personId, date, competence, start: 420, end: 900, source: 'suggested', projectNo: '26001' })

const ws = (allocations: AllocationRow[], assignments: Assignment[] = [], hireOrders: HireOrder[] = []): Workspace => ({
  settings: DEFAULT_SETTINGS,
  venue: [],
  projects: [],
  demand: [],
  allocations,
  assignments,
  hireOrders,
  persons: [{ id: 'per', name: 'Per', order: 0, competences: ['foga'] }],
  suppliers: [
    { id: 's2', name: 'Snekkerverkstedet', order: 1, competences: ['foga', 'snekker'], shifts: ['dag'] },
    { id: 's1', name: 'Messehjelp AS', order: 0, competences: ['foga'], shifts: ['dag'] },
  ],
})

describe('what is left to hire in', () => {
  it('is the hours no permanent person covers, per competence and day, in people, with the suppliers who offer it', () => {
    const needs = toOrder(ws([row('foga', { [MON]: 3 }), row('banner', { [TUE]: 0.2 })], [block('per', MON, 'foga')]), [MON, TUE])
    expect(needs).toEqual([
      { competence: 'foga', label: 'foga', hours: 15, days: [{ date: MON, hours: 15, people: 2 }], suppliers: ['Messehjelp AS', 'Snekkerverkstedet'] },
      { competence: 'banner', label: 'banner', hours: 1.5, days: [{ date: TUE, hours: 1.5, people: 1 }], suppliers: [] },
    ])
  })

  it('counts orders that wait as ordered, and keeps to the projects asked for', () => {
    const order: HireOrder = { id: 'o', supplierId: 's1', competence: 'foga', date: MON, fte: 1, start: 420, end: 900, conf: null, projectNo: '26001' }
    expect(toOrder(ws([row('foga', { [MON]: 1 })], [], [order]), [MON])).toEqual([])
    expect(toOrder(ws([row('foga', { [MON]: 1 }, '26002')]), [MON], ['26001'])).toEqual([])
  })
})
