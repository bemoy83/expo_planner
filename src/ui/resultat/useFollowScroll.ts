import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

/** Where the project that sets the timeline is read: this far down the rows in view. */
const READING_LINE = 0.25
/** Where in the timeline in view that project's first day is put, and where today is put before anything is scrolled. */
const PROJECT_AT = 0.12
const TODAY_AT = 0.3
/** How much of the way left to go the timeline moves each frame. */
const EASE = 0.22

/**
 * The timeline of Resultat follows the rows: the project at the reading line sets how far it is scrolled sideways,
 * from its first day toward the next project's as the line passes through it, so it pans and never jumps. The rows
 * mark their first day with `data-x`, in pixels from the start of the timeline. Sideways scrolling is the code's alone
 * (`overflow-x: hidden` in the style sheet), so there is nothing to give way to.
 */
export function useFollowScroll(ref: RefObject<HTMLDivElement | null>, { todayX, labelW, deps }: { todayX: number; labelW: number; deps: unknown[] }) {
  const state = useRef({ top: 0, goal: 0, frame: 0 })

  const goalOf = (el: HTMLDivElement): number => {
    const rows = [...el.querySelectorAll<HTMLElement>('.res-row.project[data-x]')]
    if (!rows.length) return el.scrollLeft
    const held = [...el.querySelectorAll<HTMLElement>('.res-row.head, .res-row.sum')].reduce((sum, row) => sum + row.offsetHeight, 0)
    const line = el.scrollTop + held + (el.clientHeight - held) * READING_LINE
    const i = Math.max(0, rows.findIndex((row) => row.offsetTop + row.offsetHeight > line))
    const row = rows[i] ?? rows.at(-1)!
    const next = rows[i + 1]
    const through = Math.max(0, Math.min(1, (line - row.offsetTop) / row.offsetHeight))
    const from = Number(row.dataset.x)
    const x = from + ((next ? Number(next.dataset.x) : from) - from) * through
    return Math.max(0, x - timelineWidth(el) * PROJECT_AT)
  }
  // The timeline in view: the scroller less the project's column and the columns of figures held to the right.
  const timelineWidth = (el: HTMLDivElement) => el.clientWidth - labelW - (el.querySelector<HTMLElement>('.res-row.head .res-numbers')?.offsetWidth ?? 0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollLeft = el.scrollTop ? goalOf(el) : Math.max(0, todayX - timelineWidth(el) * TODAY_AT)
    state.current.top = el.scrollTop
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const s = state.current
    const tick = () => {
      const left = s.goal - el.scrollLeft
      if (Math.abs(left) < 0.5) return void (s.frame = 0)
      el.scrollLeft += left * EASE
      s.frame = requestAnimationFrame(tick)
    }
    const onScroll = () => {
      if (el.scrollTop === s.top) return
      s.top = el.scrollTop
      s.goal = goalOf(el)
      if (!s.frame) s.frame = requestAnimationFrame(tick)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(s.frame)
      s.frame = 0
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}
