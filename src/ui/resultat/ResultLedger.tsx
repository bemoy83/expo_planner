import { Fragment, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { addDays, dateRange, daysBetween, isoWeek, monthShort, periodText, type ISODate } from '../../domain/dates'
import { dayAverages, seasonStatus, seasonTotals, type SeasonDay, type seasonSummary, type SeasonRow, type SeasonStatus } from '../../domain/result'
import { VENUE_PHASES, type VenuePhase } from '../../domain/types'
import { PHASE_LABELS } from '../../domain/venue'
import { count } from '../dom'
import { deviationText, hours, overHours, shareText, wholeHours } from '../format'
import { Graded } from './Graded'
import { BudgetBars, StaffBars } from './ResultBars'
import { useFollowScroll } from './useFollowScroll'

/** The width of a day on the timeline, the air at each end of it, and the width of the project's column. */
const DAY_W = 12
const TRACK_INSET = 14
const LABEL_W = 296

const SECTIONS: { status: SeasonStatus; label: string }[] = [
  { status: 'done', label: 'Avsluttet' },
  { status: 'live', label: 'Pågår' },
  { status: 'next', label: 'Kommende' },
]

/** The phases of a project over all its halls, each from its first day in any hall to its last, in the order of the phases. */
const phaseSpans = (row: SeasonRow): { phase: VenuePhase; start: ISODate; end: ISODate }[] =>
  VENUE_PHASES.flatMap((phase) => {
    const spans = Object.values(row.hallPhases).flatMap((phases) => (phases[phase] ? [phases[phase]!] : []))
    if (!spans.length) return []
    return [{ phase, start: spans.map((span) => span.start).sort()[0], end: spans.map((span) => span.end).sort().at(-1)! }]
  })

/** A figure against what it is set against, on the tile of its grade, with its share under it. Muted, without a tile, for the sums of a section. */
function NumberCell({ value, share, title, muted }: { value: string | null; share: number | null; title?: string; muted?: boolean }) {
  if (value === null) return <span className="res-num" />
  return (
    <span className={`res-num ${muted ? 'muted' : ''}`} title={title}>
      {muted ? <b>{value}</b> : <Graded share={share}>{value}</Graded>}
      <small>{shareText(share)}</small>
    </span>
  )
}

/** The plan with overhead against the budget: + where it is over. */
const planCell = (deviation: number | null, budget: number, title: string, muted?: boolean) => (
  <NumberCell value={deviation === null ? null : overHours(deviation)} share={deviation === null || !budget ? null : -deviation / budget} title={title} muted={muted} />
)

/** The hours worked against the plan with overhead: how well the plan hit. */
const hitCell = (actual: number | null, planned: number, muted?: boolean) => (
  <NumberCell value={actual === null || !planned ? null : deviationText(Math.round(actual - planned))} share={actual === null || !planned ? null : (actual - planned) / planned} title="Faktiske timer mot planlagt inkl. overhead. + er mer enn planlagt." muted={muted} />
)

interface Props {
  rows: SeasonRow[]
  summary: ReturnType<typeof seasonSummary>
  /** The planned hours of the rows per day, summed, with the hours of the permanent staff. */
  days: SeasonDay[]
  today: ISODate
  overhead: number
  /** Whether any project has actual hours: without them their columns are left out. */
  actuals: boolean
  open: string | null
  onOpen: (projectNo: string | null) => void
}

/**
 * The season as a ledger on the canvas, a row per project in sections by where it stands: its booked phases as a bar
 * on the season's timeline, and its plan, hours per day and deviations in columns held to the right. Only the
 * timeline moves sideways, and it follows the rows as they are scrolled. The heading and the sum row stay in view.
 */
export function ResultLedger({ rows, summary, days, today, overhead, actuals, open, onOpen }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  // The season runs from the first day of any project, or of today, to the last.
  const range = useMemo(() => {
    const dates = [today, ...rows.flatMap((row) => (row.first ? [row.first, row.last] : [])), ...days.map((day) => day.date)].sort()
    const start = addDays(dates[0], -3)
    const end = addDays(dates.at(-1)!, 3)
    return { start, end, days: daysBetween(start, end) + 1 }
  }, [rows, days, today])
  const at = (date: ISODate) => daysBetween(range.start, date)
  const left = (date: ISODate) => TRACK_INSET + at(date) * DAY_W
  const columns = [`${LABEL_W}px`, `${range.days * DAY_W + 2 * TRACK_INSET}px`, actuals ? '180px 172px 112px 112px 104px' : '180px 172px 112px'].join(' ')
  useFollowScroll(scroller, { todayX: left(today), labelW: LABEL_W, deps: [rows, range.start] })

  const { months, weeks } = useMemo(() => {
    const all = dateRange(range.start, range.end)
    return { months: all.filter((date, i) => i === 0 || date.endsWith('-01')), weeks: all.filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() === 1) }
  }, [range])
  // Every other month a step darker, as the weekends of the Kalender are.
  const shaded = months.flatMap((start, i) => (i % 2 ? [{ start, days: daysBetween(start, months[i + 1] ?? addDays(range.end, 1)) }] : []))
  const monthFills = (
    <span className="res-track">
      {shaded.map(({ start, days: n }) => (
        <i key={start} className="res-month-fill" style={{ left: at(start) * DAY_W, width: n * DAY_W }} />
      ))}
    </span>
  )

  const totals = summary.totals
  const sections = SECTIONS.map((section) => ({ ...section, rows: rows.filter((row) => seasonStatus(row, today) === section.status) })).filter((section) => section.rows.length)
  const budgeted = rows.filter((row) => row.budget !== null)
  const sumBars = {
    name: 'Sum, prosjektene med budsjett',
    budget: totals.budget,
    withOverhead: totals.budgetedWithOverhead,
    plannedTotal: budgeted.reduce((sum, row) => sum + row.plannedTotal, 0),
    deviation: totals.deviation,
    deviationShare: totals.deviationShare,
    actual: null,
    actualDeviation: null,
  }
  const most = Math.max(1, ...days.map((day) => Math.max(day.planned, day.staff * 1.35)))
  const height = (value: number) => `${(value / most) * 100}%`

  const numbers = (cells: ReactNode) => <span className="res-numbers">{cells}</span>

  const projectRow = (row: SeasonRow) => {
    const spans = phaseSpans(row)
    const first = spans.length ? spans.map((span) => span.start).sort()[0] : row.first
    const last = spans.length ? spans.map((span) => span.end).sort().at(-1)! : row.last
    const tip = [`${row.name || 'Uten navn'} · ${first ? periodText(first, last) : 'ingen dager'}`, ...spans.map(({ phase, start, end }) => `${PHASE_LABELS[phase]}: ${periodText(start, end)}`)].join('\n')
    const labelRight = first && left(last) + DAY_W < (range.days * DAY_W + 2 * TRACK_INSET) * 0.82
    return (
      <div
        key={row.projectNo.toLowerCase()}
        className={`res-row project ${row.projectNo === open ? 'open' : ''}`}
        data-x={first ? left(first) : undefined}
        onClick={() => onOpen(row.projectNo === open ? null : row.projectNo)}
      >
        <span className="res-label">
          <b title={row.name}>{row.name || 'Uten navn'}</b>
          <span className="res-meta">
            <span>{row.projectNo}</span>
            <span>{row.halls.join(' ')}</span>
          </span>
        </span>
        <span className="res-timeline">
          {monthFills}
          {first && (
            <span className="res-track">
              {spans.length > 0 && (
                <span className="res-event" title={tip} style={{ left: at(first) * DAY_W, width: (daysBetween(first, last) + 1) * DAY_W }}>
                  {spans.map(({ phase, start, end }) => (
                    <i key={phase} className={`ph-${phase}`} style={{ left: daysBetween(first, start) * DAY_W, width: (daysBetween(start, end) + 1) * DAY_W }} />
                  ))}
                </span>
              )}
              <span className="res-event-days" style={labelRight ? { left: (at(last) + 1) * DAY_W + 8 } : { right: `calc(100% - ${at(first) * DAY_W - 8}px)` }}>
                {periodText(first, last)}
              </span>
            </span>
          )}
        </span>
        {numbers(
          <>
            <span className="res-bars-cell">
              <BudgetBars row={row} overhead={overhead} />
            </span>
            <StaffBars averages={dayAverages([row])} />
            {row.budget === null ? (
              <span className="res-no-budget" style={{ gridColumn: actuals ? 'span 2' : undefined }}>
                <span className="res-badge">Uten budsjett</span>
              </span>
            ) : (
              <>
                {planCell(row.deviation, row.budget, 'Planlagt inkl. overhead mot budsjett. + er over, − er under.')}
                {actuals && planCell(row.actualDeviation, row.budget, 'Faktiske timer mot budsjett. + er over, − er under.')}
              </>
            )}
            {actuals && hitCell(row.actual, row.withOverhead)}
          </>,
        )}
      </div>
    )
  }

  return (
    <div className="res-ledger">
      <div className="res-scroll" ref={scroller}>
        <div className="res-grid" style={{ '--res-cols': columns } as CSSProperties}>
          <div className="res-row head">
            <span className="res-label">
              <span className="res-eyebrow">Prosjekt</span>
              <span className="res-meta">
                <span>{periodText(range.start, range.end)}</span>
              </span>
            </span>
            <span className="res-timeline">
              <span className="res-track">
                {months.map((date) => (
                  <span key={date} className="res-month" style={{ left: at(date) * DAY_W }}>
                    {monthShort(date).toUpperCase()}
                  </span>
                ))}
                {weeks.map((date) => (
                  <span key={date} className={`res-week ${Math.abs(daysBetween(today, date)) < 7 ? 'near' : ''}`} style={{ left: at(date) * DAY_W }}>
                    {isoWeek(date)}
                  </span>
                ))}
                <span className="res-today-chip" style={{ left: at(today) * DAY_W }}>
                  {periodText(today, today)}
                </span>
              </span>
            </span>
            {numbers(
              <>
                <span className="res-num-head left" title="Hold over søylene for tallene">
                  <span>{actuals ? 'Plan · faktisk' : 'Plan'}</span>
                  <small>mot budsjett</small>
                </span>
                <span className="res-num-head" title="Planlagte timer per monterings- og demonteringsdag, mot det de faste kan i normaltiden på de samme dagene">
                  <span>Timer / dag</span>
                  <small>{summary.staff === null ? '' : `mot faste ${wholeHours(summary.staff)}`}</small>
                </span>
                <span className="res-num-head" title="Planlagt inkl. overhead mot budsjett. + er over, − er under.">
                  <span>Plan</span>
                  <small>mot budsjett</small>
                </span>
                {actuals && (
                  <>
                    <span className="res-num-head" title="Faktiske timer mot budsjett. + er over, − er under.">
                      <span>Faktisk</span>
                      <small>mot budsjett</small>
                    </span>
                    <span className="res-num-head" title="Faktiske timer mot planlagt inkl. overhead: hvor godt planen traff">
                      <span>Faktisk</span>
                      <small>mot plan</small>
                    </span>
                  </>
                )}
              </>,
            )}
          </div>
          <div className="res-row sum">
            <span className="res-label">
              <b>Sum</b>
              <span className="res-meta">
                <span>{count(rows.length, 'prosjekt', 'prosjekter')}</span>
                <span>behov per dag</span>
              </span>
            </span>
            <span className="res-timeline">
              {monthFills}
              <span className="res-track res-load" title="Planlagte timer per dag over sesongen, mot det de faste kan (stiplet)">
                {days.map((day) => (
                  <span key={day.date} className="res-load-day" style={{ left: at(day.date) * DAY_W }} title={`${periodText(day.date, day.date)}: ${hours(Math.round(day.planned))} t · faste ${hours(Math.round(day.staff))} t`}>
                    {day.planned > 0 && <i style={{ height: height(Math.min(day.planned, day.staff)) }} />}
                    {day.planned > day.staff && <i className="over" style={{ bottom: height(day.staff), height: height(day.planned - day.staff) }} />}
                    {day.staff > 0 && <i className="staff" style={{ bottom: height(day.staff) }} />}
                  </span>
                ))}
                <i className="res-today-line" style={{ left: at(today) * DAY_W }} />
              </span>
            </span>
            {numbers(
              <>
                <span className="res-bars-cell">{budgeted.length > 0 && <BudgetBars row={sumBars} overhead={overhead} />}</span>
                <StaffBars averages={summary.averages} />
                {planCell(totals.deviation, totals.budget, 'Planlagt inkl. overhead mot budsjett, for prosjektene med budsjett')}
                {actuals && (
                  <>
                    {planCell(totals.actualDeviation, totals.actualBudget, 'Faktiske timer mot budsjett, for prosjektene med faktiske timer')}
                    {hitCell(totals.actuals ? totals.actual : null, totals.actualWithOverhead)}
                  </>
                )}
              </>,
            )}
          </div>
          {sections.map((section) => {
            const sums = seasonTotals(section.rows)
            return (
              <Fragment key={section.status}>
                <div className="res-row section">
                  <span className="res-label">
                    <span className="res-section-label">
                      <span className="res-eyebrow">{section.label}</span>
                      <span className="res-count">{section.rows.length}</span>
                    </span>
                  </span>
                  <span className="res-timeline" />
                  {numbers(
                    <>
                      <span />
                      <span />
                      {planCell(sums.deviation, sums.budget, '', true)}
                      {actuals && (
                        <>
                          {planCell(sums.actualDeviation, sums.actualBudget, '', true)}
                          {hitCell(sums.actuals ? sums.actual : null, sums.actualWithOverhead, true)}
                        </>
                      )}
                    </>,
                  )}
                </div>
                {section.rows.map(projectRow)}
              </Fragment>
            )
          })}
          {!rows.length && <p className="res-empty muted">Ingen prosjekter i dette utvalget.</p>}
          {rows.length > 0 && <div className="res-tail" />}
          <i className="res-today-line body" style={{ left: LABEL_W + left(today) }} />
        </div>
      </div>
      <div className="res-legend">
        <span className="res-legend-keys">
          {VENUE_PHASES.map((phase) => (
            <span key={phase}>
              <i className={`ph-${phase}`} />
              {PHASE_LABELS[phase]}
            </span>
          ))}
        </span>
        <span className="res-legend-keys">
          <span>
            <i className="plan" />
            Plan inkl. overhead
          </span>
          {actuals && (
            <span>
              <i className="actual" />
              Faktisk
            </span>
          )}
          <span>
            <i className="tick" />
            Budsjett
          </span>
          <span>
            <i className="over" />
            Over budsjett / faste
          </span>
        </span>
        <span className="res-legend-note">Hver søyle er skalert mot sitt eget budsjett</span>
      </div>
    </div>
  )
}
