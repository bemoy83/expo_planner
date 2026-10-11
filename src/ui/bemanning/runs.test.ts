import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKDAY, type Assignment } from '../../domain/types'

// The cases are written for lunch from 11:00 to 11:30.
const wd = { ...DEFAULT_WORKDAY, breakStart: 660, breakEnd: 690 }
import { runDays, runLink, runOf, stretchRun, stretchStop, stretchStops, type BlocksOn } from './runs'

// Week 42 of 2026: Monday the 12th to Friday the 16th, and the Monday after.
const MON = '2026-10-12'
const TUE = '2026-10-13'
const WED = '2026-10-14'
const THU = '2026-10-15'
const FRI = '2026-10-16'
const SAT = '2026-10-17'
const NEXT_MON = '2026-10-19'
const block = (date: string, competence: string, start = 420, end = 900): Assignment => ({ id: `${date}-${competence}-${start}`, personId: 'p', date, competence, start, end, source: 'manual' })
const on = (...all: Assignment[]): BlocksOn => (date) => all.filter((a) => a.date === date)

describe('runs of days', () => {
  it('joins whole days of one competence in a row', () => {
    const days = [MON, TUE, WED].map((date) => block(date, 'vegger'))
    const blocks = on(...days)
    expect(runLink(blocks, MON, days[0], wd)).toEqual({ prev: false, next: true })
    expect(runLink(blocks, TUE, days[1], wd)).toEqual({ prev: true, next: true })
    expect(runLink(blocks, WED, days[2], wd)).toEqual({ prev: true, next: false })
    expect(runOf(blocks, TUE, days[1], wd)).toEqual({ competence: 'vegger', from: MON, to: WED, days: 3, startShare: 0, endShare: 1 })
  })

  it('ends a run at a weekend that is not worked, and goes on through one that is', () => {
    const fri = block(FRI, 'vegger')
    expect(runLink(on(fri, block(NEXT_MON, 'vegger')), FRI, fri, wd).next).toBe(false)
    expect(runOf(on(fri, block(SAT, 'vegger'), block(NEXT_MON, 'vegger')), FRI, fri, wd)).toMatchObject({ from: FRI, to: SAT, days: 2 })
  })

  it('ends a run at another competence and at an empty day', () => {
    const mon = block(MON, 'vegger')
    expect(runLink(on(mon, block(TUE, 'tepper')), MON, mon, wd).next).toBe(false)
    expect(runLink(on(mon, block(WED, 'vegger')), MON, mon, wd).next).toBe(false)
  })

  it('lets a run begin and end in the middle of a day, where two runs can meet', () => {
    // Vegger until Wednesday 11:00, Tepper from 11:30.
    const veggerWed = block(WED, 'vegger', 420, 660)
    const tepperWed = block(WED, 'tepper', 690, 900)
    const blocks = on(block(MON, 'vegger'), block(TUE, 'vegger'), veggerWed, tepperWed, block(THU, 'tepper'), block(FRI, 'tepper'))
    expect(runOf(blocks, WED, veggerWed, wd)).toMatchObject({ from: MON, to: WED, days: 3, startShare: 0, endShare: 0.5 })
    expect(runOf(blocks, WED, tepperWed, wd)).toMatchObject({ from: WED, to: FRI, days: 3, startShare: 0.5625, endShare: 1 })
  })

  it('does not join a day that stops early to the next', () => {
    const half = block(MON, 'vegger', 420, 660)
    expect(runLink(on(half, block(TUE, 'vegger')), MON, half, wd).next).toBe(false)
  })

  it('keeps a run through a day with overtime', () => {
    const long = block(TUE, 'vegger', 420, 1020)
    expect(runOf(on(block(MON, 'vegger'), long, block(WED, 'vegger')), TUE, long, wd)).toMatchObject({ from: MON, to: WED, days: 3, endShare: 1 })
  })

  it('counts a block that is joined to nothing as a run of one day', () => {
    const one = block(MON, 'vegger', 420, 660)
    expect(runOf(on(one), MON, one, wd)).toEqual({ competence: 'vegger', from: MON, to: MON, days: 1, startShare: 0, endShare: 0.5 })
  })
})

describe('pulling an end of a run (R46)', () => {
  const week = [MON, TUE, WED].map((date) => block(date, 'vegger'))
  const days = runDays(on(...week), TUE, week[1], wd)
  // The start and the end of the normal day, and the stops between them.
  const [DAWN, NINE, ELEVEN, HALF_PAST, ONE, DUSK] = [420, 540, 660, 690, 780, 900]

  it('finds the days of a run from any block of it', () => {
    expect(days.map((day) => day.date)).toEqual([MON, TUE, WED])
    expect(days.map((day) => day.block)).toEqual(week)
  })

  it('has a stop for every two hours worked, wherever the lunch is', () => {
    // Lunch from 11:00: four hours are worked when it starts, and six at 13:30.
    expect(stretchStops('end', wd)).toEqual([DAWN, NINE, ELEVEN, 810, DUSK])
    expect(stretchStops('start', wd)).toEqual([DAWN, NINE, HALF_PAST, 810, DUSK])
    // Lunch from 11:30, as the app has it at first.
    expect(stretchStops('end', DEFAULT_WORKDAY)).toEqual([DAWN, NINE, ELEVEN, 810, DUSK])
    expect(stretchStops('start', DEFAULT_WORKDAY)).toEqual([DAWN, NINE, ELEVEN, 810, DUSK])
    // An hour's lunch from 10:00.
    expect(stretchStops('end', { ...wd, breakStart: 600, breakEnd: 660 })).toEqual([DAWN, NINE, 720, 840, DUSK])
  })

  it('stops at the stop nearest the pointer', () => {
    expect([0, 0.2, 0.5, 0.8, 1].map((share) => stretchStop(share, 'end', wd))).toEqual([DAWN, NINE, ELEVEN, 810, DUSK])
    expect(stretchStop(0.5, 'start', wd)).toBe(HALF_PAST)
    expect(stretchStop(-1, 'end', wd)).toBe(DAWN)
    expect(stretchStop(3, 'end', wd)).toBe(DUSK)
  })

  it('goes on over the days up to where its end is pulled, at either end', () => {
    expect(stretchRun(days, 'end', FRI, DUSK, wd)).toEqual({ add: [{ date: THU }, { date: FRI }], remove: [] })
    const later = runDays(on(block(WED, 'vegger'), block(THU, 'vegger')), WED, block(WED, 'vegger'), wd)
    expect(stretchRun(later, 'start', MON, DAWN, wd)).toEqual({ add: [{ date: MON }, { date: TUE }], remove: [] })
  })

  it('fills the last day no further than the time the end is pulled to', () => {
    expect(stretchRun(days, 'end', FRI, ELEVEN, wd)).toEqual({ add: [{ date: THU }, { date: FRI, within: { start: DAWN, end: ELEVEN } }], remove: [] })
    expect(stretchRun(days, 'start', '2026-10-09', ONE, wd).add).toEqual([{ date: '2026-10-09', within: { start: ONE, end: DUSK } }, { date: '2026-10-10' }, { date: '2026-10-11' }])
    // The start of a day is the end of the day before: nothing of that day is taken.
    expect(stretchRun(days, 'end', FRI, DAWN, wd).add).toEqual([{ date: THU }])
  })

  it('gives up the days past where its end is pulled back to, and cuts the block it stops in', () => {
    expect(stretchRun(days, 'end', MON, DUSK, wd).remove.map((day) => day.date)).toEqual([TUE, WED])
    expect(stretchRun(days, 'start', WED, DAWN, wd).remove.map((day) => day.date)).toEqual([MON, TUE])
    const back = stretchRun(days, 'end', TUE, ELEVEN, wd)
    expect(back.remove.map((day) => day.date)).toEqual([WED])
    expect(back.trim).toEqual({ block: week[1], start: DAWN, end: ELEVEN })
    expect(stretchRun(days, 'start', TUE, HALF_PAST, wd)).toMatchObject({ remove: [{ date: MON }], trim: { block: week[1], start: HALF_PAST, end: DUSK } })
    // A single day is cut too.
    const one = runDays(on(week[0]), MON, week[0], wd)
    expect(stretchRun(one, 'end', MON, ONE, wd)).toEqual({ add: [], remove: [], trim: { block: week[0], start: DAWN, end: ONE } })
  })

  it('makes a half day at the end whole, or longer, when the end is pulled outward', () => {
    // Monday whole, Tuesday until 11:00.
    const half = block(TUE, 'vegger', DAWN, ELEVEN)
    const short = runDays(on(block(MON, 'vegger'), half), TUE, half, wd)
    expect(stretchRun(short, 'end', THU, DUSK, wd)).toEqual({ add: [{ date: TUE, own: true }, { date: WED }, { date: THU }], remove: [] })
    expect(stretchRun(short, 'end', TUE, ONE, wd)).toEqual({ add: [{ date: TUE, within: { start: DAWN, end: ONE }, own: true }], remove: [] })
    // Thursday from 11:30, Friday whole.
    const late = block(THU, 'vegger', HALF_PAST, DUSK)
    const begun = runDays(on(late, block(FRI, 'vegger')), THU, late, wd)
    expect(stretchRun(begun, 'start', WED, DAWN, wd)).toEqual({ add: [{ date: WED }, { date: THU, own: true }], remove: [] })
    // Pulled inward, the half day is given up as any day of the run.
    expect(stretchRun(short, 'end', MON, DUSK, wd).remove.map((day) => day.date)).toEqual([TUE])
  })

  it('always leaves the day at the other end, and does nothing where the end is', () => {
    expect(stretchRun(days, 'end', '2026-10-05', DUSK, wd)).toEqual({ add: [], remove: days.slice(1) })
    expect(stretchRun(days, 'start', NEXT_MON, DAWN, wd)).toEqual({ add: [], remove: days.slice(0, -1) })
    expect(stretchRun(days, 'end', WED, DUSK, wd)).toEqual({ add: [], remove: [] })
    expect(stretchRun(days, 'start', MON, DAWN, wd)).toEqual({ add: [], remove: [] })
    // The start of its own first day is no time to cut a run's end to.
    expect(stretchRun(days, 'end', MON, DAWN, wd)).toEqual({ add: [], remove: days.slice(1) })
  })
})
