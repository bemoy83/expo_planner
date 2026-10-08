import type { KeyboardEvent, MouseEvent } from 'react'
import type { ISODate } from '../../domain/dates'
import type { AllocationRow, CapacityLine } from '../../domain/types'
import type { GroupNode } from './rows'
import type { Section } from './selection'

/** The day columns that are drawn: the visible ones and a few to each side. */
export interface Columns {
  dates: ISODate[]
  /** Position of the first drawn day in the whole period. */
  c0: number
  /** Position of the day at the left edge of what is seen. */
  first: number
  colW: number
  /** The classes every cell of a day shares (weekend, today, overbooked …). */
  classes: Map<ISODate, string>
}

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
  /** The fill handle sits on the last selected cell of this line. */
  handle: boolean
  /** What is being typed into the cell in focus on this line. */
  draft: string | null
  /** What a pencil or eraser stroke, or a drag of the fill handle, would put in this line's cells. */
  ghost: Map<ISODate, number> | undefined
  ghostClass: 'drawn' | 'erasing'
}

/** A line of the planning grid that takes FTE: a row, or a level whose number is shared out to its rows. */
export interface AllocLane {
  /** Position in the list of grid items. */
  index: number
  row?: AllocationRow
  node?: GroupNode
}

/** A staffing line as the grid shows it: overtime has one line for people and one for hours. */
export interface CapLane {
  line: CapacityLine
  field: 'values' | 'hours'
  label: string
}

/** What rows and cells ask the grid to do. The object stays the same for the life of the grid. */
export interface GridActions {
  cellDown: (section: Section, lane: number, col: number, e: MouseEvent) => void
  cellEnter: (section: Section, lane: number, col: number) => void
  /** A right-click on a planning row's cell. */
  cellMenu: (lane: number, col: number, e: MouseEvent) => void
  /** A click on a planning row's label. */
  selectRow: (lane: number) => void
  editCell: (value: number | undefined) => void
  setDraft: (text: string) => void
  commitDraft: () => void
  draftKey: (e: KeyboardEvent) => void
  fillDown: (section: Section, e: MouseEvent) => void
  /** A click on the name of a project that is in the hall calendar. */
  showProject: (key: string) => void
  /** A click on a project's bar in the hall calendar: its total is pinned over the rows, or let go of. */
  pinProject: (key: string) => void
  /** A click on the name of the pinned project: its days are brought into view. */
  revealProject: (key: string) => void
  /** Lets go of the pinned project. */
  releaseProject: () => void
  toggleGroup: (key: string) => void
  toggleEntry: (key: string) => void
  proposePlan: (rows: AllocationRow[], replace: boolean) => void
  addRow: (projectName: string, projectNo: string) => void
  editRow: (row: AllocationRow) => void
  removeRow: (row: AllocationRow) => void
  /** Removes all FTE from a row. */
  clearRow: (row: AllocationRow) => void
}
