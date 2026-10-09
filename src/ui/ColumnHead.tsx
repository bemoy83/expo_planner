import { useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ListFilter } from 'lucide-react'
import { Menu } from './common'
import type { ColumnSort } from './columnSort'
import type { ColumnFilter } from './useTable'

interface Props {
  children: ReactNode
  /** The column's filter; a column without one has no filter button. */
  filter?: ColumnFilter
  /** The direction the table is sorted by this column, if it is. */
  sorted?: ColumnSort['direction']
  /** A click on the heading sorts by the column; a column without it cannot be sorted. */
  onSort?: () => void
  className?: string
  title?: string
}

/**
 * A column heading of `DataTable`. A click on it sorts by the column, and its filter is a list of the
 * column's values to tick, with a field to search in them.
 */
export function ColumnHead({ children, filter, sorted, onSort, className, title }: Props) {
  return (
    <th className={`${className ?? ''} ${filter?.kept ? 'filtered' : ''}`} title={title} aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined}>
      {onSort ? (
        <button className="col-sort" onClick={onSort}>
          {children}
          {sorted && (sorted === 'asc' ? <ArrowUp size={11} aria-label="Sortert stigende" /> : <ArrowDown size={11} aria-label="Sortert synkende" />)}
        </button>
      ) : (
        children
      )}
      {filter && <FilterMenu filter={filter} />}
    </th>
  )
}

function FilterMenu({ filter }: { filter: ColumnFilter }) {
  const [search, setSearch] = useState('')
  const { offered, kept, toggle, keep } = filter
  const q = search.trim().toLowerCase()
  const listed = q ? offered.filter((o) => o.value.toLowerCase().includes(q)) : offered
  const ticked = new Set(kept ?? offered.map((o) => o.value))
  return (
    <Menu label={<ListFilter size={12} aria-hidden />} ariaLabel="Filtrer kolonnen" title={kept ? `Filtrert: viser ${kept.length} av ${offered.length} verdier` : 'Filtrer kolonnen'} className="col-filter">
      {() => (
        <div className="col-filter-pop">
          <input type="search" placeholder="Søk i verdiene" value={search} autoFocus onChange={(e) => setSearch(e.target.value)} />
          <div className="col-filter-all">
            <button className="link small" onClick={() => keep(q ? listed.map((o) => o.value) : offered.map((o) => o.value))}>
              {q ? 'Bare treffene' : 'Velg alle'}
            </button>
            <button className="link small" onClick={() => keep([])}>
              Fjern alle
            </button>
          </div>
          <div className="col-filter-list">
            {listed.map((o) => (
              <label key={o.value}>
                <input type="checkbox" checked={ticked.has(o.value)} onChange={() => toggle(o.value)} />
                <span>{o.value || '(tom)'}</span>
                <em>{o.count}</em>
              </label>
            ))}
            {listed.length === 0 && <span className="muted small">Ingen verdier passer søket.</span>}
          </div>
        </div>
      )}
    </Menu>
  )
}
