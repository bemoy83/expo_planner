import { describe, expect, it } from 'vitest'
import { heatScale, heatTile } from './heat'

describe('heatScale', () => {
  it('finds the largest shortage and surplus, each at least 1', () => {
    expect(heatScale([3, -8, 12, -2])).toEqual({ maxShortage: 8, maxSurplus: 12 })
    expect(heatScale([0.4, -0.2])).toEqual({ maxShortage: 1, maxSurplus: 1 })
    expect(heatScale([])).toEqual({ maxShortage: 1, maxSurplus: 1 })
  })
})

describe('heatTile', () => {
  it('colours a shortage red, darker the larger it is', () => {
    expect(heatTile(-8, 8, 10)).toEqual({ kind: 'short', percent: 85, strong: true })
    expect(heatTile(-2, 8, 10)).toEqual({ kind: 'short', percent: 38, strong: false })
    expect(heatTile(-20, 8, 10).percent).toBe(85)
  })

  it('calls a day with less than 2 FTE to spare tight', () => {
    expect(heatTile(0, 8, 10).kind).toBe('tight')
    expect(heatTile(1.9, 8, 10)).toEqual({ kind: 'tight', percent: 22, strong: false })
    // Rounding noise below zero is not a shortage.
    expect(heatTile(-0.01, 8, 10).kind).toBe('tight')
  })

  it('colours spare crew green, a little stronger the more there is', () => {
    expect(heatTile(2, 8, 10)).toEqual({ kind: 'spare', percent: 12, strong: false })
    expect(heatTile(10, 8, 10)).toEqual({ kind: 'spare', percent: 28, strong: false })
  })
})
