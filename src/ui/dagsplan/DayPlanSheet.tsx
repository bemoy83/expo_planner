import { Fragment } from 'react'
import { dayOfMonth, isoWeek, weekdayIndex, type ISODate } from '../../domain/dates'
import { competenceStyles } from '../../domain/competences'
import type { DayBlock, DayPlan, ProjectCard } from '../../domain/dayPlan'
import type { CompetenceKey, CompetenceStyle, Minute, Workspace } from '../../domain/types'
import { count } from '../dom'

const WEEKDAYS = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag']
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember']

const longDate = (date: ISODate) => `${WEEKDAYS[weekdayIndex(date)]} ${dayOfMonth(date)}. ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`
const shortDate = (date: ISODate) => `${WEEKDAYS[weekdayIndex(date)].slice(0, 3).toLowerCase()} ${dayOfMonth(date)}.`
/** 07, 11:30: the hour alone where it is on the hour. */
const hm = (minute: Minute) => (minute % 60 ? `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}` : String(Math.floor(minute / 60)).padStart(2, '0'))
const span = (start: Minute, end: Minute) => `${hm(start)}–${hm(end)}`

/** The track runs over the day from DAY_FROM to DAY_TO, in minutes. */
const DAY_FROM = 6 * 60
const DAY_TO = 21 * 60
const pct = (minute: Minute) => ((Math.min(DAY_TO, Math.max(DAY_FROM, minute)) - DAY_FROM) / (DAY_TO - DAY_FROM)) * 100

const COVER_TEXT = { ok: '', short: 'mangler', wait: 'venter' } as const

/** The colour a competence has, as the Kalender draws it. */
const colorOf = (styles: Map<CompetenceKey, CompetenceStyle>, key: CompetenceKey) => `var(--${styles.get(key)?.color ?? 'line-slate'})`

function Track({ blocks, styles, names }: { blocks: { block: DayBlock | { competence: CompetenceKey; start: Minute; end: Minute; hall: string; waiting?: boolean; hired?: boolean }; text?: string }[]; styles: Map<CompetenceKey, CompetenceStyle>; names: Map<CompetenceKey, string> }) {
  return (
    <div className="dp-track">
      {blocks.map(({ block, text }, i) => {
        const left = pct(block.start)
        const hired = 'hired' in block && block.hired
        const waiting = 'waiting' in block && block.waiting
        return (
          <div key={i} className={`dp-blk${hired ? ' hired' : ''}${waiting ? ' wait' : ''}`} style={{ left: `${left}%`, width: `${pct(block.end) - left}%`, ['--cc' as string]: colorOf(styles, block.competence) }}>
            {block.hall && <i>{block.hall}</i>}
            {text ?? names.get(block.competence) ?? block.competence}
          </div>
        )
      })}
    </div>
  )
}

function Card({ card, names, styles }: { card: ProjectCard; names: Map<CompetenceKey, string>; styles: Map<CompetenceKey, CompetenceStyle> }) {
  const { phase } = card
  return (
    <div className="dp-card">
      <div className="dp-card-head">
        <b>{card.name}</b>
        <span>{card.projectNo}</span>
      </div>
      <div className="dp-card-meta">
        {card.places.length > 0 && <span className="dp-pl">{card.places.join(' · ')}</span>}
        {phase && (
          <span>
            {phase.label}{' '}
            <span className="dp-dots" aria-hidden>
              {Array.from({ length: Math.min(phase.of, 10) }, (_, i) => (
                <i key={i} className={i < phase.day ? 'on' : ''} />
              ))}
            </span>{' '}
            dag {phase.day} av {phase.of}
          </span>
        )}
        {phase?.next && (
          <span>
            {phase.next.label.toLowerCase()} {shortDate(phase.next.date)}
          </span>
        )}
      </div>
      <div className="dp-cover">
        {card.coverage.map((c) => (
          <span key={c.competence} className={`dp-cv ${c.state}`}>
            <i style={{ background: colorOf(styles, c.competence) }} />
            {names.get(c.competence) ?? c.competence}
            {c.state === 'ok' ? <b aria-label="dekket">✓</b> : <em>{COVER_TEXT[c.state]}{c.waiting.length > 0 && `: ${c.waiting.join(', ')}`}</em>}
          </span>
        ))}
      </div>
      {card.notes.length > 0 && (
        <ul className="dp-notes">
          {card.notes.map((n, i) => (
            <li key={i}>
              <span>{[n.hall, names.get(n.competence) ?? n.competence].filter(Boolean).join(' · ')}</span>
              {n.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The day plan as a sheet: always the light palette, so what is printed is what is seen. */
export function DayPlanSheet({ plan, ws, printedAt, unsetCount, onSetPlaces }: { plan: DayPlan; ws: Workspace; printedAt: string; unsetCount: number; onSetPlaces?: () => void }) {
  const styles = new Map(competenceStyles(ws).map((s) => [s.key, s]))
  const names = new Map([...styles].map(([key, s]) => [key, s.label]))
  const projectName = (projectNo: string) => plan.projects.find((p) => p.projectNo === projectNo)?.name ?? 'Uten prosjekt'
  const projectsOf = (blocks: DayBlock[]) => blocks.reduce<string[]>((list, b) => (list[list.length - 1] === b.projectNo ? list : [...list, b.projectNo]), [])
  const wd = ws.settings.workday
  const head = [plan.projects.length ? count(plan.projects.length, 'prosjekt', 'prosjekter') : 'Ingen prosjekter', count(plan.fitters, 'fast', 'faste'), plan.hired ? `${plan.hired} innleide bekreftet` : '', plan.waiting ? `${plan.waiting} venter` : ''].filter(Boolean)
  return (
    <article className="dp-sheet" aria-label={`Dagsplan ${longDate(plan.date)}`}>
      <header className="dp-head">
        <h1>{longDate(plan.date)}</h1>
        <div>
          <b>Dagsplan · uke {isoWeek(plan.date)}</b>
          <span>{head.join(' · ')}</span>
        </div>
      </header>
      {unsetCount > 0 && onSetPlaces && (
        <div className="dp-setbar">
          <span>{unsetCount === 1 ? '1 sted er regnet ut, ikke satt' : `${unsetCount} steder er regnet ut, ikke satt`}</span>
          <button type="button" onClick={onSetPlaces}>
            Sett stedene
          </button>
        </div>
      )}
      {plan.projects.length > 0 && (
        <div className="dp-cards">
          {plan.projects.map((card) => (
            <Card key={card.projectNo} card={card} names={names} styles={styles} />
          ))}
        </div>
      )}
      <table className="dp-list">
        <thead>
          <tr>
            <th>Montør</th>
            <th>Arbeidsdag 06–21</th>
            <th>Tid</th>
            <th>Prosjekt</th>
          </tr>
        </thead>
        <tbody>
          {plan.rows.length === 0 && plan.unplaced.length === 0 && (
            <tr>
              <td colSpan={4} className="dp-empty">
                Ingen er satt opp denne dagen.
              </td>
            </tr>
          )}
          {plan.rows.map((row, i) => {
            if (row.kind === 'fitter') {
              const uncertain = row.blocks.some((b) => b.uncertain)
              return (
                <tr key={`f:${row.personId}`}>
                  <td className="dp-name">
                    <b>{row.name}</b>
                    {uncertain && <span className="dp-est" title="Stedet er regnet ut og kunne vært et annet">≈</span>}
                  </td>
                  <td>
                    <Track blocks={row.blocks.map((block) => ({ block }))} styles={styles} names={names} />
                  </td>
                  <td className="dp-time">{row.blocks.map((b) => span(b.start, b.end)).join(' · ')}</td>
                  <td className="dp-proj">
                    {projectsOf(row.blocks).map((no, j) => (
                      <Fragment key={j}>
                        {j > 0 && <i className="dp-arrow"> → </i>}
                        {projectName(no)}
                      </Fragment>
                    ))}
                  </td>
                </tr>
              )
            }
            return (
              <tr key={`h:${i}`} className="dp-hired">
                <td className="dp-name">
                  <b>
                    {row.name} · {count(row.people, 'pers', 'pers')}
                  </b>
                  {row.uncertain && <span className="dp-est" title="Stedet er regnet ut og kunne vært et annet">≈</span>}
                </td>
                <td>
                  <Track blocks={[{ block: { competence: row.competence, start: row.start, end: row.end, hall: row.hall, waiting: row.waiting, hired: true } }]} styles={styles} names={names} />
                </td>
                <td className="dp-time">
                  {span(row.start, row.end)} · {row.waiting ? 'venter, teller ikke før svar' : 'bekreftet'}
                </td>
                <td className="dp-proj">{projectName(row.projectNo)}</td>
              </tr>
            )
          })}
          {plan.unplaced.length > 0 && (
            <tr className="dp-band">
              <td colSpan={4}>Uten prosjekt eller sted</td>
            </tr>
          )}
          {plan.unplaced.map((p) => (
            <tr key={`u:${p.personId}`}>
              <td className="dp-name">
                <b>{p.name}</b>
              </td>
              <td>
                <Track blocks={p.blocks.map((block) => ({ block }))} styles={styles} names={names} />
              </td>
              <td className="dp-time">{p.blocks.map((b) => span(b.start, b.end)).join(' · ')} · ingen behov for kompetansen i dag</td>
              <td className="dp-proj dp-none">Uten prosjekt</td>
            </tr>
          ))}
          {plan.away.length > 0 && (
            <tr className="dp-band">
              <td colSpan={4}>Borte eller uten blokk</td>
            </tr>
          )}
          {plan.away.map((a) => (
            <tr key={`a:${a.personId}`} className="dp-off">
              <td className="dp-name">
                <b>{a.name}</b>
              </td>
              <td>
                <div className="dp-track">{a.away && <div className="dp-blk away" style={a.from !== undefined && a.to !== undefined ? { left: `${pct(a.from)}%`, width: `${pct(a.to) - pct(a.from)}%` } : { left: `${pct(wd.dayStart)}%`, width: `${pct(wd.dayEnd) - pct(wd.dayStart)}%` }}>Borte</div>}</div>
              </td>
              <td className="dp-time">{!a.away ? 'Ingen blokk' : a.from !== undefined && a.to !== undefined ? `Borte ${span(a.from, a.to)}${a.idle ? ', ingen blokk ellers' : ''}` : 'Borte hele dagen'}</td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="dp-foot">
        <span>
          Lunsj {hm(wd.breakStart)}–{hm(wd.breakEnd)} · <b className="dp-est">≈</b> sted regnet ut, kunne vært et annet · skravert: venter på svar
        </span>
        <span>Skrevet ut {printedAt}</span>
      </footer>
    </article>
  )
}

