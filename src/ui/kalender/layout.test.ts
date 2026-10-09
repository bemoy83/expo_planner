import { describe, expect, it } from 'vitest'
import { fitSpan, overscanCols, ZOOM_WIDTHS } from './layout'

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

describe('overscanCols', () => {
  it('draws six days out of sight at each of the plan\'s widths', () => {
    expect([ZOOM_WIDTHS.compact, ZOOM_WIDTHS.normal, ZOOM_WIDTHS.wide].map(overscanCols)).toEqual([6, 6, 6])
  })
  it('draws fewer of Bemanning\'s wide days, and never fewer than two', () => {
    expect(overscanCols(80)).toBe(4)
    expect(overscanCols(160)).toBe(2)
    expect(overscanCols(400)).toBe(2)
  })
})
