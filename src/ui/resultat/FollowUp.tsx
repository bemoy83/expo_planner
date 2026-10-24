import type { ReactNode } from 'react'
import { periodText } from '../../domain/dates'
import { NOISE, type followUps, type SeasonRow } from '../../domain/result'
import { SidePanel } from '../common'
import { count } from '../dom'
import { hours, overHours, wholeHours } from '../format'

interface Props {
  /** What there is to follow up among the projects shown, see `followUps`. */
  follow: ReturnType<typeof followUps>
  staffedOf: (row: SeasonRow) => number
  /** Events of the hall calendar without a project number, which have no row. */
  unnumbered: number
  /** Hours staffed beyond what the projects lack. */
  unshared: number
  /** Hours staffed on demand without a project number. */
  noProject: number
  onOpen: (projectNo: string) => void
  onOpenProjects: () => void
  onClose: () => void
}

/** «Følg opp»: the projects of those shown that need the planner, by what they need. A click opens the project. */
export function FollowUp({ follow, staffedOf, unnumbered, unshared, noProject, onOpen, onOpenProjects, onClose }: Props) {
  const groups: [string, SeasonRow[], (row: SeasonRow) => ReactNode][] = [
    ['Planen går over budsjett', follow.over, (row) => <span className="num">{overHours(row.deviation)} t</span>],
    ['Faktisk over budsjett', follow.actualOver, (row) => <span className="num">{overHours(row.actualDeviation)} t</span>],
    ['Starter snart, ikke fullt bemannet', follow.soon, (row) => <span className="num">{wholeHours(row.plannedTotal - staffedOf(row))} t igjen</span>],
    ['Har budsjett, ingen plan', follow.noPlan, (row) => <span className="num">{hours(row.budget ?? 0)} t budsjett</span>],
    ['Uten budsjett', follow.noBudget, () => <span className="res-act">Sett budsjett</span>],
  ]
  const shown = groups.filter(([, list]) => list.length)
  return (
    <SidePanel
      label="Følg opp"
      className="res-panel res-rail"
      onClose={onClose}
      head={
        <>
          <div className="insp-title">Følg opp</div>
          <div className="insp-sub">Prosjekter i utvalget som trenger noe av deg</div>
        </>
      }
    >
      <div className="insp-body res-rail-body">
        {!shown.length && <p className="insp-empty">Ingenting å følge opp i dette utvalget.</p>}
        {shown.map(([title, list, right]) => (
          <section key={title}>
            <h3>{title}</h3>
            {list.map((row) => (
              <button key={row.projectNo} className="res-item" onClick={() => onOpen(row.projectNo)}>
                <span>
                  <b>{row.name || row.projectNo}</b>
                  {row.first && <small>{periodText(row.first, row.last)}</small>}
                </span>
                {right(row)}
              </button>
            ))}
          </section>
        ))}
      </div>
      {(unnumbered > 0 || unshared > NOISE || noProject > NOISE) && (
        <div className="insp-foot res-rail-foot">
          {unnumbered > 0 && (
            <p>
              {count(unnumbered, 'arrangement', 'arrangementer')} uten prosjektnummer er ikke med.{' '}
              <button className="link" onClick={onOpenProjects}>
                Gi nummer
              </button>
            </p>
          )}
          {unshared > NOISE && <p>{hours(unshared)} t er bemannet utover det prosjektene mangler.</p>}
          {noProject > NOISE && <p>{hours(noProject)} t er bemannet på behov uten prosjektnummer.</p>}
        </div>
      )}
    </SidePanel>
  )
}
