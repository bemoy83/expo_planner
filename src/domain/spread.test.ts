import { describe, expect, it } from 'vitest'
import { spread } from './spread'

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
