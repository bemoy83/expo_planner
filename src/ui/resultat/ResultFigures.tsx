import type { ReactNode } from 'react'
import { NOISE, type seasonSummary, type SeasonRow } from '../../domain/result'
import { count } from '../dom'
import { overHours, overShareText, percentText, wholeOrDash as whole } from '../format'

function Figure({ label, value, unit = 't', sub, over, children }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; over?: boolean; children?: ReactNode }) {
  return (
    <div className="res-figure">
      <span className="res-figure-label">{label}</span>
      <b className={over ? 'res-over' : undefined}>
        {value}
        {unit && <small>{unit}</small>}
      </b>
      {children}
      {sub && <span className="res-figure-sub">{sub}</span>}
    </div>
  )
}

/** A share as a thin bar, in the colour of what is over where it is. */
const Meter = ({ share, over, title }: { share: number; over?: boolean; title?: string }) => (
  <div className={`bar ${over ? 'over' : ''}`} title={title}>
    <i className="share" style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} />
  </div>
)

/** The six figures over the matrix, for the projects shown: budget, plan, plan against budget, hours per day, staffed and actual. */
export function ResultFigures({ rows, summary, overhead, staffedOf }: { rows: SeasonRow[]; summary: ReturnType<typeof seasonSummary>; overhead: number; staffedOf: (row: SeasonRow) => number }) {
  const { totals, averages, staff } = summary
  const staffed = rows.reduce((sum, row) => sum + staffedOf(row), 0)
  const over = totals.deviation !== null && totals.deviation < -NOISE
  return (
    <div className="res-figures">
      <Figure label="Budsjett" value={whole(totals.budget)} sub={`${totals.budgeted} av ${count(totals.projects, 'prosjekt', 'prosjekter')} har budsjett`} />
      <Figure label={`Planlagt inkl. ${percentText(overhead)}`} value={whole(totals.withOverhead)} sub={`${whole(totals.plannedTotal)} t uten overhead`}>
        {totals.budget > 0 && <Meter share={totals.budgetedWithOverhead / totals.budget} over={over} title="Planlagt inkl. overhead mot budsjett, for prosjektene med budsjett" />}
      </Figure>
      <Figure label="Plan mot budsjett" value={totals.deviation === null ? '–' : overHours(totals.deviation)} over={over} sub={totals.deviation === null ? 'Ingen budsjetter' : overShareText(totals.deviationShare)} />
      <Figure
        label="Snitt per halldag"
        unit=""
        value={
          <span className="res-figure-pair">
            <span title="Planlagte timer til montering per monteringsdag">
              <i className="phase-mark mon" />
              {whole(averages.assembly.planned)}
            </span>
            <span title="Planlagte timer til demontering per demonteringsdag">
              <i className="phase-mark dem" />
              {whole(averages.dismantle.planned)}
            </span>
          </span>
        }
        sub={staff === null ? 'Ingen monterings- eller demonteringsdager' : `Faste kan ${whole(staff)} t per dag`}
      />
      <Figure label="Bemannet" value={whole(staffed)} sub={`${whole(Math.max(0, totals.plannedTotal - staffed))} t gjenstår av planen`}>
        {totals.plannedTotal > 0 && <Meter share={staffed / totals.plannedTotal} title="Bemannet mot planlagt, uten overhead" />}
      </Figure>
      {totals.actuals ? (
        <Figure
          label={`Faktisk · ${count(totals.actuals, 'prosjekt', 'prosjekter')}`}
          value={whole(totals.actual)}
          over={totals.actualDeviation !== null && totals.actualDeviation < -NOISE}
          sub={`${overHours(totals.actualDeviation)} t mot budsjett`}
        />
      ) : (
        <div className="res-figure empty">
          <span className="res-figure-label">Faktisk</span>
          <span className="res-figure-sub">Ingen faktiske timer lest inn.</span>
        </div>
      )}
    </div>
  )
}
