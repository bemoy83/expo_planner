import { memo, type ReactNode } from 'react'
import { capacityForDate, formatFte } from '../../domain/calc'
import { isoWeek, MONTHS_NB, WEEKDAYS_NB, weekdayIndex, type ISODate } from '../../domain/dates'
import { dayType, holidayName } from '../../domain/holidays'
import { isSuggestedRow } from '../../domain/plannedRows'
import type { CapacityLine, Settings } from '../../domain/types'
import { dominantEntry, PHASE_CODES, PHASE_LABELS, splitEntries, type HallDayEntry } from '../../domain/venue'
import type { CapLane, CellEdit, Columns, GridActions } from './gridTypes'
import { deltaClass, describeRow, fmtDate } from './labels'
import { LEFT_W, ROW_H, type Zoom } from './layout'
import { CoverageBar } from './parts'
import { DIMENSION_LABELS, type Dimension, type GridItem } from './rows'
import type { Section } from './selection'

/** An event's name in the hall calendar may run on past a short event, up to this far, where the hall is free. */
const HALL_LABEL_MAX_W = 260
const HALL_LABEL_MAX_COLS = 10
/** Roughly the width of one letter of an event's name. */
const HALL_LABEL_CHAR_W = 6.6

/** How far each level of the hierarchy is indented in the label column. */
const INDENT = 14

const ALL_DIMENSIONS: Dimension[] = ['project', 'competence', 'hall', 'avdeling']

/** One line of the grid: the label column, then a cell per drawn day. */
function Line({ className = '', label, cols, cells, overlay }: { className?: string; label: ReactNode; cols: Columns; cells: (date: ISODate, col: number) => ReactNode; overlay?: ReactNode }) {
  return (
    <div className={`grid-row ${className}`} style={{ height: ROW_H }}>
      <div className="grid-label" style={{ width: LEFT_W }}>
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
}

const valueCell = ({ cols, edit, actions, section, lane }: ValueCell, date: ISODate, col: number, value: number | undefined, note?: string, extraClass = '') => {
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

/** The two header lines: week and month, then weekday and date. */
export const HeadRows = memo(function HeadRows({ cols, zoom, overbooked }: { cols: Columns; zoom: Zoom; overbooked: Map<ISODate, { need: number; available: number }> }) {
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
            className={`${dayClass(cols, date)} cell head day-head`}
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
}

interface HallRowProps {
  hall: string
  days: Map<ISODate, HallDayEntry[]> | undefined
  runs: HallLabelRun[] | undefined
  cols: Columns
  zoom: Zoom
}

/** One hall of the hall calendar: a phase per day, with the events' names laid over them. */
export const HallRow = memo(function HallRow({ hall, days, runs, cols, zoom }: HallRowProps) {
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
  return (
    <Line
      className="hall-row"
      label={<span className="lbl-hall">{hall}</span>}
      cols={cols}
      cells={(date, col) => {
        const entries = days?.get(date)
        if (!entries?.length) return <div key={date} className={`${dayClass(cols, date)} cell hall`} style={{ width: colW }} />
        const main = dominantEntry(entries)
        const underLabel = labels.some((label) => col >= label.col && col < label.col + label.covered)
        const title = entries.map((e) => `${e.eventName} – ${PHASE_LABELS[e.phase]}`).join('\n')
        // Wide columns have room to show both events on a day the hall is shared.
        const split = zoom === 'wide' ? splitEntries(entries) : null
        if (split)
          return (
            <div key={date} className={`${dayClass(cols, date)} cell hall split`} style={{ width: colW }} title={title}>
              {split.map((entry) => (
                <span key={entry.eventName} className={`half ph-${entry.phase}`}>
                  {!underLabel && <span className="phase-code">{PHASE_CODES[entry.phase]}</span>}
                </span>
              ))}
            </div>
          )
        return (
          <div key={date} className={`${dayClass(cols, date)} cell hall ph-${main.phase} ${entries.length > 1 ? 'multi' : ''}`} style={{ width: colW }} title={title}>
            {!underLabel && zoom !== 'compact' ? <span className="phase-code">{PHASE_CODES[main.phase]}</span> : null}
          </div>
        )
      }}
      overlay={labels.map((label) => (
        <span key={`${label.eventName}:${label.col}`} className="hall-label" style={{ left: LEFT_W + label.col * colW, maxWidth: label.width }}>
          {label.eventName}
        </span>
      ))}
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

/** The totals under the staffing lines: planned need, available crew and the difference. */
export const SumRows = memo(function SumRows({ cols, need, capacity, settings }: { cols: Columns; need: Map<ISODate, number>; capacity: CapacityLine[]; settings: Settings }) {
  return (
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
    </>
  )
})

interface GroupRowProps extends CellEdit {
  item: Extract<GridItem, { kind: 'group' }>
  /** The level's place among the lines that take FTE, when it is in entry mode. */
  lane: number
  cols: Columns
  actions: GridActions
}

/** A level of the hierarchy: its sums, or cells to type in when it is in entry mode. */
export const GroupRow = memo(function GroupRow({ item, lane, cols, actions, ...edit }: GroupRowProps) {
  const { node } = item
  const project = node.project
  const delta = node.totals.plannedFte - node.totals.requiredFte
  const cell: ValueCell = { cols, edit, actions, section: 'alloc', lane }
  return (
    <Line
      className={`group-row depth-${Math.min(node.depth, 3)} ${node.rows.length ? '' : 'empty-group'} ${item.entry ? 'entry-level' : ''}`}
      cols={cols}
      label={
        <>
          <button className="twisty" style={{ marginLeft: node.depth * INDENT }} onClick={() => (item.entry ? actions.toggleEntry(node.key) : actions.toggleGroup(node.key))} aria-label={item.collapsed ? 'Vis rader' : 'Skjul rader'}>
            {item.collapsed ? '▸' : '▾'}
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
            <span className={`lbl-project lbl-level ${node.dimension === 'phase' ? (node.label === 'Demontering' ? 'dem' : node.label === 'Montering' ? 'mon' : '') : ''}`} title={`${DIMENSION_LABELS[node.dimension]}: ${node.label}`}>
              {node.label} <span className="muted count">{node.rows.length}</span>
            </span>
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
                +
              </button>
            )}
          </span>
        </>
      }
      cells={(date, col) => {
        const inSpan = project?.venue && date >= project.venue.start && date <= project.venue.end ? 'in-span' : ''
        return item.entry ? valueCell(cell, date, col, node.daily.get(date), undefined, `group-cell ${inSpan}`) : readCell(cols, date, node.daily.get(date), `group-cell ${inSpan}`)
      }}
    />
  )
})

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
  const cell: ValueCell = { cols, edit, actions, section: 'alloc', lane }
  return (
    <Line
      className="alloc-row"
      cols={cols}
      label={
        <>
          <span className="lbl-desc" style={{ paddingLeft: 18 + item.depth * INDENT }} title={describeRow(r, ALL_DIMENSIONS)}>
            {description || <em className="muted">rad</em>}
          </span>
          {outside.length > 0 && (
            <span className="lbl-warning" title={`${outside.length} ${outside.length === 1 ? 'dag' : 'dager'} med FTE ligger utenfor ${phaseDays} i hallen: ${outside.sort().map((d) => `${d.slice(8)}.${d.slice(5, 7)}.`).join(' ')}`}>
              ⚠
            </span>
          )}
          <span className={`lbl-phase ${r.phase === 'Demontering' ? 'dem' : 'mon'}`} title={r.phase}>
            {r.phase === 'Montering' ? 'M' : r.phase === 'Demontering' ? 'D' : '–'}
          </span>
          <span className="lbl-year">{r.refYear}</span>
          <span className="lbl-basis" title={r.basis}>
            {r.basis}
          </span>
          <span className="lbl-nums">
            <span className="lbl-num" title={totals.requiredHours === null ? '' : `${formatFte(totals.requiredHours, 2)} timer`}>
              {formatFte(totals.requiredFte)}
            </span>
            <span className="lbl-num">{formatFte(totals.plannedFte)}</span>
            <span className={`lbl-num delta ${deltaClass(totals.deltaFte)}`}>{formatFte(totals.deltaFte)}</span>
            <CoverageBar required={totals.requiredFte} planned={totals.plannedFte} />
          </span>
          <span className="row-slot row-actions">
            {window?.size ? (
              <button className="row-action" title={`Foreslå plan for raden: fordel det som gjenstår av behovet på ${phaseDays} i hallen. Erstatter det som står på de dagene.`} onClick={() => actions.proposePlan([r], true)}>
                ✦
              </button>
            ) : null}
            {/* A suggested row is not stored yet, so there is nothing to edit or delete. */}
            {!isSuggestedRow(r) && (
              <>
                <button className="row-action" title="Endre rad" onClick={() => actions.editRow(r)}>
                  ✎
                </button>
                <button className="row-action" title="Slett rad" onClick={() => actions.removeRow(r)}>
                  ×
                </button>
              </>
            )}
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
