import { act, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ISODate } from '../../domain/dates'
import type { HireOrder, Supplier } from '../../domain/types'
import { cleanupKalender, renderKalender, store, workspaceOf } from '../test/kalenderHarness'
import { LEFT_W, ROW_H } from '../kalender/layout'
import { DIVIDER_H, PERSON_H } from '../bemanning/layout'

/**
 * Innleid as the planner works it: the brush and Tøm over the suppliers' lines. The period is October 2026, so the column of a
 * day is its date less one. Rigg AS offers FOGA on Dag and Kveld; Lys AS offers Elektro alone, so it follows the divider.
 */
const PREFS = { planMode: 'bemanning', crewPart: 'innleid', bemanningRange: { start: '2026-10-05', end: '2026-10-11' } }
const SUPPLIERS: Supplier[] = [
  { id: 's1', name: 'Rigg AS', order: 0, competences: ['foga'], shifts: ['dag', 'kveld'] },
  { id: 's2', name: 'Lys AS', order: 1, competences: ['elektro'], shifts: ['dag'] },
]
const workspace = (hireOrders: HireOrder[] = []) => workspaceOf({ suppliers: SUPPLIERS, hireOrders })
const colOf = (date: ISODate) => Number(date.slice(8)) - 1

/** The middle of each shift line from the top of the lines: Rigg's name line, its Dag and Kveld, the divider and Lys's one line. */
const LINES = [ROW_H + PERSON_H / 2, ROW_H + PERSON_H + PERSON_H / 2, ROW_H + 2 * PERSON_H + DIVIDER_H + PERSON_H / 2]
const grid = (container: HTMLElement) => container.querySelector<HTMLElement>('.grid-scroll')!
const pointOf = (container: HTMLElement, line: number, date: ISODate) => ({
  clientX: LEFT_W + (colOf(date) + 0.5) * parseFloat(grid(container).style.getPropertyValue('--col-w')) - grid(container).scrollLeft,
  clientY: LINES[line],
})
const press = (container: HTMLElement, line: number, date: ISODate, init: MouseEventInit = {}) => fireEvent.mouseDown(container.querySelector('.il-line .bm-cell')!, { button: 0, ...pointOf(container, line, date), ...init })
const moveTo = (container: HTMLElement, line: number, date: ISODate) => fireEvent.mouseMove(window, pointOf(container, line, date))
const letGo = (init: MouseEventInit = {}) => fireEvent.mouseUp(window, init)
const keyDown = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key, ...init })
const settle = () => act(async () => {})

/** The orders as stored: supplier, shift, day and people. */
const ordersOf = () =>
  (store.workspace?.hireOrders ?? [])
    .map((order) => [order.supplierId, order.shift, order.date, order.fte])
    .sort((a, b) => String(a).localeCompare(String(b)))
const order = (shift: HireOrder['shift'], date: ISODate, fte: number): HireOrder => ({ id: `${shift}-${date}`, supplierId: 's1', shift, competence: 'foga', date, fte, start: 420, end: 900, conf: null })

describe('Innleid', () => {
  afterEach(cleanupKalender)

  it('lists the suppliers that offer the competence first, a line per shift', async () => {
    const { container } = await renderKalender(workspace(), PREFS)
    keyDown('1')
    await settle()
    expect([...container.querySelectorAll('.il-shift')].map((shift) => shift.textContent?.split(' ')[0])).toEqual(['Dag', 'Kveld', 'Dag'])
    expect(container.querySelector('.bm-divider')).not.toBeNull()
  })

  it('orders the count of the brush on every line and day a stroke goes over, in one undo step, and skips a line without the competence', async () => {
    const { container } = await renderKalender(workspace(), PREFS)
    keyDown('1')
    keyDown('+')
    press(container, 0, '2026-10-06')
    moveTo(container, 2, '2026-10-07')
    letGo()
    await settle()
    expect(ordersOf()).toEqual([
      ['s1', 'dag', '2026-10-06', 2],
      ['s1', 'dag', '2026-10-07', 2],
      ['s1', 'kveld', '2026-10-06', 2],
      ['s1', 'kveld', '2026-10-07', 2],
    ])
    expect((store.workspace?.hireOrders ?? []).every((o) => o.conf === null && o.competence === 'foga')).toBe(true)
    await act(async () => store.undo())
    expect(ordersOf()).toEqual([])
  })

  it('replaces the count where the brush paints again', async () => {
    const { container } = await renderKalender(workspace([order('dag', '2026-10-06', 2)]), PREFS)
    keyDown('1')
    keyDown('+')
    keyDown('+')
    press(container, 0, '2026-10-06')
    letGo()
    await settle()
    expect(ordersOf()).toEqual([['s1', 'dag', '2026-10-06', 3]])
  })

  it('empties the days a stroke goes over with Alt held', async () => {
    const { container } = await renderKalender(workspace([order('dag', '2026-10-06', 2), order('kveld', '2026-10-06', 1), order('dag', '2026-10-07', 1)]), PREFS)
    keyDown('1')
    press(container, 0, '2026-10-06', { altKey: true })
    moveTo(container, 1, '2026-10-06')
    letGo({ altKey: true })
    await settle()
    expect(ordersOf()).toEqual([['s1', 'dag', '2026-10-07', 1]])
  })

  it('orders nothing where Esc cancels the stroke', async () => {
    const { container } = await renderKalender(workspace(), PREFS)
    keyDown('1')
    press(container, 0, '2026-10-06')
    moveTo(container, 1, '2026-10-07')
    keyDown('Escape')
    letGo()
    await settle()
    expect(ordersOf()).toEqual([])
  })
})
