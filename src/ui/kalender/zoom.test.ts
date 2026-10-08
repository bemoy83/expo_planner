import { describe, expect, it } from 'vitest'
import { cleanPlanMode, enterSpan, fitWidth, leaveLeft, zoomFrame, zoomOf } from './zoom'

const period = { start: '2026-09-01', end: '2026-12-31' }
const hage = { start: '2026-10-19', end: '2026-10-28' }

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

describe('enterSpan (R18, R29)', () => {
  it('opens on the chosen project', () => {
    expect(enterSpan({ period, project: hage, stored: { start: '2026-10-05', end: '2026-10-14' }, leftEdge: '2026-10-01' })).toEqual(hage)
  })
  it('opens on the days last seen in Bemanning when no project is chosen', () => {
    expect(enterSpan({ period, stored: { start: '2026-10-05', end: '2026-10-14' }, leftEdge: '2026-10-01' })).toEqual({ start: '2026-10-05', end: '2026-10-14' })
  })
  it('opens on ten days from the left edge of the plan the first time', () => {
    expect(enterSpan({ period, stored: null, leftEdge: '2026-10-01' })).toEqual({ start: '2026-10-01', end: '2026-10-10' })
  })
  it('passes over a span that leaves the day in focus out of view', () => {
    expect(enterSpan({ period, project: hage, stored: { start: '2026-10-05', end: '2026-10-14' }, focus: '2026-10-07', leftEdge: '2026-10-01' })).toEqual({ start: '2026-10-05', end: '2026-10-14' })
  })
  it('starts on the Monday of the week of the day in focus when no span holds it', () => {
    expect(enterSpan({ period, project: hage, focus: '2026-11-05', leftEdge: '2026-10-01' })).toEqual({ start: '2026-11-02', end: '2026-11-11' })
  })
  it('forgets days stored for another period, and stops at the end of the period', () => {
    expect(enterSpan({ period, stored: { start: '2025-03-01', end: '2025-03-10' }, leftEdge: '2026-12-28' })).toEqual({ start: '2026-12-28', end: '2026-12-31' })
  })
})

describe('leaveLeft (R29)', () => {
  it('keeps the same day in the middle', () => {
    expect(leaveLeft({ middle: 50, shown: 30 })).toBe(35)
    expect(leaveLeft({ middle: 50, focusCol: 48, shown: 30 })).toBe(35)
  })
  it('puts the day in focus in the middle when it would be out of view', () => {
    expect(leaveLeft({ middle: 50, focusCol: 90, shown: 30 })).toBe(75.5)
  })
  it('does not go before the first day', () => {
    expect(leaveLeft({ middle: 5, shown: 30 })).toBe(0)
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
