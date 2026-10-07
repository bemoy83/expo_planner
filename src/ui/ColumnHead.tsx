import { useState, type ReactNode } from 'react'
import { ListFilter } from 'lucide-react'
import { Menu } from './common'
import type { ColumnFilter } from './useColumnFilters'

interface Props {
  children: ReactNode
  filter: ColumnFilter
  className?: string
  title?: string
}

/** A column heading with a filter: a list of the column's values to tick, with a field to search in them. */
export function ColumnHead({ children, filter, className, title }: Props) {
  const [search, setSearch] = useState('')
  const { offered, kept, toggle, keep } = filter
  const q = search.trim().toLowerCase()
  const listed = q ? offered.filter((o) => o.value.toLowerCase().includes(q)) : offered
  const ticked = new Set(kept ?? offered.map((o) => o.value))
  return (
    <th className={`${className ?? ''} ${kept ? 'filtered' : ''}`} title={title}>
      {children}
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
    </th>
  )
}
