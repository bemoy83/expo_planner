import { useRef, useState } from 'react'
import type { ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { assignmentStatus, clickBlock, openUnresolved, deleteBlock, drawBlock, editableWindows, isEligible, moveBlock, normalWindows, overtimeHours, paidHours, recolourBlock, resizeBlock, splitBlock, type EditOptions } from '../../domain/staffing'
import type { Assignment, CompetenceStyle, Interval, Minute, Person, Workspace } from '../../domain/types'
import { X } from 'lucide-react'
import { ABSENCE_LABELS } from './dayCell'
import type { Tool } from './tools'
import { clock, hoursText } from './week'

const EPSILON = 0.05
/** The pixel heights from which a block in the week editor has room for its name, its time and its hours. */
const NAME_FROM_PX = 18
const TIME_FROM_PX = 34
const HOURS_FROM_PX = 50
/** The pixels per hour of the week editor. */
export const WEEK_HOUR_PX = 28

/** A change to the assignments, worked out from the workspace as it is when the change is made. */
export type AssignmentChange = (ws: Workspace) => Assignment[]

interface Props {
  ws: Workspace
  person: Person
  date: ISODate
  /** `week` runs down the whole day with overtime; `row` runs across the normal day only. */
  layout: 'week' | 'row'
  /** A narrow column: short names only. */
  narrow?: boolean
  styles: Map<string, CompetenceStyle>
  brush: string | null
  tool: Tool
  onChange: (change: AssignmentChange) => void
  /** The pointer went down in the day: it becomes the day in focus. */
  onTouch: (date: ISODate) => void
}

/** What the pointer is doing to the track, as the times it has reached. Shown as it would be stored. */
type Draft = { kind: 'move'; id: string; start: Minute } | { kind: 'start' | 'end'; id: string; t: Minute } | { kind: 'draw'; from: Minute; to: Minute }

/** One person's day as a track of time, where blocks are drawn, moved, resized, split, recoloured and removed (R8). */
export function TimeTrack({ ws, person, date, layout, narrow = false, styles, brush, tool, onChange, onTouch }: Props) {
  const track = useRef<HTMLSpanElement>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const latest = useRef<Draft | null>(null)
  const wd = ws.settings.workday
  const week = layout === 'week'
  const range: Interval = week ? { start: wd.overtimeEarliest, end: wd.overtimeLatest } : { start: wd.dayStart, end: wd.dayEnd }
  const opts: EditOptions = week ? { pullToDay: true } : { bounds: range }
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
  const place = (from: Minute, to: Minute): React.CSSProperties => (week ? { top: `${share(from)}%`, height: `${share(to) - share(from)}%` } : { left: `${share(from)}%`, width: `${share(to) - share(from)}%` })
  const minuteAt = (e: { clientX: number; clientY: number }): Minute => {
    const box = track.current!.getBoundingClientRect()
    const along = week ? (e.clientY - box.top) / box.height : (e.clientX - box.left) / box.width
    return range.start + along * (range.end - range.start)
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
    onTouch(date)
    if (tool === 'erase' || e.altKey) return onChange((w) => deleteBlock(w.assignments ?? [], block.id))
    if (assignmentStatus(block, ws) === 'unresolved') return
    if (tool === 'paint' && brush && brush !== block.competence && grip === 'move') return onChange((w) => recolourBlock(w, block.id, brush))
    const t0 = minuteAt(e)
    follow(
      (ev) => {
        const moved = minuteAt(ev) - t0
        set(grip === 'move' ? { kind: 'move', id: block.id, start: block.start + moved } : { kind: grip, id: block.id, t: (grip === 'start' ? block.start : block.end) + moved })
      },
      commit,
    )
  }

  const trackDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    onTouch(date)
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
    <span className={`bm-track ${layout} ${canDraw ? 'drawable' : ''}`} ref={track} onMouseDown={trackDown}>
      {week && (offDay ? <i className="bm-band overtime" style={place(range.start, range.end)} /> : (
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
            {firstAway && week && <span className="bm-track-note" style={{ top: `${share(firstAway.end! >= wd.dayEnd ? firstAway.start! : range.start)}%` }}>{firstAway.note || (firstAway.end! >= wd.dayEnd ? `Går ${clock(firstAway.start!)}` : `Fra ${clock(firstAway.end!)}`)}</span>}
          </>
        )
      )}
      {shown.map((block) => {
        const style = styles.get(block.competence)
        const name = style?.label ?? block.competence
        // The row timeline shows the part of a block that is inside the normal day.
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
        const px = week ? (length / 60) * WEEK_HOUR_PX : Infinity
        const early = !offDay && block.start < wd.dayStart ? ((Math.min(block.end, wd.dayStart) - block.start) / length) * 100 : 0
        const late = !offDay && block.end > wd.dayEnd ? ((Math.max(block.start, wd.dayEnd) - block.start) / length) * 100 : 100
        return (
          <span
            key={block.id}
            className={`bm-edit-block ${unresolved ? 'unresolved' : ''} ${replaced ? 'replaced' : ''} ${ghost ? 'ghost' : ''} ${dragging ? 'dragging' : ''} ${brush && brush !== block.competence ? 'other' : ''}`}
            style={{ ...place(from, to), '--cc': `var(--${style?.color ?? 'line-slate'})` } as React.CSSProperties}
            title={`${name} · ${clock(block.start)}–${clock(block.end)} · ${hoursText(total)} t${overtime > EPSILON ? ` (${hoursText(overtime)} t overtid)` : ''}${replaced ? ' · teller ikke, behovet er dekket av andre' : unresolved ? ' · uløst' : '\nDra for å flytte · dra kantene · dobbeltklikk for å dele'}`}
            onMouseDown={(e) => blockDown(e, block, 'move')}
            onDoubleClick={(e) => {
              e.stopPropagation()
              const t = minuteAt(e)
              onChange((w) => splitBlock(w, block.id, t))
            }}
          >
            {week && offDay && <i className="bm-ot-part" style={{ top: 0, height: '100%' }} />}
            {week && early > 0 && <i className="bm-ot-part" style={{ top: 0, height: `${early}%` }} />}
            {week && late < 100 && <i className="bm-ot-part" style={{ top: `${late}%`, height: `${100 - late}%` }} />}
            {!ghost && !unresolved && (
              <>
                <i className="bm-grip start" onMouseDown={(e) => blockDown(e, block, 'start')} />
                <i className="bm-grip end" onMouseDown={(e) => blockDown(e, block, 'end')} />
              </>
            )}
            {px >= NAME_FROM_PX && <b>{narrow ? (style?.shortLabel ?? name) : name}</b>}
            {px >= TIME_FROM_PX && (
              <em>
                {clock(block.start)}–{clock(block.end)}
              </em>
            )}
            {week && px >= HOURS_FROM_PX && !narrow && (
              <em>
                {hoursText(total - overtime)} t{overtime > EPSILON ? ` + ${hoursText(overtime)} OT` : ''}
              </em>
            )}
            {!week && overtime > EPSILON && <span className="bm-ot-tag">+{hoursText(overtime)}</span>}
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
      {awayAllDay?.kind === 'syk' && <span className="bm-sick">Syk{stored.some((a) => stillOpen.has(a.id)) ? ` · ${stored.filter((a) => stillOpen.has(a.id)).length} uløst` : ''}</span>}
    </span>
  )
}
