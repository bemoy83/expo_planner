import { describe, expect, it } from 'vitest'
import type { ISODate } from '../../domain/dates'
import type { VenuePhase } from '../../domain/types'
import { phaseBars, projectSlots, projectSpansOf, projectsInView, type ProjectSpan } from './projectsInView'

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

describe('projectSpansOf', () => {
  const phases = new Map<string, Map<ISODate, VenuePhase>>([
    ['26970', new Map([['2026-10-07', 'event'], ['2026-10-05', 'assembly'], ['2026-10-09', 'dismantle']])],
    ['26100', new Map([['2026-10-02', 'assembly']])],
  ])
  const hallsOf = new Map([['26970', new Set(['B2', 'A1'])], ['26100', new Set(['C'])], ['26200', new Set(['A1'])]])
  const group = (key: string, projectName: string, fte: number) => ({ key, projectName, daily: new Map([['2026-10-05', fte]]) })

  it('gives a project its days as columns, its event first, and its halls in order', () => {
    expect(projectSpansOf([group('26970', 'VVS 2026', 2)], phases, hallsOf, ['A1', 'B2'], '2026-10-01')).toEqual([{ key: '26970', name: 'VVS 2026', halls: ['A1', 'B2'], start: 4, end: 8, eventStart: 6 }])
  })

  it('starts on the first phase where there is no event', () => {
    expect(projectSpansOf([group('26100', 'Hage 2026', 1)], phases, hallsOf, ['C'], '2026-10-01')[0]).toMatchObject({ start: 1, end: 1, eventStart: 1 })
  })

  it('leaves out a project without FTE, without days, or with no booking in a hall shown', () => {
    expect(projectSpansOf([group('26970', 'VVS 2026', 0), group('26200', 'Uten dager', 1), group('26100', 'Hage 2026', 1)], phases, hallsOf, ['A1'], '2026-10-01')).toEqual([])
  })
})
