import { describe, expect, it } from 'vitest'
import { hoursShort, hoursText } from './week'

describe('hours as text', () => {
  it('keeps quarter hours where the exact figure is wanted', () => {
    expect(hoursText(12.75)).toBe('12,75')
    expect(hoursText(0)).toBe('0')
  })

  it('has one decimal where the hours are read at a glance', () => {
    expect(hoursShort(12.75)).toBe('12,8')
    expect(hoursShort(95.25)).toBe('95,3')
    expect(hoursShort(15)).toBe('15')
    expect(hoursShort(0)).toBe('0')
  })
})
