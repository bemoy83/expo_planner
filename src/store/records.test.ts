import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type AllocationRow, type DemandLine, type VismaImport, type VismaRow, type Workspace } from '../domain/types'
import { withVismaDemand } from '../domain/visma'
import { applyDeltas, diffWorkspace, effective, fromRecords, mergeDeltas, toRecords, type Delta } from './records'

const row = (id: string, order: number, fte: Record<string, number> = {}, notes: Record<string, string> = {}): AllocationRow => ({
  id,
  order,
  projectName: 'VVS 2026',
  projectNo: '26970',
  refYear: '2026',
  competence: 'Vegger',
  phase: 'Montering',
  basis: 'Planlagt',
  fte,
  notes,
})

const vismaRow = (productType: string, quantity: number): VismaRow => ({ projectNo: '26970', eventName: 'VVS 2026', stand: 'C04-44', transInfo: '', hall: 'Hall C', avdeling: '10', articleNo: '1', description: '', quantity, productGroup: '', productType })
const visma: VismaImport = { projectNo: '26970', eventName: 'VVS 2026', fileName: 'v.xlsx', importedAt: '2026-10-19', rows: [vismaRow('Systemvegger', 70)] }
const own: DemandLine = { id: 'manual-1', projectNo: '26970', projectName: 'VVS 2026', source: 'Egen', workType: 'Rigg', quantity: null, unit: '', stand: '', hall: 'C', competence: 'Vegger', basis: 'Planlagt', assemblyHours: 8, dismantleHours: 4, comment: '', origin: 'manual' }

const base = (): Workspace => {
  const ws: Workspace = {
    settings: DEFAULT_SETTINGS,
    venue: [{ id: 'venyou-c|vvs 2026|2026-10-14|confirmed', hall: 'C', eventName: 'VVS 2026', status: 'Confirmed', phases: { event: { start: '2026-10-14', end: '2026-10-16' } } }],
    projects: [{ name: 'VVS 2026', projectNo: '26970' }],
    demand: [own],
    allocations: [row('a', 0, { '2026-10-05': 2 }, { '2026-10-05': 'Tidlig' }), row('b', 1)],
    kpi: { workTypes: [{ productType: 'Systemvegger', unit: 'lm', competence: 'Vegger' }], rates: [{ name: 'Systemvegger', unit: 'lm', assembly: 7, dismantle: 14 }], byText: [{ text: 'Montering etter avtale', productType: 'Systemvegger' }] },
    visma: [visma],
    overrides: {},
    hallRules: { places: [{ name: 'B', halls: ['B1', 'B2'] }], phrases: [], choices: { 'cafe': 'C' } },
    hiddenVenue: {},
    budgets: { '26970': 480 },
    persons: [{ id: 'p1', name: 'Anders Berg', order: 0, competences: ['Vegger'] }],
  }
  return { ...ws, demand: withVismaDemand(ws) }
}

describe('the workspace as records', () => {
  it('reads back as the workspace it was made from, with the Visma lines worked out and not stored', () => {
    const ws = base()
    const records = toRecords(ws)
    expect(records.some((r) => r.kind === 'demand' && r.id.startsWith('visma'))).toBe(false)
    expect(records.filter((r) => r.kind === 'allocCell').map((r) => [r.id, r.value])).toEqual([['a|2026-10-05', { fte: 2, note: 'Tidlig' }]])
    const back = fromRecords(records)!
    expect(back.demand.map((l) => l.id).sort()).toEqual(ws.demand.map((l) => l.id).sort())
    expect(back.allocations).toEqual(ws.allocations)
    expect(back.kpi).toEqual(ws.kpi)
    expect(back.hallRules).toEqual(ws.hallRules)
    expect(back.budgets).toEqual(ws.budgets)
  })

  it('is nothing before a workspace is started', () => {
    expect(fromRecords([])).toBeNull()
  })

  it('makes a typed day one record of its own', () => {
    const ws = base()
    const next = { ...ws, allocations: [{ ...ws.allocations[0], fte: { ...ws.allocations[0].fte, '2026-10-06': 3 } }, ws.allocations[1]] }
    expect(diffWorkspace(ws, next)).toEqual([{ kind: 'allocCell', id: 'a|2026-10-06', before: null, after: { fte: 3 } }])
  })

  it('removes the days of a removed row with it', () => {
    const ws = base()
    const deltas = diffWorkspace(ws, { ...ws, allocations: [ws.allocations[1]] })
    expect(deltas.map((d) => [d.kind, d.id, d.after])).toEqual([['allocation', 'a', null], ['allocCell', 'a|2026-10-05', null]])
  })

  it('leaves out a day whose row is not there', () => {
    const ws = base()
    const orphan: Delta = { kind: 'allocCell', id: 'gone|2026-10-05', before: null, after: { fte: 1 } }
    expect(applyDeltas(ws, [orphan], 'after').allocations.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('makes a key of a map, a hall choice and a rule for a text records of their own', () => {
    const ws = base()
    const next: Workspace = {
      ...ws,
      overrides: { k1: { excluded: true } },
      hallRules: { ...ws.hallRules!, choices: { ...ws.hallRules!.choices, scene: 'D' } },
      kpi: { ...ws.kpi!, byText: [...ws.kpi!.byText!, { text: 'Frakt', productType: 'Systemvegger' }] },
    }
    expect(diffWorkspace(ws, next).map((d) => `${d.kind} ${d.id}`).sort()).toEqual(['hallChoice scene', 'kpiText frakt', 'override k1'])
  })

  it('sorts rows of the same order by id, so every computer shows them alike', () => {
    const ws = base()
    const next = applyDeltas(ws, [{ kind: 'allocation', id: '0-new', before: null, after: { ...row('0-new', 1), fte: undefined, notes: undefined } }], 'after')
    expect(next.allocations.map((r) => r.id)).toEqual(['a', '0-new', 'b'])
  })
})

describe('undo on records', () => {
  it('keeps the first value before and the last after of a record changed several times in one step', () => {
    const ws = base()
    const first = { ...ws, allocations: [{ ...ws.allocations[0], fte: { '2026-10-05': 3 } }, ws.allocations[1]] }
    const second = { ...first, allocations: [{ ...first.allocations[0], fte: { '2026-10-05': 4 } }, ws.allocations[1]] }
    const step = new Map<string, Delta>()
    mergeDeltas(step, diffWorkspace(ws, first))
    mergeDeltas(step, diffWorkspace(first, second))
    const deltas = effective(step)
    expect(applyDeltas(second, deltas, 'before').allocations).toEqual(ws.allocations)
    expect(applyDeltas(ws, deltas, 'after').allocations).toEqual(second.allocations)
  })

  it('is no step where a record was changed and changed back', () => {
    const ws = base()
    const changed = { ...ws, budgets: { '26970': 500 } }
    const step = new Map<string, Delta>()
    mergeDeltas(step, diffWorkspace(ws, changed))
    mergeDeltas(step, diffWorkspace(changed, { ...changed, budgets: { '26970': 480 } }))
    expect(effective(step)).toEqual([])
  })

  it('undoes one override and leaves another planner\'s keys alone', () => {
    const ws = { ...base(), overrides: { theirs: { comment: 'Kari' } } }
    const mine = { ...ws, overrides: { ...ws.overrides, mine: { excluded: true } } }
    const deltas = diffWorkspace(ws, mine)
    // Another planner changes their key after mine.
    const later = { ...mine, overrides: { ...mine.overrides, theirs: { comment: 'Kari, endret' } } }
    expect(applyDeltas(later, deltas, 'before').overrides).toEqual({ theirs: { comment: 'Kari, endret' } })
  })

  it('works out the Visma lines again when an input of theirs is undone', () => {
    const ws = base()
    const kpi = { ...ws.kpi!, rates: [{ name: 'Systemvegger', unit: 'lm', assembly: 14, dismantle: 14 }] }
    const next = { ...ws, kpi, demand: withVismaDemand({ ...ws, kpi }) }
    const deltas = diffWorkspace(ws, next)
    expect(deltas.map((d) => d.kind)).toEqual(['kpi'])
    const hours = (w: Workspace) => w.demand.filter((l) => l.origin === 'visma').reduce((sum, l) => sum + l.assemblyHours, 0)
    expect(hours(next)).toBe(hours(ws) / 2)
    expect(hours(applyDeltas(next, deltas, 'before'))).toBe(hours(ws))
  })

  it('restores a removed hall booking and an import note', () => {
    const ws = { ...base(), venueImport: { fileName: 'a.xlsx', importedAt: '', from: '2026-01-01', to: '2026-12-31' } }
    const next = { ...ws, venue: [], venueImport: undefined }
    const back = applyDeltas(next, diffWorkspace(ws, next), 'before')
    expect(back.venue).toEqual(ws.venue)
    expect(back.venueImport).toEqual(ws.venueImport)
  })
})
