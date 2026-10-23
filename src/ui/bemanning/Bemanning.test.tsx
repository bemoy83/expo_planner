import { act, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ISODate } from '../../domain/dates'
import { DEFAULT_WORKDAY, type Assignment } from '../../domain/types'
import { cleanupKalender, renderKalender, store, workspaceOf } from '../test/kalenderHarness'
import { LEFT_W } from '../kalender/layout'
import { DIVIDER_H, PERSON_H } from './layout'

/**
 * Bemanning as the planner works it: the brush and the eraser over the people, the keys, copy and paste, and the Person panel.
 * The period is October 2026, so the column of a day is its date less one. The people are Kari (FOGA) and Ola (FOGA, Elektro).
 */
const PREFS = { planMode: 'bemanning', crewPart: 'faste', bemanningRange: { start: '2026-10-05', end: '2026-10-11' } }
const colOf = (date: ISODate) => Number(date.slice(8)) - 1

const grid = (container: HTMLElement) => container.querySelector<HTMLElement>('.grid-scroll')!
const colW = (container: HTMLElement) => parseFloat(grid(container).style.getPropertyValue('--col-w'))
/** A point in a person's day: `share` is how far into the day. The lines of those who lack the competence in focus follow a divider. */
const pointOf = (container: HTMLElement, row: number, date: ISODate, share = 0.5) => {
  const divider = container.querySelector('.bm-divider')
  const under = divider ? [...container.querySelectorAll('.bm-person, .bm-divider')].indexOf(divider) <= row : false
  return {
    clientX: LEFT_W + (colOf(date) + share) * colW(container) - grid(container).scrollLeft,
    clientY: row * PERSON_H + PERSON_H / 2 + (under ? DIVIDER_H : 0),
  }
}
/** A press on a person's day. The grid reads the day and the line from where the pointer is, so any day of the people takes it. */
const press = (container: HTMLElement, row: number, date: ISODate, init: MouseEventInit = {}) => fireEvent.mouseDown(container.querySelector('.bm-person .bm-cell')!, { button: 0, ...pointOf(container, row, date), ...init })
const moveTo = (container: HTMLElement, row: number, date: ISODate, share = 0.5) => fireEvent.mouseMove(window, pointOf(container, row, date, share))
const letGo = (init: MouseEventInit = {}) => fireEvent.mouseUp(window, init)
const click = (container: HTMLElement, row: number, date: ISODate, init: MouseEventInit = {}) => {
  press(container, row, date, init)
  letGo()
}
const keyDown = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key, ...init })

const blocksOf = (personId: string) => (store.workspace?.assignments ?? []).filter((a) => a.personId === personId).sort((a, b) => a.date.localeCompare(b.date))
const block = (personId: string, date: ISODate, competence = 'foga'): Assignment => ({ id: `${personId}-${date}`, personId, date, competence, start: DEFAULT_WORKDAY.dayStart, end: DEFAULT_WORKDAY.dayEnd, source: 'manual' })
const settle = () => act(async () => {})

describe('Bemanning', () => {
  afterEach(cleanupKalender)

  it('lists the people under the demand', async () => {
    const { container } = await renderKalender(workspaceOf(), PREFS)
    expect(container.querySelector('.kalender')?.classList.contains('bemanning-mode')).toBe(true)
    expect([...container.querySelectorAll('.bm-person .bm-name')].map((name) => name.textContent)).toEqual(['Kari Nordmann', 'Ola Nordmann'])
  })

  it('paints a whole day where the brush is clicked, in one undo step', async () => {
    const { container } = await renderKalender(workspaceOf(), PREFS)
    keyDown('1')
    click(container, 0, '2026-10-06')
    await settle()
    expect(blocksOf('p1').map((a) => [a.date, a.competence, a.start, a.end])).toEqual([['2026-10-06', 'foga', DEFAULT_WORKDAY.dayStart, DEFAULT_WORKDAY.dayEnd]])
    await act(async () => store.undo())
    expect(blocksOf('p1')).toEqual([])
  })

  it('paints the working days a stroke is drawn across, whole up to the day it ends in', async () => {
    const { container } = await renderKalender(workspaceOf(), PREFS)
    keyDown('b')
    press(container, 0, '2026-10-05')
    moveTo(container, 0, '2026-10-07', 0.999)
    letGo()
    await settle()
    expect(blocksOf('p1').map((a) => [a.date, a.start, a.end])).toEqual(['2026-10-05', '2026-10-06', '2026-10-07'].map((date) => [date, DEFAULT_WORKDAY.dayStart, DEFAULT_WORKDAY.dayEnd]))
  })

  it('erases the blocks of the days with the eraser, and with Alt held under the brush', async () => {
    const { container } = await renderKalender(workspaceOf({ assignments: [block('p1', '2026-10-05'), block('p1', '2026-10-06'), block('p2', '2026-10-06')] }), PREFS)
    keyDown('t')
    click(container, 0, '2026-10-05')
    await settle()
    expect(blocksOf('p1').map((a) => a.date)).toEqual(['2026-10-06'])
    keyDown('1')
    click(container, 1, '2026-10-06', { altKey: true })
    await settle()
    expect(blocksOf('p2')).toEqual([])
    expect(blocksOf('p1').map((a) => a.date)).toEqual(['2026-10-06'])
  })

  it('tells why a day cannot be painted', async () => {
    const { container } = await renderKalender(workspaceOf({ persons: [{ id: 'p1', name: 'Kari Nordmann', order: 0, competences: ['foga'] }, { id: 'p2', name: 'Ola Nordmann', order: 1, competences: ['elektro'] }] }), PREFS)
    keyDown('1')
    // With FOGA in focus the people who have it come first: Ola, who lacks it, is the second line.
    click(container, 1, '2026-10-06')
    await settle()
    expect(blocksOf('p2')).toEqual([])
    expect(document.body.textContent).toContain('Ola Nordmann har ikke FOGA.')
  })

  it('copies a day and pastes it on another person at the day under the pointer', async () => {
    const { container } = await renderKalender(workspaceOf({ assignments: [block('p1', '2026-10-06')] }), PREFS)
    click(container, 0, '2026-10-06')
    keyDown('c', { metaKey: true })
    fireEvent.mouseMove(container.querySelector('.bm-people')!, pointOf(container, 1, '2026-10-07'))
    keyDown('v', { metaKey: true })
    await settle()
    expect(blocksOf('p2').map((a) => [a.date, a.competence])).toEqual([['2026-10-07', 'foga']])
  })

  it('moves a day of blocks to another day with «Velg»', async () => {
    const { container } = await renderKalender(workspaceOf({ assignments: [block('p1', '2026-10-06')] }), PREFS)
    const blockEl = container.querySelector('.bm-person .bm-block')!
    fireEvent.mouseDown(blockEl, { button: 0, ...pointOf(container, 0, '2026-10-06') })
    moveTo(container, 0, '2026-10-08')
    letGo()
    await settle()
    expect(blocksOf('p1').map((a) => a.date)).toEqual(['2026-10-08'])
  })

  it('pulls the end of a run on over the next days', async () => {
    const { container } = await renderKalender(workspaceOf({ assignments: [block('p1', '2026-10-05'), block('p1', '2026-10-06')] }), PREFS)
    const end = container.querySelector<HTMLElement>('.bm-person .bm-edge.end')!
    expect(end.dataset.block).toBe('p1-2026-10-06')
    fireEvent.mouseDown(end, { button: 0, ...pointOf(container, 0, '2026-10-06', 0.99) })
    moveTo(container, 0, '2026-10-08', 0.99)
    letGo()
    await settle()
    expect(blocksOf('p1').map((a) => [a.date, a.start, a.end])).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((date) => [date, DEFAULT_WORKDAY.dayStart, DEFAULT_WORKDAY.dayEnd]))
  })

  it('switches to Innleid and back to the permanent staff', async () => {
    const { container, findByText } = await renderKalender(workspaceOf(), PREFS)
    const kalender = container.querySelector('.kalender')!
    fireEvent.click(await findByText('Innleid', { selector: 'button, button *' }))
    await waitFor(() => expect(kalender.getAttribute('data-part')).toBe('innleid'))
    expect(container.querySelector('.bm-person')).toBeNull()
    fireEvent.click(await findByText('Faste', { selector: 'button, button *' }))
    await waitFor(() => expect(container.querySelector('.bm-person')).not.toBeNull())
  })

  it('puts things away with Escape in order: the selection, then the brush', async () => {
    const { container } = await renderKalender(workspaceOf(), PREFS)
    const heading = () => container.querySelector('.bm-people-head .bm-label-note')?.textContent
    const chosen = () => container.querySelector('.stroke-box.chosen')
    keyDown('1')
    expect(heading()).toBe('2 med FOGA')
    keyDown('v')
    click(container, 0, '2026-10-06')
    expect(chosen()?.textContent).toContain('1 dag × 1 pers.')
    keyDown('Escape')
    expect(chosen()).toBeNull()
    expect(heading()).toBe('2 med FOGA')
    keyDown('Escape')
    expect(heading()).toBe('2 faste')
  })

  it('opens the Person panel on a click on a name, and closes it with Escape', async () => {
    const { container } = await renderKalender(workspaceOf(), PREFS)
    fireEvent.click(container.querySelector('.bm-person-name')!)
    expect(container.querySelector('aside[aria-label="Persondetaljer"]')?.textContent).toContain('Kari Nordmann')
    keyDown('Escape')
    expect(container.querySelector('aside[aria-label="Persondetaljer"]')).toBeNull()
  })
})
