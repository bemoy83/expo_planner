import type { HTMLAttributes, ReactNode } from 'react'
import { ColumnHead } from './ColumnHead'
import { isSortable, type TableView } from './useTable'

interface Props<T> {
  /** The columns and the rows that are shown, from `useTable`. */
  table: TableView<T>
  rowKey: (row: T) => string
  /** The class of a row, and whatever else its line needs. `rows` are the rows that are shown, with this one at `index`. */
  rowProps?: (row: T, index: number, rows: T[]) => HTMLAttributes<HTMLTableRowElement>
  /** Beside `ledger`: the table's own class in tables.css. */
  className?: string
  /** What the table says when the filters let no row through. */
  empty?: ReactNode
  /** The most rows drawn; the rest are left out, and the page says so. */
  limit?: number
}

/**
 * The table of the ledgers: a heading per column that sorts on a click and filters by the column's
 * values, as Excel's, and the rows edited in place. The columns say what each of them does (`Column`).
 */
export function DataTable<T>({ table, rowKey, rowProps, className, empty = 'Ingen rader passer filteret.', limit }: Props<T>) {
  const { columns, sort, sortBy, filter } = table
  const rows = limit === undefined ? table.rows : table.rows.slice(0, limit)
  return (
    <table className={className ? `ledger ${className}` : 'ledger'}>
      <thead>
        <tr>
          {columns.map((column) => (
            <ColumnHead
              key={column.key}
              className={column.className}
              title={column.title}
              filter={filter(column.key)}
              sorted={sort?.key === column.key ? sort.direction : undefined}
              onSort={isSortable(column) ? () => sortBy(column.key) : undefined}
            >
              {column.head}
            </ColumnHead>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="muted">
              {empty}
            </td>
          </tr>
        )}
        {rows.map((row, index) => (
          <tr key={rowKey(row)} {...rowProps?.(row, index, rows)}>
            {columns.map((column) => {
              const props = column.cellProps?.(row)
              return (
                <td key={column.key} {...props} className={[column.className, props?.className].filter(Boolean).join(' ') || undefined}>
                  {column.cell(row, index, rows)}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
