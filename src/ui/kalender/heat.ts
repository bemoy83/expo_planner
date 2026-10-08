import { formatFte, FTE_NOISE } from '../../domain/calc'
import { ZOOM_WIDTHS } from './layout'

/** Less than this many FTE to spare on a day counts as tight. */
export const TIGHT_BELOW = 2

export type HeatKind = 'short' | 'tight' | 'spare'

/** How one day of the Avvik line is coloured in the heat map. */
export interface HeatTile {
  kind: HeatKind
  /** How much of the kind's colour is mixed into the page colour, in per cent. */
  percent: number
  /** The fill is dark enough to need light text. */
  strong: boolean
}

/** The largest shortage and the largest surplus among the deviations, each at least 1, for scaling the tiles. */
export const heatScale = (deviations: Iterable<number>): { maxShortage: number; maxSurplus: number } => {
  let maxShortage = 1
  let maxSurplus = 1
  for (const dev of deviations) {
    if (-dev > maxShortage) maxShortage = -dev
    if (dev > maxSurplus) maxSurplus = dev
  }
  return { maxShortage, maxSurplus }
}

/**
 * The tile for a day where available crew minus planned need is `deviation`: red when understaffed, darker
 * the larger the shortage; amber when little is to spare; green when there is room, a little stronger the more.
 */
export const heatTile = (deviation: number, maxShortage: number, maxSurplus: number): HeatTile => {
  if (deviation < -FTE_NOISE) {
    const share = Math.min(1, -deviation / Math.max(1, maxShortage))
    return { kind: 'short', percent: Math.round(22 + share * 63), strong: share > 0.5 }
  }
  if (deviation < TIGHT_BELOW) return { kind: 'tight', percent: 22, strong: false }
  const share = Math.min(1, deviation / Math.max(1, maxSurplus))
  return { kind: 'spare', percent: Math.round(8 + share * 20), strong: false }
}

export const HEAT_LABELS: Record<HeatKind, string> = { short: 'Underdekning', tight: 'Stramt', spare: 'Ledig' }

/**
 * The figure on a tile: one decimal in wide columns, a whole number in narrower ones, where a figure
 * such as −11,8 does not fit on the tile. The exact figure is in the cell's tooltip.
 */
export const heatFigure = (deviation: number, colW: number): string => (colW >= ZOOM_WIDTHS.wide ? formatFte(deviation) : formatFte(Math.round(deviation) || 0, 0))
