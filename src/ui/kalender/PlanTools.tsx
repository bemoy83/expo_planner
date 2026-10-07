import { Menu, ToolSwitch, type ToolChoice } from '../common'
import { EMPTY_FILTER, filterSummary, type RowFilter } from './rows'
import type { Tool } from './selection'
import { ChevronDown, Eraser, Filter, MousePointer2, Pencil } from 'lucide-react'

/** The tools of the planning bar. */
const TOOLS: ToolChoice<Tool>[] = [
  { value: 'select', icon: <MousePointer2 size={14} aria-hidden />, name: 'Velg', shortcut: 'V', title: 'Velg celler og skriv FTE i dem (V).' },
  {
    value: 'pencil',
    icon: <Pencil size={14} aria-hidden />,
    name: 'Fordel behov',
    shortcut: 'F',
    title: 'Tegn over dager på en rad: det som gjenstår av radens behov fordeles på arbeidsdagene du tegner over, i hele FTE med desimalene på siste dag (F, eller hold Shift og dra).',
  },
  {
    value: 'eraser',
    icon: <Eraser size={14} aria-hidden />,
    name: 'Tøm',
    shortcut: 'T',
    title: 'Tegn over celler på planleggingsradene for å tømme dem. På et nivå i ✎-modus tømmes dagene for radene under (T, eller hold Alt og dra).',
  },
]

export function PlanToolSwitch({ tool, onChange }: { tool: Tool; onChange: (tool: Tool) => void }) {
  return <ToolSwitch tool={tool} tools={TOOLS} onChange={onChange} />
}

interface FilterMenuProps {
  filter: RowFilter
  onChange: (filter: RowFilter) => void
  /** Every project, as key and name. */
  projects: [key: string, name: string][]
  competences: string[]
  onlyInView: boolean
  onOnlyInView: (on: boolean) => void
}

/** The filter button of the planning bar and the panel under it: which projects and rows are shown. */
export function FilterMenu({ filter, onChange, projects, competences, onlyInView, onOnlyInView }: FilterMenuProps) {
  const { label, others, active } = filterSummary(filter, projects)
  return (
    <Menu
      label={
        <>
          <Filter size={14} aria-hidden />
          <span className="bar-button-label">{label}</span>
          {others > 0 && <span className="bar-count">+{others}</span>}
          <ChevronDown size={12} aria-hidden />
        </>
      }
      className={`bar-button ${active > 0 ? 'on' : ''}`}
      title="Filter: velg hvilke prosjekter og rader som vises"
    >
      {() => (
        <div className="filter-panel">
          <input className="search" type="search" aria-label="Søk i rader" placeholder="Søk i rader" value={filter.search} onChange={(e) => onChange({ ...filter, search: e.target.value })} />
          <label>
            Prosjekt
            <select value={filter.project} onChange={(e) => onChange({ ...filter, project: e.target.value })}>
              <option value="">Alle prosjekter ({projects.length})</option>
              {projects.map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kompetanse
            <select value={filter.competence} onChange={(e) => onChange({ ...filter, competence: e.target.value })}>
              <option value="">Alle</option>
              {competences.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="check" title="Skjul prosjekter som ikke har noen planleggingsrader ennå">
            <input type="checkbox" checked={!!filter.onlyWithRows} onChange={(e) => onChange({ ...filter, onlyWithRows: e.target.checked })} />
            Skjul tomme
          </label>
          <label className="check" title="Skjul rader der planen dekker behovet, så det som gjenstår står igjen som en arbeidsliste">
            <input type="checkbox" checked={!!filter.onlyUncovered} onChange={(e) => onChange({ ...filter, onlyUncovered: e.target.checked })} />
            Bare det som gjenstår
          </label>
          <label className="check" title="Vis bare prosjekter som foregår eller har planlagte dager i datoene som vises">
            <input type="checkbox" checked={onlyInView} onChange={(e) => onOnlyInView(e.target.checked)} />
            Bare prosjekter i visningen
          </label>
          {active > 0 && (
            <button className="link" onClick={() => onChange(EMPTY_FILTER)}>
              Nullstill
            </button>
          )}
        </div>
      )}
    </Menu>
  )
}
