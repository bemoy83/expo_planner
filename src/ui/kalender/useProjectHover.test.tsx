import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { projectHoverCss, useProjectHover } from './useProjectHover'

function Grid() {
  const hover = useProjectHover()
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

describe('useProjectHover', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('lights the project of the line or bar under the mouse, after a short rest', () => {
    const { getByTestId } = render(<Grid />)
    fireEvent.mouseOver(getByTestId('cell'))
    expect(rule()).toBe('')
    act(() => void vi.advanceTimersByTime(200))
    expect(rule()).toBe(projectHoverCss('26970'))
    // Moving on to a bar of the same project changes nothing.
    fireEvent.mouseOver(getByTestId('bar'))
    expect(rule()).toBe(projectHoverCss('26970'))
  })

  it('clears on something that is no project, and when the mouse leaves the grid', () => {
    const { getByTestId } = render(<Grid />)
    const light = () => {
      fireEvent.mouseOver(getByTestId('bar'))
      act(() => void vi.advanceTimersByTime(200))
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
    act(() => void vi.advanceTimersByTime(200))
    expect(rule()).toBe('')
  })

  it('removes its rule with the grid', () => {
    const { getByTestId, unmount } = render(<Grid />)
    fireEvent.mouseOver(getByTestId('bar'))
    act(() => void vi.advanceTimersByTime(200))
    unmount()
    expect(rule()).toBe('')
  })
})
