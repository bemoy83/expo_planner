import { useEffect, useMemo, useRef } from 'react'

/** How long the mouse rests on a project before it is lit, so crossing the grid does not make it flicker. The same wait as a tooltip's. */
const DELAY_MS = 250
/** How long a project stays lit after the view has jumped to it: long enough to find it, and then it lets go by itself. */
export const FLASH_MS = 2000

/** Several projects in one attribute, each between bars, since a project's key may hold spaces. */
export const projectList = (projects: Iterable<string>): string => `|${[...projects].join('|')}|`

/** The style rules that light one project: its bars and names in the hall calendar, and the halls it is in. */
export const projectHoverCss = (project: string): string => {
  // Inside a quoted string only the quote and the backslash need escaping.
  const key = project.replace(/["\\]/g, '\\$&')
  const is = `[data-project="${key}"]`
  const among = `[data-projects*="|${key}|"]`
  return [
    `.hall-bar:not(${is}),.hall-label:not(${is}),.hall-row:not(${among}) .lbl-hall{opacity:.3}`,
    `.hall-bar${is}{box-shadow:0 0 0 1.5px var(--text)}`,
    `.hall-row${among} .lbl-hall{font-weight:700;color:var(--text)}`,
    `.hall-row${among}>.grid-label{box-shadow:inset -3px 0 0 var(--text)}`,
  ].join('\n')
}

/**
 * Pointing at a project in the hall calendar, on one of its bars or its name there, lights its bars in
 * every hall and the names of those halls. The planning lines light nothing: the mouse is on them to
 * work, not to ask. Bars carry their project in `data-project`, and the cue is one style rule written
 * into the page. Nothing is drawn again by React, and bars that scroll into view are lit by the same rule. Returns the handlers for the element that holds the grid.
 * It follows the setting for tooltips: switched off, nothing is lit.
 * `flash` lights one project for a moment whatever the setting, to say where a jump landed; the mouse on another project takes over meanwhile.
 */
export const useProjectHover = (enabled = true) => {
  const state = useRef<{ style: HTMLStyleElement | null; shown: string | null; hovered: string | null; flashed: string | null; timer: ReturnType<typeof setTimeout> | undefined; flashTimer: ReturnType<typeof setTimeout> | undefined }>({ style: null, shown: null, hovered: null, flashed: null, timer: undefined, flashTimer: undefined })
  const hover = useMemo(() => {
    const show = (hovered: string | null) => {
      const now = state.current
      clearTimeout(now.timer)
      now.hovered = hovered
      const project = hovered ?? now.flashed
      if (project === now.shown) return
      now.shown = project
      now.style ??= document.createElement('style')
      if (!now.style.isConnected) document.head.appendChild(now.style)
      now.style.textContent = project === null ? '' : projectHoverCss(project)
    }
    return {
      onMouseOver: (e: { target: EventTarget; buttons: number }) => {
        // Not while a selection, a pencil stroke or an end of a span is being dragged.
        const project = on.current && e.buttons === 0 && e.target instanceof Element ? (e.target.closest<HTMLElement>('[data-project]')?.dataset.project ?? null) : null
        clearTimeout(state.current.timer)
        if (project === null) show(null)
        else if (project !== state.current.hovered) state.current.timer = setTimeout(() => show(project), DELAY_MS)
      },
      onMouseLeave: () => show(null),
      flash: (project: string) => {
        const now = state.current
        clearTimeout(now.flashTimer)
        now.flashed = project
        show(now.hovered)
        now.flashTimer = setTimeout(() => {
          now.flashed = null
          show(now.hovered)
        }, FLASH_MS)
      },
      dispose: () => {
        clearTimeout(state.current.flashTimer)
        state.current.flashed = null
        show(null)
        state.current.style?.remove()
      },
    }
  }, [])
  const on = useRef(enabled)
  useEffect(() => {
    on.current = enabled
    if (!enabled) hover.onMouseLeave()
  }, [enabled, hover])
  useEffect(() => hover.dispose, [hover])
  return hover
}
