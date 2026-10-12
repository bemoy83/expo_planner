import { capacityForDate, formatFte, FTE_NOISE, rowTotals, sumValues, type DemandIndex } from '../../domain/calc'
import type { ISODate } from '../../domain/dates'
import { decimalText } from '../../domain/numbers'
import { dayType } from '../../domain/holidays'
import { fillAcross, shareOverDays, stretchSpan } from '../../domain/spread'
import type { AllocationRow, CapacityLine, Settings } from '../../domain/types'
import type { AllocLane } from './gridTypes'
import { parseCellInput } from './layout'
import { rangeOf, type Fill, type FillCell, type Pull, type Selection } from './selection'

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

/** The span a planning row has an end of on a day: the days in a row with FTE around it. Null where the day is empty or inside a span. */
export const spanEndAt = (row: AllocationRow, dates: ISODate[], col: number): { from: number; to: number } | null => {
  if (!row.fte[dates[col]]) return null
  let from = col
  let to = col
  while (from > 0 && row.fte[dates[from - 1]]) from -= 1
  while (to < dates.length - 1 && row.fte[dates[to + 1]]) to += 1
  return col === from || col === to ? { from, to } : null
}

export interface PullPreview {
  cells: FillCell[]
  /** The days that get FTE they did not have, the days that are cleared, and the most a day ends up with. */
  added: number
  cleared: number
  perDay: number
  /** The row's planned FTE-days as the pull would leave them, and what it would then lack; null where its demand is not known. */
  planned: number
  lacking: number | null
  /** The day the span ends on after the pull. */
  tip: number
  blocked: boolean
  met: boolean
  /** Shift is held on a row with no demand to stop at. */
  noDemand: boolean
}

/** What pulling an end of a span would do to its row, see `stretchSpan`. */
export const pullPreview = (pull: Pull | null, dates: ISODate[], allocLanes: AllocLane[], demandIndex: DemandIndex, settings: Settings): PullPreview | null => {
  const row = pull && allocLanes[pull.lane]?.row
  if (!pull || !row) return null
  const required = rowTotals(demandIndex, row, settings).requiredFte
  const before = sumValues(row.fte)
  const known = required !== null && required > FTE_NOISE
  // A span of one day is pulled by the end the pointer is on the side of.
  const end = pull.from === pull.to ? (pull.toCol < pull.from ? 'start' : 'end') : pull.end
  const { cells: changes, blocked, met } = stretchSpan({
    values: dates.map((date) => row.fte[date]),
    workdays: dates.map((date) => dayType(date) === 'arbeidsdag'),
    from: pull.from,
    to: pull.to,
    end,
    at: pull.toCol,
    mode: pull.mode,
    lacking: known ? required - before : null,
  })
  const cells = [...changes].sort((a, b) => a[0] - b[0]).map(([col, value]): FillCell => ({ lane: pull.lane, date: dates[col], value }))
  const planned = cells.reduce((sum, cell) => sum + (cell.value ?? 0) - (row.fte[cell.date] ?? 0), before)
  const filled = [...changes].filter(([, value]) => value !== null).map(([col]) => col)
  // Where the end is now: the outermost day that has FTE once the pull is done.
  const inner = end === 'end' ? pull.from : pull.to
  const kept = (col: number) => (changes.has(col) ? changes.get(col) !== null : col >= pull.from && col <= pull.to)
  let tip = inner
  for (let col = inner; kept(col); col += end === 'end' ? 1 : -1) tip = col
  if (filled.length) tip = end === 'end' ? Math.max(tip, ...filled) : Math.min(tip, ...filled)
  return {
    cells,
    added: cells.filter((cell) => cell.value !== null && !row.fte[cell.date]).length,
    cleared: cells.filter((cell) => cell.value === null).length,
    perDay: Math.max(0, ...cells.map((cell) => cell.value ?? 0)),
    planned,
    lacking: required === null ? null : required - planned,
    tip,
    blocked,
    met,
    noDemand: pull.mode === 'demand' && !known,
  }
}

const pullTail = (pull: Pull, { blocked, met, noDemand, lacking }: PullPreview): string =>
  [
    noDemand ? 'raden har ikke noe kjent behov å stoppe ved' : '',
    pull.mode === 'demand' && !noDemand ? (met ? 'behovet er dekket' : lacking !== null && lacking > FTE_NOISE ? `${formatFte(lacking, 1)} FTE-dager igjen av behovet` : '') : '',
    blocked ? 'stopper før neste planlagte dag' : '',
  ]
    .filter(Boolean)
    .map((text) => ` · ${text}`)
    .join('')

/** What a stroke or a drag in progress would do, for the pill over the days it changes, as a stroke has one in Bemanning. */
export interface StrokePill {
  /** The days and the lines the stroke changes: where the pill sits. */
  from: ISODate
  to: ISODate
  lane0: number
  lane1: number
  /** The stroke only takes FTE away. */
  erase: boolean
  title: string
  parts: string[]
}

/**
 * The pill of a stroke that would leave `cells` as they are given. `titles` name it where it gives FTE and where it only
 * takes FTE away; a stroke that keeps its sum has one name and says so. Nothing while the stroke changes nothing.
 */
const strokePill = (titles: { gain: string; lose: string } | { sameSum: string }, cells: FillCell[], getValue: GetValue, extra: string[] = []): StrokePill | null => {
  const changed = cells.filter((cell) => (cell.value ?? 0) !== (getValue(cell.lane, cell.date) ?? 0))
  if (!changed.length) return null
  const sorted = changed.map((cell) => cell.date).sort()
  const lanes = changed.map((cell) => cell.lane)
  const change = changed.reduce((sum, cell) => sum + (cell.value ?? 0) - (getValue(cell.lane, cell.date) ?? 0), 0)
  const sameSum = 'sameSum' in titles
  const erase = !sameSum && changed.every((cell) => !cell.value)
  const dayCount = new Set((sameSum ? cells.filter((cell) => cell.value) : changed).map((cell) => cell.date)).size
  return {
    from: sorted[0],
    to: sorted[sorted.length - 1],
    lane0: Math.min(...lanes),
    lane1: Math.max(...lanes),
    erase,
    title: sameSum ? titles.sameSum : erase ? titles.lose : titles.gain,
    parts: [sameSum ? `${days(dayCount)} · samme sum` : `${days(dayCount)} · ${change > FTE_NOISE / 10 ? '+' : change < -FTE_NOISE / 10 ? '−' : ''}${formatFte(Math.abs(change), 1) || '0'} FTE`, ...extra.filter(Boolean)],
  }
}

/** The cells a pencil stroke would write. */
export const pencilCells = (preview: PencilStroke | null): FillCell[] => (preview?.lanes ?? []).flatMap(({ lane, parts }) => preview!.target.map((date, i) => ({ lane, date, value: parts[i] || null })))

/** The cells an eraser stroke would clear: every cell drawn across. */
export const eraserCells = (sel: Selection | null, dates: ISODate[]): FillCell[] => {
  if (!sel) return []
  const { lane0, lane1, col0, col1 } = rangeOf(sel)
  const cells: FillCell[] = []
  for (let lane = lane0; lane <= lane1; lane++) for (let col = col0; col <= col1; col++) cells.push({ lane, date: dates[col], value: null })
  return cells
}

export const pencilPill = (preview: PencilStroke, getValue: GetValue): StrokePill | null => strokePill({ gain: 'Fordel', lose: 'Tøm' }, pencilCells(preview), getValue)
export const eraserPill = (sel: Selection, dates: ISODate[], getValue: GetValue): StrokePill | null => strokePill({ gain: 'Tøm', lose: 'Tøm' }, eraserCells(sel, dates), getValue)
export const fillPill = (fill: Fill, cells: FillCell[], getValue: GetValue): StrokePill | null => strokePill(fill.stretch ? { sameSum: 'Strekk' } : { gain: 'Fyll', lose: 'Tøm' }, cells, getValue)
export const pullPill = (pull: Pull, { cells, blocked, met, noDemand }: PullPreview, getValue: GetValue): StrokePill | null =>
  strokePill(pull.mode === 'sum' ? { sameSum: 'Strekk' } : { gain: 'Forleng', lose: 'Kort inn' }, cells, getValue, [
    pull.mode === 'demand' && met ? 'til behovet er dekket' : '',
    noDemand ? 'ikke noe kjent behov' : '',
    blocked ? 'stopper før neste planlagte dag' : '',
  ])

/** What the status bar says while an end of a span is pulled. */
export const pullProgress = (pull: Pull, preview: PullPreview): string => {
  const { added, cleared, perDay, cells } = preview
  const tail = pullTail(pull, preview)
  if (pull.mode === 'sum') return cells.length ? `Strekker: opptil ${formatFte(perDay, 1)} FTE per dag, samme sum${tail}` : `Strekker: dra enden for å fordele summen på nytt${tail}`
  if (added) return `Forlenger ${days(added)} med ${formatFte(perDay, 1)} FTE${tail}${pull.mode === 'carry' ? ' · Shift stopper når behovet er dekket, Alt beholder summen' : ''}`
  if (cleared) return `Korter inn ${days(cleared)}${tail}`
  return cells.length ? `Løfter siste dag til ${formatFte(perDay, 1)} FTE${tail}` : `Dra enden sidelengs for å forlenge eller korte inn${tail || ' · Shift stopper når behovet er dekket, Alt beholder summen'}`
}

/** What the status bar says once the end is let go. */
export const pullNotice = (pull: Pull, preview: PullPreview): string | null => {
  const { added, cleared, cells } = preview
  const tail = pullTail(pull, preview)
  if (!cells.length) return tail ? `Ingenting endret${tail}` : null
  if (pull.mode === 'sum') return `Strakk summen over ${days(cells.filter((cell) => cell.value !== null).length)}${tail}`
  return `${added ? `Forlenget med ${days(added)}` : cleared ? `Kortet inn ${days(cleared)}` : 'Løftet siste dag'}${tail}`
}

/** What the cells of each line would hold if the stroke or the drag ended now, keyed by lane. An emptied cell holds 0. */
export const ghostCells = (cells: FillCell[]): Map<number, Map<ISODate, number>> => {
  const lanes = new Map<number, Map<ISODate, number>>()
  for (const cell of cells) {
    let line = lanes.get(cell.lane)
    if (!line) lanes.set(cell.lane, (line = new Map()))
    line.set(cell.date, cell.value ?? 0)
  }
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
