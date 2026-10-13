import { describe, expect, it } from 'vitest'
import { formatFte } from '../../domain/calc'
import { heatFigure, heatKind, heatScale, heatTile } from './heat'
import { ZOOM_WIDTHS } from './layout'

describe('heatScale', () => {
  it('finds the largest shortage and surplus, each at least 1', () => {
    expect(heatScale([3, -8, 12, -2])).toEqual({ maxShortage: 8, maxSurplus: 12 })
    expect(heatScale([0.4, -0.2])).toEqual({ maxShortage: 1, maxSurplus: 1 })
    expect(heatScale([])).toEqual({ maxShortage: 1, maxSurplus: 1 })
  })
})

describe('heatTile', () => {
  it('colours a shortage red, darker the larger it is', () => {
    expect(heatTile(-8, 8, 10)).toEqual({ kind: 'under', percent: 85, strong: true })
    expect(heatTile(-2, 8, 10)).toEqual({ kind: 'under', percent: 38, strong: false })
    expect(heatTile(-20, 8, 10).percent).toBe(85)
  })

  it('has one green for ok, from nothing to spare up to one FTE', () => {
    expect(heatTile(0, 8, 10)).toEqual({ kind: 'ok', percent: 20, strong: false })
    expect(heatTile(1, 8, 10)).toEqual({ kind: 'ok', percent: 20, strong: false })
    // Rounding noise below zero is not a shortage.
    expect(heatKind(-0.01)).toBe('ok')
    expect(heatKind(1.04)).toBe('ok')
  })

  it('colours more than one FTE to spare ochre, stronger the more, on the scale of the larger of the two', () => {
    expect(heatTile(1.5, 8, 10)).toEqual({ kind: 'over', percent: 24, strong: false })
    expect(heatTile(10, 8, 10)).toEqual({ kind: 'over', percent: 55, strong: false })
    // A surplus is lighter than a shortage of the same size.
    expect(heatTile(4, 8, 4).percent).toBeLessThan(heatTile(-4, 8, 4).percent)
  })

  it('takes the kind from a line with rules of its own', () => {
    expect(heatTile(3.5, 8, 10, 'ok').kind).toBe('ok')
    expect(heatTile(15, 60, 15, 'over')).toEqual({ kind: 'over', percent: 27, strong: false })
  })
})

describe('heatFigure', () => {
  it('keeps the decimal in wide columns, with a sign', () => {
    expect(heatFigure(6.9, ZOOM_WIDTHS.wide)).toBe(`+${formatFte(6.9)}`)
    expect(heatFigure(-11.8, ZOOM_WIDTHS.wide)).toBe(formatFte(-11.8))
  })

  it('shows whole numbers in narrower columns, and nothing for a zero', () => {
    expect(heatFigure(6.9, ZOOM_WIDTHS.normal)).toBe('+7')
    expect(heatFigure(-11.8, ZOOM_WIDTHS.compact)).toBe(formatFte(-12))
    expect(heatFigure(-0.4, ZOOM_WIDTHS.normal)).toBe('')
    expect(heatFigure(0, ZOOM_WIDTHS.wide)).toBe('')
    // columns narrowed to fit a project's days
    expect(heatFigure(3.3, 40)).toBe('+3')
  })
})
