import { useEffect, useMemo, useRef } from 'react'

/** How long the mouse rests on a project before it is lit, so crossing the grid does not make it flicker. */
const DELAY_MS = 120

/** The style rules that light one project: its bars and names in the hall calendar, and its lines. */
export const projectHoverCss = (project: string): string => {
  const is = `[data-project="${CSS.escape(project)}"]`
  return [
    `.hall-bar:not(${is}),.hall-label:not(${is}){opacity:.3}`,
    `.hall-bar${is}{box-shadow:0 0 0 1.5px var(--text)}`,
    `.grid-row${is}>.grid-label{box-shadow:inset 3px 0 0 var(--text)}`,
  ].join('\n')
}

/**
 * Pointing at a project lights everything of it: on one of its lines, its bars in every hall; on one of
 * its bars, its lines as well. Lines and bars carry their project in `data-project`, and the cue is one
 * style rule written into the page. Nothing is drawn again by React, and lines that scroll into view
 * are lit by the same rule. Returns the handlers for the element that holds the grid.
 */
export const useProjectHover = () => {
  const state = useRef<{ style: HTMLStyleElement | null; shown: string | null; timer: ReturnType<typeof setTimeout> | undefined }>({ style: null, shown: null, timer: undefined })
  const hover = useMemo(() => {
    const show = (project: string | null) => {
      const now = state.current
      clearTimeout(now.timer)
      if (project === now.shown) return
      now.shown = project
      now.style ??= document.createElement('style')
      if (!now.style.isConnected) document.head.appendChild(now.style)
      now.style.textContent = project === null ? '' : projectHoverCss(project)
    }
    return {
      onMouseOver: (e: { target: EventTarget; buttons: number }) => {
        // Not while a selection, a pencil stroke or the fill handle is being dragged.
        const project = e.buttons === 0 && e.target instanceof Element ? (e.target.closest<HTMLElement>('[data-project]')?.dataset.project ?? null) : null
        clearTimeout(state.current.timer)
        if (project === null) show(null)
        else if (project !== state.current.shown) state.current.timer = setTimeout(() => show(project), DELAY_MS)
      },
      onMouseLeave: () => show(null),
      dispose: () => {
        show(null)
        state.current.style?.remove()
      },
    }
  }, [])
  useEffect(() => hover.dispose, [hover])
  return hover
}
