import { CalendarDays, ChevronsDownUp, ChevronsUpDown, Info, Plus, Users } from 'lucide-react'
import type { AreaNode, HallFilter } from '../../domain/areas'
import type { ISODate } from '../../domain/dates'
import { PanelToggle, Segmented, UndoRedoButtons } from '../common'
import { AreaMenu } from './AreaMenu'
import { GroupingMenu } from './GroupingMenu'
import type { Zoom } from './layout'
import { PlanBar } from './PlanBar'
import { FilterMenu, PlanToolSwitch } from './PlanTools'
import { filterSummary, type Dimension, type RowFilter } from './rows'
import type { Tool } from './selection'
import type { PlanMode } from './zoom'

/** What the rows are: the demand plan, or the people who do the work. First in the planning bar of both modes. */
export function ModeSwitch({ mode, onChange }: { mode: PlanMode; onChange: (mode: PlanMode) => void }) {
  return (
    <Segmented
      label="Visning"
      value={mode}
      onChange={onChange}
      options={[
        { value: 'plan', label: <><CalendarDays size={14} aria-hidden /> Plan</>, title: 'Plan: fordel behovet på dagene' },
        { value: 'bemanning', label: <><Users size={14} aria-hidden /> Bemanning</>, title: 'Bemanning: sett de faste på arbeidet som er planlagt' },
      ]}
    />
  )
}

interface Props {
  /** The width of the grid as it is seen. */
  width: number
  /** The setting «Hjelpetekster». */
  hints: boolean
  mode: PlanMode
  onMode: (mode: PlanMode) => void
  tool: Tool
  onTool: (tool: Tool) => void
  filter: RowFilter
  onFilter: (filter: RowFilter) => void
  projects: [string, string][]
  competences: string[]
  onlyInView: boolean
  onOnlyInView: (only: boolean) => void
  /** The halls by area, and what is unticked of them under «Steder». */
  hallTree: AreaNode[]
  /** The statuses of the hall bookings. */
  statuses: string[]
  hallFilter: HallFilter
  onHallFilter: (filter: HallFilter) => void
  grouping: Dimension[]
  onGrouping: (grouping: Dimension[]) => void
  /** Some level is folded. */
  folded: boolean
  /** Folds to the top level, or opens every level when some are folded. */
  onFold: () => void
  /** The period, for the date field. */
  start: ISODate
  end: ISODate
  onToday: () => void
  onDate: (date: ISODate) => void
  zoom: Zoom
  onZoom: (zoom: Zoom) => void
}

/** The planning bar right above the rows: undo, the tools, what is shown and how, and where in the period. */
export function KalenderBar({ width, hints, mode, onMode, tool, onTool, filter, onFilter, projects, competences, onlyInView, onOnlyInView, hallTree, statuses, hallFilter, onHallFilter, grouping, onGrouping, folded, onFold, start, end, onToday, onDate, zoom, onZoom }: Props) {
  const fit = filterSummary(filter, projects)
  return (
    <PlanBar width={width} fitKey={`${grouping.join()}|${fit.label}|${fit.others}|${hallFilter.areas.length + hallFilter.halls.length + hallFilter.statuses.length}|${hints}|${tool}|${folded}`}>
      <div className="bar-zone">
        <ModeSwitch mode={mode} onChange={onMode} />
        <UndoRedoButtons />
        <PlanToolSwitch tool={tool} onChange={onTool} />
      </div>
      <div className="bar-view">
        <div className="bar-zone">
          <FilterMenu filter={filter} onChange={onFilter} projects={projects} competences={competences} onlyInView={onlyInView} onOnlyInView={onOnlyInView} />
          <AreaMenu tree={hallTree} statuses={statuses} filter={hallFilter} onChange={onHallFilter} />
          <GroupingMenu grouping={grouping} onChange={onGrouping} />
          <button className="ghost" title={folded ? 'Utvid alle: vis alle nivåer' : 'Fold sammen til øverste nivå'} onClick={onFold}>
            {folded ? <ChevronsUpDown size={16} aria-hidden /> : <ChevronsDownUp size={16} aria-hidden />}
            {folded ? 'Utvid alle' : 'Fold sammen'}
          </button>
        </div>
        <div className="bar-zone bar-zone-end">
          {hints && (
            <span className="bar-hint" title="Hold Shift og dra for å fordele, Alt og dra for å tømme. Høyreklikk en celle for flere valg.">
              <Info size={14} aria-hidden />
              <span className="bar-hint-text">
                <b>Shift</b>/<b>Alt</b>-dra · <b>høyreklikk</b>
              </span>
            </span>
          )}
          <button className="ghost" onClick={onToday}>
            I dag
          </button>
          <input className="bar-date" type="date" aria-label="Gå til dato" title="Gå til dato" min={start} max={end} onChange={(e) => e.target.value && onDate(e.target.value)} />
          <Segmented
            label="Kolonnebredde"
            value={zoom}
            onChange={onZoom}
            options={[
              { value: 'compact', label: 'S', title: 'Smale kolonner' },
              { value: 'normal', label: 'M', title: 'Normale kolonner' },
              { value: 'wide', label: 'L', title: 'Brede kolonner' },
            ]}
          />
        </div>
      </div>
    </PlanBar>
  )
}

interface HeadProps {
  projects: number
  rows: number
  /** Days planned above the available crew. */
  overbooked: number
  inspectorOpen: boolean
  onInspector: (open: boolean) => void
  onNewRow: () => void
  onPropose: () => void
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The page header of the Kalender: what is shown, and the actions that are not tools of the grid. */
export function KalenderHead({ projects, rows, overbooked, inspectorOpen, onInspector, onNewRow, onPropose }: HeadProps) {
  return (
    <div className="page-head">
      <h2>Kalender</h2>
      <span className="page-meta">{[count(projects, 'prosjekt', 'prosjekter'), count(rows, 'rad', 'rader'), overbooked ? `${count(overbooked, 'dag', 'dager')} med underdekning` : 'Ingen underdekning'].join(' · ')}</span>
      <button className="ghost" onClick={onNewRow}>
        <Plus size={14} aria-hidden /> Ny rad
      </button>
      <PanelToggle open={inspectorOpen} what="raddetaljer" hint="behov, vindu og dager for raden du står på" onToggle={() => onInspector(!inspectorOpen)} />
      <button
        className="primary"
        disabled={rows === 0}
        title="Foreslå plan: fordel behovet til radene i prosjektene som vises på monterings- og demonteringsdagene i hallene. Rader som allerede har FTE røres ikke."
        onClick={onPropose}
      >
        ✦ Foreslå plan
      </button>
    </div>
  )
}
