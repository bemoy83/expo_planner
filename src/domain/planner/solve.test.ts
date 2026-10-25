import { describe, expect, it } from 'vitest'
import { setCompetenceStyle } from '../competences'
import { DEFAULT_SETTINGS, type AllocationRow, type Assignment, type CompetenceStyle, type Person, type Workspace } from '../types'
import { scorePlan } from './score'
import { consolidate, solve, takeProjects } from './solve'
import { ownChanged } from '../staffing/edit'

/** The planning engine on small invented plans. */

const MON = '2026-10-12'
const TUE = '2026-10-13'
const WED = '2026-10-14'
const WEEK = [MON, TUE, WED, '2026-10-15', '2026-10-16']

const STYLES: [string, Partial<CompetenceStyle>][] = [
  ['banner', { stage: 'lopende' }],
  ['tepper', { stage: 'gulv' }],
  ['foga', { stage: 'standbygging' }],
  ['oppmerking', { stage: 'oppmerking', minPerHall: 2 }],
]

const person = (id: string, ...competences: string[]): Person => ({ id, name: id, order: 0, competences })

const workspace = (persons: Person[], allocations: AllocationRow[] = [], assignments: Assignment[] = []): Workspace => {
  let ws: Workspace = { settings: DEFAULT_SETTINGS, venue: [], projects: [], demand: [], allocations: STYLES.map(([key]) => row(key, {}, '99999')), persons }
  for (const [key, style] of STYLES) ws = { ...ws, competenceStyles: setCompetenceStyle(ws, key, style) }
  const keys = STYLES.map(([key]) => key)
  ws = { ...ws, competenceStyles: Object.fromEntries(Object.entries(ws.competenceStyles!).map(([key, style]) => [key, { ...style, order: keys.indexOf(key) }])) }
  return { ...ws, allocations, assignments }
}

function row(competence: string, fte: Record<string, number> = {}, projectNo = '26001', hall = 'B1', id = `forslag|${projectNo}|${competence}|${hall}`): AllocationRow {
  return { id, order: 0, projectName: `Messe ${projectNo}`, projectNo, refYear: '2026', competence, phase: 'Montering', basis: 'Planlagt', hall, fte, notes: {} }
}

let n = 0
const makeId = () => `id${n++}`

/** Solves for the rows, each needing the FTE-days given, all with the same window. */
const run = (ws: Workspace, rows: AllocationRow[], needs: number[], window: string[], keepTyped = true, near: string[] = []) =>
  solve({ ws, rows, required: (r) => needs[rows.indexOf(rows.find((x) => x.id === r.id)!)], windowOf: () => new Set(window), nearby: () => near, keepTyped, makeId })

const blocksOf = (ws: Workspace, competence?: string) => (ws.assignments ?? []).filter((a) => a.source === 'suggested' && (!competence || a.competence === competence))
const fteOf = (ws: Workspace, competence: string, projectNo = '26001') => ws.allocations.find((r) => r.competence === competence && r.projectNo === projectNo)?.fte

describe('the planning engine', () => {
  it('places a job in its window in whole people and keeps the same person on it from day to day', () => {
    const rows = [row('foga')]
    const { workspace: ws, projects } = run(workspace([person('per', 'foga'), person('pål', 'foga')]), rows, [3], [MON, TUE, WED])
    expect(projects).toEqual(['26001'])
    expect(fteOf(ws, 'foga')).toEqual({ [MON]: 1, [TUE]: 1, [WED]: 1 })
    const blocks = blocksOf(ws)
    expect(blocks).toHaveLength(3)
    expect(new Set(blocks.map((b) => b.personId)).size).toBe(1)
    expect(blocks[0]).toMatchObject({ projectNo: '26001', hall: 'B1', start: DEFAULT_SETTINGS.workday.dayStart, end: DEFAULT_SETTINGS.workday.dayEnd })
    expect(ws.allocations.find((r) => r.competence === 'foga')!.engine).toEqual([MON, TUE, WED])
  })

  it('puts the floor before the walls in a hall, with the stages overlapping', () => {
    const rows = [row('foga'), row('tepper')]
    const { workspace: ws } = run(workspace([person('per', 'foga'), person('ola', 'tepper')]), rows, [2, 2], WEEK)
    const first = (fte: Record<string, number> | undefined) => Object.keys(fte ?? {}).sort()[0]
    expect(first(fteOf(ws, 'tepper')) < first(fteOf(ws, 'foga'))).toBe(true)
    expect(scorePlan(ws, WEEK, () => new Set(WEEK)).byKind.stage).toBe(0)
  })

  it('gives the hardest competence to replace the person who has it, before the easier ones', () => {
    const rows = [row('foga'), row('banner')]
    const { workspace: ws } = run(workspace([person('ola', 'foga'), person('kari', 'foga', 'banner')]), rows, [1, 1], [MON])
    expect(blocksOf(ws, 'banner').map((b) => b.personId)).toEqual(['kari'])
    expect(blocksOf(ws, 'foga').map((b) => b.personId)).toEqual(['ola'])
  })

  it('gives a competence done by at least two in a hall two a day, on fewer days', () => {
    const rows = [row('oppmerking')]
    const { workspace: ws } = run(workspace([person('per', 'oppmerking'), person('pål', 'oppmerking')]), rows, [2], [MON, TUE, WED])
    expect(fteOf(ws, 'oppmerking')).toEqual({ [MON]: 2 })
    expect(blocksOf(ws).map((b) => b.personId).sort()).toEqual(['per', 'pål'])
  })

  it('moves what nobody can take on a day to a day of the window where someone can', () => {
    const away = (personId: string, date: string) => ({ id: `${personId}-${date}`, personId, date })
    const ws0 = { ...workspace([person('per', 'foga'), person('pål', 'foga')]), unavailability: [away('per', MON), away('pål', MON)] }
    const { workspace: ws } = run(ws0, [row('foga')], [2], [MON, TUE])
    expect(fteOf(ws, 'foga')).toEqual({ [TUE]: 2 })
    expect(scorePlan(ws, [MON, TUE], () => new Set([MON, TUE])).byKind.uncovered).toBe(0)
  })

  it('starts earlier on a day the hall stands free when the crew cannot do it all in the window, and lists the day for Venyou', () => {
    const ws0 = workspace([person('per', 'foga'), person('pål', 'foga')])
    const solution = run(ws0, [row('foga')], [4], [TUE], true, [MON])
    expect(fteOf(solution.workspace, 'foga')).toEqual({ [MON]: 2, [TUE]: 2 })
    expect(solution.outside).toEqual([{ projectNo: '26001', projectName: 'Messe 26001', hall: 'B1', date: MON }])
    expect(scorePlan(solution.workspace, [MON, TUE], () => new Set([TUE])).byKind.uncovered).toBe(0)
  })

  it('widens the window where the crew is short, and plans every stage over the widened span, the floor first', () => {
    const rows = [row('tepper'), row('foga')]
    const ws0 = workspace([person('ola', 'tepper'), person('per', 'foga')])
    const THU = '2026-10-15'
    const { workspace: ws, outside } = run(ws0, rows, [2, 4], [TUE, WED, THU], true, [MON])
    const first = (fte: Record<string, number> | undefined) => Object.keys(fte ?? {}).sort()[0]
    // The floor is not short, but it is planned again over the widened span: it starts the Monday, and the walls the day after.
    expect(first(fteOf(ws, 'tepper'))).toBe(MON)
    expect(first(fteOf(ws, 'foga'))).toBe(TUE)
    expect(outside.map((d) => d.date)).toContain(MON)
    expect(scorePlan(ws, [MON, TUE, WED, THU], () => new Set([TUE, WED, THU])).byKind.stage).toBe(0)
  })

  it('keeps the order of the stages when it moves work within the window', () => {
    const rows = [row('tepper'), row('foga')]
    const ws0 = workspace([person('ola', 'tepper'), person('per', 'foga')])
    const { workspace: ws } = run(ws0, rows, [2, 4], [TUE, WED])
    // The walls start the day after the floor, so what the one fitter cannot do waits there rather than going before the floor.
    expect(Object.keys(fteOf(ws, 'foga') ?? {}).sort()).toEqual([WED])
    expect(scorePlan(ws, [TUE, WED], () => new Set([TUE, WED])).byKind.stage).toBe(0)
  })

  it('starts a stage the day after the stage before it, and keeps banner to the days the walls stand', () => {
    const rows = [row('tepper'), row('foga'), row('banner')]
    const ws0 = workspace([person('ola', 'tepper'), person('per', 'foga'), person('pål', 'foga'), person('kari', 'banner'), person('siri', 'banner')])
    const { workspace: ws } = run(ws0, rows, [1, 4, 4], [MON, TUE, WED])
    const first = (fte: Record<string, number> | undefined) => Object.keys(fte ?? {}).sort()[0]
    expect(first(fteOf(ws, 'tepper'))).toBe(MON)
    expect(first(fteOf(ws, 'foga')) > MON).toBe(true)
    expect(first(fteOf(ws, 'banner')) >= first(fteOf(ws, 'foga'))).toBe(true)
  })

  it('does not widen the window where it does not pay', () => {
    // Nobody can do the walls the Monday either, so a day outside the window would save nothing.
    const away = { id: 'per-mon', personId: 'per', date: MON }
    const ws0 = { ...workspace([person('ola', 'tepper'), person('per', 'foga')]), unavailability: [away] }
    const { outside } = run(ws0, [row('foga')], [4], [TUE, WED], true, [MON])
    expect(outside).toEqual([])
  })

  it('does not start earlier where the crew can do it in the window', () => {
    const solution = run(workspace([person('per', 'foga'), person('pål', 'foga')]), [row('foga')], [2], [TUE], true, [MON])
    expect(fteOf(solution.workspace, 'foga')).toEqual({ [TUE]: 2 })
    expect(solution.outside).toEqual([])
  })

  it('leaves the demand nobody can take in the plan, uncovered', () => {
    const { workspace: ws } = run(workspace([]), [row('foga')], [2], [MON, TUE])
    expect(fteOf(ws, 'foga')).toEqual({ [MON]: 1, [TUE]: 1 })
    expect(blocksOf(ws)).toEqual([])
  })

  it('keeps the FTE the planner typed, or plans it again when he says so', () => {
    const typed = row('foga', { [WED]: 1 }, '26001', 'B1', 'row-typed')
    const ws0 = workspace([person('per', 'foga')], [typed])
    const kept = run(ws0, [typed], [2], [MON, TUE, WED]).workspace
    expect(fteOf(kept, 'foga')).toEqual({ [MON]: 1, [WED]: 1 })
    expect(kept.allocations[0].engine).toEqual([MON])
    const again = run(ws0, [typed], [2], [MON, TUE, WED], false).workspace
    expect(fteOf(again, 'foga')).toEqual({ [MON]: 1, [TUE]: 1 })
  })

  it('leaves the planner\'s blocks, counts them as cover, and paints again what it painted before', () => {
    const own: Assignment = { id: 'own', personId: 'per', date: MON, competence: 'foga', start: 420, end: 900, source: 'manual', projectNo: '26001', hall: 'B1' }
    const earlier: Assignment = { ...own, id: 'old', personId: 'pål', date: TUE, source: 'suggested' }
    const ws0 = workspace([person('per', 'foga'), person('pål', 'foga')], [], [own, earlier])
    const { workspace: ws } = run(ws0, [row('foga')], [2], [MON, TUE])
    expect(ws.assignments!.find((a) => a.id === 'own')).toBe(own)
    expect(ws.assignments!.some((a) => a.id === 'old')).toBe(false)
    expect(blocksOf(ws).map((b) => b.date)).toEqual([TUE])
  })

  it('plans every project at once, and takes the plan for the projects the planner picks', () => {
    const rows = [row('foga', {}, '26001'), row('foga', {}, '26002')]
    const ws0 = workspace([person('per', 'foga'), person('pål', 'foga')])
    const solution = run(ws0, rows, [1, 1], [MON])
    expect(solution.projects.sort()).toEqual(['26001', '26002'])
    expect(new Set(blocksOf(solution.workspace).map((b) => b.personId)).size).toBe(2)
    const taken = takeProjects(ws0, solution.workspace, ['26002'])
    expect(taken.allocations.map((r) => r.projectNo)).toEqual(['26002'])
    expect(blocksOf(taken).map((b) => b.projectNo)).toEqual(['26002'])
  })

  it('makes the score lower than the plan it started from', () => {
    const rows = [row('foga'), row('tepper'), row('banner')]
    const ws0 = workspace([person('per', 'foga'), person('ola', 'tepper', 'foga'), person('kari', 'banner')])
    const { workspace: ws } = run(ws0, rows, [4, 2, 3], WEEK)
    const score = (w: Workspace) => scorePlan(w, WEEK, () => new Set(WEEK)).total
    expect(score(ws)).toBe(0)
  })
})

describe('blocks the engine painted', () => {
  it('become the planner\'s own once he changes them, and only then', () => {
    const painted: Assignment = { id: 'e1', personId: 'per', date: MON, competence: 'foga', start: 420, end: 900, source: 'suggested' }
    const other: Assignment = { ...painted, id: 'e2', date: TUE }
    const before = [painted, other]
    expect(ownChanged(before, before)).toBe(before)
    const after = ownChanged(before, [{ ...painted, end: 780 }, other])!
    expect(after.map((a) => a.source)).toEqual(['manual', 'suggested'])
    expect(ownChanged(before, [other])).toEqual([other])
  })
})

describe('a day shared out again on the same people', () => {
  const wd = DEFAULT_SETTINGS.workday
  const piece = (personId: string, projectNo: string, from: number, to: number, date = MON): Assignment => ({ id: `${personId}-${projectNo}-${from}`, personId, date, competence: 'foga', start: from, end: to, source: 'suggested', projectNo, hall: 'B1' })
  // Half a day of A, a day of B and half a day of C, as the day is filled job by job: each person ends with two pieces.
  const filled = [piece('per', 'A', 420, 645), piece('per', 'B', 645, 900), piece('pål', 'B', 420, 645), piece('pål', 'C', 645, 900)]

  it('gives the biggest piece of work a whole person, and the rest to the other, so there are fewer pieces', () => {
    const out = consolidate(filled, wd, makeId)
    const pairs = new Set(out.map((a) => `${a.personId}|${a.projectNo}`))
    expect(pairs.size).toBe(3)
    expect(out.filter((a) => a.projectNo === 'B')).toHaveLength(1)
    // The hours of each piece of work are as they were.
    const hoursOf = (list: Assignment[], projectNo: string) => list.filter((a) => a.projectNo === projectNo).reduce((sum, a) => sum + (a.end - a.start), 0)
    for (const project of ['A', 'B', 'C']) expect(hoursOf(out, project)).toBe(hoursOf(filled, project))
  })

  it('lets the one who had a piece of work the day before keep it', () => {
    const yesterday = [piece('pål', 'A', 420, 900, '2026-10-11'), piece('per', 'B', 420, 900, '2026-10-11')]
    const today = [piece('per', 'A', 420, 900), piece('pål', 'B', 420, 900)]
    const out = consolidate([...yesterday, ...today], wd, makeId).filter((a) => a.date === MON)
    expect(out.map((a) => `${a.personId}|${a.projectNo}`).sort()).toEqual(['per|B', 'pål|A'])
  })
})
