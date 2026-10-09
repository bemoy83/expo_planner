import { describe, expect, it } from 'vitest'
import { cleanPlanMode, enterSpan, fitWidth, heldColumns, zoomFrame, zoomOf } from './zoom'

const period = { start: '2026-09-01', end: '2026-12-31' }

describe('fitWidth (R18)', () => {
  it('sizes the days to fill the room', () => {
    expect(fitWidth(10, 1200)).toBe(120)
    expect(fitWidth(10, 1205)).toBe(120)
  })
  it('keeps a day between 80 and 160 pixels', () => {
    expect(fitWidth(40, 1200)).toBe(80)
    expect(fitWidth(3, 1200)).toBe(160)
    expect(fitWidth(0, 1200)).toBe(160)
  })
})

describe('enterSpan', () => {
  it('opens on the days last seen in Bemanning', () => {
    expect(enterSpan({ period, stored: { start: '2026-10-05', end: '2026-10-14' }, leftEdge: '2026-10-01' })).toEqual({ start: '2026-10-05', end: '2026-10-14' })
  })
  it('opens on ten days from the day given the first time', () => {
    expect(enterSpan({ period, stored: null, leftEdge: '2026-10-01' })).toEqual({ start: '2026-10-01', end: '2026-10-10' })
  })
  it('forgets days stored for another period, and stops at the end of the period', () => {
    expect(enterSpan({ period, stored: { start: '2025-03-01', end: '2025-03-10' }, leftEdge: '2026-12-28' })).toEqual({ start: '2026-12-28', end: '2026-12-31' })
  })
})

describe('zoomFrame (R28)', () => {
  const from = { colW: 36, left: 40 }
  const to = { colW: 144, left: 48 }
  it('starts and ends on the two points', () => {
    expect(zoomFrame(from, to, 0)).toEqual(from)
    const end = zoomFrame(from, to, 1)
    expect(end.colW).toBeCloseTo(144)
    expect(end.left).toBe(48)
  })
  it('is half way on a log scale in the middle', () => {
    const middle = zoomFrame(from, to, 0.5)
    expect(middle.colW).toBeCloseTo(72)
    expect(middle.left).toBe(44)
  })
})

describe('zoomOf', () => {
  it('names the widths of the plan and those between them', () => {
    expect(zoomOf(26)).toBe('compact')
    expect(zoomOf(36)).toBe('normal')
    expect(zoomOf(52)).toBe('wide')
    expect(zoomOf(120)).toBe('wide')
  })
})

describe('cleanPlanMode', () => {
  it('falls back to the plan', () => {
    expect(cleanPlanMode('bemanning')).toBe('bemanning')
    expect(cleanPlanMode(undefined)).toBe('plan')
  })
})

describe('heldColumns', () => {
  it('holds the days of the wider end when the left edge stays', () => {
    // 1140 pixels of days: 32 days at 36 pixels, 8 at 160.
    expect(heldColumns({ colW: 36, left: 40 }, { colW: 160, left: 40 }, 1140)).toEqual({ from: 40, to: 72, left: 40 })
    expect(heldColumns({ colW: 160, left: 40 }, { colW: 36, left: 40 }, 1140)).toEqual({ from: 40, to: 72, left: 40 })
  })
  it('holds the days from the one place to the other when the edge moves', () => {
    expect(heldColumns({ colW: 100, left: 40 }, { colW: 80, left: 30 }, 1200)).toEqual({ from: 30, to: 52, left: 30 })
  })
  it('counts the day at the edge as whole when the page has scrolled a fraction short of it', () => {
    expect(heldColumns({ colW: 36, left: 39.999 }, { colW: 160, left: 40 }, 1140)?.from).toBe(40)
  })
  it('holds nothing when the way is longer than three times the days of the wider end', () => {
    expect(heldColumns({ colW: 100, left: 40 }, { colW: 100, left: 64 }, 1200)).toEqual({ from: 40, to: 76, left: 64 })
    expect(heldColumns({ colW: 100, left: 40 }, { colW: 100, left: 65 }, 1200)).toBeNull()
  })
})
