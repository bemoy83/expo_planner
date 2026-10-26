import type { MouseEvent, ReactNode } from 'react'
import { Check } from 'lucide-react'
import type { ISODate } from '../../domain/dates'
import type { NeedLabelParts, NeedSegment } from '../../domain/needLabel'
import type { CompetenceStyle } from '../../domain/types'
import { competenceColor } from '../dom'
import { Line } from '../kalender/GridRows'
import { dayClass, type Columns } from '../kalender/gridTypes'
import { hoursShort, signedHours } from '../format'
import { DEMAND_COMPACT_H, DEMAND_H } from './layout'
import { EPSILON } from './week'

/** What Faste and Innleid share of a line of the demand: the label of a day, its thin line, the hours in the label column, and the name of the line. */

const SEGMENT_CLASS: Record<NeedSegment['kind'], string> = { covered: 'covered', waiting: 'waiting', surplus: 'surplus', surplusWaiting: 'surplus waiting', uncoverable: 'uncoverable' }

/** The pieces of a label or a thin line, and the rules between its orders. */
function Fill({ parts }: { parts: NeedLabelParts }) {
  return (
    <>
      {parts.segs.map((seg, i) => (
        <i key={i} className={SEGMENT_CLASS[seg.kind]} style={{ left: `${seg.from * 100}%`, width: `${seg.width * 100}%` }} />
      ))}
      {parts.rules.map((at, i) => (
        <i key={`r${i}`} className="rule" style={{ left: `${at * 100}%` }} />
      ))}
    </>
  )
}

/**
 * A day's demand as a label (`domain/needLabel.ts`): the tint of the competence, its fill, and on it the hours that cover it of
 * those it needs, or, where the label is too narrow for them, what is missing or over, signed. `className` places it.
 */
export function NeedLabel({ parts, className = '' }: { parts: NeedLabelParts; className?: string }) {
  return (
    <span className={`bm-need-label ${parts.alert ? 'alert' : ''} ${className}`}>
      <Fill parts={parts} />
      {parts.of && (
        <b className="bm-need-of">
          {hoursShort(parts.of.done)}/{hoursShort(parts.of.need)}
        </b>
      )}
      {parts.figure !== null && <b className={parts.of ? 'bm-need-signed' : ''}>{signedHours(parts.figure)}</b>}
    </span>
  )
}

/** Compact: the same fill as one thin line, with the figure beside it where `figure` is set. */
export function NeedLine({ parts, figure = false }: { parts: NeedLabelParts; figure?: boolean }) {
  const line = (
    <i className="bm-need-line">
      <Fill parts={parts} />
    </i>
  )
  if (!figure) return line
  return (
    <span className="bm-need-compact">
      {line}
      {parts.figure !== null && <b>{signedHours(parts.figure)}</b>}
    </span>
  )
}

/** The hours a line lacks in the days in view, in the label column: signed, as on the labels, or a check where there are none. */
export function HoursLeft({ hours, compact = false }: { hours: number; compact?: boolean }) {
  return <span className="bm-week-left">{hours > EPSILON ? `${signedHours(-hours)} t` : <Check size={compact ? 11 : 13} aria-label="Dekket" />}</span>
}

/**
 * The name of a line of the demand, as a button across the label column: a competence with its colour, or a project, a place or
 * «Uten prosjekt» under it, indented in the tree (`TreeStep` in `DemandRows.tsx`), with the hours it lacks at the end.
 */
export function LinePick({
  kind = 'competence',
  name,
  hours,
  compact = false,
  glyph,
  kbd,
  pressed,
  disabled = false,
  outer,
  inner,
  title,
  onClick,
}: {
  kind?: 'competence' | 'project' | 'place'
  name: string
  hours: number
  compact?: boolean
  /** Before the colour of a competence: what a click does, as Innleid's unfold. */
  glyph?: ReactNode
  /** After the name: the key that picks it. */
  kbd?: ReactNode
  pressed?: boolean
  disabled?: boolean
  outer?: string
  inner?: string
  title?: string
  onClick?: () => void
}) {
  const indent = kind === 'project' ? 'bm-project-pick' : kind === 'place' ? 'bm-place-pick' : glyph ? 'bm-pick-glyph' : ''
  return (
    <button className={`bm-pick ${indent}`} aria-pressed={pressed} disabled={disabled} data-outer={outer} data-inner={inner} title={title} onClick={onClick}>
      {glyph}
      {kind === 'competence' && <i className="swatch" />}
      <span className="bm-name">{name}</span>
      {kbd}
      <HoursLeft hours={hours} compact={compact} />
    </button>
  )
}

/** What a day of a line of the demand shows: its label, or none on a day with nothing to show, and what it says when it is pointed at. */
export interface NeedDay {
  parts: NeedLabelParts | null
  title: string
  /** Compact: the figure beside the thin line. */
  figure?: boolean
  /** Placed on the label, as `summed`. */
  labelClass?: string
  /** Laid over the day, as the dot of hours carried here. */
  mark?: ReactNode
}

/**
 * A line of the demand, the same in Faste and in Innleid: the competence's colour, its name in the label column (`label`, a `LinePick`),
 * and per day a button with its label, or its thin line when compact, that opens the day. A day `day` gives nothing for is empty.
 * The parts wrap it in a memo of their own, with plain values, so a scroll frame draws no line again.
 */
export function NeedRow({ style, cols, compact, className, label, day, onDay }: { style: CompetenceStyle; cols: Columns; compact: boolean; className: string; label: ReactNode; day: (date: ISODate) => NeedDay | null; onDay: (date: ISODate, event: MouseEvent) => void }) {
  return (
    <Line
      className={`bm-demand ${className} ${compact ? 'compact' : ''}`}
      height={compact ? DEMAND_COMPACT_H : DEMAND_H}
      style={competenceColor(style)}
      label={label}
      cols={cols}
      cells={(date) => {
        const shown = day(date)
        const classes = `${dayClass(cols, date)} cell bm-need`
        if (!shown) return <div key={date} className={classes} />
        const { parts, title, figure = true, labelClass, mark } = shown
        return (
          <button key={date} className={classes} title={title} onClick={(event) => onDay(date, event)}>
            {parts && (compact ? <NeedLine parts={parts} figure={figure} /> : <NeedLabel parts={parts} className={labelClass} />)}
            {mark}
          </button>
        )
      }}
    />
  )
}
