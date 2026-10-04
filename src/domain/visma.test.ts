import { describe, expect, it } from 'vitest'
import type { DemandLine, KpiConfig, VismaRow, Workspace } from './types'
import { DEFAULT_SETTINGS } from './types'
import { buildVismaLines, hallOf, harvestOverrides, orphanedDecisions, vismaDemandLines, vismaLineKey, withVismaImports, workTypeName } from './visma'

const kpi: KpiConfig = {
  workTypes: [
    { name: 'FOGA-vegger', productType: '14 [FOGA-vegger]', unit: 'lm', competence: 'FOGA' },
    { name: 'Print', productType: '23 [Print]', unit: 'ordre', competence: 'Print' },
    { name: 'Teppefliser', productType: '31 [Teppefliser]', unit: 'm²', competence: 'Teppefliser' },
  ],
  rates: [
    { name: 'FOGA-vegger', unit: 'lm', assembly: 7, dismantle: 14 },
    { name: 'Print', unit: 'ordre', assembly: 1, dismantle: 0 },
    { name: 'Teppefliser', unit: 'm²', assembly: 50, dismantle: 70 },
  ],
}

const row = (overrides: Partial<VismaRow>): VismaRow => ({
  projectNo: '26970',
  eventName: 'VVS 2026',
  stand: 'C04-44',
  transInfo: '',
  customer: '',
  avdeling: '65',
  orderNo: '',
  articleNo: '',
  description: '',
  quantity: 1,
  productGroup: '',
  productType: '14 [FOGA-vegger]',
  ...overrides,
})

const rows = [
  row({ quantity: 10 }),
  row({ quantity: 4, stand: 'C02-10' }),
  row({ quantity: -4, stand: 'C02-10' }),
  row({ quantity: 21, stand: 'D01-01' }),
  row({ productType: '23 [Print]', stand: 'C04-44', quantity: 3 }),
  row({ productType: '23 [Print]', stand: 'C04-44', quantity: 2 }),
  row({ productType: '23 [Print]', stand: 'C09-01', quantity: 1 }),
  row({ productType: '0', stand: '', transInfo: 'Møterom hall E1', avdeling: '32', quantity: 100 }),
]

describe('Visma lines', () => {
  it('reads the work type and hall like the workbook', () => {
    expect(workTypeName('14 [FOGA-vegger]')).toBe('FOGA-vegger')
    expect(workTypeName('1 [5999 [Diverse]]')).toBe('5999 [Diverse')
    expect(workTypeName('0')).toBe('01_ingen produkttype')
    expect(hallOf({ stand: 'C04-44', transInfo: '' })).toBe('Hall C')
    expect(hallOf({ stand: '', transInfo: 'Hall C og D' })).toBe('Hall C og D')
  })

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

  it('flags lines without a product type until the planner picks a work type', () => {
    const key = vismaLineKey('26970', '32', '01_ingen produkttype', 'Møterom hall E1')
    expect(buildVismaLines(rows, kpi, {}).find((l) => l.key === key)).toMatchObject({ issue: 'no-product-type', assemblyHours: 0, competence: 'Ukjent' })
    const assigned = buildVismaLines(rows, kpi, { [key]: { workType: 'Teppefliser' } }).find((l) => l.key === key)!
    expect(assigned).toMatchObject({ issue: null, competence: 'Teppefliser', unit: 'm²' })
    expect(assigned.assemblyHours).toBe(2)
  })

  it('applies Effekt and the in-plan toggle without changing the source', () => {
    const key = vismaLineKey('26970', '65', 'FOGA-vegger', 'Hall C')
    const source = { projectNo: '26970', eventName: 'VVS 2026', fileName: 'x.xlsx', importedAt: '', rows }
    const line = vismaDemandLines(source, kpi, { [key]: { effekt: 0.9, inPlan: true, comment: 'egen opptelling' } }).find((l) => l.id === `visma|${key}`)!
    expect(line.assemblyHours).toBeCloseTo((10 / 7) * 0.1)
    expect(line).toMatchObject({ basis: 'Planlagt', origin: 'visma', source: 'visma per reg. dato', comment: 'egen opptelling' })
    expect(vismaDemandLines(source, kpi, {}).every((l) => l.basis === 'visma per reg. dato')).toBe(true)
  })
})

const legacyLine = (overrides: Partial<DemandLine>): DemandLine => ({
  id: 'l',
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
  basis: 'visma per reg. dato',
  assemblyHours: 0,
  dismantleHours: 0,
  comment: '',
  avdeling: '65',
  effekt: 0,
  ...overrides,
})

describe('decisions on lines that left the export', () => {
  const gone = vismaLineKey('26970', '65', 'FOGA-vegger', 'Hall E')
  const present = vismaLineKey('26970', '65', 'FOGA-vegger', 'Hall C')
  const lines = buildVismaLines(rows, kpi, {})

  it('lists them with the line as it read when the decision was made', () => {
    const found = orphanedDecisions('26970', lines, {
      [gone]: { effekt: 1, comment: 'egen opptelling', ref: { avdeling: '65', workType: 'FOGA-vegger', hall: 'Hall E' } },
      [present]: { inPlan: true },
    })
    expect(found).toEqual([expect.objectContaining({ key: gone, workType: 'FOGA-vegger', hall: 'Hall E', avdeling: '65' })])
  })

  it('ignores other projects and decisions that have been reset', () => {
    expect(
      orphanedDecisions('26970', lines, {
        [vismaLineKey('26100', '65', 'Print', 'Hall A')]: { inPlan: true },
        [gone]: { effekt: 0, inPlan: false, comment: '' },
      }),
    ).toEqual([])
  })
})

describe('workbook decisions', () => {
  it('carries Effekt, comments, «Planlagt» and hand-picked work types over', () => {
    const overrides = harvestOverrides(
      [
        legacyLine({ effekt: 1, comment: 'egen opptelling' }),
        legacyLine({ id: 'p', workType: 'Print', avdeling: '65', hall: 'Hall C', basis: 'Planlagt', quantity: 2 }),
        legacyLine({ id: 't', workType: 'Teppefliser', avdeling: '32', hall: 'Møterom hall E1', quantity: 100 }),
        legacyLine({ id: 'm', source: 'Opptelling/hallkart', basis: 'Planlagt', effekt: 0.5 }),
      ],
      rows,
      kpi,
    )
    expect(overrides[vismaLineKey('26970', '65', 'FOGA-vegger', 'Hall C')]).toEqual({ effekt: 1, comment: 'egen opptelling', ref: { avdeling: '65', workType: 'FOGA-vegger', hall: 'Hall C' } })
    expect(overrides[vismaLineKey('26970', '65', 'Print', 'Hall C')]).toMatchObject({ inPlan: true })
    expect(overrides[vismaLineKey('26970', '32', '01_ingen produkttype', 'Møterom hall E1')]).toMatchObject({ workType: 'Teppefliser', ref: { workType: '01_ingen produkttype' } })
    expect(Object.keys(overrides)).toHaveLength(3)
  })

  it('replaces only Visma rows of imported projects when the workbook is read again', () => {
    const workspace: Workspace = {
      settings: DEFAULT_SETTINGS,
      venue: [],
      projects: [],
      allocations: [],
      capacity: [],
      demand: [legacyLine({}), legacyLine({ id: 'own', source: 'Opptelling/hallkart', basis: 'Planlagt' }), legacyLine({ id: 'other', projectNo: '26100' })],
    }
    const next = withVismaImports(workspace, { kpi, overrides: {}, visma: [{ projectNo: '26970', eventName: 'VVS 2026', fileName: 'x', importedAt: '', rows }] })
    expect(next.demand.filter((l) => l.origin === 'visma')).toHaveLength(4)
    expect(next.demand.map((l) => l.id)).toEqual(expect.arrayContaining(['own', 'other']))
    expect(next.demand.find((l) => l.id === 'l')).toBeUndefined()
  })
})
