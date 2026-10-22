import { describe, expect, it } from 'vitest'
import { buildBalance, buildProjectBalance, cellsToDemand, copyDays, mergeAdjacent, moveDay, NO_PROJECT, paintDays, drawBlock, clickBlock, pasteDays, PROJECT_PLACE, splitBlock } from './staffing'
import { TWO_PROJECTS, withTwoProjects } from './staffingFixture'
import { DEFAULT_SETTINGS, DEFAULT_WORKDAY, workTag, type Assignment, type VenueBooking, type Workspace } from './types'
import { blockPlaces, bookedPlaces, dealPlaces, placeName } from './workPlace'
import { nextInRun } from '../ui/bemanning/runs'

/** Where a block's work is: the places of the project balance, and what a project has booked. */

const MON = '2026-10-12'
const TUE = '2026-10-13'
const { first: FIRST, second: SECOND } = TWO_PROJECTS
const wd = DEFAULT_WORKDAY

const booking = (id: string, hall: string, eventName: string, start: string, end: string): VenueBooking => ({ id, hall, eventName, status: 'Bekreftet', phases: { assembly: { start, end } } })

/**
 * The week of `withTwoProjects`, with the first project's Monday in two places, «B» and «C2», a day each, and the
 * second's in «Ufordelt»: its halls D1 and D2, which the place «D» collects.
 */
const base = withTwoProjects({ settings: DEFAULT_SETTINGS, venue: [], projects: [], demand: [], allocations: [] })
const ws: Workspace = {
  ...base,
  allocations: [
    { ...base.allocations[0], id: 'first-b', hall: 'B', fte: { [MON]: 1 } },
    { ...base.allocations[0], id: 'first-c', hall: 'C2', fte: { [MON]: 1 } },
    { ...base.allocations[1], hall: 'Ufordelt' },
    base.allocations[2],
  ],
  venue: [booking('v1', 'D1', 'Hagemessen', MON, TUE), booking('v2', 'D2', 'Hagemessen', TUE, TUE), booking('v3', 'B1', 'Byggemessen', MON, MON)],
  projects: [
    { name: 'Hagemessen', projectNo: SECOND },
    { name: 'Byggemessen', projectNo: FIRST },
  ],
  hallRules: { places: [{ name: 'D', halls: ['D1', 'D2'] }], phrases: [], choices: {} },
}

let counter = 0
const id = () => `new-${counter++}`
/** A whole normal day of walls for a person, 7,5 hours, for a project and a place or none. */
const day = (person: number, date: string, projectNo?: string, hall?: string): Assignment => ({ id: `b-${person}-${date}`, personId: `two-${person}`, date, competence: 'vegger', start: wd.dayStart, end: wd.dayEnd, source: 'manual', ...workTag({ projectNo, hall }) })
const staffed = (...assignments: Assignment[]): Workspace => ({ ...ws, assignments })

describe('the places of a project', () => {
  it('count a block painted on a place there, and share the project’s other hours by what each place lacks', () => {
    const balance = buildProjectBalance(staffed(day(1, MON, FIRST, 'B'), day(2, MON, FIRST)), [MON])
    const first = balance.of('vegger', MON, FIRST)
    expect(first.places.get('b')).toMatchObject({ hall: 'B', demand: 7.5, tagged: 7.5, shared: 0, remaining: 0 })
    expect(first.places.get('c2')).toMatchObject({ hall: 'C2', demand: 7.5, tagged: 0, shared: 7.5, remaining: 0 })
    expect(first.unplaced).toBe(0)
  })

  it('take the project’s share of the untagged hours too, and a row of «Ufordelt» or all halls is the project’s halls', () => {
    const balance = buildProjectBalance(staffed(day(1, MON), day(2, MON)), [MON])
    const first = balance.of('vegger', MON, FIRST)
    expect(first.places.get('b')!.shared).toBe(3.75)
    expect(first.places.get('c2')!.shared).toBe(3.75)
    expect([...balance.of('vegger', MON, SECOND).places.keys()]).toEqual([PROJECT_PLACE])
  })

  it('leave the hours more than all places lack to none of them', () => {
    const balance = buildProjectBalance(staffed(day(1, MON, FIRST, 'B'), day(2, MON, FIRST, 'B'), day(3, MON, FIRST), day(4, MON, FIRST)), [MON])
    const first = balance.of('vegger', MON, FIRST)
    expect(first.places.get('b')!.remaining).toBe(-7.5)
    expect(first.places.get('c2')!.shared).toBe(7.5)
    expect(first.unplaced).toBe(7.5)
  })

  it('count the hours moved to a day for the project in its halls', () => {
    const moved = { ...staffed(), demandAdjustments: [{ id: 'adj', competence: 'vegger', date: TUE, hours: 4, reason: 'carry' as const, projectNo: FIRST, createdAt: '' }] }
    expect(buildProjectBalance(moved, [TUE]).of('vegger', TUE, FIRST).places.get(PROJECT_PLACE)).toMatchObject({ demand: 4 })
  })
})

describe('where a block is', () => {
  it('is its place where it has one, else the places of its project as they share its hours', () => {
    const w = staffed(day(1, MON, FIRST, 'B'), day(2, MON, FIRST))
    const balance = buildProjectBalance(w, [MON])
    expect(blockPlaces(balance, w.assignments![0])).toEqual([{ projectNo: FIRST, hall: 'B', share: 1 }])
    expect(blockPlaces(balance, w.assignments![1])).toEqual([{ projectNo: FIRST, hall: 'C2', share: 1 }])
  })

  it('goes for a block of no project to the projects and on to their places, the demand without a number as one of them', () => {
    const w = staffed(day(1, MON))
    expect(blockPlaces(buildProjectBalance(w, [MON]), w.assignments![0])).toEqual([
      { projectNo: FIRST, hall: 'B', share: 0.25 },
      { projectNo: FIRST, hall: 'C2', share: 0.25 },
      { projectNo: SECOND, hall: PROJECT_PLACE, share: 0.25 },
      { projectNo: NO_PROJECT, hall: PROJECT_PLACE, share: 0.25 },
    ])
  })

  it('is nowhere for hours no project lacks, and in the project’s places by their demand where it is over them', () => {
    const w = staffed(day(1, TUE, FIRST, 'B'), day(2, TUE, FIRST), day(3, TUE, SECOND), day(4, TUE, SECOND), day(1, MON))
    const tuesday = buildProjectBalance(w, [TUE])
    expect(blockPlaces(tuesday, day(3, TUE))).toEqual([])
    // The first project plans nothing on Tuesday: its block without a place is in its halls.
    expect(blockPlaces(tuesday, w.assignments![1])).toEqual([{ projectNo: FIRST, hall: PROJECT_PLACE, share: 1 }])
  })
})

describe('the place on a block', () => {
  const work = { competence: 'vegger', projectNo: FIRST, hall: 'B' }
  const cell = { personId: 'two-1', date: MON }
  const places = (list: Assignment[]) => list.map((a) => a.hall)

  it('is given by the brush, a drawn block and a click, and only with a project', () => {
    expect(places(paintDays(ws, [cell], work, 'full', id))).toEqual(['B'])
    expect(places(drawBlock(ws, cell, work, 480, 600, {}, id))).toEqual(['B'])
    expect(places(clickBlock(ws, cell, work, 480, {}, id))).toEqual(['B'])
    expect(places(paintDays(ws, [cell], { competence: 'vegger', hall: 'B' }, 'full', id))).toEqual([undefined])
  })

  it('is kept by a move, a copy and a split', () => {
    const w = staffed(day(1, MON, FIRST, 'B'))
    const moved = moveDay(w, { from: cell, to: { personId: 'two-2', date: TUE }, blockIds: ['b-1-' + MON] }, id)
    expect(typeof moved !== 'string' && places(moved)).toEqual(['B'])
    const clip = copyDays(w, [cell])!
    expect(places(pasteDays(w, clip, TUE, TUE, undefined, id).assignments)).toEqual(['B', 'B'])
    expect(places(splitBlock(w, 'b-1-' + MON, 600, id))).toEqual(['B', 'B'])
  })

  it('keeps blocks of two places apart, and ends a run where the next day is another place', () => {
    const morning = { ...day(1, MON, FIRST, 'B'), end: 600 }
    const after = (hall?: string): Assignment => ({ ...day(1, MON, FIRST, hall), id: 'later', start: 600 })
    expect(mergeAdjacent([morning, after('C2')])).toHaveLength(2)
    expect(mergeAdjacent([morning, after()])).toHaveLength(2)
    expect(mergeAdjacent([morning, after('b')])).toEqual([{ ...morning, end: wd.dayEnd }])
    const blocks = (date: string) => [day(1, date, FIRST, date === TUE ? 'C2' : 'B')]
    expect(nextInRun(blocks, MON, day(1, MON, FIRST, 'B'), wd)).toBeUndefined()
  })
})

describe('the places a project has booked', () => {
  it('are its halls that day as the rows name them, a hall a place collects as that place', () => {
    expect(bookedPlaces(ws, SECOND, MON)).toEqual(['D'])
    expect(bookedPlaces(ws, FIRST, MON)).toEqual(['B1'])
    expect(bookedPlaces(ws, FIRST, TUE)).toEqual([])
    expect(bookedPlaces(ws, NO_PROJECT, MON)).toEqual([])
  })
})

describe('the line of a place', () => {
  it('stops a stroke drawn with Shift where the place’s demand is met', () => {
    const w = staffed(day(1, MON, FIRST, 'B'))
    const cells = [2, 3].map((person) => ({ personId: `two-${person}`, date: MON }))
    const projects = buildProjectBalance(w, [MON])
    expect(cellsToDemand(w, cells, { competence: 'vegger', projectNo: FIRST, hall: 'B' }, buildBalance(w, [MON]), false, projects)).toEqual([])
    expect(cellsToDemand(w, cells, { competence: 'vegger', projectNo: FIRST, hall: 'C2' }, buildBalance(w, [MON]), false, projects)).toHaveLength(2)
  })

  it('of the project’s halls paints «Ufordelt», which is where the rows of all its halls are', () => {
    const w = staffed({ ...day(1, MON, SECOND), hall: 'Ufordelt' })
    expect(blockPlaces(buildProjectBalance(w, [MON]), w.assignments![0])).toEqual([{ projectNo: SECOND, hall: PROJECT_PLACE, share: 1 }])
    expect(buildProjectBalance(w, [MON]).of('vegger', MON, SECOND).places.get(PROJECT_PLACE)!.tagged).toBe(7.5)
    expect(placeName('Ufordelt')).toBe('Prosjektets haller')
    expect(placeName(' B ')).toBe('B')
  })
})

describe('the blocks dealt on the places', () => {
  const at = (w: Workspace, date = MON) => dealPlaces(w, [date])

  it('keeps a block painted on a place, and deals the others whole to the places that lack most', () => {
    const w = staffed(day(1, MON, FIRST, 'B'), day(2, MON, FIRST), day(3, MON, FIRST))
    const dealt = at(w)
    expect(dealt.get('b-1-' + MON)).toEqual({ projectNo: FIRST, hall: 'B', set: true, uncertain: false })
    // «B» is taken by the first block, so the next one goes to «C2», and the third has no place to lack its hours.
    expect(dealt.get('b-2-' + MON)).toMatchObject({ projectNo: FIRST, hall: 'C2', set: false })
    expect(dealt.get('b-3-' + MON)).toMatchObject({ projectNo: FIRST, hall: PROJECT_PLACE, set: false, uncertain: false })
  })

  it('sends untagged blocks to different places, not all to one, in the order of the people', () => {
    const w = staffed(day(1, MON), day(2, MON), day(3, MON), day(4, MON))
    const dealt = at(w)
    const where = ['1', '2', '3', '4'].map((n) => dealt.get(`b-${n}-${MON}`))
    expect(new Set(where.map((d) => `${d!.projectNo}|${d!.hall}`)).size).toBe(4)
    expect(where.every((d) => d!.uncertain && !d!.set)).toBe(true)
    expect(at(w)).toEqual(dealt)
  })

  it('is certain where the project has the one place, and nowhere for hours no place lacks', () => {
    const w = staffed(day(1, MON, SECOND))
    expect(at(w).get('b-1-' + MON)).toEqual({ projectNo: SECOND, hall: PROJECT_PLACE, set: false, uncertain: false })
    // Tuesday lacks 30 hours of walls, four blocks of 7,5 cover them, and a fifth is over what any project lacks.
    const full = staffed(day(1, TUE, FIRST), day(2, TUE, FIRST), day(3, TUE, SECOND), day(4, TUE, SECOND), { ...day(1, TUE), id: 'extra' })
    expect(at(full, TUE).get('extra')).toBeNull()
  })

  it('leaves out a block that does not count', () => {
    const w = { ...staffed(day(1, MON)), unavailability: [{ id: 'u', personId: 'two-1', date: MON }] }
    expect(at(w).has('b-1-' + MON)).toBe(false)
  })
})
