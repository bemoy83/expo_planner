/** Sorting a table by one of its columns, a click on the heading at a time: ascending, descending, and back to the table's own order. */

export interface ColumnSort {
  key: string
  direction: 'asc' | 'desc'
}

/** What a cell is sorted by: text in alphabetical order, or a number. */
export type SortValue = string | number

/** The sorting after a direction is picked for `key` in its menu: that direction, or none when it was the one in use. */
export const pickSort = (sort: ColumnSort | null, key: string, direction: ColumnSort['direction']): ColumnSort | null => (sort?.key === key && sort.direction === direction ? null : { key, direction })

/** The sorting after a click on the heading of `key`. */
export const nextSort = (sort: ColumnSort | null, key: string): ColumnSort | null => (sort?.key !== key ? { key, direction: 'asc' } : sort.direction === 'asc' ? { key, direction: 'desc' } : null)

const isEmpty = (value: SortValue) => value === '' || (typeof value === 'number' && Number.isNaN(value))

const compare = (a: SortValue, b: SortValue) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'nb', { numeric: true, sensitivity: 'base' }))

/**
 * The rows in the order of a column. Rows that are equal keep the order they had, and rows with nothing
 * in the column come last in both directions, as in Excel.
 */
export const sortRows = <T>(rows: T[], value: (row: T) => SortValue, direction: ColumnSort['direction']): T[] => {
  const sign = direction === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index, value: value(row) }))
    .sort((a, b) => (isEmpty(a.value) || isEmpty(b.value) ? Number(isEmpty(a.value)) - Number(isEmpty(b.value)) : sign * compare(a.value, b.value)) || a.index - b.index)
    .map((entry) => entry.row)
}
