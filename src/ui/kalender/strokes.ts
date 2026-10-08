import { capacityForDate, formatFte, FTE_NOISE, rowTotals, sumValues, type DemandIndex } from '../../domain/calc'
import type { ISODate } from '../../domain/dates'
import { decimalText } from '../../domain/numbers'
import { dayType } from '../../domain/holidays'
import { fillAcross, shareOverDays } from '../../domain/spread'
import type { AllocationRow, CapacityLine, Settings } from '../../domain/types'
import type { AllocLane } from './gridTypes'
import { parseCellInput } from './layout'
import { rangeOf, type Fill, type FillCell, type Selection } from './selection'

/** What the grid's tools would write, worked out from the selection and the rows: no state and no storage here. */

type GetValue = (lane: number, date: ISODate) => number | undefined

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const days = (n: number) => count(n, 'dag', 'dager')

/** The working days of a span, or the whole span when it has none. */
const workTarget = (span: ISODate[]): ISODate[] => {
  const workdays = span.filter((date) => dayType(date) === 'arbeidsdag')
  return workdays.length ? workdays : span
}

export interface PencilStroke {
  /** The days that get FTE. */
  target: ISODate[]
  /** What each line gets on each of those days. */
  lanes: { lane: number; parts: number[] }[]
  /** Lines in the stroke with no demand left to share. */
  withoutDemand: number
  shared: number
  perDay: number[]
}

/**
 * The pencil: for every line in the selection, what is left of its demand after the days outside the
 * drawn span is shared over the working days in the span, in whole people with the decimals on the last
 * day. Weekends and holidays inside the span are left as they are, unless the span has no working day at all.
 */
export const pencilStroke = (sel: Selection | null, dates: ISODate[], allocLanes: AllocLane[], demandIndex: DemandIndex, settings: Settings): PencilStroke | null => {
  if (!sel) return null
  const { lane0, lane1, col0, col1 } = rangeOf(sel)
  const target = workTarget(dates.slice(col0, col1 + 1))
  const lanes: PencilStroke['lanes'] = []
  let withoutDemand = 0
  for (let lane = lane0; lane <= lane1; lane++) {
    const { row, node } = allocLanes[lane] ?? {}
    if (!row && !node) continue
    const required = node ? node.totals.requiredFte : (rowTotals(demandIndex, row!, settings).requiredFte ?? 0)
    const planned = node ? node.totals.plannedFte : sumValues(row!.fte)
    const onTarget = target.reduce((sum, date) => sum + ((node ? node.daily.get(date) : row!.fte[date]) ?? 0), 0)
    const parts = shareOverDays(required - (planned - onTarget), target.length)
    if (parts.length) lanes.push({ lane, parts })
    else withoutDemand += 1
  }
  const perDay = target.map((_, i) => lanes.reduce((sum, l) => sum + l.parts[i], 0))
  return { target, lanes, withoutDemand, shared: perDay.reduce((a, b) => a + b, 0), perDay }
}

/** What the status bar says once a pencil stroke is drawn. */
export const pencilNotice = ({ target, withoutDemand, shared }: PencilStroke): string =>
  shared
    ? `Fordelte ${formatFte(shared, 1)} FTE-dager på ${days(target.length)}${withoutDemand ? `. ${count(withoutDemand, 'linje', 'linjer')} hadde ikke behov igjen.` : ''}`
    : 'Ikke noe behov igjen å fordele her. Dagene utenfor det du tegnet dekker allerede behovet, eller raden har ikke behov.'

/** What the status bar says while a pencil stroke is being drawn. The total is left out: a stroke always places all that is left, so it would not move. */
export const pencilProgress = (preview: PencilStroke): string =>
  preview.shared
    ? `Tegner: opptil ${formatFte(Math.max(...preview.perDay), 1)} FTE per dag over ${count(preview.target.length, 'arbeidsdag', 'arbeidsdager')}`
    : 'Tegner: ikke noe behov igjen å fordele her'

export interface Proposal {
  writes: { row: AllocationRow; date: ISODate; value: number | null }[]
  done: number
  hadPlan: number
  noWindow: number
  noDemand: number
}

/**
 * A draft plan: each row's demand shared over the working days of its window, as a pencil stroke over
 * the whole window would. For several rows at once only rows without any FTE are filled, so nothing
 * the planner has placed is touched; for a single row the days in its window are replaced.
 */
export const proposal = (list: AllocationRow[], replace: boolean, windowOf: (row: AllocationRow) => Set<ISODate> | undefined, demandIndex: DemandIndex, settings: Settings): Proposal => {
  const result: Proposal = { writes: [], done: 0, hadPlan: 0, noWindow: 0, noDemand: 0 }
  for (const row of list) {
    const window = windowOf(row)
    if (!window?.size) {
      result.noWindow += 1
      continue
    }
    if (!replace && Object.keys(row.fte).length) {
      result.hadPlan += 1
      continue
    }
    const target = workTarget([...window].sort())
    const onTarget = target.reduce((sum, date) => sum + (row.fte[date] ?? 0), 0)
    const parts = shareOverDays((rowTotals(demandIndex, row, settings).requiredFte ?? 0) - (sumValues(row.fte) - onTarget), target.length)
    if (!parts.length) {
      result.noDemand += 1
      continue
    }
    target.forEach((date, i) => {
      if (parts[i] || row.fte[date] !== undefined) result.writes.push({ row, date, value: parts[i] || null })
    })
    result.done += 1
  }
  return result
}

export const proposalNotice = ({ done, hadPlan, noWindow, noDemand }: Proposal): string => {
  const rows = (n: number) => count(n, 'rad', 'rader')
  return [
    done ? `Foreslo plan for ${rows(done)}` : 'Ingen rader fikk forslag',
    hadPlan ? `${rows(hadPlan)} hadde plan fra før og er ikke rørt` : '',
    noWindow ? `${rows(noWindow)} har ingen monterings- eller demonteringsdager i hallkalenderen` : '',
    noDemand ? `${rows(noDemand)} har ikke behov igjen` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** What a drag of the fill handle would do, line by line: copy the block over the new days, or stretch its sum. */
export const fillPreview = (fill: Fill | null, dates: ISODate[], getValue: GetValue): FillCell[] => {
  if (!fill) return []
  const cells: FillCell[] = []
  const span = dates.slice(fill.col0, Math.max(fill.col1, fill.toCol) + 1)
  const workdays = span.map((date) => dayType(date) === 'arbeidsdag')
  for (let lane = fill.lane0; lane <= fill.lane1; lane++) {
    const result = fillAcross({
      values: span.map((date) => getValue(lane, date)),
      workdays,
      sourceLength: fill.col1 - fill.col0 + 1,
      length: fill.toCol - fill.col0 + 1,
      mode: fill.stretch ? 'stretch' : 'copy',
    })
    result.forEach((value, i) => value !== undefined && cells.push({ lane, date: span[i], value }))
  }
  return cells
}

const daysWith = (cells: FillCell[], cleared: boolean) => new Set(cells.filter((cell) => (cell.value === null) === cleared).map((cell) => cell.date)).size

/** What the status bar says once the fill handle is let go. */
export const fillNotice = (fill: Fill, cells: FillCell[]): string | null => {
  const filled = daysWith(cells, false)
  return !cells.length ? null : fill.stretch ? `Strakk over ${days(filled)}` : filled ? `Fylte ${days(filled)}` : `Tømte ${days(daysWith(cells, true))}`
}

/** What the status bar says while the fill handle is dragged. */
export const fillProgress = (fill: Fill, cells: FillCell[]): string => {
  const perDay = new Map<ISODate, number>()
  for (const cell of cells) if (cell.value !== null) perDay.set(cell.date, (perDay.get(cell.date) ?? 0) + cell.value)
  const cleared = daysWith(cells, true)
  if (fill.stretch) return perDay.size ? `Strekker: opptil ${formatFte(Math.max(...perDay.values()), 1)} FTE per dag over ${days(perDay.size)}` : 'Strekker: ingenting å fordele'
  if (perDay.size) return `Fyller ${days(perDay.size)} · hold Alt for å strekke i stedet`
  return cleared ? `Tømmer ${days(cleared)}` : 'Dra sidelengs for å fylle · hold Alt for å strekke'
}

/** What the cells of each line would hold if the stroke or the drag ended now, keyed by lane. */
export const ghostCells = (preview: PencilStroke | null, erasing: Selection | null, dates: ISODate[], fillCells: FillCell[]): Map<number, Map<ISODate, number>> => {
  const lanes = new Map<number, Map<ISODate, number>>()
  const set = (lane: number, date: ISODate, value: number) => {
    let cells = lanes.get(lane)
    if (!cells) lanes.set(lane, (cells = new Map()))
    cells.set(date, value)
  }
  for (const { lane, parts } of preview?.lanes ?? []) preview!.target.forEach((date, i) => set(lane, date, parts[i]))
  // An eraser stroke shows the cells it is about to clear as empty.
  if (erasing) {
    const { lane0, lane1, col0, col1 } = rangeOf(erasing)
    for (let lane = lane0; lane <= lane1; lane++) for (let col = col0; col <= col1; col++) set(lane, dates[col], 0)
  }
  for (const cell of fillCells) set(cell.lane, cell.date, cell.value ?? 0)
  return lanes
}

/**
 * Days planned above the available crew. A pencil stroke or a drag of the fill handle in progress counts,
 * so the clash shows while it is being drawn.
 */
export const overbookedDays = (
  need: Map<ISODate, number>,
  preview: PencilStroke | null,
  fillCells: FillCell[],
  allocLanes: AllocLane[],
  getValue: GetValue,
  capacity: CapacityLine[],
  settings: Settings,
): Map<ISODate, { need: number; available: number }> => {
  const drawn = new Map<ISODate, number>()
  for (const { lane, parts } of preview?.lanes ?? []) {
    const { row, node } = allocLanes[lane] ?? {}
    preview!.target.forEach((date, i) => drawn.set(date, (drawn.get(date) ?? 0) + parts[i] - ((node ? node.daily.get(date) : row?.fte[date]) ?? 0)))
  }
  for (const cell of fillCells) drawn.set(cell.date, (drawn.get(cell.date) ?? 0) + (cell.value ?? 0) - (getValue(cell.lane, cell.date) ?? 0))
  const result = new Map<ISODate, { need: number; available: number }>()
  for (const date of new Set([...need.keys(), ...drawn.keys()])) {
    const planned = (need.get(date) ?? 0) + (drawn.get(date) ?? 0)
    const { available } = capacityForDate(date, capacity, settings)
    if (planned > available + FTE_NOISE) result.set(date, { need: planned, available })
  }
  return result
}

/** The selection as text for the clipboard: tabs between days, a line per lane, as Excel reads it. */
export const copyText = (sel: Selection, dates: ISODate[], getValue: GetValue): string => {
  const { lane0, lane1, col0, col1 } = rangeOf(sel)
  const lines: string[] = []
  for (let lane = lane0; lane <= lane1; lane++) {
    const cells: string[] = []
    for (let col = col0; col <= col1; col++) {
      const value = getValue(lane, dates[col])
      cells.push(value === undefined ? '' : decimalText(value))
    }
    lines.push(cells.join('\t'))
  }
  return lines.join('\n')
}

/** The cells a pasted text fills, from the top left of the selection. Text that is no number is skipped; what falls outside the grid is dropped. */
export const pasteCells = (text: string, sel: Selection, dates: ISODate[], laneCount: number): { lane: number; date: ISODate; value: number | null }[] => {
  const { lane0, col0 } = rangeOf(sel)
  const grid = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((line) => line.split('\t'))
  return grid.flatMap((cells, dl) =>
    cells.flatMap((raw, dc) => {
      const lane = lane0 + dl
      const col = col0 + dc
      const value = parseCellInput(raw)
      return lane < laneCount && col < dates.length && value !== undefined ? [{ lane, date: dates[col], value }] : []
    }),
  )
}
