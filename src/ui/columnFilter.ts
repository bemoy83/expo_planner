/**
 * Filters on the columns of a table, as Excel's: each column lists the values it holds, and the planner
 * ticks the ones to keep. A column that is not filtered keeps every row.
 */

/** Column → the values kept in it. A column that is left out is not filtered. */
export type ColumnFilters = Record<string, string[]>
/** What each column shows for a row, as text. */
export type ColumnValues<T> = Record<string, (row: T) => string>

/** The rows every filter lets through. With `except`, that column's own filter is left out. */
export const filterRows = <T>(rows: T[], columns: ColumnValues<T>, filters: ColumnFilters, except?: string): T[] => {
  const active = Object.entries(filters).filter(([key]) => key !== except && columns[key])
  if (!active.length) return rows
  const kept = active.map(([key, values]) => [columns[key], new Set(values)] as const)
  return rows.filter((row) => kept.every(([value, values]) => values.has(value(row))))
}

/**
 * The values a column offers: those of the rows the other columns' filters let through, each with its
 * number of rows, so that ticking in one column narrows what the others offer.
 */
export const columnValues = <T>(rows: T[], columns: ColumnValues<T>, filters: ColumnFilters, key: string): { value: string; count: number }[] => {
  const counts = new Map<string, number>()
  for (const row of filterRows(rows, columns, filters, key)) counts.set(columns[key](row), (counts.get(columns[key](row)) ?? 0) + 1)
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value, 'nb', { numeric: true }))
}

/** The filters with one value of a column ticked or unticked. A column with every value ticked is no longer filtered. */
export const toggleValue = (filters: ColumnFilters, key: string, value: string, offered: string[]): ColumnFilters => {
  const kept = new Set(filters[key] ?? offered)
  if (kept.has(value)) kept.delete(value)
  else kept.add(value)
  return withValues(filters, key, [...kept], offered)
}

/** The filters with a column set to keep exactly `values`. */
export const withValues = (filters: ColumnFilters, key: string, values: string[], offered: string[]): ColumnFilters => {
  const next = { ...filters }
  if (offered.every((value) => values.includes(value))) delete next[key]
  else next[key] = values
  return next
}
