import { useRef, useState } from 'react'
import type { ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { assignmentStatus, clickBlock, openUnresolved, deleteBlock, drawBlock, editableWindows, isEligible, moveBlock, moveTarget, normalWindows, overtimeHours, paidHours, recolourBlock, resizeBlock, splitBlock, type EditOptions } from '../../domain/staffing'
import type { Assignment, CompetenceStyle, Interval, Minute, Person, Workspace } from '../../domain/types'
import { X } from 'lucide-react'
import { ABSENCE_LABELS } from './dayCell'
import { HOUR_PX } from './layout'
import type { Tool } from './tools'
import { competenceColor } from '../dom'
import { clock, EPSILON, hoursText, spanText } from './week'

/** The pixel heights from which a block has room for its name, its time and its hours. */
const NAME_FROM_PX = 18
const TIME_FROM_PX = 34
const HOURS_FROM_PX = 50
/** A day's column shows whole names from this width, and whole times from the next. */
const NAME_FROM_W = 90
const TIME_FROM_W = 112

/** A block on its way to another day: where it would start there (R19). */
export interface CrossMove {
  id: string
  date: ISODate
  start: Minute
}

/** A change to the assignments, worked out from the workspace as it is when the change is made. */
export type AssignmentChange = (ws: Workspace) => Assignment[]

interface Props {
  ws: Workspace
  person: Person
  date: ISODate
  /** The width of the day's column. */
  colW: number
  styles: Map<string, CompetenceStyle>
  brush: string | null
  tool: Tool
  onChange: (change: AssignmentChange) => void
  /** The pointer went down in an empty part of the day. */
  onTouch: (date: ISODate) => void
  /** The day under a point of the window, so a block can be dragged to another day. */
  dateAt: (clientX: number) => ISODate | null
  /** The block that is being dragged to another day, from this track or another. */
  cross: CrossMove | null
  onCross: (cross: CrossMove | null) => void
  /** The button was let go with a block over another day. */
  onCrossEnd: () => void
  /** The selected block, which Delete removes. */
  selectedId: string | null
  onSelect: (id: string | null) => void
}

/** What the pointer is doing to the track, as the times it has reached. Shown as it would be stored. */
type Draft = { kind: 'move'; id: string; start: Minute } | { kind: 'start' | 'end'; id: string; t: Minute } | { kind: 'draw'; from: Minute; to: Minute }

/**
 * One person's day as a track of time from the first to the last hour of overtime, where blocks are
 * drawn, moved, resized, split, recoloured and removed (R8), and dragged on to another day (R19).
 */
export function TimeTrack({ ws, person, date, colW, styles, brush, tool, onChange, onTouch, dateAt, cross, onCross, onCrossEnd, selectedId, onSelect }: Props) {
  const track = useRef<HTMLSpanElement>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const latest = useRef<Draft | null>(null)
  const wd = ws.settings.workday
  const range: Interval = { start: wd.overtimeEarliest, end: wd.overtimeLatest }
  const opts: EditOptions = { pullToDay: true }
  const narrow = colW < NAME_FROM_W
  const cell = { personId: person.id, date }
  const offDay = dayType(date) !== 'arbeidsdag'
  const absence = (ws.unavailability ?? []).filter((u) => u.personId === person.id && u.date === date)
  const awayAllDay = absence.find((u) => u.start === undefined || u.end === undefined)
  const open = editableWindows(person.id, date, ws.unavailability ?? [], wd)
  const normal = normalWindows(person.id, date, ws.unavailability ?? [], wd)
  const canDraw = tool === 'paint' && brush !== null && isEligible(person, brush) && open.length > 0

  const apply = (d: Draft): AssignmentChange => {
    if (d.kind === 'move') return (w) => moveBlock(w, d.id, d.start, opts)
    if (d.kind === 'draw') return (w) => drawBlock(w, cell, brush!, d.from, d.to, opts)
    return (w) => resizeBlock(w, d.id, d.kind, d.t, opts)
  }
  const stored = (ws.assignments ?? []).filter((a) => a.personId === person.id && a.date === date)
  const shown = (draft ? apply(draft)(ws) : (ws.assignments ?? [])).filter((a) => a.personId === person.id && a.date === date)
  const storedIds = new Set(stored.map((a) => a.id))
  const stillOpen = new Set(stored.length ? openUnresolved(ws).map((a) => a.id) : [])

  const share = (t: Minute) => ((t - range.start) / (range.end - range.start)) * 100
  const place = (from: Minute, to: Minute): React.CSSProperties => ({ top: `${share(from)}%`, height: `${share(to) - share(from)}%` })
  const minuteAt = (e: { clientX: number; clientY: number }): Minute => {
    const box = track.current!.getBoundingClientRect()
    return range.start + ((e.clientY - box.top) / box.height) * (range.end - range.start)
  }

  /** Follows the pointer until the button is let go. */
  const follow = (onMove: (e: MouseEvent) => void, onUp: () => void) => {
    const up = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', up)
      onUp()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', up)
  }
  const set = (d: Draft | null) => {
    latest.current = d
    setDraft(d)
  }
  const commit = () => {
    const d = latest.current
    set(null)
    if (d) onChange(apply(d))
  }

  const blockDown = (e: React.MouseEvent, block: Assignment, grip: 'move' | 'start' | 'end') => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    if (tool === 'erase' || e.altKey) return onChange((w) => deleteBlock(w.assignments ?? [], block.id))
    if (assignmentStatus(block, ws) === 'unresolved') return onSelect(block.id)
    if (tool === 'paint' && brush && brush !== block.competence && grip === 'move') return onChange((w) => recolourBlock(w, block.id, brush))
    const t0 = minuteAt(e)
    let dragged = false
    let away = false
    follow(
      (ev) => {
        dragged = true
        const moved = minuteAt(ev) - t0
        const over = grip === 'move' ? (dateAt(ev.clientX) ?? date) : date
        away = over !== date
        // Over another day the block is on its way there; the grid shows it in that day's track.
        if (away) {
          set(null)
          onCross({ id: block.id, date: over, start: block.start + moved })
        } else {
          onCross(null)
          set(grip === 'move' ? { kind: 'move', id: block.id, start: block.start + moved } : { kind: grip, id: block.id, t: (grip === 'start' ? block.start : block.end) + moved })
        }
      },
      () => {
        if (away) onCrossEnd()
        else commit()
        // A press that does not move the block selects it.
        if (!dragged) onSelect(selectedId === block.id ? null : block.id)
      },
    )
  }

  const trackDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    onTouch(date)
    onSelect(null)
    if (!canDraw) return
    const t0 = minuteAt(e)
    follow(
      (ev) => {
        const t = minuteAt(ev)
        if (latest.current || Math.abs(t - t0) >= wd.snap) set({ kind: 'draw', from: t0, to: t })
      },
      () => {
        // A press without a drag fills the free time around it; a drag draws its own span.
        if (latest.current) commit()
        else onChange((w) => clickBlock(w, cell, brush!, t0, opts))
      },
    )
  }

  const away = (from: Minute, to: Minute, key: string) => (to > from ? <i key={key} className="bm-band away" style={place(Math.max(from, range.start), Math.min(to, range.end))} /> : null)
  const firstAway = absence.find((u) => u.start !== undefined)

  return (
    <span className={`bm-track week ${canDraw ? 'drawable' : ''}`} ref={track} onMouseDown={trackDown}>
      {(offDay ? <i className="bm-band overtime" style={place(range.start, range.end)} /> : (
        <>
          <i className="bm-band overtime" style={place(range.start, wd.dayStart)} />
          <i className="bm-band overtime" style={place(wd.dayEnd, range.end)} />
          <i className="bm-rule" style={place(wd.dayStart, wd.dayStart)} />
          <i className="bm-rule" style={place(wd.dayEnd, wd.dayEnd)} />
        </>
      ))}
      {!offDay && <i className="bm-band lunch" style={place(wd.breakStart, wd.breakEnd)} />}
      {awayAllDay ? (
        <>
          {away(range.start, range.end, 'all')}
          {awayAllDay.kind !== 'syk' && <span className="bm-track-away">{ABSENCE_LABELS[awayAllDay.kind]}</span>}
        </>
      ) : (
        absence.length > 0 && (
          <>
            {away(range.start, normal[0]?.start ?? range.end, 'before')}
            {away(normal[normal.length - 1]?.end ?? range.start, range.end, 'after')}
            {firstAway && <span className="bm-track-note" style={{ top: `${share(firstAway.end! >= wd.dayEnd ? firstAway.start! : range.start)}%` }}>{firstAway.note || (firstAway.end! >= wd.dayEnd ? `Går ${clock(firstAway.start!)}` : `Fra ${clock(firstAway.end!)}`)}</span>}
          </>
        )
      )}
      {shown.map((block) => {
        const style = styles.get(block.competence)
        const name = style?.label ?? block.competence
        const from = Math.max(block.start, range.start)
        const to = Math.min(block.end, range.end)
        if (to <= from) return null
        const length = block.end - block.start
        const total = paidHours(block, wd)
        const overtime = overtimeHours(block, dayType(date), wd)
        const unresolved = assignmentStatus(block, ws) === 'unresolved'
        const replaced = unresolved && !stillOpen.has(block.id)
        const ghost = !storedIds.has(block.id)
        const dragging = draft !== null && draft.kind !== 'draw' && draft.id === block.id
        const px = (length / 60) * HOUR_PX
        const early = !offDay && block.start < wd.dayStart ? ((Math.min(block.end, wd.dayStart) - block.start) / length) * 100 : 0
        const late = !offDay && block.end > wd.dayEnd ? ((Math.max(block.start, wd.dayEnd) - block.start) / length) * 100 : 100
        return (
          <span
            key={block.id}
            className={`bm-edit-block ${unresolved ? 'unresolved' : ''} ${replaced ? 'replaced' : ''} ${ghost ? 'ghost' : ''} ${dragging ? 'dragging' : ''} ${cross?.id === block.id ? 'leaving' : ''} ${selectedId === block.id ? 'selected' : ''} ${brush && brush !== block.competence ? 'other' : ''}`}
            style={{ ...place(from, to), ...competenceColor(style) }}
            title={`${name} · ${clock(block.start)}–${clock(block.end)} · ${hoursText(total)} t${overtime > EPSILON ? ` (${hoursText(overtime)} t overtid)` : ''}${replaced ? ' · teller ikke, behovet er dekket av andre' : unresolved ? ' · uløst' : '\nDra for å flytte · dra kantene · dobbeltklikk for å dele'}`}
            onMouseDown={(e) => blockDown(e, block, 'move')}
            onDoubleClick={(e) => {
              e.stopPropagation()
              const t = minuteAt(e)
              onChange((w) => splitBlock(w, block.id, t))
            }}
          >
            {offDay && <i className="bm-ot-part" style={{ top: 0, height: '100%' }} />}
            {early > 0 && <i className="bm-ot-part" style={{ top: 0, height: `${early}%` }} />}
            {late < 100 && <i className="bm-ot-part" style={{ top: `${late}%`, height: `${100 - late}%` }} />}
            {!ghost && !unresolved && (
              <>
                <i className="bm-grip start" onMouseDown={(e) => blockDown(e, block, 'start')} />
                <i className="bm-grip end" onMouseDown={(e) => blockDown(e, block, 'end')} />
              </>
            )}
            {px >= NAME_FROM_PX && <b>{narrow ? (style?.shortLabel ?? name) : name}</b>}
            {px >= TIME_FROM_PX && <em>{spanText(block.start, block.end, colW < TIME_FROM_W)}</em>}
            {px >= HOURS_FROM_PX && !narrow && (
              <em>
                {hoursText(total - overtime)} t{overtime > EPSILON ? ` + ${hoursText(overtime)} OT` : ''}
              </em>
            )}
            {!ghost && (
              <button
                className="bm-block-remove"
                aria-label="Fjern blokken"
                title="Fjern blokken"
                onMouseDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onChange((w) => deleteBlock(w.assignments ?? [], block.id))
                }}
              >
                <X size={11} aria-hidden />
              </button>
            )}
          </span>
        )
      })}
      {cross?.date === date &&
        (() => {
          // A block from another day, where it would land here. Nothing shows where it cannot go.
          const target = moveTarget(ws, cross.id, date, cross.start)
          if (!target || typeof target === 'string') return null
          const style = styles.get(target.competence)
          return (
            <span className="bm-edit-block ghost" style={{ ...place(target.start, target.end), ...competenceColor(style) }}>
              <b>{narrow ? (style?.shortLabel ?? target.competence) : (style?.label ?? target.competence)}</b>
              <em>{spanText(target.start, target.end, colW < TIME_FROM_W)}</em>
            </span>
          )
        })()}
      {awayAllDay?.kind === 'syk' && <span className="bm-sick">Syk{stored.some((a) => stillOpen.has(a.id)) ? ` · ${stored.filter((a) => stillOpen.has(a.id)).length} uløst` : ''}</span>}
    </span>
  )
}
