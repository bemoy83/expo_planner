import { memo, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { capacityForDate, formatFte } from '../../domain/calc'
import { addDays, isoWeek, MONTHS_NB, WEEKDAYS_NB, weekdayIndex, type ISODate } from '../../domain/dates'
import { dayType, holidayName } from '../../domain/holidays'
import type { CapacityLine, Settings, VenuePhase } from '../../domain/types'
import { PHASE_CODES, type HallSegment } from '../../domain/venue'
import type { CapLane, CellEdit, Columns, GridActions } from './gridTypes'
import { deltaClass, describeRow, fmtDate } from './labels'
import { HALL_ROW_H, HEAT_ROW_H, LEFT_W, ROW_H, TOP_ROW_H, type Zoom } from './layout'
import { HEAT_LABELS, heatTile } from './heat'
import { CoverageBar } from './parts'
import { DIMENSION_LABELS, workPhaseOn, type Dimension, type GridItem } from './rows'
import type { Section } from './selection'
import { ChevronDown, ChevronRight, Eraser, Pencil, Plus, TriangleAlert } from 'lucide-react'

/** An event's name in the hall calendar may run on past a short event, up to this far, where the hall is free. */
const HALL_LABEL_MAX_W = 260
const HALL_LABEL_MAX_COLS = 10
/** Roughly the width of one letter of an event's name. */
const HALL_LABEL_CHAR_W = 6.6

/** How far each level of the hierarchy is indented in the label column. */
const INDENT = 14

const ALL_DIMENSIONS: Dimension[] = ['project', 'competence', 'hall', 'avdeling']

/** One line of the grid: the label column, then a cell per drawn day. */
function Line({ className = '', label, cols, cells, overlay, height = ROW_H, project, projects, onLabelClick }: { className?: string; label: ReactNode; cols: Columns; cells: (date: ISODate, col: number) => ReactNode; overlay?: ReactNode; height?: number; /** The project the line belongs to, for the hover cue, see `useProjectHover`. */ project?: string; /** On a hall's line: its projects, see `projectList`. */ projects?: string; onLabelClick?: (e: MouseEvent) => void }) {
  return (
    <div className={`grid-row ${className}`} style={{ height }} data-project={project} data-projects={projects}>
      <div className="grid-label" style={{ width: LEFT_W }} onClick={onLabelClick}>
        {label}
      </div>
      <div className="grid-spacer" style={{ width: cols.c0 * cols.colW }} />
      {cols.dates.map((date, i) => cells(date, cols.c0 + i))}
      {overlay}
    </div>
  )
}

const dayClass = (cols: Columns, date: ISODate) => cols.classes.get(date) ?? 'day'

const readCell = (cols: Columns, date: ISODate, value: number | undefined, className = '', title?: string) => (
  <div key={date} className={`${dayClass(cols, date)} cell ${className}`} style={{ width: cols.colW }} title={title}>
    {formatFte(value)}
  </div>
)

interface ValueCell {
  cols: Columns
  edit: CellEdit
  actions: GridActions
  section: Section
  lane: number
  /** A right-click on the cell opens the cell menu. */
  menu?: boolean
}

const valueCell = ({ cols, edit, actions, section, lane, menu }: ValueCell, date: ISODate, col: number, value: number | undefined, note?: string, extraClass = '') => {
  const focus = edit.focusCol === col
  const selected = col >= edit.selFrom && col <= edit.selTo
  // During a pencil stroke or a drag of the fill handle the cell shows what it would put there.
  const drawn = edit.ghost?.get(date)
  // The fill handle sits on the last cell of the selection, as in Excel.
  const corner = edit.handle && edit.selTo === col
  return (
    <div
      key={date}
      className={`${dayClass(cols, date)} cell editable ${selected ? 'selected' : ''} ${focus ? 'focus' : ''} ${value ? 'filled' : ''} ${extraClass} ${note ? 'has-note' : ''} ${drawn !== undefined ? edit.ghostClass : ''}`}
      style={{ width: cols.colW }}
      title={note}
      onMouseDown={(e) => actions.cellDown(section, lane, col, e)}
      onMouseEnter={() => actions.cellEnter(section, lane, col)}
      onDoubleClick={() => actions.editCell(value)}
      onContextMenu={menu ? (e) => actions.cellMenu(lane, col, e) : undefined}
    >
      {focus && edit.draft !== null ? (
        <input className="cell-input" autoFocus value={edit.draft} onChange={(e) => actions.setDraft(e.target.value)} onBlur={() => actions.commitDraft()} onKeyDown={actions.draftKey} />
      ) : drawn !== undefined ? (
        formatFte(drawn || undefined)
      ) : (
        formatFte(value)
      )}
      {corner && (
        <span
          className="fill-handle"
          title="Dra sidelengs for å kopiere til flere dager, eller tilbake for å tømme. Hold Alt for å strekke: samme sum fordelt på nytt over dagene."
          onMouseDown={(e) => actions.fillDown(section, e)}
        />
      )}
    </div>
  )
}

/** The two header lines: week and month, then weekday and date. `activeDate` is the day of the focused cell. */
export const HeadRows = memo(function HeadRows({ cols, zoom, overbooked, activeDate }: { cols: Columns; zoom: Zoom; overbooked: Map<ISODate, { need: number; available: number }>; activeDate: ISODate | undefined }) {
  return (
    <>
      <Line
        className="head-row"
        label={<span className="lbl-title">{zoom === 'compact' ? '' : 'Uke / måned'}</span>}
        cols={cols}
        cells={(date) => (
          <div key={date} className={`${dayClass(cols, date)} cell head`} style={{ width: cols.colW }}>
            {date.endsWith('-01') ? <span className="month-label">{`${MONTHS_NB[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`}</span> : weekdayIndex(date) === 0 ? <span className="week-label">u{isoWeek(date)}</span> : null}
          </div>
        )}
      />
      <Line
        className="head-row tall"
        label={<span className="lbl-title">Dato</span>}
        cols={cols}
        cells={(date) => (
          <div
            key={date}
            className={`${dayClass(cols, date)} cell head day-head ${date === activeDate ? 'active' : ''}`}
            style={{ width: cols.colW }}
            title={`${fmtDate(date)}${holidayName(date) ? ` – ${holidayName(date)}` : ''}${overbooked.has(date) ? `\nOverbooket: planlagt ${formatFte(overbooked.get(date)!.need)} FTE, tilgjengelig ${formatFte(overbooked.get(date)!.available)}` : ''}`}
          >
            <span className="wd">{WEEKDAYS_NB[weekdayIndex(date)].slice(0, zoom === 'compact' ? 1 : 3).toLowerCase()}</span>
            <span className="dn">{Number(date.slice(8))}</span>
          </div>
        )}
      />
    </>
  )
})

/** Where an event's name sits in a hall's line, see `hallLabels` in the Kalender. */
export interface HallLabelRun {
  eventName: string
  col: number
  span: number
  room: number
  project?: string
}

interface HallRowProps {
  hall: string
  /** The hall's bookings as bars, see `hallSegments`. */
  bars: HallSegment[] | undefined
  runs: HallLabelRun[] | undefined
  /** The projects with a booking in the hall, as `projectList` writes them, so the hall can be marked for one of them. */
  projects: string | undefined
  cols: Columns
  zoom: Zoom
}

/**
 * One hall of the hall calendar: a bar per phase of each event, with the events' names laid over them.
 * The day cells under the bars are empty, so a line costs a handful of bars however many days it shows.
 */
export const HallRow = memo(function HallRow({ hall, bars, runs, projects, cols, zoom }: HallRowProps) {
  const { c0, colW } = cols
  const c1 = c0 + cols.dates.length - 1
  // Names of the events in or near the visible dates, each with the width it may take.
  const labels = (runs ?? [])
    .filter((run) => run.col <= c1 && run.col + Math.max(run.span, Math.min(run.room, HALL_LABEL_MAX_COLS)) > c0)
    .map((run) => {
      const width = Math.min(run.room * colW, Math.max(run.span * colW, HALL_LABEL_MAX_W)) - 2
      // Roughly the columns the text covers, so the phase letters under it can be left out.
      const covered = Math.ceil(Math.min(width, run.eventName.length * HALL_LABEL_CHAR_W + 6) / colW)
      return { ...run, width, covered }
    })
  const visible = (bars ?? []).filter((bar) => bar.col <= c1 && bar.col + bar.span > c0)
  return (
    <Line
      className="hall-row"
      height={HALL_ROW_H}
      projects={projects}
      label={<span className="lbl-hall">{hall}</span>}
      cols={cols}
      cells={(date) => <div key={date} className={`${dayClass(cols, date)} cell hall`} style={{ width: colW }} />}
      overlay={
        <>
          {visible.map((bar) => {
            // The phase letters sit in the middle of the bar; they are left out under an event's name, in narrow columns and on the arrangement itself, which carries the name.
            const middle = bar.col + bar.span / 2
            const underLabel = labels.some((label) => middle >= label.col && middle < label.col + label.covered)
            return (
              <span
                key={`${bar.eventName}:${bar.phase}:${bar.col}`}
                className={`hall-bar ph-${bar.phase} ${bar.shared ? 'shared' : ''}`}
                style={{ left: LEFT_W + bar.col * colW + 1, width: bar.span * colW - 2 }}
                title={bar.title}
                data-project={bar.project}
              >
                {!underLabel && zoom !== 'compact' && bar.phase !== 'event' ? PHASE_CODES[bar.phase] : null}
              </span>
            )
          })}
          {labels.map((label) => (
            <span key={`${label.eventName}:${label.col}`} className="hall-label" data-project={label.project} style={{ left: LEFT_W + label.col * colW, maxWidth: label.width }}>
              {label.eventName}
            </span>
          ))}
        </>
      }
    />
  )
})

/** The base crew, which is there on every working day. */
export const BaseCrewRow = memo(function BaseCrewRow({ cols, baseCrew }: { cols: Columns; baseCrew: number }) {
  return <Line className="cap-row" label={<span className="lbl-cap">Faste (FTE)</span>} cols={cols} cells={(date) => readCell(cols, date, dayType(date) === 'arbeidsdag' ? baseCrew : undefined, 'cap-cell')} />
})

interface CapRowProps extends CellEdit {
  cap: CapLane
  lane: number
  cols: Columns
  actions: GridActions
}

/** One staffing line that takes numbers. */
export const CapRow = memo(function CapRow({ cap, lane, cols, actions, ...edit }: CapRowProps) {
  const cell: ValueCell = { cols, edit, actions, section: 'cap', lane }
  return (
    <Line
      className={`cap-row group-${cap.line.group}`}
      label={<span className={`lbl-cap group-${cap.line.group}`}>{cap.label}</span>}
      cols={cols}
      cells={(date, col) => valueCell(cell, date, col, cap.line[cap.field]?.[date], cap.field === 'values' ? cap.line.notes[date] : undefined, 'cap-cell')}
    />
  )
})

interface SumRowsProps {
  cols: Columns
  need: Map<ISODate, number>
  capacity: CapacityLine[]
  settings: Settings
  deviationOnly: boolean
  /** Whether Avvik is drawn as a heat map, see `heatTile`. */
  heat: boolean
  /** The largest shortage and surplus of the period, which the heat map is scaled by. */
  maxShortage: number
  maxSurplus: number
}

/** What the colours of the heat map mean, beside the name of the Avvik line. */
const HEAT_LEGEND: [string, number][] = [
  ['short', 85],
  ['short', 35],
  ['tight', 22],
  ['spare', 22],
]

/** The totals under the staffing lines: planned need, available crew and the difference. With the section folded only the difference shows. */
export const SumRows = memo(function SumRows({ cols, need, capacity, settings, deviationOnly, heat, maxShortage, maxSurplus }: SumRowsProps) {
  return (
    <>
      {!deviationOnly && (
        <>
          <Line className="sum-row" label={<span className="lbl-cap strong">Planlagt behov</span>} cols={cols} cells={(date) => readCell(cols, date, need.get(date), 'sum-cell')} />
          <Line
            className="sum-row"
            label={<span className="lbl-cap strong">Tilgjengelig</span>}
            cols={cols}
            cells={(date) => {
              const cap = capacityForDate(date, capacity, settings)
              return readCell(cols, date, cap.available || undefined, 'sum-cell', `Faste ${formatFte(cap.base)} + innleid/fag ${formatFte(cap.added)} + overtid ${formatFte(cap.overtime)} − utilgjengelig ${formatFte(cap.unavailable)}`)
            }}
          />
        </>
      )}
      {heat ? (
        <Line
          className="sum-row deviation-row heat-row"
          height={HEAT_ROW_H}
          label={
            <>
              <span className="lbl-cap strong">Avvik</span>
              <span className="heat-legend" title="Rødt: underdekning (mørkere = større). Gult: stramt (under 2 FTE ledig). Grønt: ledig kapasitet.">
                {HEAT_LEGEND.map(([kind, percent]) => (
                  <i key={`${kind}${percent}`} className={`heat ${kind}`} style={{ '--p': `${percent}%` } as CSSProperties} />
                ))}
              </span>
            </>
          }
          cols={cols}
          cells={(date) => {
            const available = capacityForDate(date, capacity, settings).available
            const n = need.get(date) ?? 0
            // A day with no crew and nothing planned has nothing to show.
            if (!available && !n) return <div key={date} className={`${dayClass(cols, date)} cell sum-cell`} style={{ width: cols.colW }} />
            const dev = available - n
            const tile = heatTile(dev, maxShortage, maxSurplus)
            return (
              <div key={date} className={`${dayClass(cols, date)} cell sum-cell heat-cell ${tile.kind} ${tile.strong ? 'strong' : ''}`} style={{ width: cols.colW }} title={`${HEAT_LABELS[tile.kind]} ${formatFte(dev)} FTE`}>
                <span className={`heat ${tile.kind}`} style={{ '--p': `${tile.percent}%` } as CSSProperties} />
                <span className="heat-value">{formatFte(dev)}</span>
              </div>
            )
          }}
        />
      ) : (
        <Line
          className="sum-row deviation-row"
          label={<span className="lbl-cap strong">Avvik</span>}
          cols={cols}
          cells={(date) => {
            const dev = capacityForDate(date, capacity, settings).available - (need.get(date) ?? 0)
            const n = need.get(date) ?? 0
            return readCell(cols, date, n || dev ? dev : undefined, `sum-cell dev ${dev < -0.05 ? 'neg' : dev > 0.05 && n ? 'pos' : ''}`)
          }}
        />
      )}
    </>
  )
})

interface GroupRowProps extends CellEdit {
  item: Extract<GridItem, { kind: 'group' }>
  /** The level's place among the lines that take FTE, when it is in entry mode. */
  lane: number
  /** The hall phase of each day of the project, for the strip on a project's line. */
  phases: Map<ISODate, VenuePhase> | undefined
  cols: Columns
  actions: GridActions
}

/**
 * A level of the hierarchy. Open, it shows no figures per day: the rows below carry them. Folded, it shows
 * its sums on a strip in the colour of the work phase. In entry mode it always shows cells to type in.
 * A project's line carries the hall-phase strip either way.
 */
export const GroupRow = memo(function GroupRow({ item, lane, phases, cols, actions, ...edit }: GroupRowProps) {
  const { node } = item
  const project = node.project
  const delta = node.totals.plannedFte - node.totals.requiredFte
  const cell: ValueCell = { cols, edit, actions, section: 'alloc', lane }
  // What the strip shows on a day: the hall phase on a project's line, else the work phase of a folded level.
  const stripOn = (date: ISODate): string | null => {
    const hallPhase = phases?.get(date)
    if (hallPhase) return hallPhase
    if (!item.collapsed || item.entry || phases) return null
    if (!node.daily.get(date)) return null
    if (node.dimension === 'phase') return node.label === 'Demontering' ? 'dem' : 'mon'
    return workPhaseOn(node.rows, date) === 'Demontering' ? 'dem' : 'mon'
  }
  return (
    <Line
      className={`group-row depth-${Math.min(node.depth, 3)} ${node.rows.length ? '' : 'empty-group'} ${item.entry ? 'entry-level' : ''}`}
      height={node.depth === 0 ? TOP_ROW_H : ROW_H}
      project={node.projectKey}
      cols={cols}
      label={
        <>
          <button className="twisty" style={{ marginLeft: node.depth * INDENT }} onClick={() => (item.entry ? actions.toggleEntry(node.key) : actions.toggleGroup(node.key))} aria-label={item.collapsed ? 'Vis rader' : 'Skjul rader'}>
            {item.collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          </button>
          {project ? (
            <span
              className="lbl-project"
              title={`${project.projectName}${project.projectNo ? '' : ' – uten prosjektnummer, settes på Haller-fanen'}${project.venue ? '' : ' – ikke koblet til et arrangement i hallkalenderen. Sett prosjektnummeret på arrangementet på Haller-fanen.'}`}
            >
              {project.projectName} <span className="muted">{project.projectNo || 'uten nr.'}</span>
              {!project.venue && <span className="unlinked"> ikke i hallkalenderen</span>}
            </span>
          ) : (
            <>
              {node.dimension === 'phase' && <PhaseMark phase={node.label} />}
              <span className="lbl-project lbl-level" title={`${DIMENSION_LABELS[node.dimension]}: ${node.label}`}>
                {node.label}{item.collapsed && <span className="muted count"> {node.rows.length}</span>}
              </span>
            </>
          )}
          {node.rows.length ? (
            <span className="lbl-nums">
              <span className="lbl-num">{formatFte(node.totals.requiredFte)}</span>
              <span className="lbl-num">{formatFte(node.totals.plannedFte)}</span>
              <span className={`lbl-num delta ${deltaClass(delta)}`}>{formatFte(delta)}</span>
              <CoverageBar required={node.totals.requiredFte} planned={node.totals.plannedFte} />
            </span>
          ) : (
            <span className="muted small no-rows">ingen rader</span>
          )}
          <span className="row-slot">
            {node.rows.length > 0 && (
              <button
                className={`row-action level-mode ${item.entry ? 'entry' : ''}`}
                aria-pressed={item.entry}
                title={
                  item.entry
                    ? 'Du skriver FTE på dette nivået; tallet fordeles på radene under etter behov. Klikk for å gå tilbake til sum.'
                    : 'Nivået viser summen av radene under. Klikk for å skrive FTE her og få det fordelt på radene under etter behov.'
                }
                onClick={() => actions.toggleEntry(node.key)}
              >
                {item.entry ? '✎' : 'Σ'}
              </button>
            )}
            {node.rows.length > 0 && (
              <button
                className="row-action"
                title="Foreslå plan: fordel behovet til radene under på monterings- og demonteringsdagene i hallene. Rader som allerede har FTE røres ikke."
                onClick={() => actions.proposePlan(node.rows, false)}
              >
                ✦
              </button>
            )}
            {project && (
              <button className="row-action" title="Legg til rad i prosjektet" onClick={() => actions.addRow(project.projectName, project.projectNo)}>
                <Plus size={13} aria-hidden />
              </button>
            )}
          </span>
        </>
      }
      cells={(date, col) => {
        const phase = stripOn(date)
        // The strip is rounded where a phase starts and ends.
        const strip = phase ? `strip strip-${phase} ${stripOn(addDays(date, -1)) === phase ? '' : 'strip-start'} ${stripOn(addDays(date, 1)) === phase ? '' : 'strip-end'}` : ''
        const inSpan = strip || (project?.venue && date >= project.venue.start && date <= project.venue.end ? 'in-span' : '')
        if (item.entry) return valueCell(cell, date, col, node.daily.get(date), undefined, `group-cell ${inSpan}`)
        return readCell(cols, date, item.collapsed ? node.daily.get(date) : undefined, `group-cell ${inSpan}`)
      }}
    />
  )
})

/** The colour of a work phase as a small mark in front of a line's name; the planning cells are filled in the same colour. */
function PhaseMark({ phase, indent }: { phase: string; indent?: number }) {
  return <i className={`phase-mark ${phase === 'Demontering' ? 'dem' : phase === 'Montering' ? 'mon' : ''}`} style={indent ? { marginLeft: indent } : undefined} title={phase || 'Uten arbeidsfase'} />
}

interface AllocRowProps extends CellEdit {
  item: Extract<GridItem, { kind: 'row' }>
  lane: number
  /** The days the row can be worked on, see `windowFor`. */
  window: Set<ISODate> | undefined
  /** What the row's own line says: the properties that are not a level above it. */
  rowDimensions: Dimension[]
  cols: Columns
  actions: GridActions
}

/** A planning row: what it is, its figures, and FTE per day. */
export const AllocRow = memo(function AllocRow({ item, lane, window, rowDimensions, cols, actions, ...edit }: AllocRowProps) {
  const { row: r, totals } = item
  const phaseDays = r.phase === 'Demontering' ? 'demonteringsdagene' : 'monteringsdagene'
  const outside = window?.size ? Object.keys(r.fte).filter((date) => r.fte[date] && !window.has(date)) : []
  const description = [item.lead, describeRow(r, rowDimensions)].filter(Boolean).join(' · ')
  const cell: ValueCell = { cols, edit, actions, section: 'alloc', lane, menu: true }
  const remaining = (totals.requiredFte ?? 0) - totals.plannedFte
  return (
    <Line
      className="alloc-row"
      onLabelClick={(e) => {
        if (!(e.target instanceof Element && e.target.closest('button'))) actions.selectRow(lane)
      }}
      project={item.project.venue ? item.project.key : undefined}
      cols={cols}
      label={
        <>
          <PhaseMark phase={r.phase} indent={18 + item.depth * INDENT} />
          {/* The year and the kind of demand data behind the row are in the tooltip and in row details. */}
          <span className="lbl-desc" title={[describeRow(r, ALL_DIMENSIONS), r.refYear, r.basis].filter(Boolean).join(' · ')}>
            {description || <em className="muted">rad</em>}
          </span>
          {outside.length > 0 && (
            <span className="lbl-warning" title={`${outside.length} ${outside.length === 1 ? 'dag' : 'dager'} med FTE ligger utenfor ${phaseDays} i hallen: ${outside.sort().map((d) => `${d.slice(8)}.${d.slice(5, 7)}.`).join(' ')}`}>
              <TriangleAlert size={13} aria-hidden />
            </span>
          )}
          <span className="lbl-nums">
            <span className="lbl-num" title={totals.requiredHours === null ? '' : `${formatFte(totals.requiredHours, 2)} timer`}>
              {formatFte(totals.requiredFte)}
            </span>
            <span className="lbl-num">{formatFte(totals.plannedFte)}</span>
            <span className={`lbl-num delta ${deltaClass(totals.deltaFte)}`}>{formatFte(totals.deltaFte)}</span>
            <CoverageBar required={totals.requiredFte} planned={totals.plannedFte} />
          </span>
          <span className="row-slot row-actions">
            <button
              className="row-action"
              disabled={!window?.size || remaining <= 0.05}
              aria-label="Fordel det som gjenstår over vinduet"
              title={`Fordel det som gjenstår av behovet på ${phaseDays} i hallen. Erstatter det som står på de dagene.`}
              onClick={() => actions.proposePlan([r], true)}
            >
              <Pencil size={14} aria-hidden />
            </button>
            <button className="row-action" disabled={Object.keys(r.fte).length === 0} aria-label="Tøm raden" title="Tøm raden" onClick={() => actions.clearRow(r)}>
              <Eraser size={14} aria-hidden />
            </button>
          </span>
        </>
      }
      cells={(date, col) =>
        valueCell(
          cell,
          date,
          col,
          r.fte[date],
          r.notes[date],
          `${r.phase === 'Demontering' ? 'dem' : 'mon'} ${window?.has(date) ? `in-window ${dayType(date) === 'arbeidsdag' ? 'workday' : ''}` : window?.size && r.fte[date] ? 'outside-window' : ''}`,
        )
      }
    />
  )
})
