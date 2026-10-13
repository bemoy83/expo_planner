import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import { groupWaits, hireHours, shiftOf, SHIFT_LABELS, shiftTimes, timesText, type OrderGroup } from '../../domain/hire'
import { SHIFT_IDS, type CompetenceStyle, type Interval, type Supplier, type WorkdaySettings } from '../../domain/types'
import { clock, clockMinutes, hoursText } from '../bemanning/week'
import { Segmented } from '../common'
import { fmtDay } from '../kalender/labels'
import { useStableActions } from '../kalender/useStableActions'

/** Waiting for an answer is a clock in a ring; confirmed is a solid disc with a check. Ink only: the colours say under, ok and over. */
export function AnswerGlyph({ waits, size = 14 }: { waits: boolean; size?: number }) {
  return (
    <svg className="il-glyph" width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      {waits ? (
        <>
          <circle cx="8" cy="8" r="6.5" fill="var(--bg)" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.6V8l2.3 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r="7.25" fill="currentColor" />
          <path d="M4.9 8.2l2.1 2.1 4.1-4.4" fill="none" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  )
}

/** People, fewer or more. */
export function Stepper({ value, min = 1, max = Infinity, label, onStep }: { value: number; min?: number; max?: number; label: string; onStep: (by: number) => void }) {
  return (
    <span className="il-step" role="group" aria-label={label}>
      <button aria-label="Færre" disabled={value <= min} onClick={() => onStep(-1)}>
        <Minus size={12} aria-hidden />
      </button>
      <b>{value}</b>
      <button aria-label="Flere" disabled={value >= max} onClick={() => onStep(1)}>
        <Plus size={12} aria-hidden />
      </button>
    </span>
  )
}

/**
 * The frame of a popover of the editor, under the button it was opened from, or over it where there is no room.
 * The first press outside it only closes it: the press is swallowed, with its click, so it selects no day and
 * presses nothing under it. Escape closes it, and Enter does where `onEnter` is given.
 */
export function Popover({ at, width, className = '', onClose, onEnter, children }: { at: DOMRect; width: number; className?: string; onClose: () => void; onEnter?: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [above, setAbove] = useState(false)
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0
    setAbove(at.bottom + 6 + height > window.innerHeight - 8 && at.top - 6 - height > 8)
  }, [at])
  const handlers = useStableActions({ onClose, onEnter: onEnter ?? null })
  useEffect(() => {
    let swallow = false
    const down = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      e.preventDefault()
      e.stopPropagation()
      swallow = true
      handlers.onClose()
    }
    const click = (e: MouseEvent) => {
      if (!swallow) return
      e.preventDefault()
      e.stopPropagation()
      swallow = false
    }
    const key = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement
      if (e.key === 'Escape' || (e.key === 'Enter' && onEnter && !typing)) {
        e.preventDefault()
        e.stopPropagation()
        if (e.key === 'Enter') handlers.onEnter?.()
        else handlers.onClose()
      }
    }
    document.addEventListener('mousedown', down, true)
    document.addEventListener('click', click, true)
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('mousedown', down, true)
      document.removeEventListener('keydown', key, true)
      // The click of the press that closed it comes after this: it is let through to be swallowed, then the listener goes.
      setTimeout(() => document.removeEventListener('click', click, true))
    }
  }, [handlers]) // eslint-disable-line react-hooks/exhaustive-deps
  const left = Math.max(8, Math.min(at.left + at.width / 2 - width / 2, window.innerWidth - width - 8))
  return (
    <div ref={ref} className={`il-pop ${className}`} role="dialog" style={{ width, left, ...(above ? { bottom: window.innerHeight - at.top + 6 } : { top: at.bottom + 6 }) }}>
      {children}
    </div>
  )
}

const shiftsText = (supplier: Supplier) => supplier.shifts.map((shift) => SHIFT_LABELS[shift]).join(' · ')

/** The suppliers to pick from for a competence: those that offer it, and under them those that do not, which cannot be picked. */
export function SupplierMenu({ at, competence, suppliers, current, onPick, onClose }: { at: DOMRect; competence: CompetenceStyle; suppliers: Supplier[]; current?: string; onPick: (supplier: Supplier) => void; onClose: () => void }) {
  const offers = suppliers.filter((supplier) => supplier.competences.includes(competence.key))
  const others = suppliers.filter((supplier) => !supplier.competences.includes(competence.key))
  const item = (supplier: Supplier, disabled: boolean) => (
    <button key={supplier.id} role="menuitem" disabled={disabled} onClick={() => (onClose(), onPick(supplier))}>
      <span className="il-menu-name">{supplier.name}</span>
      <span className="il-menu-note">{[shiftsText(supplier), supplier.rate ? `${supplier.rate} kr/t` : ''].filter(Boolean).join(' · ')}</span>
      {supplier.id === current && <Check size={14} aria-label="Valgt" />}
    </button>
  )
  return (
    <Popover at={at} width={240} className="il-menu" onClose={onClose}>
      <span className="menu-group first">Tilbyr {competence.label}</span>
      {offers.map((supplier) => item(supplier, !supplier.shifts.length))}
      {!offers.length && <p className="il-pop-note">Ingen leverandør tilbyr {competence.label} ennå.</p>}
      {others.length > 0 && <span className="menu-group">Tilbyr ikke {competence.label}</span>}
      {others.map((supplier) => item(supplier, true))}
    </Popover>
  )
}

/** The shift of a line of the editor: one of the supplier's, or times of its own. */
export function ShiftMenu({ at, group, supplier, wd, onPick, onOwn, onClose }: { at: DOMRect; group: OrderGroup; supplier: Supplier | undefined; wd: WorkdaySettings; onPick: (times: Interval) => void; onOwn: () => void; onClose: () => void }) {
  const now = shiftOf(group, wd)
  return (
    <Popover at={at} width={220} className="il-menu" onClose={onClose}>
      {SHIFT_IDS.map((shift) => {
        const times = shiftTimes(shift, wd)
        const offered = supplier?.shifts.includes(shift) ?? false
        return (
          <button key={shift} role="menuitem" disabled={!offered} title={offered ? undefined : `${supplier?.name ?? 'Leverandøren'} tilbyr ikke ${SHIFT_LABELS[shift].toLowerCase()}`} onClick={() => (onClose(), onPick(times))}>
            <span className="il-menu-name">{SHIFT_LABELS[shift]}</span>
            <span className="il-menu-note">{timesText(times)}</span>
            {shift === now && <Check size={14} aria-label="Valgt" />}
          </button>
        )
      })}
      <span className="menu-rule" />
      <button role="menuitem" onClick={onOwn}>
        <span className="il-menu-name">Egen tid …</span>
        {now === null && <Check size={14} aria-label="Valgt" />}
      </button>
    </Popover>
  )
}

/** Times of its own for a line of the editor, on the half hour. A time that ends before it starts goes through the night. */
export function TimePopover({ at, group, wd, onTimes, onClose }: { at: DOMRect; group: OrderGroup; wd: WorkdaySettings; onTimes: (times: Interval) => void; onClose: () => void }) {
  const [start, setStart] = useState(group.start)
  const [end, setEnd] = useState(group.end)
  const set = (part: 'start' | 'end', text: string) => {
    if (!text) return
    const minute = (Math.round(clockMinutes(text) / 30) * 30) % 1440
    const next = part === 'start' ? { start: minute, end } : { start, end: minute }
    setStart(next.start)
    setEnd(next.end)
    onTimes(next)
  }
  return (
    <Popover at={at} width={260} onClose={onClose} onEnter={onClose}>
      <span className="il-pop-title">Egen tid</span>
      <div className="il-times">
        <input type="time" step={1800} aria-label="Fra" value={clock(start)} onChange={(e) => set('start', e.target.value)} />
        <span>–</span>
        <input type="time" step={1800} aria-label="Til" value={clock(end)} onChange={(e) => set('end', e.target.value)} />
        <span className="il-pop-note">{start === end ? 'Velg en sluttid' : `${hoursText(hireHours({ start, end }, wd))} t betalt${end <= start ? ' · over natten' : ''}`}</span>
      </div>
      <PopFoot onClose={onClose} />
    </Popover>
  )
}

function PopFoot({ onClose }: { onClose: () => void }) {
  return (
    <div className="il-pop-foot">
      <span>Lagres med en gang</span>
      <button className="il-done" onClick={onClose}>
        Ferdig ↵
      </button>
    </div>
  )
}

interface AnswerProps {
  at: DOMRect
  group: OrderGroup
  supplier: Supplier | undefined
  onWaits: () => void
  onConfirm: () => void
  /** The supplier sends this many of what was asked, on the orders with the ids. */
  onFewer: (ids: string[], people: number) => void
  onClose: () => void
}

/** The answer of a supplier for a line of the editor: it waits, or it is confirmed, with fewer people where the supplier cannot send all. */
export function AnswerPopover({ at, group, supplier, onWaits, onConfirm, onFewer, onClose }: AnswerProps) {
  const waits = groupWaits(group)
  const asked = (order: OrderGroup['orders'][number]) => order.asked ?? order.fte
  const [first] = group.orders
  const alike = group.orders.every((order) => order.fte === first.fte && asked(order) === asked(first))
  const sends = (ids: string[], fte: number, of: number, label: string) => (
    <>
      <Stepper value={fte} max={of} label={label} onStep={(by) => onFewer(ids, fte + by)} /> av {of}
    </>
  )
  return (
    <Popover at={at} width={270} onClose={onClose} onEnter={onClose}>
      <span className="il-pop-title">
        Svar fra {supplier?.name ?? 'leverandøren'}
        {group.orders.length > 1 && <em>{group.orders.length} dager</em>}
      </span>
      <Segmented
        label="Svar"
        value={waits ? 'venter' : 'bekreftet'}
        onChange={(answer) => (answer === 'venter' ? onWaits() : onConfirm())}
        options={[
          { value: 'venter', label: <><AnswerGlyph waits /> Venter</> },
          { value: 'bekreftet', label: <><AnswerGlyph waits={false} /> Bekreftet</> },
        ]}
      />
      {!waits &&
        (alike ? (
          <div className="il-sends">
            Stiller {sends(group.orders.map((order) => order.id), first.fte, asked(first), 'Antall de stiller')}
            {group.orders.length > 1 ? ' per dag' : ''}
          </div>
        ) : (
          <div className="il-sends-list">
            {group.orders.map((order) => (
              <div key={order.id} className="il-sends">
                <span className="il-sends-day">{fmtDay(order.date)}</span>
                {sends([order.id], order.fte, asked(order), `Antall de stiller ${fmtDay(order.date)}`)}
              </div>
            ))}
          </div>
        ))}
      {!waits && <p className="il-pop-note">Kan de stille færre? Juster antallet – resten blir udekket igjen.</p>}
      <PopFoot onClose={onClose} />
    </Popover>
  )
}
