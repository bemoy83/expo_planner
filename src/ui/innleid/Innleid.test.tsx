import { act, fireEvent, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ISODate } from '../../domain/dates'
import type { HireOrder, Supplier } from '../../domain/types'
import { cleanupKalender, renderKalender, ROW, store, workspaceOf } from '../test/kalenderHarness'
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
const order = (shift: HireOrder['shift'], date: ISODate, fte: number, conf: number | null = null): HireOrder => ({ id: `${shift}-${date}`, supplierId: 's1', shift, competence: 'foga', date, fte, start: 420, end: 900, conf })
/** The run on a line that holds the order with the id, and a press on it, or on one of its ends. */
const runOf = (container: HTMLElement, id: string) => [...container.querySelectorAll<HTMLElement>('.il-run')].find((run) => run.dataset.ids?.split(' ').includes(id))!
const pressOn = (target: Element, container: HTMLElement, line: number, date: ISODate, init: MouseEventInit = {}) => fireEvent.mouseDown(target, { button: 0, ...pointOf(container, line, date), ...init })
const answers = () => (store.workspace?.hireOrders ?? []).map((one) => [one.date, one.conf]).sort((a, b) => String(a).localeCompare(String(b)))

describe('Innleid', () => {
  afterEach(cleanupKalender)

  it('lists the suppliers that offer the competence first, a line per shift', async () => {
    const { container } = await renderKalender(workspace(), PREFS)
    keyDown('1')
    await settle()
    expect([...container.querySelectorAll('.il-shift')].map((shift) => shift.textContent?.split(' ')[0])).toEqual(['Dag', 'Kveld', 'Dag'])
    expect(container.querySelector('.bm-divider')).not.toBeNull()
  })

  it('lists the competences of Faste with the same keys, and greys one no supplier offers', async () => {
    const names = (container: HTMLElement) => [...container.querySelectorAll('.bm-demand-section .bm-pick')].map((pick) => [pick.querySelector('.bm-name')?.textContent, pick.querySelector('kbd')?.textContent ?? '', (pick as HTMLButtonElement).disabled])
    const offersFoga: Supplier[] = [SUPPLIERS[0]]
    const { container } = await renderKalender(workspaceOf({ suppliers: offersFoga }), PREFS)
    fireEvent.click(within(container.querySelector('.bm-demand-section')!).getByRole('button', { name: 'Vis kompetansene uten behov' }))
    await settle()
    expect(names(container)).toEqual([
      ['FOGA', '1', false],
      ['Elektro', '', true],
    ])
    keyDown('2')
    await settle()
    expect(container.querySelector('.bm-demand.on')).toBeNull()
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

  it('removes the orders of the days selected with Delete, in one undo step', async () => {
    const { container } = await renderKalender(workspace([order('dag', '2026-10-06', 2), order('kveld', '2026-10-07', 1), order('dag', '2026-10-08', 1)]), PREFS)
    press(container, 0, '2026-10-06')
    moveTo(container, 1, '2026-10-07')
    letGo()
    await settle()
    keyDown('Delete')
    await settle()
    expect(ordersOf()).toEqual([['s1', 'dag', '2026-10-08', 1]])
    await act(async () => store.undo())
    expect(ordersOf()).toHaveLength(3)
  })

  it('copies the days selected and pastes them from the line and day under the pointer', async () => {
    const { container } = await renderKalender(workspace([order('dag', '2026-10-06', 2)]), PREFS)
    press(container, 0, '2026-10-06')
    letGo()
    keyDown('c', { ctrlKey: true })
    fireEvent.mouseMove(container.querySelector('.il-suppliers')!, pointOf(container, 1, '2026-10-08'))
    keyDown('v', { ctrlKey: true })
    await settle()
    expect(ordersOf()).toEqual([
      ['s1', 'dag', '2026-10-06', 2],
      ['s1', 'kveld', '2026-10-08', 2],
    ])
  })

  it('moves a day of orders to another day and line, and copies it there with Alt', async () => {
    const { container } = await renderKalender(workspace([order('dag', '2026-10-06', 2)]), PREFS)
    pressOn(runOf(container, 'dag-2026-10-06'), container, 0, '2026-10-06')
    moveTo(container, 1, '2026-10-07')
    letGo()
    await settle()
    expect(ordersOf()).toEqual([['s1', 'kveld', '2026-10-07', 2]])
    const [moved] = store.workspace!.hireOrders!
    pressOn(runOf(container, moved.id), container, 1, '2026-10-07')
    moveTo(container, 0, '2026-10-09')
    letGo({ altKey: true })
    await settle()
    expect(ordersOf()).toEqual([
      ['s1', 'dag', '2026-10-09', 2],
      ['s1', 'kveld', '2026-10-07', 2],
    ])
  })

  it('answers for the whole run in its popover, or for the day clicked alone', async () => {
    const { container, getByRole } = await renderKalender(workspace([order('dag', '2026-10-06', 2), order('dag', '2026-10-07', 2)]), PREFS)
    pressOn(runOf(container, 'dag-2026-10-06'), container, 0, '2026-10-07')
    letGo()
    await settle()
    const pop = () => within(getByRole('dialog'))
    fireEvent.click(pop().getByRole('button', { name: /Bekreftet/ }))
    await settle()
    expect(answers()).toEqual([['2026-10-06', 2], ['2026-10-07', 2]])
    fireEvent.click(pop().getByRole('checkbox'))
    fireEvent.click(pop().getByRole('button', { name: /Venter/ }))
    await settle()
    expect(answers()).toEqual([['2026-10-06', 2], ['2026-10-07', null]])
  })

  it('closes a run’s popover on the first press outside, which selects nothing, and on Escape, which keeps the days selected', async () => {
    const { container, queryByRole } = await renderKalender(workspace([order('dag', '2026-10-06', 2)]), PREFS)
    const chosen = () => container.querySelector('.chosen')?.textContent
    pressOn(runOf(container, 'dag-2026-10-06'), container, 0, '2026-10-06')
    letGo()
    await settle()
    expect(queryByRole('dialog')).not.toBeNull()
    expect(chosen()).toContain('1 dag × 1 linje')
    press(container, 0, '2026-10-08')
    moveTo(container, 0, '2026-10-09')
    letGo()
    await settle()
    expect(queryByRole('dialog')).toBeNull()
    expect(chosen()).toContain('1 dag × 1 linje')
    press(container, 0, '2026-10-06')
    moveTo(container, 0, '2026-10-07')
    letGo()
    pressOn(runOf(container, 'dag-2026-10-06'), container, 0, '2026-10-06')
    letGo()
    await settle()
    expect(queryByRole('dialog')).not.toBeNull()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await settle()
    expect(queryByRole('dialog')).toBeNull()
    expect(chosen()).toContain('2 dager × 1 linje')
  })

  it('gives a run more days or fewer by an end pulled', async () => {
    const { container } = await renderKalender(workspace([order('dag', '2026-10-06', 2), order('dag', '2026-10-07', 2)]), PREFS)
    pressOn(runOf(container, 'dag-2026-10-06').querySelector('.bm-edge.end')!, container, 0, '2026-10-07')
    moveTo(container, 0, '2026-10-09')
    letGo()
    await settle()
    expect(ordersOf().map(([, , date]) => date)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'])
    pressOn(runOf(container, 'dag-2026-10-06').querySelector('.bm-edge.end')!, container, 0, '2026-10-09')
    moveTo(container, 0, '2026-10-06')
    letGo()
    await settle()
    expect(ordersOf().map(([, , date]) => date)).toEqual(['2026-10-06'])
  })

  it('sets times of their own for a week of orders selected, in one undo step', async () => {
    const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']
    const { container, getByRole } = await renderKalender(workspace(week.map((date) => order('dag', date, 2))), PREFS)
    press(container, 0, '2026-10-05')
    moveTo(container, 0, '2026-10-09')
    letGo()
    pressOn(runOf(container, 'dag-2026-10-07'), container, 0, '2026-10-07')
    letGo()
    await settle()
    const pop = within(getByRole('dialog'))
    fireEvent.change(pop.getByLabelText('Fra'), { target: { value: '10:00' } })
    fireEvent.change(pop.getByLabelText('Til'), { target: { value: '18:00' } })
    fireEvent.click(pop.getByRole('button', { name: 'Sett tider' }))
    await settle()
    const times = () => (store.workspace?.hireOrders ?? []).map((one) => [one.shift, one.start, one.end])
    expect(times()).toEqual(week.map(() => ['dag', 600, 1080]))
    await act(async () => store.undo())
    expect(times()).toEqual(week.map(() => ['dag', 420, 900]))
  })

  it('keeps the day of a run selected when a click on it opens its popover again', async () => {
    const { container, queryByRole } = await renderKalender(workspace([order('dag', '2026-10-06', 2)]), PREFS)
    for (let i = 0; i < 2; i++) {
      pressOn(runOf(container, 'dag-2026-10-06'), container, 0, '2026-10-06')
      letGo()
      await settle()
      // The first click opens the popover; Escape closes it, and the day stays selected for the second.
      if (i === 0) fireEvent.keyDown(document, { key: 'Escape' })
      await settle()
    }
    expect(queryByRole('dialog')).not.toBeNull()
    expect(container.querySelector('.chosen')).not.toBeNull()
  })

  it('shows what the brush would order on the day under a still pointer, and orders nothing', async () => {
    const { container } = await renderKalender(workspace(), PREFS)
    keyDown('1')
    fireEvent.mouseMove(container.querySelector('.il-suppliers')!, pointOf(container, 0, '2026-10-06'))
    await settle()
    expect(container.querySelectorAll('.il-run.coming')).toHaveLength(1)
    expect(ordersOf()).toEqual([])
  })

  it('makes one person of the orders of two competences selected on a day, draws it in both colours, and splits it again, each in one undo step', async () => {
    // Rigg AS offers both. The day lacks 11.25 hours of FOGA and 3.75 of Elektro: two people, where three are ordered.
    const both: Supplier[] = [{ id: 's1', name: 'Rigg AS', order: 0, competences: ['foga', 'elektro'], shifts: ['dag'] }]
    const rows = [{ ...ROW, fte: { '2026-10-06': 1.5 } }, { ...ROW, id: 'row-b', competence: 'Elektro', fte: { '2026-10-06': 0.5 } }]
    const orders = [order('dag', '2026-10-06', 2), { ...order('dag', '2026-10-06', 1), id: 'el', competence: 'elektro' }]
    const { container, getByRole } = await renderKalender(workspaceOf({ suppliers: both, allocations: rows, hireOrders: orders }), PREFS)
    expect(container.querySelectorAll('.il-hint')).toHaveLength(1)
    press(container, 0, '2026-10-06')
    moveTo(container, 0, '2026-10-07')
    letGo()
    pressOn(runOf(container, 'el'), container, 0, '2026-10-06')
    letGo()
    await settle()
    fireEvent.click(within(getByRole('dialog')).getByRole('button', { name: /Én person · sparer 1 person/ }))
    await settle()
    const shared = store.workspace?.hireOrders ?? []
    expect(shared.map((one) => [one.competence, Math.round(one.fte * 7.5 * 100) / 100, one.conf])).toEqual([
      ['foga', 11.25, null],
      ['elektro', 3.75, null],
    ])
    expect(new Set(shared.map((one) => one.person)).size).toBe(1)
    expect(container.querySelectorAll('.il-run-parts i')).toHaveLength(2)
    expect(container.querySelectorAll('.il-hint')).toHaveLength(0)
    await act(async () => store.undo())
    expect(store.workspace?.hireOrders).toEqual(orders)
    await act(async () => store.redo())
    await settle()
    pressOn(container.querySelector('.il-run')!, container, 0, '2026-10-06')
    letGo()
    await settle()
    fireEvent.click(within(getByRole('dialog')).getByRole('button', { name: 'Del opp' }))
    await settle()
    expect(ordersOf()).toEqual([
      ['s1', 'dag', '2026-10-06', 1],
      ['s1', 'dag', '2026-10-06', 2],
    ])
  })
})
