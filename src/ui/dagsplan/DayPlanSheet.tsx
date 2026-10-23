import { Fragment } from 'react'
import { formatFte } from '../../domain/calc'
import { isoWeek } from '../../domain/dates'
import { competenceStyles } from '../../domain/competences'
import type { DayBlock, DayCompetenceGroup, DayPlan, DayWork, ProjectCard } from '../../domain/dayPlan'
import type { CompetenceKey, CompetenceStyle, Minute, Workspace } from '../../domain/types'
import { count } from '../dom'
import { colorOf, hm, longDate, shortDate, span } from './format'

/** The track runs over the day from DAY_FROM to DAY_TO, in minutes. */
const DAY_FROM = 6 * 60
const DAY_TO = 21 * 60
const pct = (minute: Minute) => ((Math.min(DAY_TO, Math.max(DAY_FROM, minute)) - DAY_FROM) / (DAY_TO - DAY_FROM)) * 100

const COVER_TEXT = { ok: '', short: 'mangler', wait: 'venter' } as const
const GROUP_STATE = { ok: 'dekket', short: 'mangler', wait: 'venter' } as const

/** People as whole days, with one decimal where they are not: «8 pers», «4,6 pers». */
const peopleText = (people: number) => `${formatFte(Math.round(people * 10) / 10, 1) || '0'} pers`

function Track({ blocks, styles, names }: { blocks: { block: DayBlock | { competence: CompetenceKey; start: Minute; end: Minute; hall: string; waiting?: boolean; hired?: boolean }; text?: string; ghost?: boolean }[]; styles: Map<CompetenceKey, CompetenceStyle>; names: Map<CompetenceKey, string> }) {
  return (
    <div className="dp-track">
      {blocks.map(({ block, text, ghost }, i) => {
        const left = pct(block.start)
        const hired = 'hired' in block && block.hired
        const waiting = 'waiting' in block && block.waiting
        return (
          <div key={i} className={`dp-blk${hired ? ' hired' : ''}${waiting ? ' wait' : ''}${ghost ? ' ghost' : ''}`} style={{ left: `${left}%`, width: `${pct(block.end) - left}%`, ['--cc' as string]: colorOf(styles, block.competence) }}>
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

/** Units as they are written on a sheet. */
const UNIT_TEXT: Record<string, string> = { m2: 'm²', m3: 'm³' }

/** What a competence is to do in a place: «Systemvegg 150 lm · Dragere 14 stk +1 til», and the day's share of the phase. */
function WorkLine({ work }: { work: DayWork }) {
  const items = work.items.map((item) => [item.productType, item.quantity === null ? '' : `${formatFte(item.quantity, 1)} ${UNIT_TEXT[item.unit.toLowerCase()] ?? item.unit}`].filter(Boolean).join(' '))
  return (
    <span className="dp-work">
      {items.join(' · ')}
      {work.more > 0 && <span className="dp-more"> +{work.more} til</span>}
      {work.share !== null && <span className="dp-share" title="Dagens planlagte FTE av fasens: hvor mye av fasens arbeid planen legger på dagen. Mengdene gjelder hele fasen.">ca. {Math.round(work.share * 100)} % i dag</span>}
    </span>
  )
}

/** A competence's head in a place: its people as whole days, what waits, and how far the project's hours of it are covered. */
function GroupHead({ group, names, styles }: { group: DayCompetenceGroup; names: Map<CompetenceKey, string>; styles: Map<CompetenceKey, CompetenceStyle> }) {
  return (
    <tr className="dp-comp">
      <td colSpan={3}>
        <i style={{ background: colorOf(styles, group.competence) }} />
        <b>{names.get(group.competence) ?? group.competence}</b>
        <span className="dp-count">
          {peopleText(group.people)}
          {group.waiting > 0 && ` + ${group.waiting} venter`}
        </span>
        {group.work && <WorkLine work={group.work} />}
        {group.state && <em className={`dp-state ${group.state}`}>{GROUP_STATE[group.state]}</em>}
      </td>
    </tr>
  )
}

/** The day plan as a sheet: always the light palette, so what is printed is what is seen. */
export function DayPlanSheet({ plan, ws, printedAt, unsetCount, onSetPlaces }: { plan: DayPlan; ws: Workspace; printedAt: string; unsetCount: number; onSetPlaces?: () => void }) {
  const styles = new Map(competenceStyles(ws).map((s) => [s.key, s]))
  const names = new Map([...styles].map(([key, s]) => [key, s.label]))
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
            <th>Tid her</th>
          </tr>
        </thead>
        <tbody>
          {plan.groups.length === 0 && plan.unplaced.length === 0 && (
            <tr>
              <td colSpan={3} className="dp-empty">
                Ingen er satt opp denne dagen.
              </td>
            </tr>
          )}
          {plan.groups.map((place) => (
            <Fragment key={`${place.projectNo}|${place.hall}`}>
              <tr className="dp-place">
                <td colSpan={3}>
                  {place.hall && <span className="dp-pl">{place.hall}</span>}
                  {place.name}
                </td>
              </tr>
              {place.competences.map((group) => (
                <Fragment key={group.competence}>
                  <GroupHead group={group} names={names} styles={styles} />
                  {group.entries.map((entry, i) =>
                    entry.kind === 'fitter' ? (
                      <tr key={`f:${entry.personId}`} className={entry.later ? 'dp-later' : undefined}>
                        <td className="dp-name">
                          <b>{entry.name}</b>
                          {entry.here.some((at) => entry.blocks[at].uncertain) && <span className="dp-est" title="Stedet er regnet ut og kunne vært et annet">≈</span>}
                        </td>
                        <td>
                          <Track blocks={entry.blocks.map((block, at) => ({ block, ghost: !entry.here.includes(at) }))} styles={styles} names={names} />
                        </td>
                        <td className="dp-time">{entry.here.map((at) => span(entry.blocks[at].start, entry.blocks[at].end)).join(' · ')}</td>
                      </tr>
                    ) : (
                      <tr key={`h:${i}`} className="dp-hired">
                        <td className="dp-name">
                          <b>
                            {entry.name} · {count(entry.people, 'pers', 'pers')}
                          </b>
                          {entry.uncertain && <span className="dp-est" title="Stedet er regnet ut og kunne vært et annet">≈</span>}
                        </td>
                        <td>
                          <Track blocks={[{ block: { competence: entry.competence, start: entry.start, end: entry.end, hall: entry.hall, waiting: entry.waiting, hired: true } }]} styles={styles} names={names} />
                        </td>
                        <td className="dp-time">
                          {span(entry.start, entry.end)} · {entry.waiting ? 'venter, teller ikke før svar' : 'bekreftet'}
                        </td>
                      </tr>
                    ),
                  )}
                </Fragment>
              ))}
            </Fragment>
          ))}
          {plan.unplaced.length > 0 && (
            <tr className="dp-band">
              <td colSpan={3}>Uten prosjekt eller sted</td>
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
            </tr>
          ))}
          {plan.away.length > 0 && (
            <tr className="dp-band">
              <td colSpan={3}>Borte eller uten blokk</td>
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
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="dp-foot">
        <span>
          Lunsj {hm(wd.breakStart)}–{hm(wd.breakEnd)} · fylt: denne gruppen, omriss: resten av dagen · strek foran navnet: senere del av dagen · <b className="dp-est">≈</b> sted regnet ut, kunne vært et annet · skravert: venter på svar · antall = timer ÷ normaldag
        </span>
        <span>Skrevet ut {printedAt}</span>
      </footer>
    </article>
  )
}

