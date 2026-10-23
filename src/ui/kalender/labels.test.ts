import { describe, expect, it } from 'vitest'
import { headLabel } from './labels'

describe('headLabel', () => {
  it('names the month on the 1st and the week on a Monday', () => {
    // 1 October 2026 is a Thursday.
    expect(headLabel('2026-10-01', 36)).toEqual({ month: 'OKT 2026', week: undefined })
    expect(headLabel('2026-10-05', 36)).toEqual({ week: 'u41' })
    expect(headLabel('2026-10-06', 36)).toEqual({})
  })

  it('writes a week that starts under the month name after the name', () => {
    // 1 November 2026 is a Sunday: week 45 starts the day after.
    expect(headLabel('2026-11-01', 36)).toEqual({ month: 'NOV 2026', week: 'u45' })
    expect(headLabel('2026-11-02', 36)).toEqual({})
    expect(headLabel('2026-11-09', 36)).toEqual({ week: 'u46' })
  })

  it('keeps the week of a month that starts on a Monday', () => {
    expect(headLabel('2026-06-01', 52)).toEqual({ month: 'JUN 2026', week: 'u23' })
  })

  it('reaches a day further in narrow columns', () => {
    // 1 August 2026 is a Saturday: the Monday is two days on, under the name only in narrow columns.
    expect(headLabel('2026-08-01', 26)).toEqual({ month: 'AUG 2026', week: 'u32' })
    expect(headLabel('2026-08-03', 26)).toEqual({})
    expect(headLabel('2026-08-01', 36)).toEqual({ month: 'AUG 2026', week: undefined })
    expect(headLabel('2026-08-03', 36)).toEqual({ week: 'u32' })
  })
})
