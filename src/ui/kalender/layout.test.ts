import { describe, expect, it } from 'vitest'
import { fitSpan, ZOOM_WIDTHS } from './layout'

describe('fitSpan', () => {
  it('centres a span that fits and keeps the column width', () => {
    // 20 columns of room, 10 days from column 30: five columns of air on each side.
    expect(fitSpan(30, 10, 20 * ZOOM_WIDTHS.normal, 'normal')).toEqual({ zoom: 'normal', leftCol: 25 })
  })

  it('narrows the columns until the span fits, with a day of air on each side', () => {
    const room = 20 * ZOOM_WIDTHS.wide
    expect(fitSpan(30, 25, room, 'wide').zoom).toBe('normal')
    expect(fitSpan(30, 35, room, 'wide').zoom).toBe('compact')
  })

  it('never widens the columns', () => {
    expect(fitSpan(30, 3, 2000, 'compact').zoom).toBe('compact')
  })

  it('starts a day before a span too long for the narrowest columns', () => {
    expect(fitSpan(30, 200, 800, 'normal')).toEqual({ zoom: 'compact', leftCol: 29 })
  })

  it('does not scroll before the first day', () => {
    expect(fitSpan(1, 4, 20 * ZOOM_WIDTHS.normal, 'normal').leftCol).toBe(0)
  })
})
