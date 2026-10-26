import { useRef, useState, type ReactNode } from 'react'
import { parseDecimal } from '../../domain/numbers'
import type { CompetenceStyle } from '../../domain/types'
import { competenceColor, inWindow } from '../dom'
import { useDismiss } from '../useDismiss'
import { CalendarCheck, CalendarOff, ChevronsDownUp, ChevronsUpDown, Eraser, Paintbrush } from 'lucide-react'
import { hoursText } from '../format'

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
  /** The person is away the whole of a working day. */
  away: boolean
  /** «tir 20.», the day the absence would end from. */
  dayShort: string
  /** Ends the absence on the day before. */
  onBack: () => void
  /** Opens the absence form on the day. */
  onAbsence: () => void
}

/** The menu a right-click on a person's day opens. */
export function DayMenu({ x, y, title, competences, hasBlocks, open, onToggleOpen, onClose, onPaint, onClear, away, dayShort, onBack, onAbsence }: MenuProps) {
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
        {open ? 'Brett sammen' : 'Brett ut timer'}
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
      {away && (
        <button role="menuitem" onClick={run(onBack)}>
          <CalendarCheck size={14} aria-hidden />
          Tilbake fra {dayShort}
        </button>
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
  /** «tirsdag 13. okt», with the project's name after it on a project's line. */
  dayText: string
  /** The day's balance in hours, a figure each: Faste's demand, assigned and left; Innleid's left after Faste, confirmed, waiting and missing. */
  stats: { label: string; hours: number }[]
  /** What the part adds under the figures: the free time and moved hours of Faste, the orders of Innleid. */
  children?: ReactNode
  /** What the button that makes it the brush says. */
  paintText: string
  canPaint: boolean
  onClose: () => void
  onPaint: () => void
}

/**
 * What a click on a day of a demand line opens, the same in Faste and Innleid: the day's balance, what the part adds
 * under it, and the competence (or the project's line) as the brush.
 */
export function DemandPopover({ x, y, style, dayText, stats, children, paintText, canPaint, onClose, onPaint }: DemandProps) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, true, onClose)
  return (
    <div className="menu-pop bm-demand-pop" role="dialog" ref={ref} style={{ ...inWindow(x, y + 8, 300, 300), ...competenceColor(style) }}>
      <div className="bm-pop-head">
        <i className="swatch" />
        <b>{style.label}</b>
        <span>{dayText}</span>
      </div>
      <div className="stats">
        {stats.map((stat) => (
          <div key={stat.label}>
            <span>{stat.label}</span>
            <b>{hoursText(stat.hours)}</b>
          </div>
        ))}
      </div>
      {children}
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
          {paintText}
        </button>
      </div>
    </div>
  )
}

const DEFAULT_CARRY = '3'

interface CarryProps {
  style: CompetenceStyle
  /** Hours moved to this day from the day before. */
  carried: number
  /** Free normal time of the people who have the competence. */
  free: number
  /** The weekday the hours would move to, with «(overtid)» where that is a day off. */
  nextDay: string
  nextDayShort: string
  onClose: () => void
  onCarry: (hours: number) => void
  onRemoveCarried: () => void
}

/** Faste's part of the popover of a demand day: the free time of the people, and moving unfinished work to the next day. */
export function CarryWork({ style, carried, free, nextDay, nextDayShort, onClose, onCarry, onRemoveCarried }: CarryProps) {
  const [amount, setAmount] = useState(DEFAULT_CARRY)
  const hours = parseDecimal(amount) ?? 0
  const valid = hours > 0
  const carry = () => {
    if (!valid) return
    onClose()
    onCarry(hours)
  }
  return (
    <>
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
    </>
  )
}
