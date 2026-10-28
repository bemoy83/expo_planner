import { describe, expect, it } from 'vitest'
import { LEFT_W } from './layout'
import { sameDays } from './useGridViewport'

describe('sameDays', () => {
  const colW = 36
  const width = 1400

  it('holds within a day at both edges', () => {
    expect(sameDays(10 * colW + 1, 10 * colW + 5, width, colW)).toBe(true)
  })

  it('tells a new day at the left edge, rounded down, up or to the nearest', () => {
    expect(sameDays(10 * colW, 10 * colW + 2, width, colW)).toBe(false)
    expect(sameDays(10 * colW + 17, 10 * colW + 19, width, colW)).toBe(false)
    expect(sameDays(10 * colW + 30, 11 * colW + 2, width, colW)).toBe(false)
  })

  it('tells a new day at the right edge', () => {
    // The right edge of the days lies at left + width − LEFT_W; at this left it is a whole day.
    const left = 20 * colW - (width - LEFT_W) + 30 * colW
    expect(sameDays(left - 2, left + 2, width, colW)).toBe(false)
  })
})
