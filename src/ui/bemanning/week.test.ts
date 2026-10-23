import { describe, expect, it } from 'vitest'
import { clockMinutes } from './week'
import { clock, hoursShort, hoursText } from '../format'

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

describe('a time of the day as text', () => {
  it('is read back as it is written', () => {
    expect(clock(690)).toBe('11:30')
    expect(clockMinutes('11:30')).toBe(690)
    expect(clockMinutes('07:00')).toBe(420)
  })

  it('is no number where the text is no time', () => {
    expect(clockMinutes('')).toBeNaN()
    expect(clockMinutes('11')).toBeNaN()
  })
})
