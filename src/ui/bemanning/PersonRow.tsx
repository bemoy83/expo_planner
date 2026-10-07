import { memo } from 'react'
import type { ISODate } from '../../domain/dates'
import type { PersonWeek } from '../../domain/staffing'
import type { CompetenceStyle, Person } from '../../domain/types'
import { ABSENCE_LABELS, type DayCell } from './dayCell'
import { clock, hoursText } from './week'

const EPSILON = 0.05

interface Props {
  person: Person
  dates: ISODate[]
  cells: DayCell[]
  week: PersonWeek
  /** The competences people have, in order: one dot each in the label. */
  competences: CompetenceStyle[]
  styles: Map<string, CompetenceStyle>
  focusDate: ISODate
  /** The row's place among the rows shown, for strokes over several rows. */
  rowIndex: number
  /** The competence in focus: blocks of other competences are dimmed. */
  brush: string | null
  /** One character per day: `x` where the brush cannot fill the day. Empty without the brush tool. */
  blocked: string
  /** The days of the row a stroke covers, and what it does to them. */
  strokeFrom: number
  strokeTo: number
  strokeMode: '' | 'paint' | 'paint-half' | 'erase'
  /** The selected day of the row, or -1. */
  selected: number
  actions: RowActions
}

/** What the days of a row tell the grid; the handlers keep their identity (see `useStableActions`). */
export interface RowActions {
  cellDown: (row: number, col: number, event: React.MouseEvent) => void
  cellEnter: (row: number, col: number) => void
  cellMenu: (row: number, col: number, event: React.MouseEvent) => void
}

const colorOf = (styles: Map<string, CompetenceStyle>, competence: string) => ({ '--cc': `var(--${styles.get(competence)?.color ?? 'line-slate'})` }) as React.CSSProperties

function FoldedDay({ cell, styles, brush }: { cell: DayCell; styles: Map<string, CompetenceStyle>; brush: string | null }) {
  const other = (competence: string) => (brush && brush !== competence ? 'other' : '')
  const overtime = cell.overtime > EPSILON ? <span className="bm-ot-tag" title={`${hoursText(cell.overtime)} t overtid`}>+{hoursText(cell.overtime)}</span> : null
  if (cell.offDay) {
    return cell.blocks.length ? (
      <span className="bm-off-blocks">
        {cell.blocks.map((block) => (
          <i key={block.id} className={`${block.unresolved ? 'unresolved' : ''} ${other(block.competence)}`} style={colorOf(styles, block.competence)} title={`${styles.get(block.competence)?.label ?? block.competence} · ${clock(block.start)}–${clock(block.end)}`} />
        ))}
        {overtime}
      </span>
    ) : null
  }
  if (cell.away && cell.away !== 'syk') return <span className="bm-away" title={cell.note || undefined}>{ABSENCE_LABELS[cell.away]}</span>
  return (
    <span className="bm-timeline">
      {cell.hatches.map((hatch) => (
        <i key={hatch.left} className="bm-hatch" style={{ left: `${hatch.left}%`, width: `${hatch.width}%` }} />
      ))}
      {cell.blocks.map((block) => {
        const style = styles.get(block.competence)
        const name = style?.label ?? block.competence
        return (
          <span
            key={block.id}
            className={`bm-block ${block.unresolved ? 'unresolved' : ''} ${other(block.competence)}`}
            style={{ left: `${block.left}%`, width: `${block.width}%`, ...colorOf(styles, block.competence) }}
            title={`${name} · ${clock(block.start)}–${clock(block.end)} · ${hoursText(block.hours)} t${block.unresolved ? ' · uløst' : ''}`}
          >
            {block.label === 'full' ? (
              <>
                <b>{name}</b>
                <em>hel dag</em>
              </>
            ) : block.label === 'name' ? (
              <b>{name}</b>
            ) : block.label === 'short' ? (
              <b>{style?.shortLabel ?? ''}</b>
            ) : null}
          </span>
        )
      })}
      {cell.away === 'syk' && <span className="bm-sick">Syk{cell.unresolved ? ` · ${cell.unresolved} uløst` : ''}</span>}
      {cell.note && cell.away !== 'syk' && <span className="bm-note">{cell.note}</span>}
      {overtime}
    </span>
  )
}

/** One person's week, folded: a label with their competences and hours, and a small timeline per day. */
export const PersonRow = memo(function PersonRow({ person, dates, cells, week, competences, styles, focusDate, rowIndex, brush, blocked, strokeFrom, strokeTo, strokeMode, selected, actions }: Props) {
  const share = week.capacity ? Math.min(1, week.normal / week.capacity) * 100 : 0
  return (
    <div className="bm-row bm-person">
      <div className="bm-label">
        <span className="bm-person-name">
          <span className="bm-name">{person.name}</span>
          <span className="bm-dots">
            {competences.map((style) => (
              <i key={style.key} className={`${person.competences.includes(style.key) ? 'has' : ''} ${style.key === brush ? 'focused' : ''}`} style={{ '--cc': `var(--${style.color})` } as React.CSSProperties} title={person.competences.includes(style.key) ? style.label : undefined} />
            ))}
          </span>
        </span>
        <span className="bm-person-week" title={`${hoursText(week.normal)} av ${hoursText(week.capacity)} t tildelt denne uka${week.overtime > EPSILON ? `, og ${hoursText(week.overtime)} t overtid` : ''}`}>
          <span>
            <b>{hoursText(week.normal)}</b>/{hoursText(week.capacity)}
            {week.overtime > EPSILON && <em> +{hoursText(week.overtime)}</em>}
          </span>
          <i>
            <i style={{ width: `${share}%` }} />
          </i>
        </span>
      </div>
      {dates.map((date, index) => {
        const cell = cells[index]
        const stroke = strokeMode && index >= strokeFrom && index <= strokeTo ? `stroke ${strokeMode}` : ''
        return (
          <div
            key={date}
            className={`bm-cell ${index >= 5 ? 'narrow' : ''} ${cell.offDay ? 'off-day' : ''} ${cell.away === 'syk' ? 'sick' : cell.away ? 'away' : ''} ${date === focusDate ? 'focus-day' : ''} ${blocked[index] === 'x' ? 'blocked' : ''} ${selected === index ? 'selected' : ''} ${stroke}`}
            onMouseDown={(e) => actions.cellDown(rowIndex, index, e)}
            onMouseEnter={() => actions.cellEnter(rowIndex, index)}
            onContextMenu={(e) => actions.cellMenu(rowIndex, index, e)}
          >
            <FoldedDay cell={cell} styles={styles} brush={brush} />
          </div>
        )
      })}
    </div>
  )
})
