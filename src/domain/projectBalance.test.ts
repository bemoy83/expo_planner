import { describe, expect, it } from 'vitest'
import { eraseOrders, groupKey, mergeOrders, orderGroups, orderText, fillGroup, planOrders, tagOrders } from './hire'
import { buildBalance, buildProjectBalance, carry, cellsToDemand, clickBlock, copyDays, drawBlock, mergeAdjacent, moveDay, NO_PROJECT, paintDays, pasteDays, projectTotals, recolourBlock, removeCarried, resizeBlock, splitBlock } from './staffing'
import { TWO_PROJECTS, withTwoProjects } from './staffingFixture'
import { DEFAULT_SETTINGS, DEFAULT_WORKDAY, type Assignment, type HireOrder, type Supplier, type Workspace } from './types'
import { nextInRun } from '../ui/bemanning/runs'

/** The project balance of `staffing.ts`: the hours of a competence on a day shared out on its projects. */

const MON = '2026-10-12'
const TUE = '2026-10-13'
const WED = '2026-10-14'
const { first: FIRST, second: SECOND } = TWO_PROJECTS
const wd = DEFAULT_WORKDAY
const ws = withTwoProjects({ settings: DEFAULT_SETTINGS, venue: [], projects: [], demand: [], allocations: [] })

let counter = 0
const id = () => `new-${counter++}`
/** A whole normal day of walls for a person, 7,5 hours, for a project or none. */
const day = (person: number, date: string, projectNo?: string): Assignment => ({ id: `b-${person}-${date}`, personId: `two-${person}`, date, competence: 'vegger', start: wd.dayStart, end: wd.dayEnd, source: 'manual', ...(projectNo && { projectNo }) })
const staffed = (...assignments: Assignment[]): Workspace => ({ ...ws, assignments })
const order = (date: string, fte: number, projectNo?: string, confirmed = true): HireOrder => ({ id: `o-${date}-${projectNo ?? 'none'}-${fte}`, supplierId: 's1', competence: 'vegger', date, fte, start: wd.dayStart, end: wd.dayEnd, conf: confirmed ? fte : null, ...(projectNo && { projectNo }) })
const supplier: Supplier = { id: 's1', name: 'Messehjelp AS', order: 0, competences: ['vegger'], shifts: ['dag', 'kveld'] }
const shares = (w: Workspace, date: string, withHired = false) =>
  Object.fromEntries([...buildProjectBalance(w, [date], withHired).get('vegger', date).projects].map(([key, p]) => [key, p.shared]))

describe('the project balance', () => {
  it('shares untagged hours by what each project lacks, the demand without a project as a recipient of its own', () => {
    expect(shares(staffed(day(1, MON), day(2, MON), day(3, MON), day(4, MON)), MON)).toEqual({ [FIRST]: 15, [SECOND]: 7.5, [NO_PROJECT]: 7.5 })
    expect(shares(staffed(day(1, MON), day(2, MON), day(3, MON)), MON)).toEqual({ [FIRST]: 11.25, [SECOND]: 5.625, [NO_PROJECT]: 5.625 })
  })

  it('counts tagged hours first, and gives one project that alone lacks hours all of them', () => {
    const balance = buildProjectBalance(staffed(day(1, MON, FIRST), day(2, MON, FIRST), day(3, MON)), [MON])
    expect(balance.of('vegger', MON, FIRST)).toMatchObject({ demand: 15, tagged: 15, shared: 0, remaining: 0 })
    expect(balance.of('vegger', MON, SECOND)).toMatchObject({ shared: 3.75, remaining: 3.75 })
    expect(shares(staffed(day(1, TUE, FIRST), day(2, TUE, FIRST), day(3, TUE)), TUE)).toEqual({ [FIRST]: 0, [SECOND]: 7.5 })
  })

  it('leaves untagged hours more than all lack to none, and what is tagged over the demand on its project', () => {
    const over = buildProjectBalance(staffed(day(1, TUE, FIRST), day(2, TUE, FIRST), day(3, TUE, FIRST), day(4, TUE), day(1, WED)), [TUE, WED])
    expect(over.of('vegger', TUE, FIRST).remaining).toBe(-7.5)
    expect(over.of('vegger', TUE, SECOND)).toMatchObject({ shared: 7.5, remaining: 7.5 })
    expect(over.get('vegger', TUE).unshared).toBe(0)
    expect(over.get('vegger', WED)).toMatchObject({ untagged: 7.5, unshared: 7.5 })
  })

  it('adds up to the balance of the competence', () => {
    const w = staffed(day(1, MON, SECOND), day(2, MON), day(3, MON), day(1, TUE))
    for (const date of [MON, TUE]) {
      const day = buildProjectBalance(w, [date]).get('vegger', date)
      const parts = [...day.projects.values()]
      const sum = buildBalance(w, [date]).get('vegger', date)
      expect(parts.reduce((total, p) => total + p.demand, 0)).toBe(sum.demand)
      expect(parts.reduce((total, p) => total + p.tagged + p.shared, 0) + day.unshared).toBe(sum.assigned)
    }
  })

  it('counts confirmed orders with the hired, and gives the same shares in one step as after the permanent staff', () => {
    const w = { ...staffed(day(1, TUE), day(2, TUE)), hireOrders: [order(TUE, 2), order(TUE, 3, FIRST, false)] }
    expect(shares(w, TUE)).toEqual({ [FIRST]: 7.5, [SECOND]: 7.5 })
    expect(shares(w, TUE, true)).toEqual({ [FIRST]: 15, [SECOND]: 15 })
    const tagged = buildProjectBalance({ ...w, hireOrders: [order(TUE, 2, SECOND)] }, [TUE], true)
    expect(tagged.of('vegger', TUE, SECOND)).toMatchObject({ tagged: 15, shared: 0 })
    expect(tagged.of('vegger', TUE, FIRST).shared).toBe(15)
  })

  it('counts a period as planned less staffed, so hours moved to the next day are not counted twice', () => {
    const w = staffed(day(1, TUE), day(2, TUE))
    const moved = { ...w, demandAdjustments: carry(w, 'vegger', TUE, 10, id), assignments: [...w.assignments!, { ...day(3, WED, FIRST), end: wd.dayStart + 300 }] }
    expect(moved.demandAdjustments.map((a) => [a.projectNo, a.hours, a.date])).toEqual([[FIRST, 5, WED], [SECOND, 5, WED]])
    const { projects, unshared } = projectTotals(buildProjectBalance(moved, [TUE, WED]), [TUE, WED])
    expect(projects.get(FIRST)).toMatchObject({ planned: 15, tagged: 4.5, shared: 7.5, remaining: 3 })
    expect(unshared).toBe(0)
  })
})

describe('a stroke to where the demand is met', () => {
  it('goes as far as the project of the brush lacks hours, where the sum line goes as far as the competence does', () => {
    const w = staffed(day(1, TUE, FIRST), day(2, TUE, FIRST))
    const cells = [MON, TUE].map((date) => ({ personId: 'two-3', date }))
    expect(cellsToDemand(w, cells, { competence: 'vegger', projectNo: FIRST }, buildBalance(w, [MON, TUE]), false, buildProjectBalance(w, [MON, TUE])).map((c) => c.date)).toEqual([MON])
    expect(cellsToDemand(w, cells, 'vegger', buildBalance(w, [MON, TUE])).map((c) => c.date)).toEqual([MON, TUE])
  })
})

describe('hours moved to the next day', () => {
  it('are for the project of the line they are moved from', () => {
    expect(carry(ws, { competence: 'vegger', projectNo: SECOND }, MON, 4, id)).toMatchObject([{ projectNo: SECOND, hours: 4, date: TUE }])
  })

  it('are for no project where nothing lacks hours', () => {
    const [moved] = carry(staffed(day(1, WED)), 'vegger', WED, 2, id)
    expect(moved.projectNo).toBeUndefined()
  })

  it('go back all parts at once from the sum line, and one project from its line', () => {
    const moved = carry(ws, 'vegger', TUE, 6, id)
    expect(moved).toHaveLength(2)
    expect(removeCarried(moved, { competence: 'vegger', projectNo: FIRST }, WED).map((a) => a.projectNo)).toEqual([SECOND])
    expect(removeCarried(moved, 'vegger', WED)).toEqual([])
  })
})

describe('the project on a block', () => {
  const work = { competence: 'vegger', projectNo: FIRST }
  const cell = { personId: 'two-1', date: MON }
  const projects = (list: Assignment[]) => list.map((a) => a.projectNo)

  it('is given by the brush, a drawn block and a click', () => {
    expect(projects(paintDays(ws, [cell], work, 'full', id))).toEqual([FIRST])
    expect(projects(drawBlock(ws, cell, work, 480, 600, {}, id))).toEqual([FIRST])
    expect(projects(clickBlock(ws, cell, work, 480, {}, id))).toEqual([FIRST])
    expect(projects(paintDays(ws, [cell], 'vegger', 'full', id))).toEqual([undefined])
  })

  it('is kept by a move, a copy, a resize, a split and another competence', () => {
    const w = staffed(day(1, MON, FIRST))
    const moved = moveDay(w, { from: cell, to: { personId: 'two-2', date: TUE }, blockIds: ['b-1-' + MON] }, id)
    expect(typeof moved !== 'string' && projects(moved)).toEqual([FIRST])
    const clip = copyDays(w, [cell])!
    expect(clip.items[0].blocks[0].projectNo).toBe(FIRST)
    expect(projects(pasteDays(w, clip, TUE, WED, undefined, id).assignments)).toEqual([FIRST, FIRST])
    expect(projects(resizeBlock(w, 'b-1-' + MON, 'end', 840))).toEqual([FIRST])
    expect(projects(splitBlock(w, 'b-1-' + MON, 600, id))).toEqual([FIRST, FIRST])
    const both = { ...w, persons: w.persons!.map((p) => ({ ...p, competences: ['vegger', 'tepper'] })) }
    expect(recolourBlock(both, 'b-1-' + MON, 'tepper')[0]).toMatchObject({ competence: 'tepper', projectNo: FIRST })
  })

  it('keeps two blocks of different projects apart, where the same project joins', () => {
    const morning = { ...day(1, MON, FIRST), end: 600 }
    const after = (projectNo?: string): Assignment => ({ ...day(1, MON, projectNo), id: 'later', start: 600 })
    expect(mergeAdjacent([morning, after(SECOND)])).toHaveLength(2)
    expect(mergeAdjacent([morning, after()])).toHaveLength(2)
    expect(mergeAdjacent([morning, after(FIRST)])).toEqual([{ ...morning, end: wd.dayEnd }])
  })

  it('ends a run where the next day is another project', () => {
    const blocks = (date: string) => (date === TUE ? [day(1, TUE, SECOND)] : [day(1, MON, FIRST)])
    expect(nextInRun(blocks, MON, day(1, MON, FIRST), wd)).toBeUndefined()
    expect(nextInRun((date) => [day(1, date, FIRST)], MON, day(1, MON, FIRST), wd)).toBeDefined()
  })
})

describe('the project on an order', () => {
  it('keeps orders of two projects apart, in the editor too', () => {
    expect(mergeOrders([order(MON, 2, FIRST), order(MON, 1, SECOND)])).toHaveLength(2)
    expect(mergeOrders([order(MON, 2, FIRST), { ...order(MON, 1, FIRST), id: 'other' }])).toHaveLength(1)
    expect(orderGroups([order(MON, 2, FIRST), order(MON, 1, SECOND)], [supplier]).map((g) => g.projectNo)).toEqual([FIRST, SECOND])
    expect(groupKey('s1', order(MON, 2, FIRST))).not.toBe(groupKey('s1', order(MON, 2, SECOND)))
  })

  it('orders a second project on the day shift the first already has', () => {
    const [planned] = planOrders([order(MON, 2, FIRST)], supplier, { competence: 'vegger', projectNo: SECOND }, [MON], () => 7.5, wd, true, id)
    expect(planned).toMatchObject({ projectNo: SECOND, start: wd.dayStart, end: wd.dayEnd, fte: 1 })
    expect(planOrders([order(MON, 2)], supplier, 'vegger', [MON], () => 30, wd, true, id)[0].start).not.toBe(wd.dayStart)
  })

  it('is set or taken off without a new answer, and joins an order of the same project', () => {
    const tagged = tagOrders([order(MON, 2), order(MON, 1, FIRST)], [`o-${MON}-none-2`], FIRST)
    expect(tagged).toMatchObject([{ fte: 3, conf: 3, projectNo: FIRST }])
    expect(tagOrders(tagged, [tagged[0].id], null)[0].projectNo).toBeUndefined()
  })

  it('is erased for one project, or for all', () => {
    const both = [order(MON, 2, FIRST), order(MON, 1, SECOND)]
    expect(eraseOrders(both, 'vegger', [MON], undefined, FIRST).map((o) => o.projectNo)).toEqual([SECOND])
    expect(eraseOrders(both, 'vegger', [MON])).toEqual([])
  })

  it('fills a line with its project, and names the project in the text to the supplier', () => {
    const [group] = orderGroups([order(MON, 2, FIRST)], [supplier])
    expect(fillGroup(group, 'vegger', [MON, TUE], id)).toMatchObject([{ date: TUE, projectNo: FIRST }])
    expect(orderText(supplier, [order(MON, 2, FIRST)], [{ key: 'vegger', label: 'Vegger' }], (no) => `Prosjekt ${no}`)).toContain(`Vegger · Prosjekt ${FIRST}: 2 pers.`)
  })
})
