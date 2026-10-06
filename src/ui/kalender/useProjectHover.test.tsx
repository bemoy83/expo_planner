import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { projectHoverCss, projectList, useProjectHover } from './useProjectHover'

function Grid({ enabled = true }: { enabled?: boolean }) {
  const hover = useProjectHover(enabled)
  return (
    <div data-testid="grid" onMouseOver={hover.onMouseOver} onMouseLeave={hover.onMouseLeave}>
      <span className="hall-bar" data-project="26970" data-testid="bar" />
      <span className="hall-bar" data-testid="other" />
      <div className="grid-row" data-project="26970">
        <div className="cell" data-testid="cell" />
      </div>
    </div>
  )
}

const rule = () => [...document.head.querySelectorAll('style')].map((style) => style.textContent).join('')

describe('projectList', () => {
  it('keeps projects apart whose keys hold spaces', () => {
    expect(projectList(['26970', 'navn:oslo motor show'])).toBe('|26970|navn:oslo motor show|')
    expect(projectHoverCss('26970')).toContain('[data-projects*="|26970|"]')
  })
})

describe('useProjectHover', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('lights the project of the line or bar under the mouse, after a short rest', () => {
    const { getByTestId } = render(<Grid />)
    fireEvent.mouseOver(getByTestId('cell'))
    act(() => void vi.advanceTimersByTime(200))
    expect(rule()).toBe('')
    act(() => void vi.advanceTimersByTime(300))
    expect(rule()).toBe(projectHoverCss('26970'))
    // Moving on to a bar of the same project changes nothing.
    fireEvent.mouseOver(getByTestId('bar'))
    expect(rule()).toBe(projectHoverCss('26970'))
  })

  it('clears on something that is no project, and when the mouse leaves the grid', () => {
    const { getByTestId } = render(<Grid />)
    const light = () => {
      fireEvent.mouseOver(getByTestId('bar'))
      act(() => void vi.advanceTimersByTime(300))
    }
    light()
    fireEvent.mouseOver(getByTestId('other'))
    expect(rule()).toBe('')
    light()
    fireEvent.mouseLeave(getByTestId('grid'))
    expect(rule()).toBe('')
  })

  it('stays out of the way while the mouse is dragging', () => {
    const { getByTestId } = render(<Grid />)
    fireEvent.mouseOver(getByTestId('cell'), { buttons: 1 })
    act(() => void vi.advanceTimersByTime(300))
    expect(rule()).toBe('')
  })

  it('lights nothing with tooltips switched off, and clears when they are switched off', () => {
    const { getByTestId, rerender } = render(<Grid enabled={false} />)
    fireEvent.mouseOver(getByTestId('bar'))
    act(() => void vi.advanceTimersByTime(300))
    expect(rule()).toBe('')
    rerender(<Grid />)
    fireEvent.mouseOver(getByTestId('bar'))
    act(() => void vi.advanceTimersByTime(300))
    expect(rule()).toBe(projectHoverCss('26970'))
    rerender(<Grid enabled={false} />)
    expect(rule()).toBe('')
  })

  it('keeps a pinned project lit while the mouse is on no other project', () => {
    const { result, unmount } = renderHook(() => useProjectHover(false))
    const { pin } = result.current
    pin('26970')
    expect(rule()).toBe(projectHoverCss('26970'))
    pin(null)
    expect(rule()).toBe('')
    pin('26970')
    unmount()
    expect(rule()).toBe('')
  })

  it('goes back to the pinned project when the mouse leaves another', () => {
    const { result } = renderHook(() => useProjectHover())
    const hover = result.current
    const { getByTestId } = render(
      <div data-testid="grid" onMouseOver={hover.onMouseOver} onMouseLeave={hover.onMouseLeave}>
        <span data-project="26970" data-testid="bar" />
      </div>,
    )
    hover.pin('navn:hage')
    fireEvent.mouseOver(getByTestId('bar'))
    act(() => void vi.advanceTimersByTime(300))
    expect(rule()).toBe(projectHoverCss('26970'))
    fireEvent.mouseLeave(getByTestId('grid'))
    expect(rule()).toBe(projectHoverCss('navn:hage'))
  })

  it('removes its rule with the grid', () => {
    const { getByTestId, unmount } = render(<Grid />)
    fireEvent.mouseOver(getByTestId('bar'))
    act(() => void vi.advanceTimersByTime(300))
    unmount()
    expect(rule()).toBe('')
  })
})
