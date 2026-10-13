import { formatFte, FTE_NOISE } from '../../domain/calc'
import { ZOOM_WIDTHS } from './layout'

/** In the Kalender, up to this many FTE to spare on a day is ok; more is over. */
export const OK_UP_TO = 1

/** The three answers of an Avvik line: too few, as it should be, too many. */
export type HeatKind = 'under' | 'ok' | 'over'

/** How one day of an Avvik line is coloured in the heat map. */
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

/** What a day of the Kalender is, where available crew minus planned need is `deviation`. */
export const heatKind = (deviation: number): HeatKind => (deviation < -FTE_NOISE ? 'under' : deviation > OK_UP_TO + FTE_NOISE ? 'over' : 'ok')

/**
 * The tile for a day: red when under, darker the larger the shortage; one flat green when ok, which never says how much
 * is to spare; ochre when over, stronger the more. Over and under are on one scale, and ochre stops below where red goes,
 * so a shortage is always the darker of two the same size. `kind` is given where the line has rules of its own for it.
 */
export const heatTile = (deviation: number, maxShortage: number, maxSurplus: number, kind: HeatKind = heatKind(deviation)): HeatTile => {
  if (kind === 'under') {
    const share = Math.min(1, -deviation / Math.max(1, maxShortage))
    return { kind, percent: Math.round(22 + share * 63), strong: share > 0.5 }
  }
  if (kind === 'ok') return { kind, percent: 20, strong: false }
  const share = Math.min(1, deviation / Math.max(1, maxShortage, maxSurplus))
  return { kind, percent: Math.round(18 + share * 37), strong: false }
}

export const HEAT_LABELS: Record<HeatKind, string> = { under: 'Underdekning', ok: 'Ok', over: 'Over' }

/** A figure with its sign: «−» for what is missing, «+» for what is over, and nothing for zero, where the colour says it. */
export const signed = (figure: string): string => (/[1-9]/.test(figure) ? (figure.startsWith('−') || figure.startsWith('-') ? figure : `+${figure}`) : '')

/**
 * The figure on a tile: one decimal in wide columns, a whole number in narrower ones, where a figure
 * such as −11,8 does not fit on the tile. The exact figure is in the cell's tooltip.
 */
export const heatFigure = (deviation: number, colW: number): string => signed(colW >= ZOOM_WIDTHS.wide ? formatFte(deviation) : formatFte(Math.round(deviation) || 0, 0))
