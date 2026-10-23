import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { dayAverages, NOISE, projectHours, projectStaffing, seasonStatus, type PhaseHours, type seasonBalance, type SeasonRow } from '../../domain/result'
import { competenceKey, VENUE_PHASES } from '../../domain/types'
import { PHASE_CODES, PHASE_LABELS } from '../../domain/venue'
import { useWorkspace } from '../../store/workspaceStore'
import { hours, useCompetenceColor } from '../behov/format'
import { SidePanel } from '../common'
import { NumberField } from '../fields'
import { overShareText, overText, percentText, spanText } from './format'
import { BudgetBars, StaffBars } from './ResultBars'

const all = (phases: PhaseHours) => phases.Montering + phases.Demontering + phases.other
const whole = (value: number) => hours(Math.round(value))

interface Props {
  row: SeasonRow
  season: ReturnType<typeof seasonBalance>
  today: string
  overhead: number
  /** The hours staffed on the project, as the matrix counts them. */
  staffed: number
  onBudget: (hours: number) => void
  onClose: () => void
  onOpenBehov: () => void
}

/**
 * One project of Resultat: its budget, which is typed here, against the plan and the actual hours; its halls and phase
 * days with its hours per day against the permanent staff; and per competence its demand, plan and staffing.
 */
export function ProjectResult({ row, season, today, overhead, staffed, onBudget, onClose, onOpenBehov }: Props) {
  const { workspace } = useWorkspace()
  const ws = workspace!
  const colorOf = useCompetenceColor()
  const competences = useMemo(() => projectHours(ws, row.projectNo), [ws.demand, ws.allocations, ws.settings, row.projectNo]) // eslint-disable-line react-hooks/exhaustive-deps
  const staffing = useMemo(() => projectStaffing(ws, season, row.projectNo), [ws.allocations, season, row.projectNo]) // eslint-disable-line react-hooks/exhaustive-deps
  const staffedOf = new Map(staffing.map((entry) => [competenceKey(entry.competence), entry]))
  const widest = Math.max(1, ...competences.map((entry) => Math.max(all(entry.demand), all(entry.planned))))
  const over = row.deviation !== null && row.deviation < -NOISE
  const averages = dayAverages([row])
  const tagged = staffing.reduce((sum, entry) => sum + all(entry.tagged), 0)
  const remaining = row.plannedTotal - staffed

  return (
    <SidePanel
      label="Prosjektresultat"
      className="res-panel"
      onClose={onClose}
      head={
        <>
          <div className="insp-title">{row.name || 'Uten navn'}</div>
          <div className="insp-sub">
            <span className="project-no">{row.projectNo}</span>
            {row.first && <span>· {spanText(row.first, row.last)}</span>}
            {seasonStatus(row, today) === 'live' && <span className="res-live">Pågår</span>}
          </div>
        </>
      }
    >
      <div className="insp-body">
        <section className="insp-sec">
          <div className="res-panel-figures">
            <label className="res-budget" title="Budsjetterte arbeidstimer for prosjektet, med overhead. Tomt eller 0 er uten budsjett.">
              <span>Budsjett</span>
              <span className="res-budget-field">
                <NumberField value={row.budget ?? 0} placeholder="Sett budsjett" ariaLabel={`Budsjett for ${row.name || row.projectNo}`} onCommit={onBudget} />
                <small>t</small>
              </span>
            </label>
            <div>
              <span>Planlagt inkl. {percentText(overhead)}</span>
              <b className="num">{whole(row.withOverhead)} t</b>
              <small>{whole(row.plannedTotal)} t uten</small>
            </div>
            <div>
              <span>Plan mot budsjett</span>
              <b className={`num ${over ? 'res-over' : ''}`}>{row.deviation === null ? '–' : `${overText(Math.round(row.deviation))} t`}</b>
              <small>{row.deviation === null ? 'uten budsjett' : overShareText(row.deviationShare)}</small>
            </div>
            <div>
              <span>Faktisk</span>
              <b className={`num ${row.actualDeviation !== null && row.actualDeviation < -NOISE ? 'res-over' : ''}`}>{row.actual === null ? '–' : `${whole(row.actual)} t`}</b>
              <small>{row.actual === null ? 'ikke lest inn' : `${overText(row.actualDeviation === null ? null : Math.round(row.actualDeviation))} t mot budsjett`}</small>
            </div>
          </div>
          <BudgetBars row={row} overhead={overhead} scale={Math.max(row.budget ?? 0, row.withOverhead, row.actual ?? 0) * 1.08 || 1} />
          <p className="insp-note res-staffed" title={`${hours(tagged)} t merket med prosjektet, ${hours(staffed - tagged)} t fordelt etter hva det mangler. Faste fra Bemanning og bekreftede bestillinger fra Innleid.`}>
            Bemannet {whole(staffed)} t av {whole(row.plannedTotal)} t planlagt · {remaining > NOISE ? `${whole(remaining)} t gjenstår` : 'fullt bemannet'}
          </p>
        </section>
        <section className="insp-sec">
          <h3 className="insp-h">Haller</h3>
          {row.halls.length ? (
            <>
              <div className="res-panel-halls">
                {row.halls.map((hall) => (
                  <span key={hall}>
                    <span className="res-tile" />
                    <b>{hall}</b>
                  </span>
                ))}
              </div>
              <div className="res-panel-days">
                {VENUE_PHASES.map((phase) => (
                  <span key={phase} title={PHASE_LABELS[phase]}>
                    <b className={`res-phase-chip ph-${phase}`}>{PHASE_CODES[phase]}</b>
                    <b className="num">{row.days[phase]}</b>
                  </span>
                ))}
                <small>halldager, talt én gang</small>
              </div>
            </>
          ) : (
            <p className="insp-empty">Ingen bookinger i hallkalenderen som vises i Kalender.</p>
          )}
          <div className="res-panel-days">
            <span>Snitt per dag mot faste</span>
            <StaffBars averages={averages} />
          </div>
        </section>
        <section className="insp-sec">
          <h3 className="insp-h">Per kompetanse</h3>
          {competences.length ? (
            <div className="res-competences">
              <div className="res-competence head">
                <span />
                <span>Behov mot plan</span>
                <span className="num">Plan</span>
                <span className="num">Bemannet</span>
              </div>
              {competences.map((entry) => {
                const demand = all(entry.demand)
                const planned = all(entry.planned)
                const staffing = staffedOf.get(competenceKey(entry.competence))
                const staffedHere = staffing ? all(staffing.tagged) + all(staffing.shared) : 0
                return (
                  <div key={entry.competence.toLowerCase()} className="res-competence">
                    <span className="res-competence-name">
                      <i style={{ background: colorOf(entry.competence) }} />
                      {entry.competence || '(uten kompetanse)'}
                    </span>
                    <span className="res-competence-bar" title={`Behov ${hours(demand)} t · plan ${hours(planned)} t (mont. ${hours(entry.planned.Montering)} · dem. ${hours(entry.planned.Demontering)})`}>
                      <i className="demand" style={{ width: `${(demand / widest) * 100}%` }} />
                      <i className="mon" style={{ left: 0, width: `${(entry.planned.Montering / widest) * 100}%` }} />
                      <i className="dem" style={{ left: `${(entry.planned.Montering / widest) * 100}%`, width: `${(entry.planned.Demontering / widest) * 100}%` }} />
                    </span>
                    <span className={`num ${planned < demand - NOISE ? 'warn-text' : ''}`}>{hours(planned)}</span>
                    <span className="num muted" title={staffing ? `${hours(all(staffing.tagged))} t merket, ${hours(all(staffing.shared))} t fordelt` : undefined}>
                      {staffedHere ? hours(staffedHere) : ''}
                    </span>
                  </div>
                )
              })}
              <div className="res-competence-keys muted">
                <span>
                  <i className="demand" />
                  Behov
                </span>
                <span>
                  <i className="phase-mark mon" />
                  Plan mont.
                </span>
                <span>
                  <i className="phase-mark dem" />
                  Plan dem.
                </span>
              </div>
            </div>
          ) : (
            <p className="insp-empty">Prosjektet har verken behov eller planlagte timer.</p>
          )}
          <p className="insp-note">Behov er linjene under «Planlagt» på Behov, som radene i Kalender planlegges mot. Plan er uten overhead.</p>
        </section>
      </div>
      <div className="insp-foot res-panel-foot">
        <button onClick={onOpenBehov}>
          Åpne i Behov <ChevronRight size={14} aria-hidden />
        </button>
      </div>
    </SidePanel>
  )
}
