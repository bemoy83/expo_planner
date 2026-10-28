import type { KeyboardEvent, MouseEvent } from 'react'
import type { ISODate } from '../../domain/dates'
import type { AllocationRow } from '../../domain/types'
import type { GroupNode } from './rows'

/** A week of the period, Monday to Sunday, or the part of one at the period's ends: the days a line draws as one piece, see `DayChunk`. */
export interface DayWeek {
  /** Position of its first day in the whole period. */
  from: number
  dates: ISODate[]
}

/**
 * The day columns that are drawn: whole weeks over the visible ones and a few to each side, so that what is drawn changes only
 * when a week comes in or goes out. The day at the left edge of what is seen is not here: it changes with every day scrolled,
 * and is handed to the few lines that need it.
 */
export interface Columns {
  dates: ISODate[]
  /** The weeks the dates are in, each the same object for the life of the period. */
  weeks: DayWeek[]
  /** Position of the first drawn day in the whole period. */
  c0: number
  colW: number
  /** The classes every cell of a day shares (weekend, today, overbooked …). */
  classes: Map<ISODate, string>
}

/** The classes of a day's cell on any line. */
export const dayClass = (cols: Columns, date: ISODate) => cols.classes.get(date) ?? 'day'

/**
 * What one line of cells needs to know about the selection and the editing in progress. Kept to plain
 * values, so a line is drawn again only when something on that line changed.
 */
export interface CellEdit {
  /** First and last selected column on this line, or -1. */
  selFrom: number
  selTo: number
  /** The column in focus on this line, or -1. */
  focusCol: number
  /** What is being typed into the cell in focus on this line. */
  draft: string | null
  /** What a pencil or eraser stroke, or a pull of a span's end, would put in this line's cells. */
  ghost: Map<ISODate, number> | undefined
  /** The line's planned FTE-days as the pull of a span's end in progress would leave them. */
  livePlanned: number | undefined
}

/** A line of the planning grid that takes FTE: a row, or a level whose number is shared out to its rows. */
export interface AllocLane {
  /** Position in the list of grid items. */
  index: number
  row?: AllocationRow
  node?: GroupNode
}

/** What rows and cells ask the grid to do. The object stays the same for the life of the grid. */
export interface GridActions {
  cellDown: (lane: number, col: number, e: MouseEvent) => void
  cellEnter: (lane: number, col: number) => void
  /** A right-click on a planning row's cell. */
  cellMenu: (lane: number, col: number, e: MouseEvent) => void
  /** A click on a planning row's label. */
  selectRow: (lane: number) => void
  editCell: (value: number | undefined) => void
  setDraft: (text: string) => void
  commitDraft: () => void
  draftKey: (e: KeyboardEvent) => void
  /** A click on the name of a project that is in the hall calendar. */
  showProject: (key: string) => void
  /** A click on a project's bar in the hall calendar: the rows scroll to the project. */
  findProject: (key: string) => void
  toggleGroup: (key: string) => void
  proposePlan: (rows: AllocationRow[], replace: boolean) => void
  addRow: (projectName: string, projectNo: string) => void
  editRow: (row: AllocationRow) => void
  removeRow: (row: AllocationRow) => void
  /** Removes all FTE from a row. */
  clearRow: (row: AllocationRow) => void
}

/**
 * What a week of a line's cells is drawn from: the line's own props, which are all its cells read, with the width of a day
 * and the classes of the days for `cols`, and the selection and the cell in focus cut to the week, so the weeks they are
 * not in stay as they are. The day at the left edge (`first`) is the label's and the overlay's, never a cell's, and so are
 * the props named in `labelOnly`: what changes there is not drawn again in the cells.
 */
export const weekInputs =
  <P extends { cols: Columns; first?: number }>({ cols, first: _first, ...rest }: P, labelOnly: (keyof P)[] = []) =>
  (week: DayWeek): Record<string, unknown> => {
    const props: Record<string, unknown> = rest
    const inputs: Record<string, unknown> = { ...props, colW: cols.colW, classes: cols.classes }
    for (const key of labelOnly) delete inputs[key as string]
    if (typeof props.selFrom === 'number' && typeof props.selTo === 'number' && typeof props.focusCol === 'number') {
      const to = week.from + week.dates.length - 1
      const from = Math.max(props.selFrom, week.from)
      const until = Math.min(props.selTo, to)
      const selected = props.selFrom >= 0 && from <= until
      const focus = props.focusCol >= week.from && props.focusCol <= to
      Object.assign(inputs, { selFrom: selected ? from : -1, selTo: selected ? until : -1, focusCol: focus ? props.focusCol : -1, draft: focus ? props.draft : null })
    }
    return inputs
  }
