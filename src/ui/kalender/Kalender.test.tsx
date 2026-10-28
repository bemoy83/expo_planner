import { act, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { addDays, type ISODate } from '../../domain/dates'
import { cleanupKalender, fteOf, renderKalender, ROW, store, workspaceOf } from '../test/kalenderHarness'
import { LEFT_W, ZOOM_WIDTHS } from './layout'

/**
 * The planning grid as the planner works it: a click, the keys, a number typed, copy and paste, the eraser and a pulled end of a span.
 * The period is October 2026, so the column of a day is its date less one.
 */
const COL_W = ZOOM_WIDTHS.normal
const colOf = (date: ISODate) => Number(date.slice(8)) - 1
const xOf = (date: ISODate) => LEFT_W + colOf(date) * COL_W + COL_W / 2

const grid = (container: HTMLElement) => container.querySelector<HTMLElement>('.grid-scroll')!
const rowLine = (container: HTMLElement) => container.querySelector<HTMLElement>('.grid-alloc .alloc-row')!
const cellOf = (container: HTMLElement, date: ISODate) => rowLine(container).querySelectorAll<HTMLElement>('.cell.editable')[colOf(date)]

/** A press and a let-go on a cell: a click. */
const click = (container: HTMLElement, date: ISODate, init: MouseEventInit = {}) => {
  fireEvent.mouseDown(cellOf(container, date), { button: 0, clientX: xOf(date), clientY: 100, ...init })
  fireEvent.mouseUp(window, { clientX: xOf(date), clientY: 100 })
}
const key = (container: HTMLElement, k: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(grid(container), { key: k, ...init })
const focused = (container: HTMLElement) => [...rowLine(container).querySelectorAll('.cell.editable')].findIndex((cell) => cell.classList.contains('focus'))
const selected = (container: HTMLElement) => [...rowLine(container).querySelectorAll('.cell.editable')].flatMap((cell, i) => (cell.classList.contains('selected') ? [i] : []))

/** Types into the field of the cell in focus and leaves it with a key. */
const type = (container: HTMLElement, text: string, leave = 'Enter') => {
  key(container, text[0])
  const input = container.querySelector<HTMLInputElement>('.cell-input')!
  fireEvent.change(input, { target: { value: text } })
  fireEvent.keyDown(input, { key: leave })
}

describe('the planning grid', () => {
  afterEach(cleanupKalender)

  it('shows the planning row with its FTE on its day', async () => {
    const { container } = await renderKalender()
    expect(cellOf(container, '2026-10-06').textContent).toBe('2')
    expect(cellOf(container, '2026-10-06').classList.contains('filled')).toBe(true)
  })

  it('selects a cell on a click, and moves the focus with the arrows and Tab', async () => {
    const { container } = await renderKalender()
    click(container, '2026-10-06')
    expect(focused(container)).toBe(colOf('2026-10-06'))
    key(container, 'ArrowRight')
    expect(focused(container)).toBe(colOf('2026-10-07'))
    key(container, 'Tab', { shiftKey: true })
    key(container, 'ArrowLeft')
    expect(focused(container)).toBe(colOf('2026-10-05'))
  })

  it('moves the focus and the selection over the edge of a week, where the days are drawn a week at a time', async () => {
    const { container } = await renderKalender()
    click(container, '2026-10-11')
    key(container, 'ArrowRight')
    expect(focused(container)).toBe(colOf('2026-10-12'))
    key(container, 'ArrowLeft', { shiftKey: true })
    key(container, 'ArrowLeft', { shiftKey: true })
    expect(selected(container)).toEqual([colOf('2026-10-11'), colOf('2026-10-12')])
    expect(focused(container)).toBe(colOf('2026-10-10'))
    type(container, '3')
    expect(['2026-10-10', '2026-10-11', '2026-10-12'].map((date) => cellOf(container, date).textContent)).toEqual(['3', '3', '3'])
  })

  it('picks a day by a click on its date, and lets go of the cells', async () => {
    const { container } = await renderKalender()
    const dateHead = (date: ISODate) => container.querySelectorAll<HTMLElement>('.grid-head .day-head')[colOf(date)]
    click(container, '2026-10-06')
    expect(dateHead('2026-10-06').classList.contains('active')).toBe(true)
    fireEvent.click(dateHead('2026-10-09'))
    expect(focused(container)).toBe(-1)
    expect(dateHead('2026-10-09').classList.contains('active')).toBe(true)
    expect(dateHead('2026-10-06').classList.contains('active')).toBe(false)
  })

  it('shows the day in focus in the date field, and picks the day typed there', async () => {
    const { container } = await renderKalender()
    const field = container.querySelector<HTMLInputElement>('.bar-date')!
    click(container, '2026-10-06')
    expect(field.value).toBe('2026-10-06')
    fireEvent.change(field, { target: { value: '2026-10-12' } })
    expect(focused(container)).toBe(-1)
    expect(field.value).toBe('2026-10-12')
    expect(container.querySelector('.grid-head .day-head.active')?.getAttribute('title')).toMatch(/^man 12\.10\.2026/)
  })

  it('stores a number typed in a cell, and moves on with Tab', async () => {
    const { container } = await renderKalender()
    click(container, '2026-10-07')
    type(container, '3', 'Tab')
    await act(async () => {})
    expect(fteOf('row-a', '2026-10-07')).toBe(3)
    expect(focused(container)).toBe(colOf('2026-10-08'))
  })

  it('takes a decimal comma', async () => {
    const { container } = await renderKalender()
    click(container, '2026-10-07')
    type(container, '1,5')
    await act(async () => {})
    expect(fteOf('row-a', '2026-10-07')).toBe(1.5)
  })

  it('leaves the cell as it was when Escape leaves the field', async () => {
    const { container } = await renderKalender()
    click(container, '2026-10-06')
    type(container, '5', 'Escape')
    await act(async () => {})
    expect(fteOf('row-a', '2026-10-06')).toBe(2)
    expect(container.querySelector('.cell-input')).toBeNull()
  })

  it('fills a range picked with Shift in one undo step, and keeps it selected', async () => {
    const { container } = await renderKalender()
    click(container, '2026-10-05')
    click(container, '2026-10-07', { shiftKey: true })
    expect(selected(container)).toEqual([colOf('2026-10-05'), colOf('2026-10-06')])
    type(container, '1')
    await act(async () => {})
    expect(['2026-10-05', '2026-10-06', '2026-10-07'].map((date) => fteOf('row-a', date))).toEqual([1, 1, 1])
    expect(selected(container)).toEqual([colOf('2026-10-05'), colOf('2026-10-06')])
    await act(async () => store.undo())
    expect(['2026-10-05', '2026-10-06', '2026-10-07'].map((date) => fteOf('row-a', date))).toEqual([undefined, 2, undefined])
  })

  it('selects a range by a drag with «Velg»', async () => {
    const { container } = await renderKalender()
    fireEvent.mouseDown(cellOf(container, '2026-10-05'), { button: 0, clientX: xOf('2026-10-05'), clientY: 100 })
    fireEvent.mouseEnter(cellOf(container, '2026-10-06'))
    fireEvent.mouseEnter(cellOf(container, '2026-10-08'))
    fireEvent.mouseUp(window)
    expect(selected(container)).toEqual([colOf('2026-10-05'), colOf('2026-10-06'), colOf('2026-10-07')])
    expect(focused(container)).toBe(colOf('2026-10-08'))
  })

  it('clears the selected cells with Delete, and lets go of them with Escape', async () => {
    const { container } = await renderKalender()
    click(container, '2026-10-06')
    key(container, 'Delete')
    await act(async () => {})
    expect(fteOf('row-a', '2026-10-06')).toBeUndefined()
    key(container, 'Escape')
    expect(focused(container)).toBe(-1)
  })

  it('copies a cell and pastes it on another day', async () => {
    const { container } = await renderKalender()
    click(container, '2026-10-06')
    let copied = ''
    fireEvent.copy(grid(container), { clipboardData: { setData: (_: string, text: string) => (copied = text) } })
    expect(copied).toBe('2')
    click(container, '2026-10-09')
    fireEvent.paste(grid(container), { clipboardData: { getData: () => copied } })
    await act(async () => {})
    expect(fteOf('row-a', '2026-10-09')).toBe(2)
  })

  it('erases what an Alt-drag is drawn across, and gives back what was selected', async () => {
    const { container } = await renderKalender(workspaceOf({ allocations: [{ ...workspaceOf().allocations[0], fte: { '2026-10-06': 2, '2026-10-07': 2, '2026-10-08': 1 } }] }))
    click(container, '2026-10-12')
    fireEvent.mouseDown(cellOf(container, '2026-10-07'), { button: 0, altKey: true, clientX: xOf('2026-10-07'), clientY: 100 })
    fireEvent.mouseEnter(cellOf(container, '2026-10-08'))
    fireEvent.mouseUp(window)
    await act(async () => {})
    expect(['2026-10-06', '2026-10-07', '2026-10-08'].map((date) => fteOf('row-a', date))).toEqual([2, undefined, undefined])
    expect(focused(container)).toBe(colOf('2026-10-12'))
    expect(container.querySelector('.statusbar')?.textContent).toContain('Visket ut 3 FTE-dager')
  })

  it('pulls the end of a span outward, giving the new days its crew', async () => {
    const { container } = await renderKalender()
    const from = '2026-10-06'
    const to = addDays(from, 2)
    fireEvent.mouseDown(cellOf(container, from), { button: 0, clientX: xOf(from), clientY: 100 })
    fireEvent.mouseMove(window, { clientX: xOf(to), clientY: 100 })
    expect(container.querySelector('.kalender')?.classList.contains('pulling')).toBe(true)
    fireEvent.mouseUp(window, { clientX: xOf(to), clientY: 100 })
    await act(async () => {})
    expect(['2026-10-06', '2026-10-07', '2026-10-08'].map((date) => fteOf('row-a', date))).toEqual([2, 2, 2])
    // A pull selects nothing.
    expect(focused(container)).toBe(-1)
  })

  it('opens the cell menu on a right-click, and closes it with Escape', async () => {
    const { container } = await renderKalender()
    fireEvent.contextMenu(cellOf(container, '2026-10-06'), { clientX: 10, clientY: 10 })
    expect(document.querySelector('.cell-menu')).not.toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('.cell-menu')).toBeNull()
  })

  it('shares a number typed on a folded level out over its rows', async () => {
    const other = { ...ROW, id: 'row-b', competence: 'Elektro', fte: {} }
    const { container } = await renderKalender(workspaceOf({ allocations: [ROW, other] }))
    const phase = [...container.querySelectorAll<HTMLElement>('.grid-alloc .group-row')].find((line) => line.textContent?.includes('Montering'))!
    fireEvent.click(phase.querySelector('.twisty')!)
    const folded = [...container.querySelectorAll<HTMLElement>('.grid-alloc .group-row')].find((line) => line.textContent?.includes('Montering'))!
    const cell = folded.querySelectorAll<HTMLElement>('.cell.editable')[colOf('2026-10-07')]
    fireEvent.mouseDown(cell, { button: 0, clientX: xOf('2026-10-07'), clientY: 100 })
    fireEvent.mouseUp(window)
    key(container, '4')
    const input = container.querySelector<HTMLInputElement>('.cell-input')!
    fireEvent.keyDown(input, { key: 'Enter' })
    await act(async () => {})
    expect((fteOf('row-a', '2026-10-07') ?? 0) + (fteOf('row-b', '2026-10-07') ?? 0)).toBe(4)
    expect(fteOf('row-a', '2026-10-06')).toBe(2)
  })

  it('zooms into Bemanning and out again, and keeps the plan where it was', async () => {
    const { container, findByText } = await renderKalender()
    const kalender = container.querySelector('.kalender')!
    fireEvent.click(await findByText('Bemanning', { selector: 'button, button *' }))
    await waitFor(() => expect(kalender.classList.contains('bemanning-mode')).toBe(true))
    expect([...container.querySelectorAll('.bm-person .bm-name')].map((name) => name.textContent)).toEqual(['Kari Nordmann', 'Ola Nordmann'])
    fireEvent.click(await findByText('Plan', { selector: 'button, button *' }))
    await waitFor(() => expect(container.querySelector('.grid-alloc .alloc-row')).not.toBeNull())
    expect(cellOf(container, '2026-10-06').textContent).toBe('2')
  })

  it('picks the tools with their keys, and puts them away with Escape', async () => {
    const { container } = await renderKalender()
    const kalender = container.querySelector('.kalender')!
    fireEvent.keyDown(window, { key: 'b' })
    expect(kalender.classList.contains('pencil')).toBe(true)
    fireEvent.keyDown(window, { key: 't' })
    expect(kalender.classList.contains('eraser')).toBe(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(kalender.className.trim()).toBe('kalender')
  })
})
