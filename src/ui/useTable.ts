import { useMemo, useState, type ReactNode, type TdHTMLAttributes } from 'react'
import { columnValues, filterRows, toggleValue, withValues, type ColumnFilters, type ColumnValues } from './columnFilter'
import { nextSort, sortRows, type ColumnSort, type SortValue } from './columnSort'

/** One column of a table: its heading, what a row shows in it, and what it is filtered and sorted by. */
export interface Column<T> {
  key: string
  head?: ReactNode
  title?: string
  /** For the heading and the cells alike, as `num`, `center` and `actions`. */
  className?: string
  /** The cell as text: the values the column's filter lists, and what it is sorted by. Several values for a cell that holds several. */
  text?: (row: T) => string | string[]
  /** What the column is sorted by where that is not its text: a number, or text for a column that is sorted but not filtered. */
  sort?: (row: T) => SortValue
  /** The cell. `rows` are the rows that are shown, in their order, with this one at `index`. */
  cell: (row: T, index: number, rows: T[]) => ReactNode
  /** More for the cell of one row: a tooltip, a class of its own. */
  cellProps?: (row: T) => TdHTMLAttributes<HTMLTableCellElement>
}

/** What a column's heading needs to offer its filter. */
export interface ColumnFilter {
  offered: { value: string; count: number }[]
  /** The values kept, or `undefined` when the column is not filtered. */
  kept: string[] | undefined
  toggle: (value: string) => void
  keep: (values: string[]) => void
}

/** A table as it is shown: see `useTable`. */
export interface TableView<T> {
  columns: Column<T>[]
  /** The rows the filters let through, in the order chosen. */
  rows: T[]
  sort: ColumnSort | null
  /** A click on a heading: ascending, descending, then the table's own order again. */
  sortBy: (key: string) => void
  /** What the heading of a filtered column is given, or `undefined` for a column without a filter. */
  filter: (key: string) => ColumnFilter | undefined
  /** How many columns are filtered. */
  filtered: number
  clearFilters: () => void
}

const sortValue = <T,>(column: Column<T>): ((row: T) => SortValue) | undefined =>
  column.sort ??
  (column.text &&
    ((row) => {
      const text = column.text!(row)
      return typeof text === 'string' ? text : text.join(', ')
    }))

/** Whether a click on the column's heading sorts by it. */
export const isSortable = <T,>(column: Column<T>) => !!(column.sort ?? column.text)

/**
 * The filters and the sorting of a table, kept for as long as the tab is open. Give what it returns to
 * `DataTable`; the page reads `rows` where it counts or acts on the rows that are shown.
 */
export function useTable<T>(all: T[], columns: Column<T>[]): TableView<T> {
  const [filters, setFilters] = useState<ColumnFilters>({})
  const [sort, setSort] = useState<ColumnSort | null>(null)
  const values = useMemo(() => {
    const values: ColumnValues<T> = {}
    for (const column of columns) if (column.text) values[column.key] = column.text
    return values
  }, [columns])
  const rows = useMemo(() => {
    const kept = filterRows(all, values, filters)
    const by = sort && columns.find((column) => column.key === sort.key)
    const value = by && sortValue(by)
    return sort && value ? sortRows(kept, value, sort.direction) : kept
  }, [all, columns, values, filters, sort])
  const filter = (key: string): ColumnFilter | undefined => {
    if (!values[key]) return undefined
    const offered = columnValues(all, values, filters, key)
    const offeredValues = offered.map((o) => o.value)
    return {
      offered,
      kept: filters[key],
      toggle: (value) => setFilters((f) => toggleValue(f, key, value, offeredValues)),
      keep: (kept) => setFilters((f) => withValues(f, key, kept, offeredValues)),
    }
  }
  return {
    columns,
    rows,
    // A sorting by a column that is no longer there is none.
    sort: sort && columns.some((column) => column.key === sort.key) ? sort : null,
    sortBy: (key) => setSort((s) => nextSort(s, key)),
    filter,
    filtered: Object.keys(filters).filter((key) => values[key]).length,
    clearFilters: () => setFilters({}),
  }
}
