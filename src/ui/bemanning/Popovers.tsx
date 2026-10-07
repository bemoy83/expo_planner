import { useRef, useState } from 'react'
import type { CompetenceStyle } from '../../domain/types'
import { useDismiss } from '../useDismiss'
import { CalendarOff, ChevronsDownUp, ChevronsUpDown, Eraser, HeartPulse, Paintbrush, Thermometer } from 'lucide-react'
import { hoursText } from './week'

const inWindow = (x: number, y: number, width: number, height: number) => ({ left: Math.max(8, Math.min(x, window.innerWidth - width - 10)), top: Math.max(8, Math.min(y, window.innerHeight - height - 10)) })

interface AskProps {
  x: number
  y: number
  /** How many of the days hold work of another competence. */
  count: number
  onCancel: () => void
  onFill: () => void
  onReplace: () => void
}

/** Asked at the pointer when a full-day paint meets days that already hold other work. */
export function PaintAsk({ x, y, count, onCancel, onFill, onReplace }: AskProps) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, true, onCancel)
  return (
    <div className="menu-pop bm-ask" role="dialog" ref={ref} style={inWindow(x, y + 8, 300, 150)}>
      <p>{count === 1 ? 'Dagen har allerede andre oppgaver.' : `${count} av dagene har allerede andre oppgaver.`} Vil du fylle den ledige tiden, eller erstatte alt?</p>
      <div className="dialog-actions">
        <button onClick={onCancel}>Avbryt</button>
        <button onClick={onReplace}>Erstatt</button>
        <button className="primary" autoFocus onClick={onFill}>
          Fyll resten
        </button>
      </div>
    </div>
  )
}

interface MenuProps {
  x: number
  y: number
  title: string
  /** The person's competences, each with whether a full day of it can be painted here. */
  competences: { style: CompetenceStyle; blocked: boolean }[]
  hasBlocks: boolean
  /** Whether the person is open for editing hours. */
  open: boolean
  onToggleOpen: () => void
  onClose: () => void
  onPaint: (competence: string) => void
  onClear: () => void
  /** The weekday of the menu's day, as in «Meld syk tirsdag». */
  dayName: string
  /** `null` on a day that is no workday, where nobody is reported sick. */
  sick: boolean | null
  /** Whether there are more workdays after this one in the week. */
  moreDays: boolean
  onSick: (restOfWeek: boolean) => void
  onWell: (restOfWeek: boolean) => void
  onAbsence: () => void
}

/** The menu a right-click on a person's day opens. */
export function DayMenu({ x, y, title, competences, hasBlocks, open, onToggleOpen, onClose, onPaint, onClear, dayName, sick, moreDays, onSick, onWell, onAbsence }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, true, onClose)
  const run = (action: () => void) => () => {
    onClose()
    action()
  }
  return (
    <div className="menu-pop cell-menu" role="menu" ref={ref} style={inWindow(x, y, 280, 250 + competences.length * 34)} onContextMenu={(e) => e.preventDefault()}>
      <span className="menu-group first">{title}</span>
      <button role="menuitem" onClick={run(onToggleOpen)}>
        {open ? <ChevronsDownUp size={14} aria-hidden /> : <ChevronsUpDown size={14} aria-hidden />}
        {open ? 'Fold sammen' : 'Utvid til timer'}
        <span className="menu-key">E</span>
      </button>
      <span className="menu-rule" />
      {competences.map(({ style, blocked }) => (
        <button key={style.key} role="menuitem" disabled={blocked} onClick={run(() => onPaint(style.key))}>
          <Paintbrush size={14} aria-hidden />
          Mal hel dag med {style.label}
        </button>
      ))}
      {competences.length > 0 && <span className="menu-rule" />}
      <button role="menuitem" disabled={!hasBlocks} onClick={run(onClear)}>
        <Eraser size={14} aria-hidden />
        Tøm dagen
        <span className="menu-key">Del</span>
      </button>
      <span className="menu-rule" />
      {sick === false && (
        <>
          <button role="menuitem" onClick={run(() => onSick(false))}>
            <Thermometer size={14} aria-hidden />
            Meld syk {dayName}
          </button>
          {moreDays && (
            <button role="menuitem" onClick={run(() => onSick(true))}>
              <Thermometer size={14} aria-hidden />
              Meld syk ut uka
            </button>
          )}
        </>
      )}
      {sick === true && (
        <>
          <button role="menuitem" onClick={run(() => onWell(false))}>
            <HeartPulse size={14} aria-hidden />
            Friskmeld {dayName}
          </button>
          {moreDays && (
            <button role="menuitem" onClick={run(() => onWell(true))}>
              <HeartPulse size={14} aria-hidden />
              Friskmeld ut uka
            </button>
          )}
        </>
      )}
      <button role="menuitem" onClick={run(onAbsence)}>
        <CalendarOff size={14} aria-hidden />
        Fravær …
      </button>
    </div>
  )
}

interface DemandProps {
  x: number
  y: number
  style: CompetenceStyle
  /** «tirsdag 13. okt» */
  dayText: string
  demand: number
  assigned: number
  remaining: number
  /** Hours moved to this day from the day before. */
  carried: number
  /** Free normal time of the people who have the competence. */
  free: number
  /** The weekday the hours would move to, with «(overtid)» where that is a day off. */
  nextDay: string
  nextDayShort: string
  /** Whether the competence is the brush already. */
  painting: boolean
  canPaint: boolean
  onClose: () => void
  onCarry: (hours: number) => void
  onRemoveCarried: () => void
  onPaint: () => void
}

const DEFAULT_CARRY = '3'

/** What a click on a day of a demand line opens: the day's balance, and moving unfinished work to the next day. */
export function DemandPopover({ x, y, style, dayText, demand, assigned, remaining, carried, free, nextDay, nextDayShort, painting, canPaint, onClose, onCarry, onRemoveCarried, onPaint }: DemandProps) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, true, onClose)
  const [amount, setAmount] = useState(DEFAULT_CARRY)
  const hours = Number(amount.replace(',', '.'))
  const valid = Number.isFinite(hours) && hours > 0
  const carry = () => {
    if (!valid) return
    onClose()
    onCarry(hours)
  }
  return (
    <div className="menu-pop bm-demand-pop" role="dialog" ref={ref} style={{ ...inWindow(x, y + 8, 300, 300), '--cc': `var(--${style.color})` } as React.CSSProperties}>
      <div className="bm-pop-head">
        <i className="swatch" />
        <b>{style.label}</b>
        <span>{dayText}</span>
      </div>
      <div className="bm-pop-stats">
        <div>
          <span>Behov</span>
          <b>{hoursText(demand)}</b>
        </div>
        <div>
          <span>Tildelt</span>
          <b>{hoursText(assigned)}</b>
        </div>
        <div>
          <span>Gjenstår</span>
          <b>{hoursText(Math.max(0, remaining))}</b>
        </div>
      </div>
      <p>
        Ledig hos faste med {style.label}: <b>{hoursText(free)} t</b>
      </p>
      {carried > 0 && (
        <p>
          {hoursText(carried)} t er flyttet hit fra dagen før.{' '}
          <button
            className="link"
            onClick={() => {
              onClose()
              onRemoveCarried()
            }}
          >
            Ta tilbake
          </button>
        </p>
      )}
      <div className="bm-pop-carry">
        <label htmlFor="bm-carry-hours">Ikke fullført? Flytt arbeid til {nextDay}</label>
        <div>
          <input id="bm-carry-hours" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && carry()} />
          <span>t</span>
          <button disabled={!valid} onClick={carry}>
            Flytt til {nextDayShort}
          </button>
        </div>
      </div>
      <div className="dialog-actions">
        <button onClick={onClose}>Lukk</button>
        <button
          className="primary"
          disabled={!canPaint}
          onClick={() => {
            onClose()
            onPaint()
          }}
        >
          {painting ? `Maler med ${style.label}` : `Mal med ${style.label}`}
        </button>
      </div>
    </div>
  )
}
