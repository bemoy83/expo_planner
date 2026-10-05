import { describe, expect, it } from 'vitest'
import { fillAcross, shareOverDays, spread } from './spread'

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

describe('dragging the fill handle', () => {
  // A week from Monday: five working days, then the weekend, then on.
  const week = (n: number) => Array.from({ length: n }, (_, i) => i % 7 < 5)
  const _ = undefined

  it('copies the selected value over the new days', () => {
    expect(fillAcross({ values: [2, _, _, _], workdays: week(4), sourceLength: 1, length: 4, mode: 'copy' })).toEqual([_, 2, 2, 2])
  })

  it('repeats a pattern', () => {
    expect(fillAcross({ values: [2, 1, _, _, _], workdays: week(5), sourceLength: 2, length: 5, mode: 'copy' })).toEqual([_, _, 2, 1, 2])
  })

  it('leaves weekends alone when copying, and carries on after them', () => {
    expect(fillAcross({ values: [3, 3, _, _, _, 9, _, _, _], workdays: week(9), sourceLength: 2, length: 9, mode: 'copy' })).toEqual([_, _, 3, 3, 3, _, _, 3, 3])
  })

  it('fills every day when the selection itself is a weekend', () => {
    const workdays = [false, false, true]
    expect(fillAcross({ values: [1, _, _], workdays, sourceLength: 1, length: 3, mode: 'copy' })).toEqual([_, 1, 1])
  })

  it('copies an empty cell in the pattern as empty', () => {
    expect(fillAcross({ values: [2, _, 5, 5], workdays: week(4), sourceLength: 2, length: 4, mode: 'copy' })).toEqual([_, _, 2, null])
    expect(fillAcross({ values: [_, _, _], workdays: week(3), sourceLength: 1, length: 3, mode: 'copy' })).toEqual([_, _, _])
  })

  it('clears the days let go of when dragged back in', () => {
    expect(fillAcross({ values: [2, 2, _, 2], workdays: week(4), sourceLength: 4, length: 2, mode: 'copy' })).toEqual([_, _, _, null])
  })

  it('stretches the same total over more days, whole people first', () => {
    expect(fillAcross({ values: [4, 4, _, _], workdays: week(4), sourceLength: 2, length: 4, mode: 'stretch' })).toEqual([2, 2, 2, 2])
    expect(fillAcross({ values: [3, 2.5, _], workdays: week(3), sourceLength: 2, length: 3, mode: 'stretch' })).toEqual([2, 2, 1.5])
  })

  it('squeezes the same total into fewer days', () => {
    expect(fillAcross({ values: [1, 1, 1, 1], workdays: week(4), sourceLength: 4, length: 2, mode: 'stretch' })).toEqual([2, 2, null, null])
  })

  it('moves what stood on a weekend onto the working days when stretching', () => {
    // Friday 2, Saturday 2, stretched to the Monday after.
    const workdays = [true, false, false, true]
    expect(fillAcross({ values: [2, 2, _, _], workdays, sourceLength: 2, length: 4, mode: 'stretch' })).toEqual([2, null, _, 2])
  })

  it('does nothing when there is nothing to stretch', () => {
    expect(fillAcross({ values: [_, _, _], workdays: week(3), sourceLength: 1, length: 3, mode: 'stretch' })).toEqual([_, _, _])
  })
})
