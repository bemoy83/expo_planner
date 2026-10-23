import { describe, expect, it } from 'vitest'
import { capitalized, dayText, monthName, monthShort, periodText, weekdayName, weekdayShort } from './dates'

describe('names of days and months', () => {
  it('are written from one list each', () => {
    expect(weekdayName('2026-10-05')).toBe('mandag')
    expect(weekdayShort('2026-10-11')).toBe('søn')
    expect(monthName('2026-10')).toBe('oktober')
    expect(monthShort('2027-05-17')).toBe('mai')
    expect(capitalized(weekdayName('2026-10-10'))).toBe('Lørdag')
  })

  it('make up a day and a period', () => {
    expect(dayText('2026-10-05')).toBe('man 5. okt')
    expect(periodText('2026-10-21', '2026-10-21')).toBe('21. okt')
    expect(periodText('2026-10-21', '2026-10-23')).toBe('21.–23. okt')
    expect(periodText('2026-09-30', '2026-10-02')).toBe('30. sep–2. okt')
    expect(periodText('2026-10-30', '2027-10-02')).toBe('30. okt–2. okt')
  })
})
