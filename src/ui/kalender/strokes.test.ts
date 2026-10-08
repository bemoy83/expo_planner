import { describe, expect, it } from 'vitest'
import { buildDemandIndex } from '../../domain/calc'
import { DEFAULT_SETTINGS, type AllocationRow, type DemandLine } from '../../domain/types'
import type { AllocLane } from './gridTypes'
import type { GroupNode } from './rows'
import type { Fill, Selection } from './selection'
import { copyText, fillNotice, fillPreview, fillProgress, ghostCells, overbookedDays, pasteCells, pencilNotice, pencilProgress, pencilStroke, proposal, proposalNotice } from './strokes'

// Monday 5 to Sunday 11 October 2026.
const dates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']
const [MON, TUE, WED, , FRI, SAT, SUN] = dates

const row = (id: string, overrides: Partial<AllocationRow> = {}): AllocationRow => ({
  id,
  order: 0,
  projectName: 'VVS 2026',
  projectNo: '26970',
  refYear: '2026',
  competence: 'FOGA',
  phase: 'Montering',
  basis: 'Planlagt',
  fte: {},
  notes: {},
  ...overrides,
})
const demand = (competence: string, assemblyHours: number): DemandLine => ({
  id: competence,
  projectNo: '26970',
  projectName: 'VVS 2026',
  eventYear: '2026',
  source: '',
  workType: competence,
  quantity: null,
  unit: '',
  stand: '',
  hall: '',
  competence,
  basis: 'Planlagt',
  assemblyHours,
  dismantleHours: 0,
  comment: '',
})
// FOGA needs 5 FTE-days and Print 1,2; Banner has no demand.
const index = buildDemandIndex([demand('FOGA', 37.5), demand('Print', 9)])
const settings = DEFAULT_SETTINGS
const over = (lane0: number, col0: number, lane1: number, col1: number): Selection => ({ anchor: { lane: lane0, col: col0 }, focus: { lane: lane1, col: col1 } })
const lanesOf = (...rows: AllocationRow[]): AllocLane[] => rows.map((r, i) => ({ row: r, index: i }))
const valueOf = (lanes: AllocLane[]) => (lane: number, date: string) => lanes[lane]?.row?.fte[date]

describe('pencilStroke', () => {
  it('shares what is left of the demand over the working days drawn across', () => {
    const drawn = pencilStroke(over(0, 0, 0, 2), dates, lanesOf(row('a')), index, settings)!
    expect(drawn.target).toEqual([MON, TUE, WED])
    expect(drawn.lanes).toEqual([{ lane: 0, parts: [2, 2, 1] }])
    expect(drawn).toMatchObject({ shared: 5, perDay: [2, 2, 1], withoutDemand: 0 })
  })

  it('leaves the weekend alone, unless nothing else is drawn', () => {
    expect(pencilStroke(over(0, 4, 0, 6), dates, lanesOf(row('a')), index, settings)!.target).toEqual([FRI])
    expect(pencilStroke(over(0, 5, 0, 6), dates, lanesOf(row('a')), index, settings)!.target).toEqual([SAT, SUN])
  })

  it('counts what is planned outside the stroke and replaces what is inside it', () => {
    const planned = row('a', { fte: { [MON]: 1, [FRI]: 3 } })
    // 5 needed, 3 on Friday outside the stroke: 2 left for Monday and Tuesday, whatever Monday held.
    expect(pencilStroke(over(0, 0, 0, 1), dates, lanesOf(planned), index, settings)!.lanes).toEqual([{ lane: 0, parts: [1, 1] }])
  })

  it('draws on a line each and tells how many had nothing left', () => {
    const lanes = lanesOf(row('a'), row('b', { competence: 'Banner' }), row('c', { competence: 'Print' }))
    const drawn = pencilStroke(over(0, 0, 2, 1), dates, lanes, index, settings)!
    expect(drawn.lanes.map((l) => l.lane)).toEqual([0, 2])
    expect(drawn.withoutDemand).toBe(1)
    expect(drawn.perDay).toEqual(drawn.target.map((_, i) => drawn.lanes[0].parts[i] + drawn.lanes[1].parts[i]))
    expect(pencilNotice(drawn)).toBe('Fordelte 6,2 FTE-dager på 2 dager. 1 linje hadde ikke behov igjen.')
  })

  it('uses the sums of a level in entry mode', () => {
    const node = { totals: { requiredFte: 4, plannedFte: 1 }, daily: new Map([[MON, 1]]) } as GroupNode
    expect(pencilStroke(over(0, 0, 0, 1), dates, [{ node, index: 0 }], index, settings)!.lanes).toEqual([{ lane: 0, parts: [2, 2] }])
  })

  it('is nothing without a selection', () => {
    expect(pencilStroke(null, dates, lanesOf(row('a')), index, settings)).toBeNull()
  })

  it('says so when nothing is left to share', () => {
    const done = pencilStroke(over(0, 0, 0, 1), dates, lanesOf(row('a', { fte: { [FRI]: 5 } })), index, settings)!
    expect(done.shared).toBe(0)
    expect(pencilNotice(done)).toMatch(/^Ikke noe behov igjen/)
    expect(pencilProgress(done)).toBe('Tegner: ikke noe behov igjen å fordele her')
    expect(pencilProgress(pencilStroke(over(0, 0, 0, 2), dates, lanesOf(row('a')), index, settings)!)).toBe('Tegner: opptil 2 FTE per dag over 3 arbeidsdager')
  })
})

describe('proposal', () => {
  const window = new Set([SAT, MON, TUE])
  const windowOf = (r: AllocationRow) => (r.id === 'nowhere' ? undefined : window)

  it('shares each row over the working days of its window', () => {
    const a = row('a')
    const plan = proposal([a], false, windowOf, index, settings)
    expect(plan.writes).toEqual([
      { row: a, date: MON, value: 3 },
      { row: a, date: TUE, value: 2 },
    ])
    expect(plan).toMatchObject({ done: 1, hadPlan: 0, noWindow: 0, noDemand: 0 })
  })

  it('leaves rows that have a plan, no window or no demand, and says how many', () => {
    const plan = proposal([row('a'), row('planned', { fte: { [WED]: 1 } }), row('nowhere'), row('banner', { competence: 'Banner' })], false, windowOf, index, settings)
    expect(plan.writes.every((write) => write.row.id === 'a')).toBe(true)
    expect(plan).toMatchObject({ done: 1, hadPlan: 1, noWindow: 1, noDemand: 1 })
    expect(proposalNotice(plan)).toBe('Foreslo plan for 1 rad · 1 rad hadde plan fra før og er ikke rørt · 1 rad har ingen monterings- eller demonteringsdager i hallkalenderen · 1 rad har ikke behov igjen')
    expect(proposalNotice(proposal([], false, windowOf, index, settings))).toBe('Ingen rader fikk forslag')
  })

  it('replaces the days in the window for a single row, keeping what lies outside it', () => {
    const a = row('a', { fte: { [MON]: 1, [WED]: 4 } })
    // 5 needed and 4 on Wednesday outside the window: 1 left, put on Monday; Tuesday has nothing to clear.
    expect(proposal([a], true, windowOf, index, settings).writes).toEqual([{ row: a, date: MON, value: 1 }])
    const b = row('b', { fte: { [MON]: 1, [TUE]: 1, [WED]: 4 } })
    expect(proposal([b], true, windowOf, index, settings).writes).toEqual([
      { row: b, date: MON, value: 1 },
      { row: b, date: TUE, value: null },
    ])
  })
})

describe('the fill handle', () => {
  const lanes = lanesOf(row('a', { fte: { [MON]: 2 } }))
  const fill = (overrides: Partial<Fill> = {}): Fill => ({ lane0: 0, lane1: 0, col0: 0, col1: 0, toCol: 2, stretch: false, ...overrides })

  it('copies the block over the days dragged across', () => {
    const cells = fillPreview(fill(), dates, valueOf(lanes))
    expect(cells.filter((cell) => cell.date !== MON)).toEqual([
      { lane: 0, date: TUE, value: 2 },
      { lane: 0, date: WED, value: 2 },
    ])
    expect(fillProgress(fill(), cells)).toMatch(/^Fyller \d dager · hold Alt/)
    expect(fillNotice(fill(), cells)).toMatch(/^Fylte \d dager$/)
  })

  it('stretches the sum of the block with Alt', () => {
    const stretched = fillPreview(fill({ toCol: 1, stretch: true }), dates, valueOf(lanes))
    expect(stretched.map((cell) => cell.value)).toEqual([1, 1])
    expect(fillProgress(fill({ toCol: 1, stretch: true }), stretched)).toBe('Strekker: opptil 1 FTE per dag over 2 dager')
    expect(fillNotice(fill({ toCol: 1, stretch: true }), stretched)).toBe('Strakk over 2 dager')
  })

  it('has nothing to say before the drag has moved, and no cells without a drag', () => {
    expect(fillPreview(null, dates, valueOf(lanes))).toEqual([])
    expect(fillNotice(fill(), [])).toBeNull()
    expect(fillProgress(fill(), [])).toBe('Dra sidelengs for å fylle · hold Alt for å strekke')
    expect(fillProgress(fill({ stretch: true }), [])).toBe('Strekker: ingenting å fordele')
  })
})

describe('ghostCells', () => {
  it('shows what a pencil stroke, an eraser stroke and a fill would leave in the cells', () => {
    const preview = pencilStroke(over(0, 0, 0, 1), dates, lanesOf(row('a')), index, settings)
    expect(ghostCells(preview, null, dates, []).get(0)).toEqual(new Map([[MON, 3], [TUE, 2]]))
    expect(ghostCells(null, over(1, 0, 1, 1), dates, []).get(1)).toEqual(new Map([[MON, 0], [TUE, 0]]))
    const filled = ghostCells(null, null, dates, [{ lane: 2, date: WED, value: null }, { lane: 2, date: TUE, value: 4 }])
    expect(filled.get(2)).toEqual(new Map([[WED, 0], [TUE, 4]]))
  })
})

describe('overbookedDays', () => {
  const crew = { ...settings, baseCrew: 2 }

  it('lists the days planned above the crew', () => {
    const days = overbookedDays(new Map([[MON, 3], [TUE, 2]]), null, [], [], () => undefined, [], crew)
    expect([...days]).toEqual([[MON, { need: 3, available: 2 }]])
  })

  it('counts a stroke and a fill in progress as the change they would make', () => {
    const lanes = lanesOf(row('a', { fte: { [MON]: 1 } }))
    const need = new Map([[MON, 1]])
    const preview = pencilStroke(over(0, 0, 0, 0), dates, lanes, index, settings)
    // The stroke puts all 5 on Monday in place of the 1 that is there.
    expect(overbookedDays(need, preview, [], lanes, valueOf(lanes), [], crew).get(MON)).toEqual({ need: 5, available: 2 })
    const dragged = [{ lane: 0, date: TUE, value: 3 }]
    expect(overbookedDays(need, null, dragged, lanes, valueOf(lanes), [], crew).get(TUE)).toEqual({ need: 3, available: 2 })
  })
})

describe('the clipboard', () => {
  const lanes = lanesOf(row('a', { fte: { [MON]: 1.5, [WED]: 2 } }), row('b', { fte: { [TUE]: 3 } }))

  it('copies the selection as tabs and lines, with a decimal comma', () => {
    expect(copyText(over(0, 0, 1, 2), dates, valueOf(lanes))).toBe('1,5\t\t2\n\t3\t')
  })

  it('pastes from the top left of the selection, clears on an empty cell and skips what is no number', () => {
    expect(pasteCells('1,5\t\tx\r\n2\n', over(1, 1, 0, 3), dates, 2)).toEqual([
      { lane: 0, date: TUE, value: 1.5 },
      { lane: 0, date: WED, value: null },
      { lane: 1, date: TUE, value: 2 },
    ])
  })

  it('drops what falls outside the grid', () => {
    expect(pasteCells('1\t2\n3\t4', over(1, 6, 1, 6), dates, 2)).toEqual([{ lane: 1, date: SUN, value: 1 }])
  })
})
