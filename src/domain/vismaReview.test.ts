import { describe, expect, it } from 'vitest'
import { withAlias } from './locations'
import type { KpiConfig, VismaImport, VismaRow } from './types'
import { vismaLineKey } from './visma'
import { countOf, matchesFilter, reviewVisma } from './vismaReview'

const kpi: KpiConfig = {
  workTypes: [
    { productType: 'FOGA-vegger', unit: 'lm', competence: 'FOGA' },
    { productType: 'Print', unit: 'ordre', competence: 'Print' },
  ],
  rates: [
    { name: 'FOGA-vegger', unit: 'lm', assembly: 7, dismantle: 14 },
    { name: 'Print', unit: 'ordre', assembly: 1, dismantle: 0 },
  ],
}
const row = (overrides: Partial<VismaRow>): VismaRow => ({ projectNo: '26970', eventName: 'VVS 2026', stand: 'C04-44', transInfo: '', customer: '', avdeling: '65', orderNo: '', articleNo: '', description: '', quantity: 1, productGroup: '', productType: 'FOGA-vegger', ...overrides })
const imported = (projectNo: string, rows: VismaRow[]): VismaImport => ({ projectNo, eventName: '', fileName: 'utskrift.xlsx', importedAt: '', rows: rows.map((r) => ({ ...r, projectNo })) })

const visma = [
  imported('26970', [row({ quantity: 10 }), row({ quantity: 21, stand: 'D01-01' }), row({ productType: 'Print', quantity: 3 }), row({ productType: '', stand: '', transInfo: 'Møterom hall E1', avdeling: '32' })]),
  imported('26100', [row({ quantity: 5 })]),
]
const halls = ['C', 'D']
const inPlan = { [vismaLineKey('26970', '65', 'FOGA-vegger', 'Hall C')]: { inPlan: true } }

describe('reviewVisma', () => {
  it('counts per project what is not in the plan, what has no hall and what gives no hours', () => {
    const review = reviewVisma(visma, kpi, inPlan, halls, {})
    expect(review.get('26970')).toMatchObject({ open: 3, ready: 2, unresolved: 1, issues: 1 })
    expect(review.get('26970')!.lines.map((line) => line.competence)).toEqual(['FOGA', 'FOGA', 'Print', 'Ukjent'])
    expect(review.get('26100')).toMatchObject({ open: 1, ready: 1, unresolved: 0, issues: 0 })
  })

  it('counts a line as placed once the planner has chosen a hall for its text', () => {
    const review = reviewVisma(visma, kpi, {}, halls, withAlias({}, 'Møterom hall E1', 'D'))
    expect(review.get('26970')!.unresolved).toBe(0)
  })

  it('filters the lines the way it counts them', () => {
    const project = reviewVisma(visma, kpi, inPlan, halls, {}).get('26970')!
    for (const filter of ['all', 'open', 'unresolved', 'issue'] as const) expect(project.lines.filter((line) => matchesFilter(line, filter, halls, {}))).toHaveLength(countOf(project, filter))
    expect(countOf(project, 'all')).toBe(4)
  })
})
