import { memo, useMemo } from 'react'
import { ChevronDown, ChevronRight, Link2 } from 'lucide-react'
import { dayText, todayIso, type ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { hireHours, isUrgent, laneOf, partName, SHIFT_LABELS, shiftTimes, supplierDays, supplierWaits, supplierWeek, timesText, type LineRuns, type SupplierDay, type SupplierLine } from '../../domain/hire'
import type { CompetenceStyle, HireOrder, Supplier, WorkdaySettings } from '../../domain/types'
import { useBemanning } from '../bemanning/BemanningScope'
import { CrewName } from '../bemanning/CrewFrame'
import { DAY_INSET, DIVIDER_H, PERSON_H, shiftLine } from '../bemanning/layout'
import { strokeRange } from '../bemanning/tools'
import { competenceColor, count } from '../dom'
import { hoursText } from '../format'
import { Line } from '../kalender/GridRows'
import { dayClass, type Columns } from '../kalender/gridTypes'
import { daysWide, LEFT_W } from '../kalender/layout'
import { PILL_ROOM, StrokeBox } from '../kalender/StrokeBox'
import { useInnleid, type InnleidActions } from './InnleidScope'
import { AnswerGlyph } from './OrderPopovers'

/** What the label of a supplier's first line holds: its name, which opens its panel, the marks of what it offers, and its week. */
interface NameProps {
  supplier: Supplier
  /** The competences of the list (`listStyles`), for the marks of what the supplier offers. */
  competences: CompetenceStyle[]
  /** The competence of the brush, whose mark has a ring. */
  focus: string | null
  waits: boolean
  /** It waits for an answer on a day that starts soon (`isUrgent`). */
  urgent: boolean
  /** What it is ordered for in the week of the people's in Faste (`supplierWeek`). */
  week: { hours: number; waiting: number }
  actions: InnleidActions
}

function SupplierName({ supplier, competences, focus, waits, urgent, actions }: NameProps) {
  return (
    <CrewName
      name={supplier.name}
      title={`Åpne bestillingen til ${supplier.name}`}
      onOpen={() => actions.openSupplier(supplier.id)}
      mark={
        waits && (
          <>
            <AnswerGlyph waits size={12} />
            {urgent && <i className="need-dot" title="Venter på svar for dager som starter snart: purr på leverandøren" />}
          </>
        )
      }
      competences={competences}
      has={(competence) => supplier.competences.includes(competence)}
      focus={focus}
    />
  )
}

/** A supplier's hours ordered in the week, where Faste has a person's hours against their capacity: a supplier has none. */
function WeekHours({ supplier, week }: { supplier: Supplier; week: NameProps['week'] }) {
  return (
    <span className="bm-person-week" title={`${hoursText(week.hours)} t bestilt fra ${supplier.name} denne uka${week.waiting > 0 ? `, ${hoursText(week.waiting)} t av dem venter på svar` : ''}`}>
      <span>{week.hours > 0 && <b>{hoursText(week.hours)}</b>}</span>
    </span>
  )
}

/** What a supplier is ordered for on a day, under the pointer: the people in all, and per competence. */
const dayTitle = (supplier: Supplier, date: ISODate, day: SupplierDay, styles: Map<string, CompetenceStyle>, today: ISODate): string =>
  [
    `${supplier.name} · ${dayText(date)} · ${hoursText(day.people)} pers.`,
    ...day.parts.map((part) => `${styles.get(part.competence)?.label ?? part.competence}: ${hoursText(part.people)} pers.${part.waiting ? `, ${hoursText(part.waiting)} venter på svar` : ''}`),
    ...(day.waiting > 0 && isUrgent(date, today) ? ['Starter snart og venter fortsatt på svar: purr på leverandøren'] : []),
  ].join('\n')

interface NameLineProps extends NameProps {
  cols: Columns
  /** By date. */
  days: Map<ISODate, SupplierDay> | undefined
  styles: Map<string, CompetenceStyle>
  /** Today, for the days that wait for an answer and start soon. */
  today: ISODate
  folded: boolean
  /** It has no shift at all. */
  empty: boolean
  dim: boolean
  onOpenSuppliers: () => void
}

/**
 * A supplier's name line: its name, and per day what it is ordered for over its shifts (2026-10-27): a bar in the colours of the
 * competences, as long as each one's people, those that wait for an answer hatched, and the people in all beside it. Its shift lines fold under it.
 */
const NameLine = memo(function NameLine({ cols, days, styles, today, folded, empty, dim, onOpenSuppliers, ...name }: NameLineProps) {
  const { supplier, actions } = name
  return (
    <Line
      className={`il-supplier ${dim ? 'dim' : ''}`}
      height={PERSON_H}
      label={
        <>
          {empty ? (
            <span className="row-gap" />
          ) : (
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
            <WeekHours supplier={supplier} week={name.week} />
          )}
        </>
      }
      cols={cols}
      cells={(date) => {
        const day = days?.get(date)
        return (
          <div key={date} className={`${dayClass(cols, date)} cell il-people`} onMouseDown={actions.cellDown} title={day ? dayTitle(supplier, date, day, styles, today) : undefined}>
            {day && (
              <>
                {day.waiting > 0 && isUrgent(date, today) && <i className="need-dot" />}
                <span className="il-day-bar">
                  {day.parts.map((part, _, parts) => {
                    const style = styles.get(part.competence)
                    const named = partName(parts.length)
                    const text = named && (named === 'label' ? style?.label : style?.shortLabel || style?.label)
                    return (
                      <span key={part.competence} className={`il-day-part ${name.focus && name.focus !== part.competence ? 'other' : ''} ${part.waiting === part.people ? 'waits' : ''}`} style={{ ...competenceColor(style), flexGrow: part.people }}>
                        {part.people > part.waiting && <i style={{ flexGrow: part.people - part.waiting }} />}
                        {part.waiting > 0 && <i className="waits" style={{ flexGrow: part.waiting }} />}
                        {text && <b className={named === 'short' ? 'short' : ''}>{text}</b>}
                      </span>
                    )
                  })}
                </span>
                <b>{hoursText(day.people)}</b>
              </>
            )}
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
}

/** A supplier's shift, as a person's line in Faste: its orders as runs over the days, a lane in height for each competence and project. */
const ShiftLine = memo(function ShiftLine({ supplier, line, runs, cols, styles, wd, projectName, focus, dim, refusedFrom, refusedTo, coming, going, actions }: ShiftLineProps) {
  const geometry = shiftLine(runs.lanes.length)
  const times = timesText(shiftTimes(line.shift, wd))
  return (
    <Line
      className={`il-line ${dim ? 'dim' : ''}`}
      height={geometry.height}
      label={
        <>
          <span className={`il-shift ${line.offered ? '' : 'retired'}`} title={line.offered ? `${supplier.name} · ${SHIFT_LABELS[line.shift]} ${times}` : `${supplier.name} tilbyr ikke ${SHIFT_LABELS[line.shift].toLowerCase()} lenger. Bestillingene står til de er flyttet eller fjernet.`}>
            <b>{SHIFT_LABELS[line.shift]}</b> {times}
          </span>
          {!line.offered && (
            <span className="il-retired">
              <i className="need-dot" />
              Tilbys ikke lenger
            </span>
          )}
        </>
      }
      cols={cols}
      cells={(date, col) => <div key={date} className={`${dayClass(cols, date)} cell bm-cell ${dayType(date) === 'arbeidsdag' ? '' : 'off-day'} ${col >= refusedFrom && col <= refusedTo ? 'refused' : ''}`} onMouseDown={actions.cellDown} />}
      overlay={runs.runs.map((run) => {
        const style = styles.get(run.competence)
        const label = `${style?.label ?? run.competence}${run.projectNo ? ` · ${projectName(run.projectNo)}` : ''}`
        const order = run.orders[0]
        // A part of a shared person (slice 6) is its share of the person in hours, with a link: «FOGA 5,6 t».
        const people = run.shared ? `${hoursText(run.fte * hireHours(run, wd))} t` : order.asked && !run.waits ? `${hoursText(run.fte)}/${hoursText(order.asked)}` : hoursText(run.fte)
        // Its own times where they are not the shift's, without the minutes of a whole hour: «10–18».
        const own = timesText(run) === times ? null : timesText(run).replace(/:00/g, '')
        const stale = line.stale.includes(run.competence)
        const lane = geometry.lane(run.lane)
        const at = cols.c0 + cols.dates.indexOf(run.from)
        const days = cols.dates.indexOf(run.to) - cols.dates.indexOf(run.from) + 1
        const state = coming && run.orders.some(coming) ? 'coming' : going && run.orders.some(going) ? 'going' : ''
        // An end is taken hold of where the run as it is pulled ends (`grips`, which go on over days off), as in Faste.
        const grip = runs.grips.find((one) => one.orders.includes(order))
        const atStart = grip?.from === run.from
        const atEnd = grip?.to === run.to
        return (
          <span
            key={`${run.lane}|${run.from}`}
            className={`il-run ${run.waits ? 'waits' : ''} ${state} ${lane.height < 20 ? 'sm' : ''} ${focus && focus !== run.competence ? 'other' : ''}`}
            data-lane={laneOf(run)}
            data-ids={run.orders.map((one) => one.id).join(' ')}
            style={{ left: daysWide(at, LEFT_W + DAY_INSET), width: daysWide(days, -2 * DAY_INSET), top: lane.top, height: lane.height, ...competenceColor(style) }}
            onMouseDown={actions.cellDown}
            title={`${label} · ${supplier.name} · ${SHIFT_LABELS[line.shift]}\n${dayText(run.from)}${run.to === run.from ? '' : ` – ${dayText(run.to)}`} · ${run.shared ? `${people} av en delt person` : `${people} pers.`} · ${run.waits ? 'venter på svar' : 'bekreftet'}${run.shared ? '\nPersonen deler timene med en annen kompetanse. «Del opp» i leverandørpanelet.' : ''}${own ? `\nEgne tider ${own}` : ''}${run.projectNo ? '' : '\nUten prosjekt: fordeles på prosjektene'}${stale ? `\n${supplier.name} tilbyr ikke ${style?.label ?? run.competence} lenger` : ''}`}
          >
            <span className="il-run-name" style={{ left: LEFT_W + DAY_INSET }}>
              {stale && <i className="need-dot" />}
              {run.shared && <Link2 className="il-shared" size={12} aria-hidden />}
              {label}
              <b>{people}</b>
              {own && <small>{own}</small>}
            </span>
            {atStart && <i className="bm-edge start" data-edge="start" data-block={grip!.orders[0].id} />}
            {atEnd && <i className="bm-edge end" data-edge="end" data-block={grip!.orders[grip!.orders.length - 1].id} />}
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
  const { cols, styles, labelOf, listStyles, week } = useBemanning()
  const { suppliers, stored, brush, tool, blocks, shiftRows, able, bodyRef, stroke, selection, marked, pill, wd, projectName, actions } = useInnleid()
  const order = useMemo(() => listStyles.map((style) => style.key), [listStyles])
  const perDay = useMemo(() => supplierDays(stored, wd, order), [stored, wd, order])
  const today = todayIso()
  // Each supplier's week, the same object for as long as its orders and the week are, so a scroll frame draws no line again.
  const weeks = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplierWeek(perDay.get(supplier.id), week)])), [suppliers, perDay, week])
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
    <div className="bm-people il-suppliers" ref={bodyRef} data-tool={tool} onMouseMove={actions.bodyMove} onMouseLeave={actions.bodyLeave}>
      {blocks.map((block) => {
        const { supplier } = block
        const days = perDay.get(supplier.id)
        const name: NameProps = {
          supplier,
          competences: listStyles,
          focus: brush,
          ...supplierWaits(days, today),
          week: weeks.get(supplier.id)!,
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
            <NameLine {...name} cols={cols} days={days} styles={styles} today={today} folded={block.folded} empty={!block.rows.length && !block.folded} dim={block.dim} onOpenSuppliers={onOpenSuppliers} />
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
                  focus={brush}
                  dim={block.dim}
                  refusedFrom={inStroke ? range.colFrom : -1}
                  refusedTo={inStroke ? range.colTo : -1}
                  coming={marked?.coming}
                  going={marked?.going}
                  actions={actions}
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
          <span>Klikk en blokk: endre alle</span>
          <span>Del fjerner</span>
          <span>Esc</span>
        </StrokeBox>
      )}
    </div>
  )
}
