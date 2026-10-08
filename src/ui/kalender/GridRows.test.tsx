import { fireEvent, render, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type AllocationRow } from '../../domain/types'
import { buildDemandIndex, rowTotals } from '../../domain/calc'
import { AllocRow, GroupRow } from './GridRows'
import type { CellEdit, Columns, GridActions } from './gridTypes'
import { buildGroups, pinnedProject, type GridItem } from './rows'
import { useStableActions } from './useStableActions'

const row: AllocationRow = {
  id: 'a',
  order: 0,
  projectName: 'VVS 2026',
  projectNo: '26970',
  refYear: '2026',
  competence: 'FOGA',
  phase: 'Montering',
  basis: 'Planlagt',
  importedHours: null,
  fte: { '2026-10-06': 2 },
  notes: {},
}
const item = { kind: 'row', row, totals: rowTotals(buildDemandIndex([]), row, DEFAULT_SETTINGS), project: { key: '26970' }, depth: 0 } as Extract<GridItem, { kind: 'row' }>
const dates = ['2026-10-05', '2026-10-06', '2026-10-07']
const cols: Columns = { dates, c0: 0, first: 0, colW: 36, classes: new Map(dates.map((date) => [date, 'day'])) }
const idle: CellEdit = { selFrom: -1, selTo: -1, focusCol: -1, handle: false, draft: null, ghost: undefined, ghostClass: 'drawn' }
const noActions = new Proxy({}, { get: () => () => {} }) as GridActions
const rowDimensions = ['competence' as const]

describe('AllocRow', () => {
  afterEach(() => vi.restoreAllMocks())

  const view = (edit: CellEdit, actions = noActions) => <AllocRow item={item} lane={0} window={undefined} rowDimensions={rowDimensions} cols={cols} actions={actions} {...edit} />
  // Every cell looks up its day's classes, so the lookups count how often the line is drawn.
  const draws = () => {
    const lookups = vi.spyOn(cols.classes, 'get')
    return () => lookups.mock.calls.length / dates.length
  }

  it('is not drawn again when nothing on its line changed', () => {
    const drawn = draws()
    const { rerender } = render(view(idle))
    expect(drawn()).toBe(1)
    // The grid renders again (a scroll frame, a selection on another line) with the same values for this line.
    rerender(view({ ...idle }))
    expect(drawn()).toBe(1)
  })

  it('shows the selection, the focus and the fill handle on its own line', () => {
    const drawn = draws()
    const { container, rerender } = render(view(idle))
    expect(container.querySelectorAll('.cell.selected')).toHaveLength(0)
    rerender(view({ ...idle, selFrom: 1, selTo: 2, focusCol: 2, handle: true }))
    expect(drawn()).toBe(2)
    const cells = [...container.querySelectorAll('.cell')]
    expect(cells.map((cell) => cell.classList.contains('selected'))).toEqual([false, true, true])
    expect(cells[2].classList.contains('focus')).toBe(true)
    expect(cells[2].querySelector('.fill-handle')).not.toBeNull()
    expect(cells[1].textContent).toBe('2')
  })

  it('shows what a stroke would put in the cells', () => {
    const { container } = render(view({ ...idle, ghost: new Map([['2026-10-07', 1.5]]) }))
    const cells = [...container.querySelectorAll('.cell')]
    expect(cells[2].classList.contains('drawn')).toBe(true)
    expect(cells[2].textContent).toBe('1,5')
    expect(cells[1].classList.contains('drawn')).toBe(false)
  })

  it('tells the grid which cell was pressed', () => {
    const cellDown = vi.fn()
    const { container } = render(view(idle, { ...noActions, cellDown }))
    fireEvent.mouseDown(container.querySelectorAll('.cell')[1])
    expect(cellDown).toHaveBeenCalledWith('alloc', 0, 1, expect.anything())
  })
})

describe('GroupRow as the pinned project', () => {
  const group = buildGroups([row], [{ key: 'vvs 2026|2026', name: 'VVS 2026', projectNo: '26970', linkSource: 'list', ambiguous: false, start: '2026-10-05', end: '2026-10-07', halls: ['C'] }], buildDemandIndex([]), DEFAULT_SETTINGS)[0]
  const view = (actions: GridActions) => <GroupRow item={pinnedProject(group)} lane={-1} phases={undefined} pinned cols={cols} actions={actions} {...idle} />

  it('shows the sum of the whole project per day', () => {
    const { container } = render(view(noActions))
    expect([...container.querySelectorAll('.cell')].map((cell) => cell.textContent)).toEqual(['', '2', ''])
  })

  it('brings the days into view from the name and is let go of from the pin, and cannot be folded', () => {
    const calls = { revealProject: vi.fn(), releaseProject: vi.fn(), showProject: vi.fn(), toggleGroup: vi.fn() }
    const { container } = render(view({ ...noActions, ...calls }))
    fireEvent.click(container.querySelector('.lbl-project')!)
    expect(calls.revealProject).toHaveBeenCalledWith('26970')
    fireEvent.click(container.querySelector('.twisty')!)
    expect(calls.releaseProject).toHaveBeenCalledTimes(1)
    expect(calls.showProject).not.toHaveBeenCalled()
    expect(calls.toggleGroup).not.toHaveBeenCalled()
    expect(container.querySelector('.level-mode')).toBeNull()
  })
})

describe('useStableActions', () => {
  it('keeps the same object and calls the latest handlers', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { result, rerender } = renderHook(({ go }) => useStableActions({ go }), { initialProps: { go: first } })
    const actions = result.current
    rerender({ go: second })
    expect(result.current).toBe(actions)
    actions.go()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
