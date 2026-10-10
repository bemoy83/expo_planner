import { memo } from 'react'
import { capacityForDate, formatFte, FTE_NOISE, type RowTotals } from '../../domain/calc'
import type { ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import type { AllocationRow, CapacityLine, Settings } from '../../domain/types'
import { PHASE_LABELS } from '../../domain/venue'
import { SidePanel } from '../common'
import { fmtDay } from './labels'
import { Pencil } from 'lucide-react'

/** The row the panel is about, with what the Kalender knows of it. */
export interface RowDetails {
  row: AllocationRow
  totals: RowTotals
  /** The days the row can be worked on, see `windowFor`. */
  window: Set<ISODate> | undefined
  projectName: string
  /** The halls the project has booked. */
  halls: string[]
  /** A suggested row is not stored yet, so there is nothing to edit. */
  stored: boolean
}

interface Props {
  details: RowDetails | null
  need: Map<ISODate, number>
  capacity: CapacityLine[]
  settings: Settings
  onEdit: (row: AllocationRow) => void
  /** Shares what is left of the row's demand over its window. */
  onSpread: (row: AllocationRow) => void
  onClose: () => void
}

/**
 * Row details: the demand, the window and the days of the planning row in focus. The panel slides in over
 * the right edge of the grid, so the grid keeps its width.
 */
export const RowInspector = memo(function RowInspector({ details, need, capacity, settings, onEdit, onSpread, onClose }: Props) {
  if (!details) {
    return (
      <SidePanel
        label="Raddetaljer"
        onClose={onClose}
        head={
          <>
            <div className="insp-eyebrow">Rad</div>
            <p className="insp-empty">Velg en planleggingsrad for å se behov, vindu og dagene i den.</p>
          </>
        }
      />
    )
  }
  const { row, totals, window, projectName, halls, stored } = details
  const required = totals.requiredFte ?? 0
  const planned = totals.plannedFte
  const rest = required - planned
  const state = rest > FTE_NOISE ? 'open' : rest < -FTE_NOISE ? 'over' : 'done'
  const share = required > 0 ? Math.min(100, (planned / required) * 100) : planned > 0 ? 100 : 0
  const windowDays = window ? [...window].sort() : []
  const workdays = windowDays.filter((date) => dayType(date) === 'arbeidsdag').length
  const days = Object.keys(row.fte).filter((date) => row.fte[date]).sort()
  const outside = window?.size ? days.filter((date) => !window.has(date)).reduce((sum, date) => sum + row.fte[date], 0) : 0
  const phaseMark = row.phase === 'Demontering' ? 'dem' : row.phase === 'Montering' ? 'mon' : ''
  const scope: [string, string][] = [
    ['Prosjekt', [projectName, row.projectNo].filter(Boolean).join(' · ')],
    ['Data fra', row.refYear],
    ['Grunnlag', row.basis],
    ['Hall/Sted', row.hall === undefined ? 'Alle haller' : row.hall || 'Uten hall'],
    ['Avd.', row.avdeling === undefined ? 'Alle' : row.avdeling || 'Uten avd.'],
  ]
  return (
    <SidePanel
      label="Raddetaljer"
      onClose={onClose}
      head={
        <>
          <div className="insp-title">{row.competence || 'Rad'}</div>
          <div className="insp-sub">
            <i className={`phase-mark ${phaseMark}`} />
            <span>{row.phase || 'Uten arbeidsfase'}</span>
            <span className="insp-sep">·</span>
            <span className="insp-trunc">{projectName}</span>
          </div>
        </>
      }
      actions={
        stored && (
          <button className="ghost icon-button" aria-label="Endre rad" title="Endre rad" onClick={() => onEdit(row)}>
            <Pencil size={16} aria-hidden />
          </button>
        )
      }
    >
      <div className="insp-body">
        <section className="insp-sec">
          <h3 className="insp-h">
            Fremdrift<span>FTE-dager</span>
          </h3>
          <div className="stats">
            <div>
              <span>Behov</span>
              <b>{totals.requiredFte === null ? '–' : formatFte(required)}</b>
              <em>{totals.requiredHours === null ? 'uten grunnlag' : `${formatFte(totals.requiredHours)} t`}</em>
            </div>
            <div>
              <span>Planlagt</span>
              <b>{formatFte(planned)}</b>
              <em>{formatFte(planned * settings.hoursPerDay)} t</em>
            </div>
            <div className={state}>
              <span>{state === 'open' ? 'Gjenstår' : state === 'over' ? 'Over' : 'Dekket'}</span>
              <b>{state === 'done' ? '✓' : `${state === 'over' ? '+' : ''}${formatFte(Math.abs(rest))}`}</b>
              <em>{required > 0 ? `${Math.round((planned / required) * 100)} %` : ' '}</em>
            </div>
          </div>
          <div className={`bar ${state}`}>
            <i className="share" style={{ width: `${share}%` }} />
          </div>
          {outside > 0 && <p className="insp-warn">{formatFte(outside)} FTE-dager ligger utenfor vinduet.</p>}
        </section>
        <section className="insp-sec">
          <h3 className="insp-h">Vindu</h3>
          {windowDays.length ? (
            <dl className="insp-dl">
              <dt>Periode</dt>
              <dd className="num">
                {fmtDay(windowDays[0])} – {fmtDay(windowDays[windowDays.length - 1])}
              </dd>
              <dt>Arbeidsdager</dt>
              <dd className="num">{workdays}</dd>
              <dt>Hallfase</dt>
              <dd>{row.phase === 'Demontering' ? PHASE_LABELS.dismantle : PHASE_LABELS.assembly}</dd>
              <dt>Haller</dt>
              <dd>{halls.join(', ') || '–'}</dd>
            </dl>
          ) : (
            <p className="insp-note">Hallkalenderen har ingen {row.phase === 'Demontering' ? 'demonteringsdager' : 'monteringsdager'} for raden.</p>
          )}
        </section>
        <section className="insp-sec">
          <h3 className="insp-h">Omfang</h3>
          <dl className="insp-dl">
            {scope.map(([term, value]) => (
              <div key={term} className="insp-pair">
                <dt>{term}</dt>
                <dd>{value || '–'}</dd>
              </div>
            ))}
          </dl>
        </section>
        {days.length > 0 && (
          <section className="insp-sec">
            <h3 className="insp-h">
              Dager med FTE<span>{days.length}</span>
            </h3>
            <table className="insp-days">
              <thead>
                <tr>
                  <th>Dag</th>
                  <th>Raden</th>
                  <th>Behov</th>
                  <th>Avvik</th>
                </tr>
              </thead>
              <tbody>
                {days.map((date) => {
                  const planNeed = need.get(date) ?? 0
                  const dev = capacityForDate(date, capacity, settings).available - planNeed
                  return (
                    <tr key={date}>
                      <td>
                        {fmtDay(date)}
                        {window?.size && !window.has(date) ? (
                          <span className="insp-out" title="Utenfor vinduet">
                            {' '}
                            · utenfor
                          </span>
                        ) : null}
                      </td>
                      <td>{formatFte(row.fte[date])}</td>
                      <td>{formatFte(planNeed)}</td>
                      <td className={dev < -FTE_NOISE ? 'neg' : 'pos'}>{formatFte(dev)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )}
      </div>
      <footer className="insp-foot">
        {state === 'open' ? (
          <button disabled={!windowDays.length} title="Fordel det som gjenstår på arbeidsdagene i radens vindu" onClick={() => onSpread(row)}>
            <Pencil size={14} aria-hidden />
            Fordel {formatFte(rest)} over vinduet
          </button>
        ) : (
          <span className={`insp-done ${state}`}>{state === 'done' ? 'Behovet er dekket' : `${formatFte(-rest)} FTE-dager over behovet`}</span>
        )}
      </footer>
    </SidePanel>
  )
})
