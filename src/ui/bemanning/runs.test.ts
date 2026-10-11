import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKDAY as wd, type Assignment } from '../../domain/types'
import { runLink, runOf, type BlocksOn } from './runs'

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

  it('ends a run at a weekend, at another competence and at an empty day', () => {
    const fri = block(FRI, 'vegger')
    const overWeekend = on(fri, block(SAT, 'vegger'), block(NEXT_MON, 'vegger'))
    expect(runLink(overWeekend, FRI, fri, wd).next).toBe(false)
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
