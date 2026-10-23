import type { CSSProperties } from 'react'
import { NOISE, type dayAverages, type SeasonRow } from '../../domain/result'
import { hours } from '../behov/format'
import { deviationText, overShareText, overText, percentText, shareText } from './format'

/** What the bars of a project, or of the sum of several, are drawn from. */
type Bars = Pick<SeasonRow, 'name' | 'budget' | 'withOverhead' | 'plannedTotal' | 'actual'>

/** Where the budget stands on a bar of the list, as a share of its width: each project is scaled to its own budget. */
const BUDGET_AT = 0.75

const pct = (share: number) => `${Math.max(0, Math.min(1, share)) * 100}%`

/** The numbers behind the bars, for their tooltip. */
const barsTitle = (row: Bars, overhead: number): string => {
  const lines = [row.name || 'Uten navn', `Plan inkl. ${percentText(overhead)}: ${row.withOverhead ? `${hours(row.withOverhead)} t (${hours(row.plannedTotal)} t uten)` : 'ingen plan'}`]
  if (row.actual !== null) lines.push(`Faktisk: ${hours(row.actual)} t`)
  lines.push(`Budsjett: ${row.budget === null ? 'ikke satt' : `${hours(row.budget)} t`}`)
  if (row.budget !== null) {
    const share = (used: number) => overShareText(row.budget ? (row.budget - used) / row.budget : null)
    if (row.withOverhead) lines.push(`Plan ${overText(row.budget - row.withOverhead)} t mot budsjett (${share(row.withOverhead)})`)
    if (row.actual !== null) lines.push(`Faktisk ${overText(row.budget - row.actual)} t mot budsjett (${share(row.actual)})`)
    if (row.withOverhead > row.budget + NOISE || (row.actual ?? 0) > row.budget + NOISE) lines.push('Oransje viser timene over budsjett')
  }
  if (row.actual !== null && row.withOverhead) lines.push(`Faktisk ${deviationText(row.actual - row.withOverhead)} t mot plan (${shareText((row.actual - row.withOverhead) / row.withOverhead)})`)
  return lines.join('\n')
}

/**
 * The plan with overhead, and the actual hours where there are any, as two thin bars against the budget, which is a
 * tick through both; what is over the budget is orange. In the list a bar is scaled to the project's own budget, so the
 * tick stands at the same place in every row; `scale` gives one scale in hours instead, for the panel of one project.
 */
export function BudgetBars({ row, overhead, scale }: { row: Bars; overhead: number; scale?: number }) {
  const reference = row.budget ?? Math.max(row.withOverhead, row.actual ?? 0, 1)
  const at = (value: number) => (scale ? value / scale : (value / reference) * BUDGET_AT)
  const bar = (value: number, kind: 'plan' | 'actual') => {
    const over = row.budget !== null && value > row.budget + NOISE
    return (
      <span className={`res-line ${kind}`}>
        <i className="fill" style={{ width: pct(at(over ? row.budget! : value)) }} />
        {over && <i className="over" style={{ left: pct(at(row.budget!)), width: pct(at(value) - at(row.budget!)) }} />}
        {at(value) > 1 && <i className="past" />}
      </span>
    )
  }
  return (
    <div className={`res-bars ${scale ? 'big' : ''}`} title={barsTitle(row, overhead)}>
      {bar(row.withOverhead, 'plan')}
      {row.actual !== null && bar(row.actual, 'actual')}
      {row.budget !== null && <i className="tick" style={{ left: pct(at(row.budget)) }} />}
      {!row.withOverhead && row.budget === null && <span className="res-bars-none">Ingen plan</span>}
    </div>
  )
}

const WORK: { key: 'assembly' | 'dismantle'; label: string }[] = [
  { key: 'assembly', label: 'Montering' },
  { key: 'dismantle', label: 'Demontering' },
]

/**
 * The planned hours per day of build-up and of tear-down against what the permanent staff can work on those days: a bar
 * from the line of the staff, to the right and orange where the plan needs more than they cover, to the left where
 * they are not filled.
 */
export function StaffBars({ averages }: { averages: ReturnType<typeof dayAverages> }) {
  return (
    <span className="res-staff">
      {WORK.map(({ key, label }) => {
        const { planned, staff } = averages[key]
        if (planned === null) {
          return (
            <span key={key} className="res-staff-line">
              <i className={`res-diverge ${key}`} />
              <span className="num">–</span>
            </span>
          )
        }
        const gap = planned - (staff ?? 0)
        const share = staff ? Math.max(-1, Math.min(1, gap / staff)) : gap > NOISE ? 1 : 0
        const up = gap > NOISE
        const title = `${label}: ${hours(planned)} t planlagt per dag · faste kan ${hours(staff ?? 0)} t\n${
          Math.abs(gap) < 1 ? 'Går opp med de faste' : up ? `${hours(gap)} t mer enn de faste kan: trenger innleie eller overtid` : `${hours(-gap)} t mindre enn de faste kan: de faste er ikke fylt`
        }`
        const style: CSSProperties = up ? { left: '50%', width: `${share * 50}%` } : { right: '50%', width: `${-share * 50}%` }
        return (
          <span key={key} className="res-staff-line" title={title}>
            <i className={`res-diverge ${key}`}>
              <i className={up ? 'up' : 'down'} style={style} />
            </i>
            <span className={`num ${up ? 'res-over' : ''}`}>{hours(Math.round(planned))}</span>
          </span>
        )
      })}
    </span>
  )
}
