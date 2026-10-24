import type { CSSProperties, ReactNode } from 'react'
import { reviewGrade } from '../../domain/result'
import { GRADE_TILES } from '../kalender/heat'

/**
 * A figure on the tile of the heat map for how far it is from what it is set against (`share`, either way). Without a
 * share, the figure alone.
 */
export function Graded({ share, children }: { share: number | null; children: ReactNode }) {
  if (share === null || !Number.isFinite(share)) return <span className="res-graded">{children}</span>
  const tile = GRADE_TILES[reviewGrade(share)]
  return (
    <span className={`res-graded heat-cell ${tile.kind}`}>
      <span className={`heat ${tile.kind}`} style={{ '--p': `${tile.percent}%` } as CSSProperties} />
      <span className="heat-value">{children}</span>
    </span>
  )
}
