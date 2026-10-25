import { describe, expect, it } from 'vitest'
import { setCompetenceStyle } from '../competences'
import { DEFAULT_SETTINGS, type AllocationRow, type Assignment, type CompetenceStyle, type Person, type Workspace } from '../types'
import { scorePlan } from './score'
import { consolidate, inStretches, solve, takeProjects } from './solve'
import { ownChanged } from '../staffing/edit'

/** The planning engine on small invented plans. */

const MON = '2026-10-12'
const TUE = '2026-10-13'
const WED = '2026-10-14'
const THU = '2026-10-15'
const WEEK = [MON, TUE, WED, THU, '2026-10-16']

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
/** The first day a row has FTE. */
const first = (fte: Record<string, number> | undefined) => Object.keys(fte ?? {}).sort()[0]

describe('the planning engine', () => {
  it('places a build-up in its window from the day the exhibitors move in, in whole days, and keeps people on it', () => {
    const rows = [row('foga')]
    const { workspace: ws, projects } = run(workspace([person('per', 'foga'), person('pål', 'foga')]), rows, [3], [MON, TUE, WED])
    expect(projects).toEqual(['26001'])
    // Both fitters are free the Wednesday, the last day, so it is done with both; the one who works the Tuesday is one of them.
    expect(fteOf(ws, 'foga')).toEqual({ [WED]: 2, [TUE]: 1 })
    const blocks = blocksOf(ws)
    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toMatchObject({ projectNo: '26001', hall: 'B1', start: DEFAULT_SETTINGS.workday.dayStart, end: DEFAULT_SETTINGS.workday.dayEnd })
    expect(ws.allocations.find((r) => r.competence === 'foga')!.engine).toEqual([TUE, WED])
  })

  it('plans a tear-down on from the end of the event', () => {
    const rows = [{ ...row('foga'), phase: 'Demontering' as const }]
    const { workspace: ws } = run(workspace([person('per', 'foga'), person('pål', 'foga')]), rows, [3], [MON, TUE, WED])
    expect(fteOf(ws, 'foga')).toEqual({ [MON]: 2, [TUE]: 1 })
  })

  it('fills the window of a build-up before it takes a day the hall stands free before it, and takes that day for the rest alone', () => {
    // Two fitters can do four days' work in the two days of the window: the Monday before it is not used. A fifth day's work
    // takes the Monday, for what the window cannot hold.
    const ws0 = workspace([person('per', 'foga'), person('pål', 'foga')])
    const fits = run(ws0, [row('foga')], [4], [TUE, WED], true, [MON])
    expect(fteOf(fits.workspace, 'foga')).toEqual({ [TUE]: 2, [WED]: 2 })
    expect(fits.outside).toEqual([])
    const more = run(ws0, [row('foga')], [5], [TUE, WED], true, [MON])
    expect(fteOf(more.workspace, 'foga')).toEqual({ [MON]: 1, [TUE]: 2, [WED]: 2 })
    expect(more.outside.map((d) => d.date)).toEqual([MON])
  })

  it('puts the floor before the walls in a hall, with the stages overlapping', () => {
    const rows = [row('foga'), row('tepper')]
    const { workspace: ws } = run(workspace([person('per', 'foga'), person('ola', 'tepper')]), rows, [2, 2], WEEK)
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
    expect(fteOf(ws, 'oppmerking')).toEqual({ [WED]: 2 })
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
    const { workspace: ws, outside } = run(ws0, rows, [2, 4], [TUE, WED, THU], true, [MON])
    // The floor is not short, but it is planned again over the widened span: the one fitter needs all four days, and the
    // floor begins no later than the walls do.
    expect(first(fteOf(ws, 'tepper'))).toBe(MON)
    expect(Object.keys(fteOf(ws, 'foga') ?? {}).sort()).toEqual([MON, TUE, WED, THU])
    expect(outside.map((d) => d.date)).toContain(MON)
    expect(scorePlan(ws, [MON, TUE, WED, THU], () => new Set([TUE, WED, THU])).byKind.stage).toBe(0)
  })

  it('keeps the order of the stages when it moves work within the window', () => {
    const rows = [row('tepper'), row('foga')]
    const ws0 = workspace([person('ola', 'tepper'), person('per', 'foga')])
    const { workspace: ws } = run(ws0, rows, [2, 4], [TUE, WED])
    // The floor needs both days, so the walls go no further back than the day it begins.
    expect(Object.keys(fteOf(ws, 'tepper') ?? {}).sort()).toEqual([TUE, WED])
    expect(scorePlan(ws, [TUE, WED], () => new Set([TUE, WED])).byKind.stage).toBe(0)
  })

  it('plans a build-up back from the last day, the stages the other way round, and marks the hall out first', () => {
    // Four days, three stages: the walls go last and take the last days, the floor before them, and the marking out,
    // planned last, comes on the first day of all, not on the day the exhibitors move in.
    const rows = [row('oppmerking'), row('tepper'), row('foga')]
    const ws0 = workspace([person('per', 'oppmerking'), person('pål', 'oppmerking'), person('ola', 'tepper'), person('kari', 'foga'), person('siv', 'foga')])
    const { workspace: ws } = run(ws0, rows, [2, 2, 4], [MON, TUE, WED, THU])
    const days = (competence: string) => Object.keys(fteOf(ws, competence) ?? {}).sort()
    expect(days('foga').at(-1)).toBe(THU)
    expect(days('oppmerking')).toEqual([MON])
    expect(days('tepper')[0] >= MON && days('tepper')[0] < days('foga')[0]).toBe(true)
    expect(scorePlan(ws, [MON, TUE, WED, THU], () => new Set([MON, TUE, WED, THU])).byKind.stage).toBe(0)
  })

  it('starts a stage the day after the stage before it, and keeps banner to the days the walls stand', () => {
    const rows = [row('tepper'), row('foga'), row('banner')]
    const ws0 = workspace([person('ola', 'tepper'), person('per', 'foga'), person('pål', 'foga'), person('kari', 'banner'), person('siri', 'banner')])
    const { workspace: ws } = run(ws0, rows, [1, 4, 4], [MON, TUE, WED])
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
    const typed = row('foga', { [MON]: 1 }, '26001', 'B1', 'row-typed')
    const ws0 = workspace([person('per', 'foga')], [typed])
    const kept = run(ws0, [typed], [2], [MON, TUE, WED]).workspace
    expect(fteOf(kept, 'foga')).toEqual({ [MON]: 1, [WED]: 1 })
    expect(kept.allocations[0].engine).toEqual([WED])
    const again = run(ws0, [typed], [2], [MON, TUE, WED], false).workspace
    expect(fteOf(again, 'foga')).toEqual({ [TUE]: 1, [WED]: 1 })
  })

  it('leaves the planner\'s blocks, counts them as cover, and paints again what it painted before', () => {
    const own: Assignment = { id: 'own', personId: 'per', date: MON, competence: 'foga', start: 420, end: 900, source: 'manual', projectNo: '26001', hall: 'B1' }
    const earlier: Assignment = { ...own, id: 'old', personId: 'pål', date: TUE, source: 'suggested' }
    const ws0 = workspace([person('per', 'foga'), person('pål', 'foga')], [], [own, earlier])
    const { workspace: ws } = run(ws0, [row('foga')], [2], [MON, TUE])
    expect(ws.assignments!.find((a) => a.id === 'own')).toBe(own)
    expect(ws.assignments!.some((a) => a.id === 'old')).toBe(false)
    // Per's own block the Monday covers half the work, though the build-up is planned back from the Tuesday: one more is
    // needed, on the Tuesday.
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

  it('covers what the staff can cover, in the order of the stages', () => {
    const rows = [row('foga'), row('tepper'), row('banner')]
    const ws0 = workspace([person('per', 'foga'), person('ola', 'tepper', 'foga'), person('kari', 'banner')])
    const { workspace: ws } = run(ws0, rows, [4, 2, 3], WEEK)
    const score = scorePlan(ws, WEEK, () => new Set(WEEK))
    expect(score.byKind.uncovered).toBe(0)
    expect(score.byKind.stage).toBe(0)
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

describe('a competence planned as one team', () => {
  it('gives a steady crew a day and fills the halls one after the other, both departments of a hall together', () => {
    const avd = (hall: string, avdeling: string): AllocationRow => ({ ...row('foga', {}, '26001', hall, `forslag|${hall}|${avdeling}`), avdeling })
    const rows = [avd('D', '10'), avd('C', '20'), avd('C', '10'), avd('D', '20')]
    const ws0 = workspace([person('per', 'foga')])
    const { workspace: ws } = solve({ ws: ws0, rows, required: () => 1, windowOf: () => new Set([MON, TUE, WED, THU]), keepTyped: true, makeId })
    const days = (hall: string) => ws.allocations.filter((r) => r.hall === hall).flatMap((r) => Object.keys(r.fte)).sort()
    expect(days('C')).toEqual([WED, THU])
    expect(days('D')).toEqual([MON, TUE])
    // One a day, as there is one fitter: no day over, none idle.
    const perDay = new Map<string, number>()
    for (const r of ws.allocations) for (const [date, fte] of Object.entries(r.fte)) perDay.set(date, (perDay.get(date) ?? 0) + fte)
    expect([...perDay.values()]).toEqual([1, 1, 1, 1])
  })
})

describe('the plan in tenths of a day', () => {
  it('gives people whole tenths, so a day asks for no more than its blocks give', () => {
    // Per has two and a half hours free after the planner's own block: a third of a day, three tenths and a quarter hour.
    const own: Assignment = { id: 'own', personId: 'per', date: MON, competence: 'foga', start: 420, end: 750, source: 'manual', projectNo: '26009', hall: 'C1' }
    const { workspace: ws } = run(workspace([person('per', 'foga')], [], [own]), [row('foga')], [1], [MON])
    const hours = blocksOf(ws, 'foga').reduce((sum, b) => sum + (b.end - b.start) / 60, 0)
    expect(hours).toBe(2.25)
    // What nobody does is the seven tenths left, to the minute.
    const uncovered = scorePlan(ws, [MON], () => new Set([MON])).findings.filter((f) => f.kind === 'uncovered' && f.projectNo === '26001')
    expect(uncovered.reduce((sum, f) => sum + f.hours!, 0)).toBeCloseTo(0.7 * DEFAULT_SETTINGS.hoursPerDay)
  })
})

describe('a window widened', () => {
  it('stays as it is where the people the widening takes leave another project short', () => {
    // One fitter. A needs two days in its one-day window and could start the Tuesday; B needs the Tuesday. Starting A
    // early saves A a day, but takes the fitter from B, so the season gains nothing and pays a day outside the window.
    const rows = [row('foga', {}, '26001', 'B1'), row('foga', {}, '26002', 'C1')]
    const windows: Record<string, string[]> = { '26001': [WED], '26002': [TUE] }
    const solution = solve({ ws: workspace([person('per', 'foga')]), rows, required: (r) => (r.projectNo === '26001' ? 2 : 1), windowOf: (r) => new Set(windows[r.projectNo]), nearby: (r) => (r.projectNo === '26001' ? [TUE] : []), keepTyped: true, makeId })
    expect(solution.outside).toEqual([])
    expect(blocksOf(solution.workspace).filter((b) => b.date === TUE).map((b) => b.projectNo)).toEqual(['26002'])
  })
})

describe('a window widened, its stages', () => {
  it('overlap on a day as in the window, so the widening does not stretch the work over a day per stage', () => {
    // Two days, three stages: in the window the stages share the days. The fitter is short, and the two free days before
    // it give him the days he lacks; the marking and the floor may begin the same day as he does.
    const rows = [row('oppmerking'), row('tepper'), row('foga')]
    const ws0 = workspace([person('per', 'oppmerking'), person('pål', 'oppmerking'), person('ola', 'tepper'), person('kari', 'foga')])
    const needs: Record<string, number> = { oppmerking: 1, tepper: 1, foga: 4 }
    const solution = solve({ ws: ws0, rows, required: (r) => needs[r.competence], windowOf: () => new Set([WED, THU]), nearby: () => [TUE, MON], keepTyped: true, makeId })
    expect(Object.keys(fteOf(solution.workspace, 'foga') ?? {}).sort()).toEqual([MON, TUE, WED, THU])
  })
})

describe('a day outside the window', () => {
  it('is begun for half a day\'s work or more, as it costs a day of the hall', () => {
    // Per has two and a quarter hours free the Tuesday before the window: too little to ask Venyou for the hall.
    const own: Assignment = { id: 'own', personId: 'per', date: TUE, competence: 'foga', start: 420, end: 750, source: 'manual', projectNo: '26009', hall: 'C1' }
    const rows = [row('foga')]
    const solution = solve({ ws: workspace([person('per', 'foga')], [], [own]), rows, required: () => 2, windowOf: () => new Set([WED]), nearby: () => [TUE], keepTyped: true, makeId })
    expect(solution.outside).toEqual([])
    expect(fteOf(solution.workspace, 'foga')?.[TUE]).toBeUndefined()
  })
})

describe('a row whose work spans stages', () => {
  it('splits it by the stage of its product types, so the floor part of carpentry is done with the floor', () => {
    const rows = [row('tepper'), row('foga'), row('snekker')]
    let ws0 = workspace([person('ola', 'tepper'), person('per', 'foga'), person('siv', 'snekker')])
    ws0 = { ...ws0, competenceStyles: setCompetenceStyle(ws0, 'snekker', { stage: 'tilvalg' }), kpi: { workTypes: [{ productType: 'Oppbygget gulv', unit: 'm²', competence: 'snekker', stage: 'gulv' }, { productType: 'Snekker-vegger', unit: 'lm', competence: 'snekker' }], rates: [] } }
    const byWork = (r: AllocationRow) => (r.competence === 'snekker' ? new Map([['Oppbygget gulv', 7.5], ['Snekker-vegger', 7.5]]) : new Map<string, number>())
    const { workspace: ws } = solve({ ws: ws0, rows, required: (r) => (r.competence === 'snekker' ? 2 : 1), hoursByWork: byWork, windowOf: () => new Set([MON, TUE, WED, THU]), keepTyped: true, makeId })
    // The built-up floor is laid the day of the carpet; the carpenter walls come after the walls.
    const carpet = first(fteOf(ws, 'tepper'))
    expect(fteOf(ws, 'snekker')?.[carpet]).toBe(1)
    expect(Object.keys(fteOf(ws, 'snekker') ?? {}).sort()[1] > first(fteOf(ws, 'foga'))).toBe(true)
  })
})

describe('people who stay where they are', () => {
  it('keeps a person in the hall they were in the day before while it has work for them', () => {
    // Hall C needs four days' work over the Monday and Tuesday, hall D one the Tuesday. Planned back from the Tuesday, the
    // two in C the Tuesday are the two in C the Monday, and D gets the third.
    const rows = [row('foga', {}, '26001', 'C'), row('foga', {}, '26002', 'D')]
    const ws0 = workspace([person('per', 'foga'), person('pål', 'foga'), person('siri', 'foga')])
    const solution = solve({ ws: ws0, rows, required: (r) => (r.hall === 'C' ? 4 : 1), windowOf: (r) => new Set(r.hall === 'C' ? [MON, TUE] : [TUE]), keepTyped: true, makeId })
    const blocks = blocksOf(solution.workspace)
    const inC = (date: string) => blocks.filter((b) => b.date === date && b.hall === 'C').map((b) => b.personId).sort()
    expect(inC(TUE)).toHaveLength(2)
    expect(inC(MON)).toEqual(inC(TUE))
  })

  it('lays a person\'s day out as one stretch per project, not A, B and A again', () => {
    const wd = DEFAULT_SETTINGS.workday
    const piece = (projectNo: string, from: number, to: number): Assignment => ({ id: `${projectNo}-${from}`, personId: 'per', date: MON, competence: 'foga', start: from, end: to, source: 'suggested', projectNo, hall: 'B1' })
    const out = inStretches([piece('A', 420, 540), piece('B', 540, 660), piece('A', 660, 900)], wd, makeId)
    expect(out.map((a) => a.projectNo)).toEqual(['A', 'B'])
    expect(out[0]).toMatchObject({ start: 420 })
    expect(out[1].end).toBe(900)
  })

  it('keeps a hall one stretch where it has two competences, the one the person ended the day before with first', () => {
    const wd = DEFAULT_SETTINGS.workday
    const piece = (hall: string, competence: string, from: number, to: number, date = MON): Assignment => ({ id: `${hall}-${competence}-${date}-${from}`, personId: 'per', date, competence, start: from, end: to, source: 'suggested', projectNo: 'A', hall })
    const yesterday = piece('F', 'foga', 420, 900, '2026-10-09')
    const out = inStretches([yesterday, piece('F', 'foga', 420, 510), piece('E', 'foga', 510, 555), piece('F', 'tepper', 555, 900)], wd, makeId).filter((a) => a.date === MON)
    expect(out.map((a) => a.hall)).toEqual(['F', 'F', 'E'])
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

describe('hire in the planning engine', () => {
  const suppliers = [
    { id: 'kveld', name: 'Kveldshjelp', order: 0, competences: ['foga'], shifts: ['kveld' as const] },
    { id: 'mh', name: 'Messehjelp', order: 1, competences: ['foga', 'tepper'], shifts: ['dag' as const] },
  ]
  const hiring = (persons: Person[], allocations: AllocationRow[] = []) => ({ ...workspace(persons, allocations), suppliers })
  const drafts = (ws: Workspace) => (ws.hireOrders ?? []).filter((o) => o.engine)
  const perDay = (ws: Workspace) => {
    const days: Record<string, number> = {}
    for (const o of drafts(ws)) days[o.date] = (days[o.date] ?? 0) + o.fte
    return days
  }

  it('hires what the permanent staff cannot do, one person kept on over the span, from the first supplier with a day shift', () => {
    const { workspace: ws, hired } = run(hiring([person('per', 'foga')]), [row('foga')], [6], [MON, TUE, WED])
    expect(fteOf(ws, 'foga')).toEqual({ [MON]: 2, [TUE]: 2, [WED]: 2 })
    expect(blocksOf(ws).map((b) => b.personId)).toEqual(['per', 'per', 'per'])
    expect(hired).toEqual([{ supplierId: 'mh', competences: ['foga'], dates: [MON, TUE, WED], projectNos: ['26001'] }])
    expect(drafts(ws)).toEqual([MON, TUE, WED].map((date) => expect.objectContaining({ supplierId: 'mh', competence: 'foga', date, fte: 1, conf: null, projectNo: '26001' })))
  })

  it('sends the same hired person on to the next hall, rather than a new one', () => {
    const rows = [row('foga', {}, '26001', 'B1'), row('foga', {}, '26002', 'C1')]
    const windows: Record<string, string[]> = { '26001': [MON], '26002': [TUE] }
    const { hired } = solve({ ws: hiring([], rows), rows, required: () => 1, windowOf: (r) => new Set(windows[r.projectNo]), keepTyped: true, makeId })
    expect(hired).toEqual([expect.objectContaining({ dates: [MON, TUE], projectNos: ['26001', '26002'] })])
  })

  it('hires nobody for less than half a day, but on the last day, and lets a hired person go over a quiet day', () => {
    const { workspace: ws } = run(hiring([person('per', 'foga')]), [row('foga')], [3.2], [MON, TUE, WED])
    // A fifth of a day more than Per can do is left for the last day planned, the first of the build-up, where it is hired.
    expect(perDay(ws)).toEqual({ [MON]: 1 })
  })

  it('leaves no less than half a day of a job for a later day, but hires for it now', () => {
    const { workspace: ws, hired } = run(hiring([]), [row('foga')], [0.8], [MON, TUE])
    expect(fteOf(ws, 'foga')).toEqual({ [TUE]: 0.8 })
    expect(hired.map((h) => h.dates)).toEqual([[TUE]])
  })

  it('gives a person hired in today the next job that day too, before hiring another', () => {
    const rows = [row('foga', {}, '26001', 'B1'), row('foga', {}, '26002', 'C1')]
    const { hired } = solve({ ws: hiring([], rows), rows, required: () => 0.4, windowOf: () => new Set([MON]), keepTyped: true, makeId })
    expect(hired).toEqual([expect.objectContaining({ dates: [MON], projectNos: ['26001', '26002'] })])
  })

  it('gives work no supplier offers the people who have it first, before they go on with other work', () => {
    // Per did the walls of 26001 the Tuesday and would go on with them the Monday, but only he can mark out 26002 that
    // day: he marks it out, and a fitter is hired for the walls. What a second marker would do stays uncovered.
    const rows = [row('foga', {}, '26001', 'B1'), row('oppmerking', {}, '26002', 'C1')]
    const windows: Record<string, string[]> = { '26001': [MON, TUE], '26002': [MON] }
    const { workspace: ws } = solve({ ws: hiring([person('per', 'foga', 'oppmerking')], rows), rows, required: () => 2, windowOf: (r) => new Set(windows[r.projectNo]), keepTyped: true, makeId })
    expect(blocksOf(ws).filter((b) => b.date === MON).map((b) => b.competence)).toEqual(['oppmerking'])
    expect(drafts(ws).map((o) => `${o.competence} ${o.date}`)).toEqual([`foga ${MON}`])
  })

  it('counts the orders the planner has made as cover', () => {
    const ws = { ...hiring([person('per', 'foga')]), hireOrders: [{ id: 'o', supplierId: 'mh', competence: 'foga', date: MON, fte: 1, start: 420, end: 900, conf: null, projectNo: '26001' }] }
    const { workspace: solved } = run(ws, [row('foga')], [2], [MON])
    expect(drafts(solved)).toEqual([])
    expect(fteOf(solved, 'foga')).toEqual({ [MON]: 2 })
  })

  it('leaves uncovered what no supplier offers for the day shift', () => {
    const ws = { ...workspace([]), suppliers: [suppliers[0]] }
    const { workspace: solved, hired } = run(ws, [row('foga')], [2], [MON, TUE])
    expect(hired).toEqual([])
    expect(scorePlan(solved, WEEK, () => new Set([MON, TUE])).byKind.uncovered).toBeGreaterThan(0)
  })

  it('never takes the hired people with the plan', () => {
    const ws = hiring([], [row('foga', {}, '26001', 'B1', 'stored')])
    const solution = run(ws, ws.allocations, [2], [MON, TUE, THU])
    expect(drafts(solution.workspace).length).toBeGreaterThan(0)
    expect(takeProjects(ws, solution.workspace, ['26001']).hireOrders ?? []).toEqual([])
  })
})
