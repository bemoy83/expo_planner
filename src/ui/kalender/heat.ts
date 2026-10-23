import { FTE_NOISE } from '../../domain/calc'
import { ZOOM_WIDTHS } from './layout'
import { formatFte, signed } from '../format'

/** In the Kalender, up to this many FTE to spare on a day is ok; more is over. */
export const OK_UP_TO = 1

/** The three answers of an Avvik line: too few, as it should be, too many. */
export type HeatKind = 'under' | 'ok' | 'over'

/** How one day of an Avvik line is coloured in the heat map. */
interface HeatTile {
  kind: HeatKind
  /** How much of the kind's colour is mixed into the page colour, in per cent. */
  percent: number
  /** The fill is strong enough that the figure is written in the page's ink, not the kind's. */
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

/** What a day of the Kalender is, where available crew minus planned need is `deviation`. */
export const heatKind = (deviation: number): HeatKind => (deviation < -FTE_NOISE ? 'under' : deviation > OK_UP_TO + FTE_NOISE ? 'over' : 'ok')

/**
 * The tile for a day: red when under, darker the larger the shortage; one flat green when ok, which never says how much
 * is to spare; ochre when over, stronger the more. Over and under are on one scale, and ochre stops below where red goes,
 * so a shortage is always the darker of two the same size. The tiles are kept soft, a tint on the page as the other
 * fills of the app are (2026-10-23): a shortage at most 42 % of its colour, a surplus 30 %. `kind` is given where the line has rules of its own for it.
 */
export const heatTile = (deviation: number, maxShortage: number, maxSurplus: number, kind: HeatKind = heatKind(deviation)): HeatTile => {
  if (kind === 'under') {
    const share = Math.min(1, -deviation / Math.max(1, maxShortage))
    return { kind, percent: Math.round(14 + share * 28), strong: share > 0.5 }
  }
  if (kind === 'ok') return { kind, percent: 14, strong: false }
  const share = Math.min(1, deviation / Math.max(1, maxShortage, maxSurplus))
  return { kind, percent: Math.round(10 + share * 20), strong: false }
}

export const HEAT_LABELS: Record<HeatKind, string> = { under: 'Underdekning', ok: 'Ok', over: 'Over' }


/**
 * The figure on a tile: one decimal in wide columns, a whole number in narrower ones, where a figure
 * such as −11,8 does not fit on the tile. The exact figure is in the cell's tooltip.
 */
export const heatFigure = (deviation: number, colW: number): string => signed(colW >= ZOOM_WIDTHS.wide ? formatFte(deviation) : formatFte(Math.round(deviation) || 0, 0))
