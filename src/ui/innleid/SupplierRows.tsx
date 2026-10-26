import { memo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { dayText, type ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { laneOf, SHIFT_LABELS, shiftTimes, supplierDays, timesText, type LineRuns, type SupplierDay, type SupplierLine } from '../../domain/hire'
import type { CompetenceStyle, HireOrder, Supplier, WorkdaySettings } from '../../domain/types'
import { useBemanning } from '../bemanning/BemanningScope'
import { DAY_INSET, DIVIDER_H, shiftLine } from '../bemanning/layout'
import { strokeRange } from '../bemanning/tools'
import { competenceColor, count } from '../dom'
import { hoursText } from '../format'
import { Line } from '../kalender/GridRows'
import { dayClass, type Columns } from '../kalender/gridTypes'
import { daysWide, LEFT_W, ROW_H } from '../kalender/layout'
import { PILL_ROOM, StrokeBox } from '../kalender/StrokeBox'
import { useInnleid, type InnleidActions } from './InnleidScope'
import { AnswerGlyph } from './OrderPopovers'

/** What the label of a supplier's first line holds: its name, which opens its panel, and what it offers. */
interface NameProps {
  supplier: Supplier
  /** The competences of the board, for the marks of what the supplier offers. */
  competences: CompetenceStyle[]
  /** The competence of the brush, whose mark has a ring. */
  focus: string | null
  waits: boolean
  /** The people-days in the days in view. */
  total: number
  actions: InnleidActions
}

function SupplierName({ supplier, competences, focus, waits, actions }: NameProps) {
  return (
    <>
      <button className="il-supplier-name lbl-desc" title={`Åpne bestillingen til ${supplier.name}`} onClick={() => actions.openSupplier(supplier.id)}>
        {supplier.name}
      </button>
      {waits && <AnswerGlyph waits size={12} />}
      <span className="bm-dots" title={`Tilbyr: ${competences.filter((style) => supplier.competences.includes(style.key)).map((style) => style.label).join(', ') || 'ingen av kompetansene med restbehov'}`}>
        {competences.map((style) => (
          <i key={style.key} className={`${supplier.competences.includes(style.key) ? 'has' : ''} ${style.key === focus ? 'focused' : ''}`} style={competenceColor(style)} />
        ))}
      </span>
    </>
  )
}

interface NameLineProps extends NameProps {
  cols: Columns
  /** By date. */
  days: Map<ISODate, SupplierDay> | undefined
  folded: boolean
  /** It has no shift at all. */
  empty: boolean
  dim: boolean
  onOpenSuppliers: () => void
}

/** A supplier with more than one line: its name, and the people it is ordered for per day over its shifts, those that wait for an answer hatched. Its lines fold under it. */
const NameLine = memo(function NameLine({ cols, days, folded, empty, dim, onOpenSuppliers, ...name }: NameLineProps) {
  const { supplier, actions } = name
  return (
    <Line
      className={`il-supplier ${dim ? 'dim' : ''}`}
      height={ROW_H}
      label={
        <>
          {!empty && (
            <button className="row-action" aria-expanded={!folded} aria-label={folded ? 'Vis skiftene' : 'Skjul skiftene'} title={folded ? 'Vis skiftene' : 'Skjul skiftene'} onClick={() => actions.fold(supplier.id)}>
              {folded ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
            </button>
          )}
          <SupplierName {...name} />
          {empty ? (
            <button className="link small il-retired" onClick={onOpenSuppliers}>
              Ingen skift
            </button>
          ) : (
            <span className="bm-week-left">{name.total || ''}</span>
          )}
        </>
      }
      cols={cols}
      cells={(date) => {
        const day = days?.get(date)
        return (
          <div key={date} className={`${dayClass(cols, date)} cell il-people`} onMouseDown={actions.cellDown} title={day ? `${supplier.name} · ${dayText(date)}\n${hoursText(day.people)} pers.${day.waiting ? `, ${hoursText(day.waiting)} venter på svar` : ''}` : undefined}>
            {day && day.people > day.waiting && <span>{hoursText(day.people - day.waiting)}</span>}
            {day && day.waiting > 0 && <span className="waits">{hoursText(day.waiting)}</span>}
          </div>
        )
      }}
    />
  )
})

interface ShiftLineProps {
  supplier: Supplier
  line: SupplierLine
  /** The line's orders over the days drawn, as runs in lanes. */
  runs: LineRuns
  cols: Columns
  styles: Map<string, CompetenceStyle>
  wd: WorkdaySettings
  projectName: (projectNo: string) => string
  /** The competence of the brush: runs of other competences are dimmed. */
  focus: string | null
  dim: boolean
  /** The columns of the line a brush stroke covers where the supplier does not offer its competence, hatched: the stroke passes it by. */
  refusedFrom: number
  refusedTo: number
  /** The orders a stroke under way adds or changes, or takes away. Plain functions of the scope, the same while no stroke is drawn. */
  coming: ((order: HireOrder) => boolean) | undefined
  going: ((order: HireOrder) => boolean) | undefined
  actions: InnleidActions
  /** The supplier has this line alone: its label is the supplier's too, with the name. */
  name?: NameProps
}

/** A supplier's shift, as a person's line in Faste: its orders as runs over the days, a lane in height for each competence and project. */
const ShiftLine = memo(function ShiftLine({ supplier, line, runs, cols, styles, wd, projectName, focus, dim, refusedFrom, refusedTo, coming, going, actions, name }: ShiftLineProps) {
  const geometry = shiftLine(runs.lanes.length)
  const times = timesText(shiftTimes(line.shift, wd))
  return (
    <Line
      className={`il-line ${name ? 'il-supplier' : ''} ${dim ? 'dim' : ''}`}
      height={geometry.height}
      label={
        <>
          {name && <SupplierName {...name} />}
          <span className={`il-shift ${line.offered ? '' : 'retired'}`} title={line.offered ? `${supplier.name} · ${SHIFT_LABELS[line.shift]} ${times}` : `${supplier.name} tilbyr ikke ${SHIFT_LABELS[line.shift].toLowerCase()} lenger. Bestillingene står til de er flyttet eller fjernet.`}>
            <b>{SHIFT_LABELS[line.shift]}</b> {times}
          </span>
          {!line.offered && (
            <span className="il-retired">
              <i className="need-dot" />
              Tilbys ikke lenger
            </span>
          )}
          {name && <span className="bm-week-left">{name.total || ''}</span>}
        </>
      }
      cols={cols}
      cells={(date, col) => <div key={date} className={`${dayClass(cols, date)} cell bm-cell ${dayType(date) === 'arbeidsdag' ? '' : 'off-day'} ${col >= refusedFrom && col <= refusedTo ? 'refused' : ''}`} onMouseDown={actions.cellDown} />}
      overlay={runs.runs.map((run) => {
        const style = styles.get(run.competence)
        const label = `${style?.label ?? run.competence}${run.projectNo ? ` · ${projectName(run.projectNo)}` : ''}`
        const order = run.orders[0]
        const people = order.asked && !run.waits ? `${hoursText(run.fte)}/${hoursText(order.asked)}` : hoursText(run.fte)
        // Its own times where they are not the shift's, without the minutes of a whole hour: «10–18».
        const own = timesText(run) === times ? null : timesText(run).replace(/:00/g, '')
        const stale = line.stale.includes(run.competence)
        const lane = geometry.lane(run.lane)
        const at = cols.c0 + cols.dates.indexOf(run.from)
        const days = cols.dates.indexOf(run.to) - cols.dates.indexOf(run.from) + 1
        const state = coming && run.orders.some(coming) ? 'coming' : going && run.orders.some(going) ? 'going' : ''
        return (
          <span
            key={`${run.lane}|${run.from}`}
            className={`il-run ${run.waits ? 'waits' : ''} ${state} ${lane.height < 20 ? 'sm' : ''} ${focus && focus !== run.competence ? 'other' : ''}`}
            data-lane={laneOf(run)}
            style={{ left: daysWide(at, LEFT_W + DAY_INSET), width: daysWide(days, -2 * DAY_INSET), top: lane.top, height: lane.height, ...competenceColor(style) }}
            onMouseDown={actions.cellDown}
            title={`${label} · ${supplier.name} · ${SHIFT_LABELS[line.shift]}\n${dayText(run.from)}${run.to === run.from ? '' : ` – ${dayText(run.to)}`} · ${people} pers. · ${run.waits ? 'venter på svar' : 'bekreftet'}${own ? `\nEgne tider ${own}` : ''}${run.projectNo ? '' : '\nUten prosjekt: fordeles på prosjektene'}${stale ? `\n${supplier.name} tilbyr ikke ${style?.label ?? run.competence} lenger` : ''}`}
          >
            <span className="il-run-name" style={{ left: LEFT_W + DAY_INSET }}>
              {stale && <i className="need-dot" />}
              {label}
              <b>{people}</b>
              {own && <small>{own}</small>}
            </span>
          </span>
        )
      })}
    />
  )
})

/**
 * The suppliers under the bar, as the people in Faste: each with a line per shift it offers, its orders drawn as runs on
 * them, and with more than one shift a name line over them with the people per day, which folds them. With a brush, the
 * suppliers that offer its competence come first, and the others are dimmed under a divider. The brush and Tøm are drawn
 * over the lines as in Faste, as a box with a pill, and the lines show what the stroke would leave.
 */
export function SupplierRows({ onOpenSuppliers }: { onOpenSuppliers: () => void }) {
  const { cols, styles, labelOf } = useBemanning()
  const { suppliers, stored, rows, view, brush, tool, blocks, shiftRows, able, bodyRef, stroke, selection, marked, pill, wd, projectName, actions } = useInnleid()
  const perDay = supplierDays(stored)
  const focus = brush
  if (!suppliers.length)
    return (
      <div className="bm-empty">
        <strong>Ingen leverandører registrert.</strong> Legg inn leverandørene, hva de tilbyr og skiftene deres, så kan de bestilles.
        <button onClick={onOpenSuppliers}>Åpne Leverandører</button>
      </div>
    )
  const range = stroke && (stroke.mode === 'paint' || stroke.mode === 'erase') ? strokeRange(stroke) : null
  const chosen = !stroke && selection ? strokeRange({ mode: 'select', ...selection }) : null
  const selecting = stroke?.mode === 'select' ? strokeRange(stroke) : null
  const box = (r: { rowFrom: number; rowTo: number; colFrom: number; colTo: number }) => {
    const first = shiftRows[r.rowFrom]
    const last = shiftRows[Math.min(r.rowTo, shiftRows.length - 1)]
    return { left: daysWide(r.colFrom, LEFT_W), width: daysWide(r.colTo - r.colFrom + 1), top: first.top, height: last.top + last.height - first.top }
  }
  const pillStyle = pill?.competence ? competenceColor(styles.get(pill.competence)) : undefined
  return (
    <div className="bm-people il-suppliers" ref={bodyRef} data-tool={tool}>
      {blocks.map((block) => {
        const { supplier } = block
        const days = perDay.get(supplier.id)
        const name: NameProps = {
          supplier,
          competences: rows,
          focus,
          waits: !!days && [...days.values()].some((day) => day.waiting > 0),
          total: view.reduce((sum, date) => sum + (days?.get(date)?.people ?? 0), 0),
          actions,
        }
        const offered = !brush || supplier.competences.includes(brush)
        return (
          <div key={supplier.id}>
            {block.divider && (
              <div className="bm-divider" style={{ height: DIVIDER_H }}>
                <span style={{ width: LEFT_W }}>
                  Uten {labelOf(brush!)} · {blocks.length - able}
                </span>
              </div>
            )}
            {!block.single && <NameLine {...name} cols={cols} days={days} folded={block.folded} empty={!block.rows.length && !block.folded} dim={block.dim} onOpenSuppliers={onOpenSuppliers} />}
            {block.rows.map((shift) => {
              const row = shiftRows.indexOf(shift)
              const inStroke = range !== null && stroke?.mode === 'paint' && !offered && row >= range.rowFrom && row <= range.rowTo
              return (
                <ShiftLine
                  key={shift.line.key}
                  supplier={supplier}
                  line={shift.line}
                  runs={shift.runs}
                  cols={cols}
                  styles={styles}
                  wd={wd}
                  projectName={projectName}
                  focus={focus}
                  dim={block.dim}
                  refusedFrom={inStroke ? range.colFrom : -1}
                  refusedTo={inStroke ? range.colTo : -1}
                  coming={marked?.coming}
                  going={marked?.going}
                  actions={actions}
                  name={block.single ? name : undefined}
                />
              )
            })}
          </div>
        )
      })}
      {range && pill && shiftRows.length > 0 && (
        // One outline over the days and lines of the stroke, and what it will do on a pill above it.
        <StrokeBox kind={pill.mode} style={{ ...box(range), ...pillStyle }} below={box(range).top < PILL_ROOM}>
          {pill.mode === 'erase' ? (
            <b>
              {pill.competence ? (
                <>
                  Tøm <i className="swatch" /> {labelOf(pill.competence)}
                  {pill.projectNo ? ` · ${projectName(pill.projectNo)}` : ''}
                </>
              ) : (
                'Tøm alt'
              )}
            </b>
          ) : (
            <b>
              <i className="swatch" /> {labelOf(pill.competence!)}
              {pill.projectNo ? ` · ${projectName(pill.projectNo)}` : ''}
            </b>
          )}
          {pill.text.map((text) => (
            <span key={text}>{text}</span>
          ))}
        </StrokeBox>
      )}
      {selecting && shiftRows.length > 0 && <StrokeBox kind="select" style={box(selecting)} below={box(selecting).top < PILL_ROOM} />}
      {chosen && shiftRows.length > 0 && (
        // The days that are selected, one or many: a tint with no outline, and what can be done with them.
        <StrokeBox kind="bare chosen" style={box(chosen)} below={box(chosen).top < PILL_ROOM}>
          <span>
            {count(chosen.colTo - chosen.colFrom + 1, 'dag', 'dager')} × {count(chosen.rowTo - chosen.rowFrom + 1, 'linje', 'linjer')}
          </span>
          <span>Del fjerner</span>
          <span>Esc</span>
        </StrokeBox>
      )}
    </div>
  )
}
