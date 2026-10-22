import { competenceStyles } from '../../domain/competences'
import { isoWeek, dayOfMonth, weekdayIndex } from '../../domain/dates'
import type { VenuePhase, Workspace } from '../../domain/types'
import { PHASE_LABELS } from '../../domain/venue'
import type { WeekBar, WeekPlan } from '../../domain/weekPlan'
import { count } from '../dom'
import { colorOf, MONTHS, WEEKDAYS } from './format'

const DAY_NAMES = WEEKDAYS.map((d) => d.slice(0, 3))
/** The class of a phase's stretch, for its colour. */
const PHASE_CLASS: Record<VenuePhase, string> = { assembly: 'up', movingIn: 'mi', event: 'ev', movingOut: 'mo', dismantle: 'dn' }

/** A flag's days as «tir», «tir–ons» or «tor og fre»: the first and last of a run, else the days one by one. */
const daysText = (days: number[], names: string[]) => {
  const run = days.every((d, i) => i === 0 || d === days[i - 1] + 1)
  return days.length > 2 && run ? `${names[days[0]].toLowerCase()}–${names[days[days.length - 1]].toLowerCase()}` : days.map((d) => names[d].toLowerCase()).join(' og ')
}

/** The shared week plan as a sheet, A4 landscape: the same palette as the day plan, the colours of the Kalender. */
export function WeekPlanSheet({ plan, ws, printedAt }: { plan: WeekPlan; ws: Workspace; printedAt: string }) {
  const styles = new Map(competenceStyles(ws).map((s) => [s.key, s]))
  const label = (key: string) => styles.get(key)?.label ?? key
  const first = plan.dates[0]
  const last = plan.dates[6]
  const range = `${dayOfMonth(first)}. ${MONTHS[Number(first.slice(5, 7)) - 1].slice(0, 3)} – ${dayOfMonth(last)}. ${MONTHS[Number(last.slice(5, 7)) - 1].slice(0, 3)} ${last.slice(0, 4)}`
  const bar = (b: WeekBar, project: string, placed: boolean) => (
    <div className="wp-row" key={`${project}|${b.competence}`}>
      <span className="wp-lbl">{label(b.competence)}</span>
      {b.runs.map((run, i) => (
        <span key={run.from} className="wp-bar" style={{ gridColumn: `${run.from + 2} / ${run.to + 3}`, ['--cc' as string]: colorOf(styles, b.competence) }}>
          {i === 0 && placed && b.halls.map((hall) => <i key={hall} className="dp-pl">{hall}</i>)}
          {i === 0 && b.avdelinger.join(' · ')}
          {b.flags
            .filter((f) => f.days[0] >= run.from && f.days[0] <= run.to)
            .map((f) => (
              <em key={f.state} className={`wp-flag ${f.state}`}>
                {f.state === 'short' ? 'mangler' : 'venter'} {daysText(f.days, DAY_NAMES)}
              </em>
            ))}
        </span>
      ))}
    </div>
  )
  const empty = plan.projects.length === 0 && plan.without.length === 0
  return (
    <article className="dp-sheet dp-week" aria-label={`Ukeplan uke ${isoWeek(first)}`}>
      <header className="dp-head">
        <h1>Uke {isoWeek(first)}</h1>
        <div>
          <b>{range}</b>
          <span>{plan.projects.length ? count(plan.projects.length, 'prosjekt', 'prosjekter') : 'Ingen prosjekter'}</span>
        </div>
      </header>
      {empty ? (
        <p className="dp-empty">Ingenting er planlagt denne uken.</p>
      ) : (
        <div className="wp-grid">
          <span />
          {plan.dates.map((d) => (
            <span key={d} className={`wp-day${weekdayIndex(d) >= 5 ? ' we' : ''}`}>
              {DAY_NAMES[weekdayIndex(d)]} {dayOfMonth(d)}
            </span>
          ))}
          {plan.projects.map((p) => (
            <section key={p.projectNo} className="wp-proj">
              <h2>
                <b>{p.name}</b>
                <span>{p.projectNo}</span>
              </h2>
              {p.phases.length > 0 && (
                <div className="wp-row">
                  <span className="wp-lbl wp-fase">Fase</span>
                  {p.phases.map((ph) => (
                    <span key={`${ph.phase}${ph.from}`} className={`wp-phase ${PHASE_CLASS[ph.phase]}`} style={{ gridColumn: `${ph.from + 2} / ${ph.to + 3}` }}>
                      {PHASE_LABELS[ph.phase]}
                      {ph.phase === 'event' ? '' : ph.from === ph.to ? ` · dag ${ph.day} av ${ph.of}` : ` · dag ${ph.day}–${Math.min(ph.of, ph.day + ph.to - ph.from)} av ${ph.of}`}
                    </span>
                  ))}
                </div>
              )}
              {p.bars.map((b) => bar(b, p.projectNo, p.places.length >= 2))}
            </section>
          ))}
          {plan.without.length > 0 && (
            <section className="wp-proj">
              <h2>
                <b>Uten prosjekt</b>
                <span>arbeid som ikke er knyttet til noe prosjekt</span>
              </h2>
              {plan.without.map((b) => bar(b, '', false))}
            </section>
          )}
        </div>
      )}
      {plan.attention.length > 0 && (
        <div className="wp-attn">
          {(['short', 'wait'] as const).map((state) => {
            const list = plan.attention.filter((a) => a.state === state)
            if (!list.length) return null
            return (
              <p key={state}>
                <b className={state}>{state === 'short' ? 'Mangler' : 'Venter på svar'}</b>
                {list.map((a, i) => (
                  <span key={i}>
                    {a.projectName} · {label(a.competence)} {daysText(a.days, DAY_NAMES)}
                  </span>
                ))}
              </p>
            )
          })}
        </div>
      )}
      <footer className="dp-foot">
        <span>
          Stolpen går fra første til siste dag med arbeid · <b className="wp-short">mangler</b> faste og bekreftede dekker ikke behovet · <b className="wp-wait">venter</b> bestilt, ikke bekreftet
        </span>
        <span>Skrevet ut {printedAt}</span>
      </footer>
    </article>
  )
}
