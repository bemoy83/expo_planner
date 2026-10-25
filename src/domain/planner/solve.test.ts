import { describe, expect, it } from 'vitest'
import { setCompetenceStyle } from '../competences'
import { DEFAULT_SETTINGS, type AllocationRow, type Assignment, type CompetenceStyle, type Person, type Workspace } from '../types'
import { scorePlan } from './score'
import { solve, takeProjects } from './solve'
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

  it('keeps the order of the stages when it moves work: the walls start no earlier than the floor', () => {
    const rows = [row('tepper'), row('foga')]
    const ws0 = workspace([person('ola', 'tepper'), person('per', 'foga')])
    const { workspace: ws } = run(ws0, rows, [2, 4], [TUE, WED], true, [MON])
    expect(fteOf(ws, 'foga')).toEqual({ [TUE]: 2, [WED]: 2 })
    expect(scorePlan(ws, [MON, TUE, WED], () => new Set([TUE, WED])).byKind.stage).toBe(0)
  })

  it('lets the walls follow the floor to a day before the window once the floor has gone there', () => {
    const rows = [row('tepper'), row('foga')]
    const ws0 = workspace([person('ola', 'tepper'), person('per', 'foga')])
    const { workspace: ws } = run(ws0, rows, [3, 3], [TUE, WED], true, [MON])
    expect(fteOf(ws, 'tepper')?.[MON]).toBe(1)
    expect(fteOf(ws, 'foga')?.[MON]).toBe(1)
    expect(scorePlan(ws, [MON, TUE, WED], () => new Set([TUE, WED])).byKind.stage).toBe(0)
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
