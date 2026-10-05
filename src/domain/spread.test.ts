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
  it('shares evenly in halves', () => {
    expect(shareOverDays(6, 4)).toEqual([1.5, 1.5, 1.5, 1.5])
    expect(shareOverDays(8, 2)).toEqual([4, 4])
  })

  it('puts what does not divide evenly on the first days', () => {
    expect(shareOverDays(5, 4)).toEqual([1.5, 1.5, 1, 1])
    expect(shareOverDays(1, 4)).toEqual([0.5, 0.5, 0, 0])
  })

  it('rounds the total up to the next half so the demand is covered', () => {
    expect(shareOverDays(3.1, 2)).toEqual([2, 1.5])
    expect(shareOverDays(0.2, 3)).toEqual([0.5, 0, 0])
    expect(shareOverDays(2.9999999999, 2)).toEqual([1.5, 1.5])
  })

  it('gives nothing when nothing is left or no days are drawn', () => {
    expect(shareOverDays(0, 3)).toEqual([])
    expect(shareOverDays(-2, 3)).toEqual([])
    expect(shareOverDays(4, 0)).toEqual([])
  })

  it('can share in other steps', () => {
    expect(shareOverDays(2.5, 2, 1)).toEqual([2, 1])
  })
})
