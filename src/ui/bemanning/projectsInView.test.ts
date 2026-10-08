import { describe, expect, it } from 'vitest'
import { phaseBars, projectSlots, projectsInView, type ProjectSpan } from './projectsInView'

const project = (key: string, start: number, end: number, eventStart = start): ProjectSpan => ({ key, name: key, halls: [], start, end, eventStart })
const vvs = project('VVS', 0, 9, 4)
const hage = project('Hage', 18, 27, 21)
const motor = project('Oslo Motor Show', 20, 33, 26)
const all = [motor, hage, vvs]
const keys = (list: ProjectSpan[]) => list.map((p) => p.key)

describe('projectsInView (R37)', () => {
  it('lists the projects with a day among the visible ones, by the start of the event', () => {
    expect(keys(projectsInView(all, 5, 14, new Set()))).toEqual(['VVS'])
    expect(keys(projectsInView(all, 16, 25, new Set()))).toEqual(['Hage', 'Oslo Motor Show'])
  })
  it('keeps a listed project until it is two days out of view', () => {
    const listed = new Set(['VVS'])
    expect(keys(projectsInView(all, 11, 20, listed))).toEqual(['VVS', 'Hage', 'Oslo Motor Show'])
    expect(keys(projectsInView(all, 12, 21, listed))).toEqual(['Hage', 'Oslo Motor Show'])
    // One that is not listed does not come in before it is in view.
    expect(keys(projectsInView(all, 11, 17, new Set()))).toEqual([])
  })
})

describe('projectSlots (R37)', () => {
  it('is the most projects any stretch of the visible days lists, lingering counted in', () => {
    expect(projectSlots(all, 10, 40)).toBe(3)
    expect(projectSlots([vvs, hage], 3, 40)).toBe(1)
    expect(projectSlots([], 10, 40)).toBe(0)
  })
})

describe('phaseBars', () => {
  it('joins days in the same phase that follow each other', () => {
    const days = new Map([
      ['2026-10-21', 'event'],
      ['2026-10-19', 'assembly'],
      ['2026-10-20', 'assembly'],
      ['2026-10-25', 'dismantle'],
    ] as const)
    expect(phaseBars(new Map(days), '2026-10-01')).toEqual([
      { phase: 'assembly', col: 18, span: 2 },
      { phase: 'event', col: 20, span: 1 },
      { phase: 'dismantle', col: 24, span: 1 },
    ])
  })
})
