import type { MouseEvent, RefObject } from 'react'
import { LEFT_W } from './layout'

/**
 * The day under the pointer, tinted down the date header and the top block, to trace a bar in the hall calendar to its date, and a
 * planning row's day to its date and to what the halls hold on it. In Bemanning it runs down the project lines and the demand, and a
 * person's day is traced to them. The rows themselves are not tinted: they are ruled, and carry the selection.
 * It is laid by a style variable on the canvas, set here and not in a state, so no line is drawn again as the pointer moves.
 * Returns the tint, to put in each block it runs down, and the handlers of the blocks the pointer traces it from.
 */
export function useDayHover(scrollRef: RefObject<HTMLDivElement | null>, colW: number, dayCount: number) {
  const dayHover = <i className="day-hover" style={{ left: `calc(var(--col-w) * var(--hover-day, 0) + ${LEFT_W}px)` }} />
  const onMouseMove = (e: MouseEvent<HTMLElement>) => {
    const canvas = e.currentTarget.parentElement
    const scroll = scrollRef.current
    if (!canvas || !scroll) return
    const inLabels = e.clientX - scroll.getBoundingClientRect().left < LEFT_W
    const day = inLabels ? -1 : Math.floor((e.clientX - canvas.getBoundingClientRect().left - LEFT_W) / colW)
    if (day < 0 || day >= dayCount) delete canvas.dataset.hoverDay
    else if (canvas.dataset.hoverDay !== String(day)) {
      canvas.style.setProperty('--hover-day', String(day))
      canvas.dataset.hoverDay = String(day)
    }
  }
  const onMouseLeave = (e: MouseEvent<HTMLElement>) => {
    if (e.currentTarget.parentElement) delete e.currentTarget.parentElement.dataset.hoverDay
  }
  return { dayHover, hoverProps: { onMouseMove, onMouseLeave } }
}
