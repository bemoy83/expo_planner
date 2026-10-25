import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type AllocationRow, type Assignment, type HireOrder, type Workspace } from '../types'
import { leftUncovered, toHire } from './toHire'

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

describe('what is left uncovered', () => {
  it('is the hours nobody covers, per competence, with the suppliers who offer it for the day shift', () => {
    const needs = leftUncovered(ws([row('foga', { [MON]: 3 }), row('banner', { [TUE]: 0.2 })], [block('per', MON, 'foga')]), [MON, TUE])
    expect(needs).toEqual([
      { competence: 'foga', label: 'foga', hours: 15, suppliers: ['Messehjelp AS', 'Snekkerverkstedet'] },
      { competence: 'banner', label: 'banner', hours: 1.5, suppliers: [] },
    ])
  })

  it('counts orders that wait as ordered, and keeps to the projects asked for', () => {
    const order: HireOrder = { id: 'o', supplierId: 's1', competence: 'foga', date: MON, fte: 1, start: 420, end: 900, conf: null, projectNo: '26001' }
    expect(leftUncovered(ws([row('foga', { [MON]: 1 })], [], [order]), [MON])).toEqual([])
    expect(leftUncovered(ws([row('foga', { [MON]: 1 }, '26002')]), [MON], ['26001'])).toEqual([])
  })
})

describe('«Til innleie»', () => {
  it('lists the people hired in per competence and supplier, as runs of days with the people on each, for the projects picked', () => {
    const hired = [
      { supplierId: 's1', competences: ['foga'], dates: [MON, TUE], projectNos: ['26001'] },
      { supplierId: 's1', competences: ['foga'], dates: [MON, TUE], projectNos: ['26001', '26002'] },
      { supplierId: 's1', competences: ['foga'], dates: [TUE], projectNos: ['26001'] },
      { supplierId: 's2', competences: ['snekker'], dates: [MON], projectNos: ['26003'] },
    ]
    expect(toHire(ws([]), hired, ['26001'])).toEqual([
      {
        competence: 'foga',
        label: 'foga',
        supplier: 'Messehjelp AS',
        personDays: 5,
        spans: [
          { from: MON, to: TUE, people: 2, projectNos: ['26001', '26002'] },
          { from: TUE, to: TUE, people: 1, projectNos: ['26001'] },
        ],
      },
    ])
  })
})
