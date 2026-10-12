import type { CSSProperties, ReactNode } from 'react'

/** A pill sits above its box, or under it where the lines above leave it no room. */
export const PILL_ROOM = 34

interface Props {
  /** What the box is, as classes of `.stroke-box`: `bare` (no outline), `erase`, `select`, `chosen`, `plan`. */
  kind: string
  /** Where it lies over the days and the lines. */
  style: CSSProperties
  below: boolean
  /** What the pill says; without it the box has no pill. */
  children?: ReactNode
}

/**
 * What a stroke is doing or what is selected, in both modes of the Kalender: a box over the days and the lines
 * it covers, and on its edge a pill that says it. The parts of the pill are a `<b>` for its name and a `<span>` each.
 */
export function StrokeBox({ kind, style, below, children }: Props) {
  return (
    <div className={`stroke-box ${kind}`} style={style}>
      {children && <span className={`stroke-pill ${below ? 'below' : ''}`}>{children}</span>}
    </div>
  )
}
