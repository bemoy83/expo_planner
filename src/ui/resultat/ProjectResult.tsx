import { useMemo } from 'react'
import { projectHours, type PhaseHours, type SeasonRow } from '../../domain/result'
import { useWorkspace } from '../../store/workspaceStore'
import { hours } from '../behov/format'
import { SidePanel } from '../common'
import { deviationText, shareText } from './format'

const shown = (value: number) => (value ? hours(value) : '')

/** One project of Resultat: its budget against the plan, its halls, and its hours per competence and phase beside its demand. */
export function ProjectResult({ row, budget, overhead, onClose, onOpenBehov }: { row: SeasonRow; budget: number | null; overhead: string; onClose: () => void; onOpenBehov: () => void }) {
  const { workspace } = useWorkspace()
  const ws = workspace!
  const competences = useMemo(() => projectHours(ws, row.projectNo), [ws.demand, ws.allocations, ws.settings, row.projectNo]) // eslint-disable-line react-hooks/exhaustive-deps
  const other = competences.some((entry) => entry.planned.other)
  const sum = (of: (entry: (typeof competences)[number]) => PhaseHours, phase: keyof PhaseHours) => competences.reduce((total, entry) => total + of(entry)[phase], 0)
  const over = row.deviation !== null && row.deviation < -0.05

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
            {row.year && <span>{row.year}</span>}
          </div>
        </>
      }
    >
      <div className="insp-body">
        <section className="insp-sec">
          <dl className="insp-dl res-dl">
            <dt>Budsjett</dt>
            <dd className="num">{budget === null ? 'Ikke satt' : `${hours(budget)} t`}</dd>
            <dt>Planlagt</dt>
            <dd className="num">{hours(row.plannedTotal)} t</dd>
            <dt>Inkl. {overhead}</dt>
            <dd className="num">{hours(row.withOverhead)} t</dd>
            <dt>Avvik</dt>
            <dd className={`num ${over ? 'res-over' : ''}`}>{row.deviation === null ? '–' : `${deviationText(row.deviation)} t · ${shareText(row.deviationShare)}`}</dd>
          </dl>
        </section>
        <section className="insp-sec">
          <h3 className="insp-h">Haller</h3>
          {row.halls.length ? (
            <dl className="insp-dl res-dl">
              <dt>Haller</dt>
              <dd>{row.halls.join(', ')}</dd>
              <dt>Halldager</dt>
              <dd className="num">
                {row.days.assembly} mont. · {row.days.event} arr. · {row.days.dismantle} dem.
              </dd>
            </dl>
          ) : (
            <p className="insp-empty">Ingen bookinger i hallkalenderen som vises i Kalender.</p>
          )}
        </section>
        <section className="insp-sec res-hours">
          <h3 className="insp-h">Timer per kompetanse</h3>
          {competences.length ? (
            <table className="ledger summary">
              <thead>
                <tr>
                  <th rowSpan={2}>Kompetanse</th>
                  <th colSpan={2}>Montering</th>
                  <th colSpan={2}>Demontering</th>
                  {other && <th rowSpan={2} title="Planlagt på rader uten arbeidsfase">Uten fase</th>}
                </tr>
                <tr className="sub">
                  <th title="Behovet under «Planlagt» på Behov">Behov</th>
                  <th title="Planlagt i Kalender, FTE × normaltid">Plan</th>
                  <th title="Behovet under «Planlagt» på Behov">Behov</th>
                  <th title="Planlagt i Kalender, FTE × normaltid">Plan</th>
                </tr>
              </thead>
              <tbody>
                {competences.map((entry) => (
                  <tr key={entry.competence.toLowerCase()}>
                    <td>{entry.competence || '(uten kompetanse)'}</td>
                    <td className="num">{shown(entry.demand.Montering)}</td>
                    <td className="num planned">{shown(entry.planned.Montering)}</td>
                    <td className="num">{shown(entry.demand.Demontering)}</td>
                    <td className="num planned">{shown(entry.planned.Demontering)}</td>
                    {other && <td className="num planned">{shown(entry.planned.other)}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Sum</td>
                  <td className="num">{shown(sum((entry) => entry.demand, 'Montering'))}</td>
                  <td className="num planned">{shown(sum((entry) => entry.planned, 'Montering'))}</td>
                  <td className="num">{shown(sum((entry) => entry.demand, 'Demontering'))}</td>
                  <td className="num planned">{shown(sum((entry) => entry.planned, 'Demontering'))}</td>
                  {other && <td className="num planned">{shown(sum((entry) => entry.planned, 'other'))}</td>}
                </tr>
              </tfoot>
            </table>
          ) : (
            <p className="insp-empty">Prosjektet har verken behov eller planlagte timer.</p>
          )}
          <p className="insp-note">Behov er linjene under «Planlagt» på Behov, som radene i Kalender planlegges mot. Plan er uten overhead.</p>
        </section>
      </div>
      <div className="insp-foot">
        <button onClick={onOpenBehov}>Åpne prosjektet i Behov</button>
      </div>
    </SidePanel>
  )
}
