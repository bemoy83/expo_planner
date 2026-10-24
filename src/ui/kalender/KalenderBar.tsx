import { CalendarDays, Info, Plus, Users } from 'lucide-react'
import type { ISODate } from '../../domain/dates'
import type { ReactNode } from 'react'
import { PanelToggle, Segmented, UndoRedoButtons } from '../common'
import { GroupingMenu } from './GroupingMenu'
import type { Zoom } from './layout'
import { PlanBar } from './PlanBar'
import { FilterMenu, PlanToolSwitch } from './PlanTools'
import { DIMENSION_LABELS, filterSummary, type Dimension, type RowFilter } from './rows'
import type { Tool } from './selection'
import type { CrewPart, PlanMode } from './zoom'
import { count } from '../dom'

/** What the rows are: the demand plan, or the people who do the work. First in the planning bar of both modes. */
export function ModeSwitch({ mode, onChange }: { mode: PlanMode; onChange: (mode: PlanMode) => void }) {
  return (
    <Segmented
      label="Visning"
      value={mode}
      onChange={onChange}
      options={[
        { value: 'plan', label: <><CalendarDays size={14} aria-hidden /> Plan</>, title: 'Plan: fordel behovet på dagene' },
        { value: 'bemanning', label: <><Users size={14} aria-hidden /> Bemanning</>, title: 'Bemanning: sett de faste på arbeidet som er planlagt, og lei inn til resten' },
      ]}
    />
  )
}

/** The part of Bemanning that is shown, beside the mode. */
export function PartSwitch({ part, onChange }: { part: CrewPart; onChange: (part: CrewPart) => void }) {
  return (
    <Segmented
      label="Mannskap"
      value={part}
      onChange={onChange}
      options={[
        { value: 'faste', label: 'Faste', title: 'Faste: sett de faste på arbeidet som er planlagt' },
        { value: 'innleid', label: 'Innleid', title: 'Innleid: dekk behovet som står igjen etter de faste, med folk fra leverandører' },
      ]}
    />
  )
}

/** The mode the Kalender is in, named after its title in the page header. The band it sits on has the mode's colour. */
export function ModeTag({ mode, part }: { mode: PlanMode; /** In Bemanning: the part shown, where it is not the permanent staff. */ part?: 'innleid' }) {
  return (
    <span className="mode-tag">
      {mode === 'bemanning' ? <Users size={13} aria-hidden /> : <CalendarDays size={13} aria-hidden />}
      {mode === 'bemanning' ? (part ? 'Bemanning · Innleid' : 'Bemanning') : 'Plan'}
    </span>
  )
}

/**
 * How much of the hierarchy is shown, the same for every branch: a level by its number in «Grupper etter», or all the rows.
 * No button is pressed where branches are folded by hand.
 */
function LevelSwitch({ grouping, levels, onChange }: { grouping: Dimension[]; levels: number | 'all' | null; onChange: (levels: number | 'all') => void }) {
  return (
    <Segmented
      label="Detaljnivå"
      value={levels === null ? '' : String(levels)}
      onChange={(value) => onChange(value === 'all' ? 'all' : Number(value))}
      options={[
        ...grouping.map((_, i) => ({ value: String(i + 1), label: String(i + 1), title: `Fold sammen til ${grouping.slice(0, i + 1).map((d) => DIMENSION_LABELS[d]).join(' › ')}` })),
        { value: 'all', label: 'Alle', title: 'Vis alle nivåer og rader' },
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
  grouping: Dimension[]
  onGrouping: (grouping: Dimension[]) => void
  /** How many levels are shown, see `shownLevels`: null where branches are folded by hand. */
  levels: number | 'all' | null
  /** Folds every branch to that many levels, or opens them all. */
  onLevels: (levels: number | 'all') => void
  /** The period, for the date field. */
  start: ISODate
  end: ISODate
  onToday: () => void
  /** The day in focus, or today: what the date field shows. */
  date: ISODate
  onDate: (date: ISODate) => void
  zoom: Zoom
  onZoom: (zoom: Zoom) => void
}

/** The planning bar right above the rows: undo, the tools, what is shown and how, and where in the period. */
export function KalenderBar({ width, hints, mode, onMode, tool, onTool, filter, onFilter, projects, competences, onlyInView, onOnlyInView, grouping, onGrouping, levels, onLevels, start, end, onToday, date, onDate, zoom, onZoom }: Props) {
  const fit = filterSummary(filter, projects)
  return (
    <PlanBar width={width} fitKey={`${grouping.join()}|${fit.label}|${fit.others}|${hints}|${tool}`}>
      <div className="bar-zone">
        <ModeSwitch mode={mode} onChange={onMode} />
        <UndoRedoButtons />
        <PlanToolSwitch tool={tool} onChange={onTool} />
      </div>
      <div className="bar-view">
        <div className="bar-zone">
          <FilterMenu filter={filter} onChange={onFilter} projects={projects} competences={competences} onlyInView={onlyInView} onOnlyInView={onOnlyInView} />
          <GroupingMenu grouping={grouping} onChange={onGrouping} />
          {grouping.length > 0 && <LevelSwitch grouping={grouping} levels={levels} onChange={onLevels} />}
        </div>
        <div className="bar-zone bar-zone-end">
          {hints && (
            <span className="bar-hint" title="Hold Alt og dra for å tømme. Shift og dra en ende av et spenn stopper der behovet er dekket, eller fordeler summen på nytt når det er dekket fra før. Høyreklikk en celle for flere valg.">
              <Info size={14} aria-hidden />
              <span className="bar-hint-text">
                <b>Alt</b>-dra · <b>høyreklikk</b>
              </span>
            </span>
          )}
          <button className="ghost" onClick={onToday}>
            I dag
          </button>
          <input className="bar-date" type="date" aria-label="Gå til dato" title="Gå til dato" min={start} max={end} value={date} onChange={(e) => e.target.value && onDate(e.target.value)} />
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
  /** The button «Steder»: it decides what the whole page shows, so it is here and not among the tools of the rows. */
  places: ReactNode
  inspectorOpen: boolean
  onInspector: (open: boolean) => void
  onNewRow: () => void
  onPropose: () => void
}

/** The page header of the Kalender: what is shown, and the actions that are not tools of the grid. */
export function KalenderHead({ projects, rows, overbooked, places, inspectorOpen, onInspector, onNewRow, onPropose }: HeadProps) {
  return (
    <div className="page-head mode-band">
      <h2>Kalender</h2>
      <ModeTag mode="plan" />
      <span className="page-meta">{[count(projects, 'prosjekt', 'prosjekter'), count(rows, 'rad', 'rader'), overbooked ? `${count(overbooked, 'dag', 'dager')} med underdekning` : 'Ingen underdekning'].join(' · ')}</span>
      {places}
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
