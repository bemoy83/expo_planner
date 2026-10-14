import { describe, expect, it } from 'vitest'
import { locateDemand, withChoice } from './locations'
import { PLANNED_BASIS, VISMA_BASIS, type KpiConfig, type VismaImport, type VismaRow } from './types'
import { vismaDemandLines, vismaLineKey } from './visma'
import { causeGroups, countOf, missingText, reviewVisma, suggestWorkType } from './vismaReview'

const kpi: KpiConfig = {
  workTypes: [
    { productType: 'FOGA-vegger', unit: 'lm', competence: 'FOGA' },
    { productType: 'Print', unit: 'ordre', competence: 'Print' },
    { productType: 'Gulv', unit: 'm2', competence: 'Tepper' },
  ],
  rates: [
    { name: 'FOGA-vegger', unit: 'lm', assembly: 7, dismantle: 14 },
    { name: 'Print', unit: 'ordre', assembly: 1, dismantle: 0 },
  ],
}
const row = (overrides: Partial<VismaRow>): VismaRow => ({ projectNo: '26970', eventName: 'VVS 2026', stand: 'C04-44', transInfo: '', hall: overrides.stand === '' ? (overrides.transInfo ?? '') : `Hall ${(overrides.stand ?? 'C')[0]}`, customer: '', avdeling: '65', orderNo: '', articleNo: '', description: '', quantity: 1, productGroup: '', productType: 'FOGA-vegger', ...overrides })
const imported = (projectNo: string, rows: VismaRow[]): VismaImport => ({ projectNo, eventName: '', fileName: 'utskrift.xlsx', importedAt: '', rows: rows.map((r) => ({ ...r, projectNo })) })

const visma = [
  imported('26970', [
    row({ quantity: 14 }),
    row({ quantity: 21, stand: 'D01-01' }),
    row({ productType: 'Print', quantity: 3 }),
    row({ productType: '', stand: '', transInfo: 'Møterom hall E1', avdeling: '32' }),
    row({ productType: 'Gulv', quantity: 40 }),
  ]),
  imported('26100', [row({ quantity: 5 })]),
]
const halls = ['C', 'D']
const leftOut = { [vismaLineKey('26970', '65', 'FOGA-vegger', 'Hall C')]: { excluded: true } }

describe('reviewVisma', () => {
  it('counts per project the lines that need the planner, that count, and that are left out', () => {
    const review = reviewVisma(visma, kpi, leftOut, halls)
    expect(review.get('26970')).toMatchObject({ need: 2, counted: 2, excluded: 1 })
    expect(review.get('26970')!.lines.map((line) => line.competence)).toEqual(['FOGA', 'FOGA', 'Print', 'Tepper', 'Ukjent'])
    expect(review.get('26100')).toMatchObject({ need: 0, counted: 1, excluded: 0, countedHours: 5 / 7 + 5 / 14 })
  })

  it('says what a line lacks: a work type, a rate, a hall', () => {
    const lines = reviewVisma(visma, kpi, {}, halls).get('26970')!.lines
    expect(lines.find((line) => line.workType === 'Gulv')!.missing).toEqual(['rate'])
    const without = lines.find((line) => line.competence === 'Ukjent')!
    expect(without.missing).toEqual(['type', 'hall'])
    expect(missingText(without.missing)).toBe('Mangler arbeidstype og hall')
  })

  it('asks for the unit in use where a product type on KPI has none, not for a rate', () => {
    const unitless: KpiConfig = { ...kpi, workTypes: [...kpi.workTypes, { productType: 'Møbler', unit: '', competence: 'Møbler' }] }
    const line = reviewVisma([imported('26970', [row({ productType: 'Møbler' })])], unitless, {}, halls).get('26970')!.lines[0]
    expect(line.missing).toEqual(['unit'])
    expect(causeGroups([line]).rate).toEqual([])
  })

  it('counts a line once the planner has chosen a hall for its text and a work type for it', () => {
    const key = vismaLineKey('26970', '32', '01_ingen produkttype', 'Møterom hall E1')
    const review = reviewVisma(visma, kpi, { [key]: { workType: 'Print' } }, halls, withChoice(undefined, 'Møterom hall E1', 'D'))
    expect(review.get('26970')!.lines.find((line) => line.key === key)!.status).toBe('counted')
  })

  it('keeps a line left out as left out, whatever it lacks', () => {
    const key = vismaLineKey('26970', '32', '01_ingen produkttype', 'Møterom hall E1')
    const review = reviewVisma(visma, kpi, { [key]: { excluded: true } }, halls)
    expect(review.get('26970')!.lines.find((line) => line.key === key)!.status).toBe('excluded')
  })

  it('counts the filters the way it lists the lines', () => {
    const project = reviewVisma(visma, kpi, leftOut, halls).get('26970')!
    for (const filter of ['need', 'counted', 'excluded'] as const) expect(project.lines.filter((line) => line.status === filter)).toHaveLength(countOf(project, filter))
    expect(countOf(project, 'all')).toBe(5)
  })
})

describe('the demand of Visma lines', () => {
  it('is planned with once a line gives hours and has a hall, unless it is left out', () => {
    const demand = locateDemand(vismaDemandLines(visma[0], kpi, leftOut), halls)
    const basis = (workType: string, hall: string) => demand.find((line) => line.workType === workType && line.hall === hall)?.basis
    expect(basis('FOGA-vegger', 'C')).toBe(VISMA_BASIS)
    expect(basis('FOGA-vegger', 'D')).toBe(PLANNED_BASIS)
    expect(basis('Print', 'C')).toBe(PLANNED_BASIS)
    expect(basis('Gulv', 'C')).toBe(VISMA_BASIS)
    expect(basis('01_ingen produkttype', 'Mangler hall')).toBe(VISMA_BASIS)
  })
})

describe('suggestWorkType', () => {
  it('offers the product type whose first word the article texts hold', () => {
    expect(suggestWorkType(['Fritekst Foga'], kpi)).toBe('FOGA-vegger')
    expect(suggestWorkType(['Diverse arbeid'], kpi)).toBeUndefined()
  })

  it('offers it on a line that lacks a work type', () => {
    const rows = [row({ productType: '', description: 'Fritekst foga, 4 m', quantity: 4 })]
    const line = reviewVisma([imported('26970', rows)], kpi, {}, halls).get('26970')!.lines[0]
    expect(line).toMatchObject({ missing: ['type'], suggestedType: 'FOGA-vegger', texts: ['Fritekst foga, 4 m'] })
  })

  it('offers nothing where only a few of many texts name a type', () => {
    expect(suggestWorkType(['Bås, fargede vegger', 'IKKE FRONTBORD', 'Tilpass 25 m²'], { ...kpi, workTypes: [...kpi.workTypes, { productType: 'Frontbord', unit: 'stk', competence: 'Møbler' }] })).toBeUndefined()
    expect(suggestWorkType(['Gangtepper', 'Legging av gangtepper'], { ...kpi, workTypes: [{ productType: 'Gangtepper', unit: 'm2', competence: 'Tepper' }] })).toBe('Gangtepper')
  })

  it('takes the longest word where the texts hold several', () => {
    const many: KpiConfig = { ...kpi, workTypes: [...kpi.workTypes, { productType: 'Printduk', unit: 'm2', competence: 'Print' }] }
    expect(suggestWorkType(['Printduk på vegg'], many)).toBe('Printduk')
  })
})

describe('causeGroups', () => {
  it('groups the lines that need the planner by what they lack', () => {
    const rows = [
      row({ productType: '', stand: '', transInfo: 'Foaje øst', description: 'Fritekst', avdeling: '32' }),
      row({ productType: '', stand: '', transInfo: 'Foaje øst', description: 'Fritekst', avdeling: '64' }),
      row({ productType: 'Gulv', quantity: 40 }),
      row({ productType: 'Gulv', quantity: 10, avdeling: '64' }),
    ]
    const { hall, type, rate } = causeGroups(reviewVisma([imported('26970', rows)], kpi, {}, halls).get('26970')!.lines)
    expect(hall).toEqual([expect.objectContaining({ text: 'Foaje øst', blank: false, projects: ['26970'] })])
    expect(hall[0].lines).toHaveLength(2)
    expect(type).toEqual([expect.objectContaining({ text: 'Fritekst' })])
    expect(rate).toEqual([expect.objectContaining({ workType: 'Gulv', unit: 'm2', quantity: 50 })])
  })

  it('leaves out lines that are left out or count', () => {
    const rows = [row({ productType: 'Gulv', quantity: 40 })]
    const key = vismaLineKey('26970', '65', 'Gulv', 'Hall C')
    expect(causeGroups(reviewVisma([imported('26970', rows)], kpi, { [key]: { excluded: true } }, halls).get('26970')!.lines).rate).toEqual([])
  })
})
