import { describe, expect, it } from 'vitest'
import { shareOverDays, spread, spreadOpen, stretchSpan, type SpanInput } from './spread'

const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100

describe('sharing a number typed on a level out over its rows', () => {
  it('shares by weight', () => {
    expect(spread(4, [30, 10])).toEqual([3, 1])
    expect(spread(1.5, [1, 1, 1])).toEqual([0.5, 0.5, 0.5])
  })

  it('rounds to one decimal and still sums to the total', () => {
    const parts = spread(2, [3.1, 4.8, 1.2, 7.7, 0.2])
    expect(parts).toEqual([0.4, 0.6, 0.1, 0.9, 0])
    expect(sum(parts)).toBe(2)
    expect(sum(spread(1, [1, 1, 1]))).toBe(1)
    expect(spread(1, [1, 1, 1])).toEqual([0.4, 0.3, 0.3])
  })

  it('keeps two decimals when the total has two', () => {
    expect(spread(0.25, [1, 1])).toEqual([0.13, 0.12])
  })

  it('shares alike when no row has a weight', () => {
    expect(spread(3, [0, 0, 0])).toEqual([1, 1, 1])
    expect(spread(2, [0, Number.NaN])).toEqual([1, 1])
  })

  it('gives rows without weight nothing when others have some', () => {
    expect(spread(2, [0, 5, 0])).toEqual([0, 2, 0])
  })

  it('handles one row, no rows and zero', () => {
    expect(spread(2.5, [7])).toEqual([2.5])
    expect(spread(2, [])).toEqual([])
    expect(spread(0, [1, 2])).toEqual([0, 0])
  })
})

describe('sharing a day of a level over the rows that are open that day', () => {
  it('shares by weight among the open rows, and gives the others nothing', () => {
    expect(spreadOpen(4, [30, 10, 60], [true, true, false])).toEqual([3, 1, 0])
    expect(spreadOpen(2, [30, 10], [false, true])).toEqual([0, 2])
  })

  it('shares alike among the open rows when none of them has a weight', () => {
    expect(spreadOpen(2, [0, 0, 50], [true, true, false])).toEqual([1, 1, 0])
  })

  it('shares over all the rows when none is open', () => {
    expect(spreadOpen(4, [30, 10], [false, false])).toEqual([3, 1])
  })

  it('is as spread when every row is open, and handles no rows', () => {
    expect(spreadOpen(2, [3.1, 4.8, 1.2, 7.7, 0.2], [true, true, true, true, true])).toEqual(spread(2, [3.1, 4.8, 1.2, 7.7, 0.2]))
    expect(spreadOpen(2, [], [])).toEqual([])
  })
})

describe('sharing demand over drawn days', () => {
  it('shares whole people evenly, the ones that do not divide on the first days', () => {
    expect(shareOverDays(6, 3)).toEqual([2, 2, 2])
    expect(shareOverDays(8, 2)).toEqual([4, 4])
    expect(shareOverDays(7, 5)).toEqual([2, 2, 1, 1, 1])
  })

  it('keeps the decimals for the last day', () => {
    expect(shareOverDays(7.7, 5)).toEqual([2, 2, 1, 1, 1.7])
    expect(shareOverDays(6.5, 3)).toEqual([2, 2, 2.5])
    expect(shareOverDays(3.1, 2)).toEqual([2, 1.1])
  })

  it('puts the decimals right after the last whole person when there are more days than people', () => {
    expect(shareOverDays(1.2, 5)).toEqual([1, 0.2, 0, 0, 0])
    expect(shareOverDays(3, 5)).toEqual([1, 1, 1, 0, 0])
    expect(shareOverDays(4.5, 5)).toEqual([1, 1, 1, 1, 0.5])
    expect(shareOverDays(0.4, 3)).toEqual([0.4, 0, 0])
    expect(shareOverDays(2.5, 1)).toEqual([2.5])
  })

  it('rounds the total up to one decimal so the demand is covered', () => {
    expect(shareOverDays(1.23, 2)).toEqual([1, 0.3])
    expect(shareOverDays(0.01, 2)).toEqual([0.1, 0])
    expect(shareOverDays(2.9999999999, 2)).toEqual([2, 1])
    const parts = shareOverDays(43.47, 8)
    expect(Math.round(parts.reduce((a, b) => a + b, 0) * 10) / 10).toBe(43.5)
  })

  it('gives nothing when nothing is left or no days are drawn', () => {
    expect(shareOverDays(0, 3)).toEqual([])
    expect(shareOverDays(-2, 3)).toEqual([])
    expect(shareOverDays(4, 0)).toEqual([])
  })
})

describe('pulling an end of a span', () => {
  // A week from Monday: five working days, then the weekend, then on.
  const week = (n: number) => Array.from({ length: n }, (_, i) => i % 7 < 5)
  const _ = undefined
  const pull = (values: (number | undefined)[], input: Omit<SpanInput, 'values' | 'workdays' | 'mode'> & Partial<Pick<SpanInput, 'workdays' | 'mode'>>) => {
    const { cells, ...rest } = stretchSpan({ values, workdays: week(values.length), mode: 'carry', ...input })
    return { cells: Object.fromEntries(cells), ...rest }
  }

  it('carries the crew of the end day on over the new days, and leaves the span as it is', () => {
    expect(pull([3, 2, _, _, _], { from: 0, to: 1, end: 'end', at: 3 })).toEqual({ cells: { 2: 2, 3: 2 }, blocked: false, met: false })
  })

  it('carries the crew of the first day back when the start is pulled', () => {
    expect(pull([_, _, 3, 2], { from: 2, to: 3, end: 'start', at: 0 }).cells).toEqual({ 0: 3, 1: 3 })
  })

  it('lifts an end day that holds the decimals left over to the crew of the day before it', () => {
    expect(pull([2, 2, 0.4, _, _], { from: 0, to: 2, end: 'end', at: 4 }).cells).toEqual({ 2: 2, 3: 2, 4: 2 })
    // A whole number that is lower, and decimals that are higher, are the crew of that day.
    expect(pull([3, 2, _], { from: 0, to: 1, end: 'end', at: 2 }).cells).toEqual({ 2: 2 })
    expect(pull([2, 2.5, _], { from: 0, to: 1, end: 'end', at: 2 }).cells).toEqual({ 2: 2.5 })
    expect(pull([0.5, _], { from: 0, to: 0, end: 'end', at: 1 }).cells).toEqual({ 1: 0.5 })
  })

  it('passes over weekends, and lifts nothing where no new day is reached', () => {
    // Thursday and Friday, pulled to the Tuesday after.
    expect(pull([_, _, _, 2, 2, _, _, _, _], { from: 3, to: 4, end: 'end', at: 8 }).cells).toEqual({ 7: 2, 8: 2 })
    expect(pull([_, _, _, 2, 0.5, _, _, _, _], { from: 3, to: 4, end: 'end', at: 6 }).cells).toEqual({})
  })

  it('fills every day when the span itself is on days off', () => {
    expect(pull([_, _, _, _, _, 1, _, _], { from: 5, to: 5, end: 'end', at: 7 }).cells).toEqual({ 6: 1, 7: 1 })
    expect(pull([_, _, _, _, _, 1, _, _], { from: 5, to: 5, end: 'start', at: 3 }).cells).toEqual({ 3: 1, 4: 1 })
  })

  it('clears the days let go of, and always keeps the day at the other end', () => {
    expect(pull([2, 2, 2, 2], { from: 0, to: 3, end: 'end', at: 1 }).cells).toEqual({ 2: null, 3: null })
    expect(pull([2, 2, 2, 2], { from: 0, to: 3, end: 'start', at: 2 }).cells).toEqual({ 0: null, 1: null })
    expect(pull([_, 2, 2, 2], { from: 1, to: 3, end: 'end', at: 0 }).cells).toEqual({ 2: null, 3: null })
    expect(pull([2, 2, 2], { from: 0, to: 2, end: 'end', at: 2 }).cells).toEqual({})
  })

  it('stops on the day before the next planned day', () => {
    expect(pull([2, _, _, 4, 4], { from: 0, to: 0, end: 'end', at: 4 })).toEqual({ cells: { 1: 2, 2: 2 }, blocked: true, met: false })
    expect(pull([4, _, 2], { from: 2, to: 2, end: 'start', at: 0 })).toEqual({ cells: { 1: 2 }, blocked: true, met: false })
    expect(pull([2, _, _], { from: 0, to: 0, end: 'end', at: 9 })).toEqual({ cells: { 1: 2, 2: 2 }, blocked: false, met: false })
  })

  it('stops where the demand is met, with what is left on the last day', () => {
    expect(pull([2, _, _, _, _], { from: 0, to: 0, end: 'end', at: 4, mode: 'demand', lacking: 4.53 })).toEqual({ cells: { 1: 2, 2: 2, 3: 0.6 }, blocked: false, met: true })
    expect(pull([2, _, _], { from: 0, to: 0, end: 'end', at: 2, mode: 'demand', lacking: 9 })).toEqual({ cells: { 1: 2, 2: 2 }, blocked: false, met: false })
    // The day that held the decimals is lifted first, and counts.
    expect(pull([2, 0.5, _, _], { from: 0, to: 1, end: 'end', at: 3, mode: 'demand', lacking: 2 }).cells).toEqual({ 1: 2, 2: 0.5 })
    expect(pull([2, 0.5, _, _], { from: 0, to: 1, end: 'end', at: 3, mode: 'demand', lacking: 1 }).cells).toEqual({ 1: 1.5 })
  })

  it('writes nothing where the demand is met already', () => {
    expect(pull([2, _, _], { from: 0, to: 0, end: 'end', at: 2, mode: 'demand', lacking: 0 })).toEqual({ cells: {}, blocked: false, met: true })
    expect(pull([2, _, _], { from: 0, to: 0, end: 'end', at: 2, mode: 'demand', lacking: -3 }).met).toBe(true)
  })

  it('is not stopped by a demand that is not known', () => {
    expect(pull([2, _, _], { from: 0, to: 0, end: 'end', at: 2, mode: 'demand', lacking: null })).toEqual({ cells: { 1: 2, 2: 2 }, blocked: false, met: false })
  })

  it('clears as usual when pulled inward with the demand stop', () => {
    expect(pull([2, 2, 2], { from: 0, to: 2, end: 'end', at: 0, mode: 'demand', lacking: 5 }).cells).toEqual({ 1: null, 2: null })
  })

  it('keeps the sum and shares it again over the new length', () => {
    expect(pull([4, 4, _, _], { from: 0, to: 1, end: 'end', at: 3, mode: 'sum' }).cells).toEqual({ 0: 2, 1: 2, 2: 2, 3: 2 })
    expect(pull([1, 1, 1, 1], { from: 0, to: 3, end: 'end', at: 1, mode: 'sum' }).cells).toEqual({ 0: 2, 1: 2, 2: null, 3: null })
    expect(pull([_, _, 3, 2.5], { from: 2, to: 3, end: 'start', at: 1, mode: 'sum' }).cells).toEqual({ 1: 2, 2: 2, 3: 1.5 })
    // Over a weekend the working days share it; the next span still stops the end.
    expect(pull([_, _, _, _, 4, _, _, _, 9], { from: 4, to: 4, end: 'end', at: 8, mode: 'sum' })).toEqual({ cells: { 4: 2, 7: 2 }, blocked: true, met: false })
  })
})
