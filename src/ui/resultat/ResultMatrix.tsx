import { Fragment, useState, type CSSProperties } from 'react'
import { periodText } from '../../domain/dates'
import { dayAverages, NOISE, PLAN_MARGIN, seasonStatus, type HallPhases, type seasonSummary, type SeasonRow } from '../../domain/result'
import { VENUE_PHASES, type VenuePhase } from '../../domain/types'
import { PHASE_CODES, PHASE_LABELS } from '../../domain/venue'
import { count } from '../dom'
import { BudgetBars, StaffBars } from './ResultBars'
import { deviationText, overHours, overShareText, shareText, wholeHours } from '../format'

const SHORT: Record<VenuePhase, string> = { assembly: 'Mont.', movingIn: 'Innfl.', event: 'Arr.', movingOut: 'Utfl.', dismantle: 'Dem.' }

/** The booked phases of a hall, for its tile: «B1 · Mont. 7.–9. sep · Arr. 10.–12. sep · Dem. 13. sep». */
const hallTitle = (hall: string, phases: HallPhases) => [hall, ...VENUE_PHASES.filter((phase) => phases[phase]).map((phase) => `${SHORT[phase]} ${periodText(phases[phase]!.start, phases[phase]!.end)}`)].join(' · ')

/** A deviation from the budget, against it: hours over the share, in the colour of what is over where it is. */
function Deviation({ deviation, share, title }: { deviation: number | null; share: number | null; title: string }) {
  if (deviation === null) return <span />
  return (
    <span className={`res-dev num ${deviation < -NOISE ? 'res-over' : ''}`} title={title}>
      <b>{overHours(deviation)}</b>
      <small>{overShareText(share)}</small>
    </span>
  )
}

/** The hours worked against the plan with overhead: how well the plan hit, marked where it is more than `PLAN_MARGIN` over. */
function Hit({ actual, planned }: { actual: number | null; planned: number }) {
  if (actual === null || !planned) return <span />
  return (
    <span className={`res-dev num ${actual > planned * (1 + PLAN_MARGIN) ? 'res-over' : ''}`} title="Faktiske timer mot planlagt inkl. overhead. + er mer enn planlagt.">
      <b>{deviationText(Math.round(actual - planned))}</b>
      <small>{shareText((actual - planned) / planned)}</small>
    </span>
  )
}

interface Props {
  rows: SeasonRow[]
  summary: ReturnType<typeof seasonSummary>
  /** The halls with a column of their own, in order; the other halls of the rows are counted under «Andre». */
  halls: string[]
  today: string
  overhead: number
  /** Whether any project has actual hours: without them their columns are left out. */
  actuals: boolean
  open: string | null
  onOpen: (projectNo: string | null) => void
}

/**
 * The season as a matrix, a row per project: its hall days per phase, its halls, its plan and actual hours against its
 * budget, its hours per day against the permanent staff, and its deviations. The heading and the sums stay in view.
 */
export function ResultMatrix({ rows, summary, halls, today, overhead, actuals, open, onOpen }: Props) {
  const [lit, setLit] = useState<string | null>(null)
  const fixed = new Set(halls)
  const others = [...new Set(rows.flatMap((row) => row.halls.filter((hall) => !fixed.has(hall))))]
  const { totals, averages: sumAverages, staff } = summary
  const columns = [
    'minmax(150px,2.4fr)',
    'repeat(5,24px)',
    '4px',
    halls.length ? `repeat(${halls.length},22px)` : '',
    others.length ? '28px' : '',
    'minmax(48px,2fr)',
    'minmax(120px,1.6fr)',
    `repeat(${actuals ? 3 : 1},minmax(54px,.9fr))`,
  ]
  const style = { '--res-cols': columns.filter(Boolean).join(' ') } as CSSProperties
  const todayAt = rows.findIndex((row) => row.first > today)
  const todayLine = (
    <div className="res-today">
      <span>I dag · {periodText(today, today)}</span>
    </div>
  )
  const phaseCells = (days: SeasonRow['days'], sum?: boolean) => (
    <>
      {VENUE_PHASES.map((phase) => (
        <span key={phase} className={`res-phase-days num ${sum ? 'sum' : ''}`}>
          {days[phase] || ''}
        </span>
      ))}
      <span />
    </>
  )
  const hallHead = (key: string, name: string, title: string, n: number) => (
    <span key={key} className={`res-hall-head ${lit === key ? 'lit' : ''}`} title={title} onMouseEnter={() => setLit(key)} onMouseLeave={() => setLit(null)}>
      <b>{name}</b>
      <small className="num">{n || ''}</small>
    </span>
  )
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

  const row = (row: SeasonRow) => {
    const inOthers = row.halls.filter((hall) => !fixed.has(hall))
    return (
      <div key={row.projectNo.toLowerCase()} className={`res-row ${row.projectNo === open ? 'open' : ''}`} onClick={() => onOpen(row.projectNo === open ? null : row.projectNo)}>
        <span className="res-project">
          <b title={row.name}>{row.name || 'Uten navn'}</b>
          <span className="res-project-meta">
            <span className="project-no">{row.projectNo}</span>
            {row.first && <span>{periodText(row.first, row.last)}</span>}
            {seasonStatus(row, today) === 'live' && <span className="pill ok">Pågår</span>}
          </span>
        </span>
        {phaseCells(row.days)}
        {halls.map((hall) => (
          <span key={hall} className={`res-hall ${lit === hall ? 'lit' : ''}`}>
            {row.hallPhases[hall] ? <span className="res-tile" title={hallTitle(hall, row.hallPhases[hall])} /> : <i className="res-dot" />}
          </span>
        ))}
        {others.length > 0 && (
          <span className={`res-hall ${lit === '*' ? 'lit' : ''}`}>
            {inOthers.length ? (
              <span className="res-tile more num" title={inOthers.map((hall) => hallTitle(hall, row.hallPhases[hall] ?? {})).join('\n')}>
                {inOthers.length}
              </span>
            ) : (
              <i className="res-dot" />
            )}
          </span>
        )}
        <span className="res-bars-cell">
          <BudgetBars row={row} overhead={overhead} />
        </span>
        <StaffBars averages={dayAverages([row])} />
        {row.budget === null ? (
          <span className="res-no-budget" style={{ gridColumn: actuals ? 'span 2' : undefined }}>
            Uten budsjett
          </span>
        ) : (
          <>
            <Deviation deviation={row.deviation} share={row.deviationShare} title="Planlagt inkl. overhead mot budsjett. + er over, − er under." />
            {actuals && <Deviation deviation={row.actualDeviation} share={row.actualDeviation === null ? null : row.actualDeviation / row.budget} title="Faktiske timer mot budsjett. + er over, − er under." />}
          </>
        )}
        {actuals && <Hit actual={row.actual} planned={row.withOverhead} />}
      </div>
    )
  }

  return (
    <div className="res-card res-matrix" style={style}>
      <div className="res-matrix-body">
        <div className="res-row res-head">
          <span>Prosjekt</span>
          {VENUE_PHASES.map((phase) => (
            <span key={phase} className="res-phase-head" title={`${PHASE_LABELS[phase]}: halldager, talt én gang over prosjektets haller`}>
              <b className={`ph-${phase}`}>{PHASE_CODES[phase]}</b>
            </span>
          ))}
          <span />
          {halls.map((hall) => {
            const n = rows.filter((row) => row.hallPhases[hall]).length
            return hallHead(hall, hall, `${hall}: ${count(n, 'prosjekt', 'prosjekter')}`, n)
          })}
          {others.length > 0 && hallHead('*', 'Andre', `Haller som ikke er valgt under «Steder»: ${others.join(', ')}`, others.length)}
          <span className="res-num-head left" title="Hold over søylene for tallene">
            <span>{actuals ? 'Plan · faktisk' : 'Plan'}</span>
            <small>mot budsjett</small>
          </span>
          <span className="res-num-head staff" title="Planlagte timer per monterings- og demonteringsdag, mot det de faste kan i normaltiden på de samme dagene. Til høyre: mer enn de faste kan. Til venstre: de faste er ikke fylt.">
            <span>
              <span>
                <i className="phase-mark mon" />
                Montering
              </span>
              <small className="num">t / dag</small>
            </span>
            <span>
              <span>
                <i className="phase-mark dem" />
                Demontering
              </span>
              <small className="num">{staff === null ? '' : `faste ${wholeHours(staff)}`}</small>
            </span>
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
        </div>
        {rows.map((each, i) => (
          <Fragment key={each.projectNo.toLowerCase()}>
            {i === todayAt && todayLine}
            {row(each)}
          </Fragment>
        ))}
        {todayAt === -1 && rows.length > 0 && todayLine}
        {!rows.length && <p className="res-empty muted">Ingen prosjekter i dette utvalget.</p>}
        <div className="res-row res-sum">
          <span>
            <b>Sum</b> <span className="muted">{count(rows.length, 'prosjekt', 'prosjekter')}</span>
          </span>
          {phaseCells(totals.days, true)}
          {halls.map((hall) => (
            <span key={hall} />
          ))}
          {others.length > 0 && <span />}
          <span className="res-bars-cell">{budgeted.length > 0 && <BudgetBars row={sumBars} overhead={overhead} />}</span>
          <StaffBars averages={sumAverages} />
          <Deviation deviation={totals.deviation} share={totals.deviationShare} title="Planlagt inkl. overhead mot budsjett, for prosjektene med budsjett" />
          {actuals && (
            <>
              <Deviation deviation={totals.actualDeviation} share={totals.actualDeviation === null || !totals.actualBudget ? null : totals.actualDeviation / totals.actualBudget} title="Faktiske timer mot budsjett, for prosjektene med faktiske timer" />
              <Hit actual={totals.actuals ? totals.actual : null} planned={totals.actualWithOverhead} />
            </>
          )}
        </div>
      </div>
      <div className="res-legend">
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
            <i className="over" />
            Over budsjett
          </span>
          <span>
            <i className="tick" />
            Budsjett
          </span>
        </span>
        <span className="muted">Hver søyle er skalert mot sitt eget budsjett</span>
      </div>
    </div>
  )
}
