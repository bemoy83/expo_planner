import { useMemo, useState } from 'react'
import { columnValues, filterRows, toggleValue, withValues, type ColumnFilters, type ColumnValues } from './columnFilter'

/** What a column's heading needs to offer its filter. */
export interface ColumnFilter {
  offered: { value: string; count: number }[]
  /** The values kept, or `undefined` when the column is not filtered. */
  kept: string[] | undefined
  toggle: (value: string) => void
  keep: (values: string[]) => void
}

/**
 * Filters on the columns of a table, kept for as long as the tab is open. `rows` are the rows the
 * filters let through; `filter(key)` is what the heading of a column is given.
 */
export function useColumnFilters<T>(all: T[], columns: ColumnValues<T>) {
  const [filters, setFilters] = useState<ColumnFilters>({})
  const rows = useMemo(() => filterRows(all, columns, filters), [all, columns, filters])
  const filter = (key: string): ColumnFilter => {
    const offered = columnValues(all, columns, filters, key)
    const values = offered.map((o) => o.value)
    return {
      offered,
      kept: filters[key],
      toggle: (value) => setFilters((f) => toggleValue(f, key, value, values)),
      keep: (kept) => setFilters((f) => withValues(f, key, kept, values)),
    }
  }
  return { rows, filter, active: Object.keys(filters).filter((key) => columns[key]).length, clear: () => setFilters({}) }
}
