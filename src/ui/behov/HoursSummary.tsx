import { useMemo } from 'react'
import { PLANNED_BASIS } from '../../domain/types'
import { useWorkspace } from '../../store/workspaceStore'
import { SidePanel } from '../common'
import { hours } from './format'


/** The hours of a project per competence and basis, Visma and own lines together: what the Kalender rows pick from. */
export function HoursSummary({ projectNo, projectName, onClose }: { projectNo: string; projectName: string; onClose: () => void }) {
  const { workspace } = useWorkspace()
  const demand = workspace!.demand
  const summary = useMemo(() => {
    const bases = new Set<string>()
    const byCompetence = new Map<string, Map<string, [number, number]>>()
    for (const line of demand) {
      if (line.projectNo !== projectNo || (!line.assemblyHours && !line.dismantleHours)) continue
      bases.add(line.basis)
      const row = byCompetence.get(line.competence) ?? new Map<string, [number, number]>()
      const cell = row.get(line.basis) ?? [0, 0]
      row.set(line.basis, [cell[0] + line.assemblyHours, cell[1] + line.dismantleHours])
      byCompetence.set(line.competence, row)
    }
    const order = [...bases].sort((a, b) => (a === PLANNED_BASIS ? -1 : b === PLANNED_BASIS ? 1 : a.localeCompare(b, 'nb')))
    return { bases: order, rows: [...byCompetence].sort((a, b) => a[0].localeCompare(b[0], 'nb')) }
  }, [demand, projectNo])
  return (
    <SidePanel
      label="Timer per kompetanse"
      className="hours-summary"
      onClose={onClose}
      head={
        <>
          <div className="insp-title">Timer per kompetanse</div>
          <div className="insp-sub">
            <span className="insp-trunc">{projectName}</span>
            <span className="project-no">{projectNo}</span>
          </div>
        </>
      }
    >
      <div className="insp-body">
        <section className="insp-sec">
          <p className="insp-note">Radene i Kalender henter behov herfra. «{PLANNED_BASIS}» er tallene du planlegger med; Visma-linjer som ikke er med står under sitt eget grunnlag.</p>
        </section>
        <section className="insp-sec">
          {summary.rows.length ? (
            <table className="ledger summary">
              <thead>
                <tr>
                  <th>Kompetanse</th>
                  {summary.bases.map((b) => (
                    <th key={b} colSpan={2} className={b === PLANNED_BASIS ? 'planned' : ''}>
                      {b || '(uten grunnlag)'}
                    </th>
                  ))}
                </tr>
                <tr className="sub">
                  <th />
                  {summary.bases.flatMap((b) => [<th key={`${b}m`}>Mont.</th>, <th key={`${b}d`}>Dem.</th>])}
                </tr>
              </thead>
              <tbody>
                {summary.rows.map(([competence, cells]) => (
                  <tr key={competence}>
                    <td>{competence || '(uten kompetanse)'}</td>
                    {summary.bases.flatMap((b) => {
                      const cell = cells.get(b)
                      return [
                        <td key={`${b}m`} className={`num ${b === PLANNED_BASIS ? 'planned' : ''}`}>
                          {cell ? hours(cell[0]) : ''}
                        </td>,
                        <td key={`${b}d`} className={`num ${b === PLANNED_BASIS ? 'planned' : ''}`}>
                          {cell ? hours(cell[1]) : ''}
                        </td>,
                      ]
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="insp-empty">Ingen timer registrert for prosjektet.</p>
          )}
        </section>
      </div>
    </SidePanel>
  )
}
