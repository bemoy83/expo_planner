import type { CSSProperties } from 'react'
import type { CompetenceStyle } from '../domain/types'

/** Whether a key press belongs to a field that is being typed in, so the page's own keys leave it alone. */
export const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)

/** Where a menu or popover of the given size opens when asked for at a point: there, or as near as keeps it inside the window. */
export const inWindow = (x: number, y: number, width: number, height: number): { left: number; top: number } => ({
  left: Math.max(8, Math.min(x, window.innerWidth - width - 10)),
  top: Math.max(8, Math.min(y, window.innerHeight - height - 10)),
})

/** A competence's colour, handed to the style sheet as `--cc`. One without a style is slate. */
export const competenceColor = (style: Pick<CompetenceStyle, 'color'> | undefined): CSSProperties => ({ '--cc': `var(--${style?.color ?? 'line-slate'})` }) as CSSProperties
