import { describe, expect, it } from 'vitest'
import { shareOverDays, spread } from './spread'

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
