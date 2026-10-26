import { memo, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { capacityForDate, FTE_NOISE } from '../../domain/calc'
import { addDays, weekdayShort, type ISODate } from '../../domain/dates'
import { dayType, holidayName } from '../../domain/holidays'
import type { CapacityLine, DayValues, Settings, VenuePhase } from '../../domain/types'
import { PHASE_CODES, type HallSegment } from '../../domain/venue'
import { dayClass, type CellEdit, type Columns, type GridActions } from './gridTypes'
import { deltaClass, describeRow, fmtDate, headLabel } from './labels'
import { daysWide, HALL_COMPACT_H, HALL_ROW_H, HEAT_ROW_H, LEFT_W, ROW_H, TOP_ROW_H, type Zoom } from './layout'
import { HEAT_LABELS, heatFigure, heatTile, OK_UP_TO, type HeatKind } from './heat'
import { DIMENSION_LABELS, workPhaseOn, type Dimension, type GroupItem, type RowItem } from './rows'
import { Twisty } from '../common'
import { Eraser, Pencil, Plus, TriangleAlert } from 'lucide-react'
import { count } from '../dom'
import { formatFte, signed } from '../format'

/** An event's name in the hall calendar may run on past a short event, up to this far, where the hall is free. */
const HALL_LABEL_MAX_W = 260
const HALL_LABEL_MAX_COLS = 10
/** The width of one letter on a hall bar, of an event's name and of a phase alike, and the air a phase's letters need at the bar's ends. */
const BAR_CHAR_W = 6
const PHASE_CODE_AIR = 4

/** The heights of the two lines of the date header: week and month, then weekday and date. */
const HEAD_ROW_H = 20
const DATE_ROW_H = 30

/** How far each level of the hierarchy is indented in the label column. */
const INDENT = 14

const ALL_DIMENSIONS: Dimension[] = ['project', 'competence', 'hall', 'avdeling']

/** One line of the grid: the label column, then a cell per drawn day. */
export function Line({ className = '', label, cols, cells, overlay, height = ROW_H, minHeight, style, projects, onLabelClick }: { className?: string; label: ReactNode; cols: Columns; cells: (date: ISODate, col: number) => ReactNode; overlay?: ReactNode; height?: number; /** A line whose height follows what is in it, at least this; `height` is then not used. */ minHeight?: number; /** Style variables for the line, such as the colour of its competence. */ style?: CSSProperties; /** On a hall's line: its projects, for the hover cue, see `useProjectHover` and `projectList`. */ projects?: string; onLabelClick?: (e: MouseEvent) => void }) {
  const size = minHeight === undefined ? { height } : { minHeight }
  return (
    <div className={`grid-row ${className}`} style={{ ...style, ...size }} data-projects={projects}>
      <div className="grid-label" onClick={onLabelClick}>
        {label}
      </div>
      <div className="grid-spacer" style={{ width: daysWide(cols.c0) }} />
      {cols.dates.map((date, i) => cells(date, cols.c0 + i))}
      {overlay}
    </div>
  )
}

/**
 * The heading of a section of the top block: its name and what belongs with it in the label column, on a tinted line that runs across
 * the grid. The line is a heading and has no days: no rules, no weekends, no red days and no today line.
 */
export function SectionLine({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`grid-row section-row ${className}`}>
      <div className="section-head" style={{ width: LEFT_W }}>
        {children}
      </div>
    </div>
  )
}

const readCell = (cols: Columns, date: ISODate, value: number | undefined, className = '', title?: string) => (
  <div key={date} className={`${dayClass(cols, date)} cell ${className}`} title={title}>
    {formatFte(value)}
  </div>
)

interface ValueCell {
  cols: Columns
  edit: CellEdit
  actions: GridActions
  lane: number
  /** A right-click on the cell opens the cell menu. */
  menu?: boolean
}

const valueCell = ({ cols, edit, actions, lane, menu }: ValueCell, date: ISODate, col: number, value: number | undefined, note?: string, extraClass = '') => {
  const focus = edit.focusCol === col
  // The cell in focus has its ring and no tint, as the active cell of a selection in Excel.
  const selected = col >= edit.selFrom && col <= edit.selTo && !focus
  // During a stroke or a pull of a span's end the cell shows what it would put there.
  const drawn = edit.ghost?.get(date)
  // It is shown on the span itself, see `spanClass`: the day has the look of a planned day, and a day that would be emptied keeps its figure.
  const shown = drawn || value
  return (
    <div
      key={date}
      className={`${dayClass(cols, date)} cell editable ${selected ? 'selected' : ''} ${focus ? 'focus' : ''} ${value ? 'filled' : ''} ${extraClass} ${note ? 'has-note' : ''}`}
      title={note}
      onMouseDown={(e) => actions.cellDown(lane, col, e)}
      onMouseEnter={() => actions.cellEnter(lane, col)}
      onDoubleClick={() => actions.editCell(value)}
      onContextMenu={menu ? (e) => actions.cellMenu(lane, col, e) : undefined}
    >
      {focus && edit.draft !== null ? (
        <input className="cell-input" autoFocus value={edit.draft} onChange={(e) => actions.setDraft(e.target.value)} onBlur={() => actions.commitDraft()} onKeyDown={actions.draftKey} />
      ) : (
        formatFte(shown)
      )}
    </div>
  )
}

/**
 * The classes of a day on a line that draws its FTE as spans, a row or a level in entry: the phase its colour is of, where a run of days
 * starts and ends, and whether the day is one the line can be worked on.
 *
 * Planned days in a row are drawn as one span, rounded where the run starts and ends: a day without FTE ends it. While a stroke is drawn
 * or an end is pulled, the spans are drawn as it would leave them, as a stroke is in Bemanning: the days that would get FTE as a tint of
 * the line's colour with their figures, and the days that would lose it hatched, since their FTE would not be there.
 */
const spanClass = (valueAt: (date: ISODate) => number | undefined, ghost: CellEdit['ghost'], window: Set<ISODate> | undefined, phase: string, date: ISODate): string => {
  const value = valueAt(date)
  const on = (day: ISODate) => !!(valueAt(day) || ghost?.get(day))
  const drawn = ghost?.get(date)
  const stroke = drawn === undefined ? '' : drawn === 0 ? (value ? 'going' : '') : value ? '' : 'filled coming'
  const run = on(date) ? `${on(addDays(date, -1)) ? '' : 'run-start'} ${on(addDays(date, 1)) ? '' : 'run-end'}` : ''
  const inWindow = window?.has(date) ? `in-window ${dayType(date) === 'arbeidsdag' ? 'workday' : ''}` : window?.size && value ? 'outside-window' : ''
  return `${phase === 'Demontering' ? 'dem' : 'mon'} ${run} ${stroke} ${inWindow}`
}

/** A mark in a line's label for FTE on days outside its window, the days it can be worked on in the halls. */
function OutsideWindow({ dates, window, where }: { dates: ISODate[]; window: Set<ISODate> | undefined; where: string }) {
  const outside = window?.size ? dates.filter((date) => !window.has(date)).sort() : []
  if (!outside.length) return null
  return (
    <span className="lbl-warning" title={`${count(outside.length, 'dag', 'dager')} med FTE ligger utenfor ${where}: ${outside.map((d) => `${d.slice(8)}.${d.slice(5, 7)}.`).join(' ')}`}>
      <TriangleAlert size={13} aria-hidden />
    </span>
  )
}

/** The two header lines: week and month, then weekday and date. `activeDate` is the day of the focused cell. */
export const HeadRows = memo(function HeadRows({ cols, zoom, overbooked, activeDate, onDate, onDayPlan }: { cols: Columns; zoom: Zoom; overbooked: Map<ISODate, { need: number; available: number }>; activeDate: ISODate | undefined; /** A click on a date picks the day in focus. Must keep its identity. */ onDate: (date: ISODate) => void; /** A right-click on a date opens its day plan. Must keep its identity. */ onDayPlan?: (date: ISODate) => void }) {
  return (
    <>
      <Line
        className="head-row"
        height={HEAD_ROW_H}
        label={<span className="lbl-title">{zoom === 'compact' ? '' : 'Uke / måned'}</span>}
        cols={cols}
        cells={(date) => {
          const { month, week } = headLabel(date, cols.colW)
          return (
            <div key={date} className={`${dayClass(cols, date)} cell head`}>
              {month && <span className="month-label">{month}</span>}
              {week && <span className="week-label">{month ? `· ${week}` : week}</span>}
            </div>
          )
        }}
      />
      <Line
        className="head-row tall"
        height={DATE_ROW_H}
        label={<span className="lbl-title">Dato</span>}
        cols={cols}
        cells={(date) => (
          <div
            key={date}
            className={`${dayClass(cols, date)} cell head day-head ${date === activeDate ? 'active' : ''}`}
            onClick={() => onDate(date)}
            onContextMenu={onDayPlan && ((e) => { e.preventDefault(); onDayPlan(date) })}
            title={`${fmtDate(date)}${holidayName(date) ? ` – ${holidayName(date)}` : ''}${overbooked.has(date) ? `\nOverbooket: planlagt ${formatFte(overbooked.get(date)!.need)} FTE, tilgjengelig ${formatFte(overbooked.get(date)!.available)}` : ''}\nKlikk: velg dagen${onDayPlan ? '\nHøyreklikk: dagsplan' : ''}`}
          >
            <span className="wd">{weekdayShort(date).slice(0, zoom === 'compact' ? 1 : 3)}</span>
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
  /** The compact hall calendar: a thin bar per phase, with neither letters nor names. */
  compact?: boolean
  cols: Columns
}

/**
 * One hall of the hall calendar: a bar per phase of each event, with the events' names laid over them.
 * The day cells under the bars are empty, so a line costs a handful of bars however many days it shows.
 */
export const HallRow = memo(function HallRow({ hall, bars, runs, projects, compact = false, cols }: HallRowProps) {
  const { c0, colW } = cols
  const c1 = c0 + cols.dates.length - 1
  // Names of the events in or near the visible dates, each with the width it may take.
  const labels = (compact ? [] : (runs ?? []))
    .filter((run) => run.col <= c1 && run.col + Math.max(run.span, Math.min(run.room, HALL_LABEL_MAX_COLS)) > c0)
    .map((run) => {
      const width = Math.min(run.room * colW, Math.max(run.span * colW, HALL_LABEL_MAX_W)) - 2
      // Roughly the columns the text covers, so the phase letters under it can be left out.
      const covered = Math.ceil(Math.min(width, run.eventName.length * BAR_CHAR_W + 6) / colW)
      // Where the name is now: on its first day, or held at the left edge of the days, at most to the end of the stretch it may move in.
      const at = Math.min(Math.max(run.col, cols.first), run.col + Math.max(run.span, Math.ceil(width / colW)) - covered)
      // The same width for the page, which follows the width of a day through a zoom.
      const widest = `max(${daysWide(run.span)}, ${HALL_LABEL_MAX_W}px)`
      const maxWidth = `calc(${Number.isFinite(run.room) ? `min(${daysWide(run.room)}, ${widest})` : widest} - 2px)`
      return { ...run, maxWidth, covered, at }
    })
  const visible = (bars ?? []).filter((bar) => bar.col <= c1 && bar.col + bar.span > c0)
  return (
    <Line
      className="hall-row"
      height={compact ? HALL_COMPACT_H : HALL_ROW_H}
      projects={projects}
      label={<span className="lbl-hall">{hall}</span>}
      cols={cols}
      cells={(date) => <div key={date} className={`${dayClass(cols, date)} cell hall`} />}
      overlay={
        <>
          {visible.map((bar) => {
            // The phase letters sit in the middle of the bar; they are left out under an event's name and on a bar too narrow for them, such as half a day in narrow columns.
            const code = PHASE_CODES[bar.phase]
            const fits = bar.span * colW - 2 >= code.length * BAR_CHAR_W + PHASE_CODE_AIR
            const middle = bar.col + bar.span / 2
            // A name held at the edge sits a part of a day further in than its column says; one day more is kept clear for it.
            const underLabel = labels.some((label) => middle >= label.at && middle < label.at + label.covered + (label.at > label.col ? 1 : 0))
            return (
              <span
                key={`${bar.eventName}:${bar.phase}:${bar.col}`}
                className={`hall-bar ph-${bar.phase} ${bar.shared ? 'shared' : ''}`}
                style={{ left: daysWide(bar.col, LEFT_W + 1), width: daysWide(bar.span, -2) }}
                title={bar.title}
                data-project={bar.project}
              >
                {!compact && !underLabel && fits ? code : null}
              </span>
            )
          })}
          {labels.map((label) => (
            // The name starts on its day and stays at the left edge of the days for as long as its event is in view.
            <span key={`${label.eventName}:${label.col}`} className="hall-label-run" style={{ left: daysWide(label.col, LEFT_W), width: `max(${daysWide(label.span)}, ${label.maxWidth})` }}>
              <span className="hall-label" data-project={label.project} style={{ left: LEFT_W, maxWidth: label.maxWidth }}>
                {label.eventName}
              </span>
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

/** A staffing line that comes from Bemanning: absence, overtime. It is read here and changed there. */
export const FromBemanningRow = memo(function FromBemanningRow({ cols, label, title, values }: { cols: Columns; label: string; title: string; values: DayValues }) {
  return (
    <Line
      className="cap-row"
      label={
        <span className="lbl-cap" title={title}>
          {label}
        </span>
      }
      cols={cols}
      cells={(date) => readCell(cols, date, values[date], 'cap-cell')}
    />
  )
})

interface SumRowsProps {
  cols: Columns
  need: Map<ISODate, number>
  capacity: CapacityLine[]
  /** The people ordered in Innleid who are not confirmed, as FTE per day. */
  waitingHired: DayValues
  settings: Settings
  deviationOnly: boolean
  /** Whether Avvik is drawn as a heat map, see `heatTile`. */
  heat: boolean
  /** The largest shortage and surplus of the period, which the heat map is scaled by. */
  maxShortage: number
  maxSurplus: number
}

/** What the colours of the heat map mean, beside the name of the Avvik line. */
const HEAT_LEGEND: [HeatKind, number][] = [
  ['under', 70],
  ['ok', 20],
  ['over', 45],
]

/** The three swatches beside the name of an Avvik line: under, ok, over. */
export function HeatLegend({ title }: { title: string }) {
  return (
    <span className="heat-legend" title={title}>
      {HEAT_LEGEND.map(([kind, percent]) => (
        <i key={kind} className={`heat ${kind}`} style={{ '--p': `${percent}%` } as CSSProperties} />
      ))}
    </span>
  )
}

/** The totals under the staffing lines: planned need, available crew and the difference. With the section folded only the difference shows. */
export const SumRows = memo(function SumRows({ cols, need, capacity, waitingHired, settings, deviationOnly, heat, maxShortage, maxSurplus }: SumRowsProps) {
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
              return readCell(cols, date, cap.available || undefined, 'sum-cell', `Faste ${formatFte(cap.base)} + innleid ${formatFte(cap.added)} + overtid ${formatFte(cap.overtime)} − utilgjengelig ${formatFte(cap.unavailable)}${waitingHired[date] ? `\n${formatFte(waitingHired[date])} FTE innleid venter på svar og teller ikke` : ''}`)
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
              <span className="lbl-cap strong">Mangler / over</span>
              <HeatLegend title={`Rødt: underdekning (mørkere = større). Grønt: ok, opptil ${formatFte(OK_UP_TO)} FTE ledig. Oker: over (sterkere = mer).`} />
            </>
          }
          cols={cols}
          cells={(date) => {
            const available = capacityForDate(date, capacity, settings).available
            const n = need.get(date) ?? 0
            // A day with no crew and nothing planned has nothing to show.
            if (!available && !n) return <div key={date} className={`${dayClass(cols, date)} cell sum-cell`} />
            const dev = available - n
            const tile = heatTile(dev, maxShortage, maxSurplus)
            return (
              <div key={date} className={`${dayClass(cols, date)} cell sum-cell heat-cell ${tile.kind}`} title={`${HEAT_LABELS[tile.kind]} ${signed(formatFte(dev)) || '0'} FTE`}>
                <span className={`heat ${tile.kind}`} style={{ '--p': `${tile.percent}%` } as CSSProperties} />
                <span className="heat-value">{heatFigure(dev, cols.colW)}</span>
              </div>
            )
          }}
        />
      ) : (
        <Line
          className="sum-row deviation-row"
          label={<span className="lbl-cap strong">Mangler / over</span>}
          cols={cols}
          cells={(date) => {
            const dev = capacityForDate(date, capacity, settings).available - (need.get(date) ?? 0)
            const n = need.get(date) ?? 0
            return (
              <div key={date} className={`${dayClass(cols, date)} cell sum-cell dev ${dev < -FTE_NOISE ? 'neg' : dev > FTE_NOISE && n ? 'pos' : ''}`}>
                {n || dev ? signed(formatFte(dev)) : ''}
              </div>
            )
          }}
        />
      )}
    </>
  )
})

interface GroupRowProps extends CellEdit {
  item: GroupItem
  /** The level's place among the lines that take FTE, when it is folded. */
  lane: number
  /** The hall phase of each day of the project, for the strip on a project's line. */
  phases: Map<ISODate, VenuePhase> | undefined
  /** Folded: the days the rows under the level can be worked on, see `AllocRow`. */
  window?: Set<ISODate>
  cols: Columns
  actions: GridActions
}

/**
 * A level of the hierarchy. Open, it shows no figures per day: the rows below carry them, and a project's line the
 * hall-phase strip. Folded below a project, it is the deepest line of its branch and a row: its sums are its FTE, typed,
 * drawn as spans and pulled by their ends as a row's are, and what a day gets is shared out over the rows under it. A folded
 * project only sums, on its hall-phase strip: without its work phases there is nothing to share FTE out by.
 */
export const GroupRow = memo(function GroupRow({ item, lane, phases, window, cols, actions, ...edit }: GroupRowProps) {
  const { node } = item
  const project = node.project
  // While an end of one of the level's spans is pulled, its figures count what the pull would leave.
  const planned = edit.livePlanned ?? node.totals.plannedFte
  const delta = planned - node.totals.requiredFte
  const cell: ValueCell = { cols, edit, actions, lane }
  // The colour of a day in entry: the phase most of its FTE is for, and where it has none yet, the phase of the level or of its first row.
  const phaseOn = (date: ISODate) => (node.dimension === 'phase' ? node.label : (workPhaseOn(node.rows, date) ?? node.rows[0]?.phase ?? ''))
  const valueAt = (date: ISODate) => node.daily.get(date)
  // FTE on a project's line on a day the halls have no phase for it: build-up or tear-down planned beyond the hall's days.
  const outside = (date: ISODate) => !!phases?.size && !phases.has(date) && !!node.daily.get(date)
  // What the strip shows on a day: the hall phase on a project's line, where the project is worked beyond it the phase the work
  // is for (hatched, as FTE outside a row's window is), else the work phase of a folded level.
  const stripOn = (date: ISODate): string | null => {
    const hallPhase = phases?.get(date)
    if (hallPhase) return hallPhase
    if (outside(date)) return workPhaseOn(node.rows, date) === 'Demontering' ? 'dismantle' : 'assembly'
    if (!item.collapsed || phases) return null
    if (!node.daily.get(date)) return null
    if (node.dimension === 'phase') return node.label === 'Demontering' ? 'dem' : 'mon'
    return workPhaseOn(node.rows, date) === 'Demontering' ? 'dem' : 'mon'
  }
  return (
    <Line
      className={`group-row depth-${Math.min(node.depth, 3)} ${node.rows.length ? '' : 'empty-group'} ${item.entry ? 'entry-level' : ''}`}
      height={node.depth === 0 ? TOP_ROW_H : ROW_H}
      cols={cols}
      label={
        <>
          <Twisty open={!item.collapsed} show="Vis rader" hide="Skjul rader" style={{ marginLeft: node.depth * INDENT }} onToggle={() => actions.toggleGroup(node.key)} />
          {project ? (
            <span
              className={`lbl-project ${project.venue ? 'locatable' : ''}`}
              onClick={project.venue ? () => actions.showProject(project.key) : undefined}
              title={`${project.venue ? 'Klikk for å vise prosjektets haller og dager i hallkalenderen. ' : ''}${project.projectName}${project.projectNo ? '' : ' – uten prosjektnummer, settes på Haller › Prosjekter'}${project.venue ? '' : ' – ikke koblet til et arrangement i hallkalenderen. Prosjektnummeret settes på Haller › Prosjekter.'}`}
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
          {item.entry && <OutsideWindow dates={[...node.daily].filter(([, fte]) => fte).map(([date]) => date)} window={window} where="monterings- og demonteringsdagene i hallene" />}
          {node.rows.length ? (
            <span className="lbl-nums">
              <span className="lbl-num">{formatFte(node.totals.requiredFte)}</span>
              <span className={`lbl-num ${edit.livePlanned === undefined ? '' : 'live'}`}>{formatFte(planned)}</span>
              <span className={`lbl-num delta ${deltaClass(delta)}`}>{formatFte(delta)}</span>
            </span>
          ) : (
            <span className="muted small no-rows">ingen rader</span>
          )}
          <span className="row-slot">
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
        if (item.entry) return valueCell(cell, date, col, valueAt(date), undefined, spanClass(valueAt, edit.ghost, window, phaseOn(date), date))
        const phase = stripOn(date)
        // The strip is rounded where a phase starts and ends.
        const strip = phase ? `strip strip-${phase} ${stripOn(addDays(date, -1)) === phase ? '' : 'strip-start'} ${stripOn(addDays(date, 1)) === phase ? '' : 'strip-end'} ${outside(date) ? 'strip-outside' : ''}` : ''
        const inSpan = strip || (project?.venue && date >= project.venue.start && date <= project.venue.end ? 'in-span' : '')
        return readCell(cols, date, item.collapsed ? node.daily.get(date) : undefined, `group-cell ${inSpan}`)
      }}
    />
  )
})

/** The colour of a work phase as a small mark in front of a line's name; the spans of the planned days are in the same colour. */
function PhaseMark({ phase, indent }: { phase: string; indent?: number }) {
  return <i className={`phase-mark ${phase === 'Demontering' ? 'dem' : phase === 'Montering' ? 'mon' : ''}`} style={indent ? { marginLeft: indent } : undefined} title={phase || 'Uten arbeidsfase'} />
}

interface AllocRowProps extends CellEdit {
  item: RowItem
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
  const description = [item.lead, describeRow(r, rowDimensions)].filter(Boolean).join(' · ')
  const cell: ValueCell = { cols, edit, actions, lane, menu: true }
  const valueAt = (date: ISODate) => r.fte[date]
  const remaining = (totals.requiredFte ?? 0) - totals.plannedFte
  // While an end of one of the row's spans is pulled, its figures count what the pull would leave.
  const planned = edit.livePlanned ?? totals.plannedFte
  const delta = totals.requiredFte === null ? null : planned - totals.requiredFte
  return (
    <Line
      className="alloc-row"
      onLabelClick={(e) => {
        if (!(e.target instanceof Element && e.target.closest('button'))) actions.selectRow(lane)
      }}
      cols={cols}
      label={
        <>
          <PhaseMark phase={r.phase} indent={18 + item.depth * INDENT} />
          {/* The year and the kind of demand data behind the row are in the tooltip and in row details. */}
          <span className="lbl-desc" title={[describeRow(r, ALL_DIMENSIONS), r.refYear, r.basis].filter(Boolean).join(' · ')}>
            {description || <em className="muted">rad</em>}
          </span>
          <OutsideWindow dates={Object.keys(r.fte).filter((date) => r.fte[date])} window={window} where={`${phaseDays} i hallen`} />
          <span className="lbl-nums">
            <span className="lbl-num" title={totals.requiredHours === null ? '' : `${formatFte(totals.requiredHours, 2)} timer`}>
              {formatFte(totals.requiredFte)}
            </span>
            <span className={`lbl-num ${edit.livePlanned === undefined ? '' : 'live'}`}>{formatFte(planned)}</span>
            <span className={`lbl-num delta ${deltaClass(delta)}`}>{formatFte(delta)}</span>
          </span>
          <span className="row-slot row-actions">
            <button
              className="row-action"
              disabled={!window?.size || remaining <= FTE_NOISE}
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
      cells={(date, col) => valueCell(cell, date, col, valueAt(date), r.notes[date], spanClass(valueAt, edit.ghost, window, r.phase, date))}
    />
  )
})
