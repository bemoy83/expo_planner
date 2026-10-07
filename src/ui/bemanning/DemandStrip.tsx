import { useEffect, useState, type ReactNode } from 'react'
import { dayOfMonth, todayIso, type ISODate } from '../../domain/dates'
import { dayType, holidayName } from '../../domain/holidays'
import type { Balance, FreeCapacity } from '../../domain/staffing'
import type { CompetenceStyle } from '../../domain/types'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import { competenceColor } from '../dom'
import { dayClass as dayClassOf, EPSILON, hoursText, weekLabel, weekRange, WEEKDAYS_LONG } from './week'

interface Props {
  dates: ISODate[]
  /** The competences shown, in order, each with the key it is picked with (0 for none). */
  competences: { style: CompetenceStyle; key: number }[]
  balance: Balance
  /** By `competence|date`: the remaining hours the people with the competence have no free normal time for. */
  uncoverable: Map<string, number>
  capacity: FreeCapacity[]
  focusDate: ISODate
  onFocusDate: (date: ISODate) => void
  folded: boolean
  onToggleFolded: () => void
  /** The competence in focus, if any. */
  brush: string | null
  onPick: (competence: string) => void
  /** Hours the stroke under the pointer would add for the brush, by date. */
  preview: Map<ISODate, number>
  /** A click on a day of a demand line. */
  onDay: (competence: string, date: ISODate, event: React.MouseEvent) => void
}

/** The remaining hours of a day. It is keyed by its value, so a changed number is a new element, and that one slides in. */
function Remaining({ live, state, children }: { live: boolean; state: string; children: ReactNode }) {
  const [slideIn] = useState(live)
  return <b className={`bm-number ${state} ${slideIn ? 'slide-in' : ''}`}>{children}</b>
}

/** The pinned top of Bemanning: the days of the week, what remains of the demand per competence, and the free capacity. */
export function DemandStrip({ dates, competences, balance, uncoverable, capacity, focusDate, onFocusDate, folded, onToggleFolded, brush, onPick, preview, onDay }: Props) {
  // Numbers slide in when they change, but not when the page opens.
  const [live, setLive] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setLive(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  const today = todayIso()
  const workdays = dates.filter((date) => dayType(date) === 'arbeidsdag')
  const dayClass = (date: ISODate, index: number) => dayClassOf(date, index, focusDate)

  return (
    <div className="bm-strip">
      <div className="bm-row bm-dates">
        <div className="bm-label">
          <span className="bm-eyebrow">Dato</span>
          <span className="bm-label-note">
            {weekLabel(dates)} · {weekRange(dates)} {dates[6].slice(0, 4)}
          </span>
        </div>
        {dates.map((date, index) => (
          <button
            key={date}
            className={`bm-date day day-head ${dayClass(date, index)} ${date === today ? 'today' : ''} ${date === focusDate ? 'active' : ''} ${dayType(date) === 'helligdag' ? 'helligdag' : ''}`}
            aria-pressed={date === focusDate}
            title={`${WEEKDAYS_LONG[index]} ${dayOfMonth(date)}.${holidayName(date) ? ` – ${holidayName(date)}` : ''}`}
            onClick={() => onFocusDate(date)}
          >
            <span className="wd">{WEEKDAYS_LONG[index].slice(0, 3)}</span>
            <span className="dn">{dayOfMonth(date)}</span>
          </button>
        ))}
      </div>

      <div className="bm-row bm-section">
        <div className="bm-label">
          <button className="bm-section-toggle" aria-expanded={!folded} title={folded ? 'Vis alle kompetanser' : 'Vis bare kompetansen i fokus'} onClick={onToggleFolded}>
            {folded ? <ChevronRight size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
            <span className="bm-eyebrow">Behov</span>
          </button>
          <span className="bm-label-note">{folded ? `${competences.filter(({ style }) => style.key !== brush).length} skjult` : 'gjenstår · timer'}</span>
        </div>
        <span />
      </div>

      {competences.map(({ style, key }) => {
          const on = style.key === brush
          if (folded && !on) return null
          const weekRemaining = workdays.reduce((sum, date) => sum + Math.max(0, balance.get(style.key, date).remaining), 0)
          return (
            <div key={style.key} className={`bm-row bm-demand ${on ? 'on' : brush ? 'dim' : ''}`} style={competenceColor(style)}>
              <button className="bm-label bm-pick" aria-pressed={on} disabled={!key && !on} title={on ? 'Slå av fokus og pensel (Esc)' : key ? `Fokuser på ${style.label} og mal med den (${key})` : `Ingen av de faste har ${style.label}`} onClick={() => onPick(style.key)}>
                <i className="swatch" />
                <span className="bm-name">{style.label}</span>
                {key > 0 && <kbd>{key}</kbd>}
                <span className="bm-week-left">
                  {hoursText(weekRemaining)}
                  <em> t igjen</em>
                </span>
              </button>
              {dates.map((date, index) => {
                const cell = balance.get(style.key, date)
                const offDay = dayType(date) !== 'arbeidsdag'
                const none = cell.demand < EPSILON && cell.assigned < EPSILON
                if (none) {
                  return (
                    <div key={date} className={`bm-need ${dayClass(date, index)}`}>
                      <span className="bm-need-value">
                        <b className="bm-number nil">–</b>
                      </span>
                    </div>
                  )
                }
                const unc = uncoverable.get(`${style.key}|${date}`) ?? 0
                const state = cell.remaining > EPSILON ? (unc > EPSILON ? 'uncoverable' : '') : cell.remaining < -EPSILON ? 'over' : 'ok'
                const base = Math.max(cell.demand, cell.assigned) || 1
                const regular = (Math.min(cell.assigned - cell.assignedOT, cell.demand) / base) * 100
                const overtime = (Math.min(cell.assigned, cell.demand) / base) * 100 - regular
                const surplus = (Math.max(0, cell.assigned - cell.demand) / base) * 100
                const title =
                  `${style.label} · ${WEEKDAYS_LONG[index]}${offDay ? ' (overtid)' : ''}\nBehov ${hoursText(cell.demand)} t · tildelt ${hoursText(cell.assigned)} t` +
                  (cell.assignedOT > EPSILON ? ` (herav ${hoursText(cell.assignedOT)} t overtid)` : '') +
                  ` · gjenstår ${hoursText(Math.max(0, cell.remaining))} t` +
                  (cell.carried > EPSILON ? `\n${hoursText(cell.carried)} t er flyttet hit fra dagen før.` : '') +
                  (unc > EPSILON ? `\n${hoursText(unc)} t kan ikke dekkes av faste i normaltid.` : '')
                return (
                  <button key={date} className={`bm-need ${dayClass(date, index)}`} title={title} onClick={(e) => onDay(style.key, date, e)}>
                    <span className="bm-need-value">
                      {on && (preview.get(date) ?? 0) > EPSILON && <span className="bm-preview">−{hoursText(Math.min(preview.get(date)!, Math.max(cell.remaining, 0)) || preview.get(date)!)}</span>}
                      {cell.carried > EPSILON && index < 5 && <span className="bm-carried">+{hoursText(cell.carried)}</span>}
                      <Remaining key={hoursText(cell.remaining)} live={live} state={state}>
                        {state === 'ok' ? <Check size={14} aria-label="Dekket" /> : state === 'over' ? `+${hoursText(-cell.remaining)}` : hoursText(cell.remaining)}
                      </Remaining>
                      {index < 5 && cell.demand > EPSILON && <em>av {hoursText(cell.demand)}</em>}
                    </span>
                    <span className="bm-bar">
                      <i className="covered" style={{ width: `${regular}%` }} />
                      {overtime > 0 && <i className="overtime" style={{ left: `${regular}%`, width: `${overtime}%` }} />}
                      {surplus > 0 && <i className="surplus" style={{ left: `${regular + overtime}%`, width: `${surplus}%` }} />}
                      {unc > EPSILON && <i className="uncoverable" style={{ width: `${(unc / base) * 100}%` }} />}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        })}

      <div className="bm-row bm-capacity">
        <div className="bm-label">
          <span className="bm-label-text">{brush ? `Ledig med ${competences.find(({ style }) => style.key === brush)?.style.label ?? brush}` : 'Ledig kapasitet, faste'}</span>
        </div>
        {dates.map((date, index) => (
          <div key={date} className={`bm-free ${dayClass(date, index)}`}>
            {dayType(date) === 'arbeidsdag' && (
              <>
                <b>{hoursText(capacity[index].hours)}</b>
                <em>
                  t · {capacity[index].people} pers
                </em>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
