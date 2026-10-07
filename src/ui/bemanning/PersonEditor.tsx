import type { ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import type { PersonWeek } from '../../domain/staffing'
import type { CompetenceStyle, Person, Workspace } from '../../domain/types'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { TimeTrack, WEEK_HOUR_PX, type AssignmentChange } from './TimeTrack'
import type { Tool } from './tools'
import { hoursText } from './week'

const EPSILON = 0.05

/** What an open person tells the grid; the handlers keep their identity (see `useStableActions`). */
export interface EditorActions {
  change: (change: AssignmentChange) => void
  pickBrush: (competence: string) => void
  fold: (personId: string) => void
  step: (delta: number) => void
  focusDate: (date: ISODate) => void
  dayMenu: (personId: string, date: ISODate, event: React.MouseEvent) => void
  /** The pointer came in over the open person. */
  enter: () => void
}

interface Props {
  ws: Workspace
  person: Person
  dates: ISODate[]
  week: PersonWeek
  /** The person's competences, each with the key it is picked with (0 for none). */
  competences: { style: CompetenceStyle; key: number }[]
  styles: Map<string, CompetenceStyle>
  brush: string | null
  tool: Tool
  focusDate: ISODate
  actions: EditorActions
}

function QuickPick({ competences, brush, actions, long }: Pick<Props, 'competences' | 'brush' | 'actions'> & { long: boolean }) {
  return (
    <span className={`bm-quick ${long ? 'long' : ''}`}>
      {competences.map(({ style, key }) => (
        <button
          key={style.key}
          className={brush === style.key ? 'on' : ''}
          aria-pressed={brush === style.key}
          style={{ '--cc': `var(--${style.color})` } as React.CSSProperties}
          title={brush === style.key ? 'Slå av pensel (Esc)' : `Mal med ${style.label}${key ? ` (${key})` : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            actions.pickBrush(style.key)
          }}
        >
          <i className="swatch" />
          {long ? style.label : style.shortLabel}
          {long && key > 0 && <kbd>{key}</kbd>}
        </button>
      ))}
    </span>
  )
}

const dayClass = (date: ISODate, index: number, focusDate: ISODate) => `${index >= 5 ? 'narrow' : ''} ${dayType(date) !== 'arbeidsdag' ? 'off-day' : ''} ${date === focusDate ? 'focus-day' : ''}`

/** The week editor: one person's week with the whole day down the page, 06 to 21, where overtime is drawn. */
export function WeekEditor({ ws, person, dates, week, competences, styles, brush, tool, focusDate, actions }: Props) {
  const wd = ws.settings.workday
  const hours: number[] = []
  for (let hour = Math.ceil(wd.overtimeEarliest / 60); hour * 60 <= wd.overtimeLatest; hour++) hours.push(hour)
  const height = ((wd.overtimeLatest - wd.overtimeEarliest) / 60) * WEEK_HOUR_PX
  return (
    <div className="bm-row bm-week-editor" style={{ '--bm-track-h': `${height}px` } as React.CSSProperties} onMouseEnter={actions.enter}>
      <div className="bm-label">
        <div className="bm-editor-info">
          <button className="bm-editor-head" aria-expanded title="Fold sammen (E)" onClick={() => actions.fold(person.id)}>
            <ChevronDown size={14} aria-hidden />
            <span className="bm-name">{person.name}</span>
          </button>
          <QuickPick competences={competences} brush={brush} actions={actions} long />
          <dl>
            <dt>Normaltid</dt>
            <dd>
              {hoursText(week.normal)} / {hoursText(week.capacity)} t
            </dd>
            <dt>Overtid</dt>
            <dd className={week.overtime > EPSILON ? 'has' : ''}>{hoursText(week.overtime)} t</dd>
          </dl>
          <span className="bm-editor-step">
            <button className="row-action" aria-label="Forrige person" title="Forrige person (↑)" onClick={() => actions.step(-1)}>
              <ChevronUp size={14} aria-hidden />
            </button>
            <button className="row-action" aria-label="Neste person" title="Neste person (↓)" onClick={() => actions.step(1)}>
              <ChevronDown size={14} aria-hidden />
            </button>
          </span>
          <span className="bm-editor-hint">Dra en blokk forbi {String(wd.dayEnd / 60).padStart(2, '0')}:00 for overtid</span>
        </div>
        <div className="bm-axis">
          {hours.map((hour) => (
            <span key={hour} className={hour * 60 === wd.dayStart || hour * 60 === wd.dayEnd ? 'day-edge' : ''} style={{ top: `${((hour * 60 - wd.overtimeEarliest) / (wd.overtimeLatest - wd.overtimeEarliest)) * 100}%` }}>
              {String(hour).padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>
      {dates.map((date, index) => (
        <div key={date} className={`bm-cell bm-editor-cell ${dayClass(date, index, focusDate)}`} onContextMenu={(e) => actions.dayMenu(person.id, date, e)}>
          <TimeTrack ws={ws} person={person} date={date} layout="week" narrow={index >= 5} styles={styles} brush={brush} tool={tool} onChange={actions.change} onTouch={actions.focusDate} />
        </div>
      ))}
    </div>
  )
}

/** The row timeline: a person's normal days side by side, each a track from the start to the end of the day. */
export function TimelineRow({ ws, person, dates, week, competences, styles, brush, tool, focusDate, actions }: Props) {
  const wd = ws.settings.workday
  const hours: number[] = []
  for (let hour = wd.dayStart / 60; hour * 60 <= wd.dayEnd; hour++) hours.push(hour)
  const share = week.capacity ? Math.min(1, week.normal / week.capacity) * 100 : 0
  return (
    <div className="bm-row bm-timeline-row" onMouseEnter={actions.enter}>
      <div className="bm-label bm-person-label" onClick={() => actions.fold(person.id)}>
        <button className="row-action" aria-expanded aria-label="Fold sammen" title="Fold sammen (E)">
          <ChevronDown size={14} aria-hidden />
        </button>
        <span className="bm-person-name">
          <span className="bm-name">{person.name}</span>
          <QuickPick competences={competences} brush={brush} actions={actions} long={false} />
        </span>
        <span className="bm-person-week">
          <span>
            <b>{hoursText(week.normal)}</b>/{hoursText(week.capacity)}
            {week.overtime > EPSILON && <em> +{hoursText(week.overtime)}</em>}
          </span>
          <i>
            <i style={{ width: `${share}%` }} />
          </i>
        </span>
      </div>
      {dates.map((date, index) => (
        <div key={date} className={`bm-cell bm-editor-cell ${dayClass(date, index, focusDate)}`} onContextMenu={(e) => actions.dayMenu(person.id, date, e)}>
          {dayType(date) !== 'arbeidsdag' ? (
            <span className="bm-overtime-only">Overtid i ukevisning</span>
          ) : (
            <>
              <span className="bm-ruler">
                {hours.map((hour) => (
                  <span key={hour} style={{ left: `${((hour * 60 - wd.dayStart) / (wd.dayEnd - wd.dayStart)) * 100}%` }}>
                    {String(hour).padStart(2, '0')}
                  </span>
                ))}
              </span>
              <TimeTrack ws={ws} person={person} date={date} layout="row" styles={styles} brush={brush} tool={tool} onChange={actions.change} onTouch={actions.focusDate} />
            </>
          )}
        </div>
      ))}
    </div>
  )
}
