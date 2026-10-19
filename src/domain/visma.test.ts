import { describe, expect, it } from 'vitest'
import type { KpiConfig, VismaRow } from './types'
import { vismaHall } from '../import/vismaExport'
import { setActiveUnit, setRate, withExcludedArticle, withTextType } from './kpi'
import { buildVismaLines, lineRef, yieldByType, orphanedDecisions, vismaDemandLines, vismaLineKey, withProjectNames } from './visma'

const kpi: KpiConfig = {
  workTypes: [
    { productType: 'FOGA-vegger', unit: 'lm', competence: 'FOGA' },
    { productType: 'Print', unit: 'ordre', competence: 'Print' },
    { productType: 'Teppefliser', unit: 'm²', competence: 'Teppefliser' },
  ],
  rates: [
    { name: 'FOGA-vegger', unit: 'lm', assembly: 7, dismantle: 14 },
    { name: 'Print', unit: 'ordre', assembly: 1, dismantle: 0 },
    { name: 'Teppefliser', unit: 'm²', assembly: 50, dismantle: 70 },
  ],
}

const row = (overrides: Partial<VismaRow>): VismaRow => withHall({
  projectNo: '26970',
  eventName: 'VVS 2026',
  stand: 'C04-44',
  transInfo: '',
  avdeling: '65',
  articleNo: '',
  description: '',
  quantity: 1,
  productGroup: '',
  productType: 'FOGA-vegger',
  ...overrides,
})
/** The row with its Hall/Sted as the reader gives it. */
const withHall = (fields: Omit<VismaRow, 'hall'> & { hall?: string }): VismaRow => ({ ...fields, hall: fields.hall ?? vismaHall(fields.stand, fields.transInfo) })

const rows = [
  row({ quantity: 10 }),
  row({ quantity: 4, stand: 'C02-10' }),
  row({ quantity: -4, stand: 'C02-10' }),
  row({ quantity: 21, stand: 'D01-01' }),
  row({ productType: 'Print', stand: 'C04-44', quantity: 3 }),
  row({ productType: 'Print', stand: 'C04-44', quantity: 2 }),
  row({ productType: 'Print', stand: 'C09-01', quantity: 1 }),
  row({ productType: '', stand: '', transInfo: 'Møterom hall E1', avdeling: '32', quantity: 100 }),
]

describe('Visma lines', () => {

  it('groups by department, work type and hall, summing signed quantities', () => {
    const lines = buildVismaLines(rows, kpi, {})
    const walls = lines.find((l) => l.workType === 'FOGA-vegger' && l.hall === 'Hall C')!
    expect(walls.quantity).toBe(10)
    expect(walls.rowCount).toBe(3)
    expect(walls.assemblyHours).toBeCloseTo(10 / 7)
    expect(walls.dismantleHours).toBeCloseTo(10 / 14)
    expect(lines.find((l) => l.workType === 'FOGA-vegger' && l.hall === 'Hall D')!.quantity).toBe(21)
  })

  it('counts stands for order-based work types and gives no hours for a zero rate', () => {
    const print = buildVismaLines(rows, kpi, {}).find((l) => l.workType === 'Print')!
    expect(print.quantity).toBe(2)
    expect(print.assemblyHours).toBe(2)
    expect(print.dismantleHours).toBe(0)
  })

  it('notes the phase a rate is missing for, and flags the line when both are', () => {
    const print = buildVismaLines(rows, kpi, {}).find((l) => l.workType === 'Print')!
    expect(print).toMatchObject({ issue: null, missingRate: 'dismantle' })
    const walls = buildVismaLines(rows, kpi, {}).find((l) => l.workType === 'FOGA-vegger')!
    expect(walls).toMatchObject({ issue: null, missingRate: null })
    const noRates: typeof kpi = { ...kpi, rates: kpi.rates.map((rate) => (rate.name === 'Print' ? { ...rate, assembly: 0, dismantle: 0 } : rate)) }
    expect(buildVismaLines(rows, noRates, {}).find((l) => l.workType === 'Print')).toMatchObject({ issue: 'no-rate', missingRate: null, assemblyHours: 0, dismantleHours: 0 })
    const montering = { ...kpi, rates: kpi.rates.map((rate) => (rate.name === 'Print' ? { ...rate, assembly: 0, dismantle: 4 } : rate)) }
    expect(buildVismaLines(rows, montering, {}).find((l) => l.workType === 'Print')).toMatchObject({ issue: null, missingRate: 'assembly' })
  })

  it('flags lines without a product type until the planner picks a work type', () => {
    const key = vismaLineKey('26970', '32', '01_ingen produkttype', 'Møterom hall E1')
    expect(buildVismaLines(rows, kpi, {}).find((l) => l.key === key)).toMatchObject({ issue: 'no-product-type', assemblyHours: 0, competence: 'Ukjent' })
    const assigned = buildVismaLines(rows, kpi, { [key]: { workType: 'Teppefliser' } }).find((l) => l.key === key)!
    expect(assigned).toMatchObject({ issue: null, competence: 'Teppefliser', unit: 'm²' })
    expect(assigned.assemblyHours).toBe(2)
  })

  it('applies Effekt and leaving a line out without changing the source', () => {
    const key = vismaLineKey('26970', '65', 'FOGA-vegger', 'Hall C')
    const source = { projectNo: '26970', eventName: 'VVS 2026', fileName: 'x.xlsx', importedAt: '', rows }
    const line = vismaDemandLines(source, kpi, { [key]: { effekt: 0.9, comment: 'egen opptelling' } }).find((l) => l.id === `visma|${key}`)!
    expect(line.assemblyHours).toBeCloseTo((10 / 7) * 0.1)
    expect(line).toMatchObject({ basis: 'Planlagt', origin: 'visma', source: 'visma per reg. dato', comment: 'egen opptelling' })
    expect(vismaDemandLines(source, kpi, { [key]: { excluded: true } }).find((l) => l.id === `visma|${key}`)!.basis).toBe('visma per reg. dato')
  })
})

describe('what a product type gives', () => {
  it('sums the quantity and hours of its lines in the unit in use, or in another unit', () => {
    const given = yieldByType(rows, kpi)
    // FOGA-vegger: 10 + 0 + 21 lm at 7 and 14 per hour; Print: two stands at one per hour.
    expect(given.get('foga-vegger')).toEqual({ quantity: 31, assembly: 31 / 7, dismantle: 31 / 14 })
    expect(given.get('print')).toEqual({ quantity: 2, assembly: 2, dismantle: 0 })
    expect(given.has('01_ingen produkttype')).toBe(false)
    const inStands = setActiveUnit(setRate(kpi, 'FOGA-vegger', 'stands', { assembly: 0.5 }), 'FOGA-vegger', 'stands')
    expect(yieldByType(rows, inStands).get('foga-vegger')).toEqual({ quantity: 3, assembly: 6, dismantle: 0 })
  })
})

describe('a work type by article text', () => {
  it('reads a line without a product type as the type the setup gives its text, unless one is chosen for the line', () => {
    const untyped = [row({ productType: '', description: 'Fritekst Foga', quantity: 14 })]
    const withRule = withTextType(kpi, 'fritekst foga', 'FOGA-vegger')
    const line = buildVismaLines(untyped, withRule, {})[0]
    expect(line).toMatchObject({ workType: 'FOGA-vegger', typeByText: true, issue: null, assemblyHours: 2 })
    expect(buildVismaLines(untyped, withRule, { [line.key]: { workType: 'Print' } })[0]).toMatchObject({ workType: 'Print', typeByText: false })
    expect(withTextType(withRule, 'Fritekst foga', undefined).byText).toEqual([])
  })

  it('keeps lines without a product type apart by their text, so unlike articles are not summed', () => {
    const untyped = [
      row({ productType: '', description: 'Gangtepper', quantity: 40 }),
      row({ productType: '', description: 'Gardiner på bakvegg', quantity: 6 }),
      row({ productType: '', description: 'gangtepper', quantity: 10 }),
    ]
    const lines = buildVismaLines(untyped, kpi, {})
    expect(lines.map((line) => [line.texts, line.quantity])).toEqual([
      [['Gangtepper'], 50],
      [['Gardiner på bakvegg'], 6],
    ])
    expect(lines[0].key).toBe(vismaLineKey('26970', '65', '01_ingen produkttype', 'Hall C', 'Gangtepper'))
    expect(lineRef(lines[1]).workType).toBe('01_ingen produkttype «Gardiner på bakvegg»')
  })
})

describe('decisions on lines that left the export', () => {
  const gone = vismaLineKey('26970', '65', 'FOGA-vegger', 'Hall E')
  const present = vismaLineKey('26970', '65', 'FOGA-vegger', 'Hall C')
  const lines = buildVismaLines(rows, kpi, {})

  it('lists them with the line as it read when the decision was made', () => {
    const found = orphanedDecisions('26970', lines, {
      [gone]: { effekt: 1, comment: 'egen opptelling', ref: { avdeling: '65', workType: 'FOGA-vegger', hall: 'Hall E' } },
      [present]: { excluded: true },
    })
    expect(found).toEqual([expect.objectContaining({ key: gone, workType: 'FOGA-vegger', hall: 'Hall E', avdeling: '65' })])
  })

  it('ignores other projects and decisions that have been reset', () => {
    expect(
      orphanedDecisions('26970', lines, {
        [vismaLineKey('26100', '65', 'Print', 'Hall A')]: { excluded: true },
        [gone]: { effekt: 0, excluded: false, comment: '' },
      }),
    ).toEqual([])
  })
})

describe('withProjectNames', () => {
  it('gives a line without the name the name of its project', () => {
    const rows = withProjectNames([row({ eventName: '' }), row({}), row({ projectNo: '26100', eventName: 'Hage 2026' })])
    expect(rows.map((r) => r.eventName)).toEqual(['VVS 2026', 'VVS 2026', 'Hage 2026'])
  })

  it('refuses a project that no line names', () => {
    expect(() => withProjectNames([row({}), row({ projectNo: '26100', eventName: ' ' })])).toThrow('26100')
  })
})

describe('product type names', () => {
  it('finds the rule and the rate of a line by the name, whatever its case', () => {
    const config: KpiConfig = { workTypes: [{ productType: '5999 Diverse', unit: 'stk', competence: 'Diverse' }], rates: [{ name: '5999 diverse', unit: 'stk', assembly: 2, dismantle: 4 }] }
    const [line] = buildVismaLines([row({ productType: '5999 DIVERSE', quantity: 8 })], config, {})
    expect(line).toMatchObject({ workType: '5999 DIVERSE', competence: 'Diverse', assemblyHours: 4, dismantleHours: 2, issue: null })
  })
})

describe('article numbers left out', () => {
  it('are not read: their booking lines give no line, no quantity and no hours', () => {
    const booked = [row({ quantity: 10, articleNo: '100' }), row({ quantity: 4, articleNo: ' 4711 ' }), row({ productType: '', description: 'Frakt', articleNo: '4711' })]
    const lines = buildVismaLines(booked, withExcludedArticle(kpi, '4711', 'Frakt'), {})
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ quantity: 10, rowCount: 1 })
  })
})
