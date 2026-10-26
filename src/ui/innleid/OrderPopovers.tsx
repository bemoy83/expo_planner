import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { hireHours, isWaiting, SHIFT_LABELS, shiftTimes } from '../../domain/hire'
import type { HireOrder, Interval, WorkdaySettings } from '../../domain/types'
import { clockMinutes } from '../bemanning/week'
import { Segmented } from '../common'
import { dayText, type ISODate } from '../../domain/dates'
import { count } from '../dom'
import { useDismiss } from '../useDismiss'
import { clock, hoursText } from '../format'

/** Waiting for an answer is a hatch, as hours that are not there yet are hatched in the labels; confirmed is a solid disc with a check. Ink only: the colours say under, ok and over. */
export function AnswerGlyph({ waits, size = 14 }: { waits: boolean; size?: number }) {
  if (waits) return <i className="il-glyph il-hatch" aria-hidden />
  return (
    <svg className="il-glyph" width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="7.25" fill="currentColor" />
      <path d="M4.9 8.2l2.1 2.1 4.1-4.4" fill="none" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** People, fewer or more. */
function Stepper({ value, min = 1, max = Infinity, label, onStep }: { value: number; min?: number; max?: number; label: string; onStep: (by: number) => void }) {
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
 * The frame of a popover of Innleid, under the run it was opened from, or over it where there is no room. The first press
 * outside it only closes it (`useDismiss`, swallowed), Escape closes it, and Enter does where `onEnter` is given.
 */
function Popover({ at, width, onClose, onEnter, children }: { at: DOMRect; width: number; onClose: () => void; onEnter?: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [above, setAbove] = useState(false)
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0
    setAbove(at.bottom + 6 + height > window.innerHeight - 8 && at.top - 6 - height > 8)
  }, [at])
  useDismiss(ref, true, onClose, { swallow: true, onEnter })
  const left = Math.max(8, Math.min(at.left + at.width / 2 - width / 2, window.innerWidth - width - 8))
  return (
    <div ref={ref} className="il-pop" role="dialog" style={{ width, left, ...(above ? { bottom: window.innerHeight - at.top + 6 } : { top: at.bottom + 6 }) }}>
      {children}
    </div>
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

/** What the popover of orders changes: each one undo step, on the orders with the ids. */
export interface OrderEdits {
  waits: (ids: string[]) => void
  confirm: (ids: string[]) => void
  fewer: (ids: string[], people: number) => void
  count: (ids: string[], by: number) => void
  times: (ids: string[], times: Interval) => void
  tag: (ids: string[], projectNo: string | null) => void
  remove: (ids: string[]) => void
}

interface OrderProps {
  at: DOMRect
  /** The orders of the run, or of the days selected, as they are now. */
  orders: HireOrder[]
  /** The day clicked, which «Bare denne dagen» narrows them to. */
  date: ISODate
  title: string
  wd: WorkdaySettings
  /** The projects the orders can be for. */
  projects: string[]
  projectName: (projectNo: string) => string
  edits: OrderEdits
  onClose: () => void
}

/** One value where all of them have it, else `null`. */
const alike = <T,>(values: T[]): T | null => (values.every((value) => value === values[0]) ? values[0] : null)

/**
 * What a click on a run of a supplier's line opens, or on a run inside days selected: the answer of the supplier, the people,
 * the times, the project and «Fjern», for all of the orders, or with «Bare denne dagen» for those of the day clicked.
 */
export function OrderPopover({ at, orders, date, title, wd, projects, projectName, edits, onClose }: OrderProps) {
  const [oneDay, setOneDay] = useState(false)
  const [draft, setDraft] = useState<Interval | null>(null)
  const days = new Set(orders.map((order) => order.date)).size
  const shown = oneDay ? orders.filter((order) => order.date === date) : orders
  const ids = shown.map((order) => order.id)
  if (!shown.length) return null
  const waits = shown.some(isWaiting)
  const asked = (order: HireOrder) => order.asked ?? order.fte
  const fte = alike(shown.map((order) => order.fte))
  const of = alike(shown.map(asked))
  const start = alike(shown.map((order) => order.start))
  const end = alike(shown.map((order) => order.end))
  const shift = alike(shown.map((order) => order.shift))
  const projectNo = alike(shown.map((order) => order.projectNo?.trim() ?? ''))
  const own = shift !== null && start !== null && end !== null && (shiftTimes(shift, wd).start !== start || shiftTimes(shift, wd).end !== end)
  // New times are a draft until «Sett tider» or Enter, so a week of them is one change and one undo step.
  const times = draft ?? (start !== null && end !== null ? { start, end } : shift !== null ? shiftTimes(shift, wd) : null)
  const setTime = (part: 'start' | 'end', text: string) => {
    if (!text || !times) return
    const minute = (Math.round(clockMinutes(text) / 30) * 30) % 1440
    setDraft(part === 'start' ? { start: minute, end: times.end } : { start: times.start, end: minute })
  }
  const applyTimes = () => {
    if (draft && draft.start !== draft.end) edits.times(ids, draft)
    setDraft(null)
  }
  const choices = [...new Set([...projects, ...(projectNo ? [projectNo] : [])])]
  return (
    <Popover at={at} width={300} onClose={onClose} onEnter={() => (applyTimes(), onClose())}>
      <span className="il-pop-title">
        {title}
        <em>{oneDay ? dayText(date) : days > 1 ? `${days} dager` : dayText(date)}</em>
      </span>
      {days > 1 && (
        <label className="il-pop-check">
          <input type="checkbox" checked={oneDay} onChange={(e) => setOneDay(e.target.checked)} /> Bare denne dagen ({dayText(date)})
        </label>
      )}
      <Segmented
        label="Svar"
        value={waits ? 'venter' : 'bekreftet'}
        onChange={(answer) => (answer === 'venter' ? edits.waits(ids) : edits.confirm(ids))}
        options={[
          { value: 'venter', label: <><AnswerGlyph waits /> Venter</> },
          { value: 'bekreftet', label: <><AnswerGlyph waits={false} /> Bekreftet</> },
        ]}
      />
      <div className="il-sends">
        <span className="il-sends-day">{waits ? 'Bestilt' : 'Stiller'}</span>
        {fte === null ? (
          <em className="il-pop-note">ulikt per dag</em>
        ) : waits ? (
          <Stepper value={fte} label="Antall personer" onStep={(by) => edits.count(ids, by)} />
        ) : (
          <>
            <Stepper value={fte} max={of ?? fte} label="Antall de stiller" onStep={(by) => edits.fewer(ids, fte + by)} />
            {of !== null && of !== fte && <span>av {of}</span>}
          </>
        )}
        <span>pers.</span>
      </div>
      {!waits && fte !== null && <p className="il-pop-note">Stiller de færre, blir resten udekket igjen. Flere personer er et nytt spørsmål: bestillingen venter da igjen.</p>}
      {!waits && fte !== null && (
        <button className="link small" onClick={() => edits.count(ids, 1)}>
          Be om én til
        </button>
      )}
      <div className="il-times">
        {!times ? (
          <span className="il-pop-note">Ulike skift</span>
        ) : (
          <>
            <input type="time" step={1800} aria-label="Fra" value={clock(times.start)} onChange={(e) => setTime('start', e.target.value)} />
            <span>–</span>
            <input type="time" step={1800} aria-label="Til" value={clock(times.end)} onChange={(e) => setTime('end', e.target.value)} />
            {draft ? (
              <button className="link small" disabled={draft.start === draft.end} onClick={applyTimes}>
                Sett tider
              </button>
            ) : (
              own &&
              shift !== null && (
                <button className="link small" onClick={() => edits.times(ids, shiftTimes(shift, wd))}>
                  {SHIFT_LABELS[shift]}s tider
                </button>
              )
            )}
            <span className="il-pop-note">
              {times.start === times.end ? 'Velg en sluttid' : `${hoursText(hireHours(times, wd))} t betalt${times.end <= times.start ? ' · over natten' : ''}`}
              {!draft && (start === null || end === null) ? ' · ulike tider nå' : ''}
            </span>
          </>
        )}
      </div>
      <label className="il-pop-field">
        <span>Prosjekt</span>
        <select value={projectNo ?? ''} onChange={(e) => edits.tag(ids, e.target.value || null)}>
          {projectNo === null && <option value="">Ulike prosjekter</option>}
          <option value="">Uten prosjekt</option>
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {projectName(choice)}
            </option>
          ))}
        </select>
      </label>
      <button className="il-remove" onClick={() => edits.remove(ids)}>
        <Trash2 size={14} aria-hidden /> Fjern {count(shown.length, 'bestilling', 'bestillinger')}
      </button>
      <PopFoot onClose={onClose} />
    </Popover>
  )
}
