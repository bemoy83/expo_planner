import type { PersonWeek } from '../../domain/staffing'
import type { CompetenceStyle } from '../../domain/types'
import { competenceColor } from '../dom'
import { ABSENCE_LABELS, blockLabel, type BlockNames, type DayCell } from './dayCell'
import { clock, EPSILON, hoursText } from './week'

const colorOf = (styles: Map<string, CompetenceStyle>, competence: string) => competenceColor(styles.get(competence))

/** A person's hours in the week: normal time of what they have, overtime after it, and a meter of the normal time. */
export function WeekMeter({ week, overLimit = false }: { week: PersonWeek; /** The week's overtime is above the limit (R36). */ overLimit?: boolean }) {
  const share = week.capacity ? Math.min(1, week.normal / week.capacity) * 100 : 0
  return (
    <span className="bm-person-week" title={`${hoursText(week.normal)} av ${hoursText(week.capacity)} t tildelt denne uka${week.overtime > EPSILON ? `, og ${hoursText(week.overtime)} t overtid` : ''}`}>
      <span>
        <b>{hoursText(week.normal)}</b>/{hoursText(week.capacity)}
        {week.overtime > EPSILON && <em className={overLimit ? 'over-limit' : ''}> +{hoursText(week.overtime)}</em>}
      </span>
      <i>
        <i style={{ width: `${share}%` }} />
      </i>
    </span>
  )
}

/** What a person's day shows when it is folded: a small timeline of the normal day, `width` pixels wide. */
export function FoldedDay({ cell, styles, brush, width, names }: { cell: DayCell; styles: Map<string, CompetenceStyle>; brush: string | null; width: number; names: BlockNames }) {
  const other = (competence: string) => (brush && brush !== competence ? 'other' : '')
  const overtime = cell.overtime > EPSILON ? <span className="bm-ot-tag" title={`${hoursText(cell.overtime)} t overtid`}>+{hoursText(cell.overtime)}</span> : null
  if (cell.offDay) {
    return cell.blocks.length ? (
      <span className="bm-off-blocks">
        {cell.blocks.map((block) => (
          <i key={block.id} className={`${block.unresolved ? 'unresolved' : ''} ${block.replaced ? 'replaced' : ''} ${other(block.competence)}`} style={colorOf(styles, block.competence)} title={`${styles.get(block.competence)?.label ?? block.competence} · ${clock(block.start)}–${clock(block.end)}`} />
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
        // The blocks share the day's width less the air around them, see `.bm-timeline`.
        const label = blockLabel(((width - 10) * block.width) / 100, name, style?.shortLabel ?? '', names, hoursText(block.hours))
        return (
          <span
            key={block.id}
            className={`bm-block ${block.unresolved ? 'unresolved' : ''} ${block.replaced ? 'replaced' : ''} ${other(block.competence)}`}
            style={{ left: `${block.left}%`, width: `${block.width}%`, ...colorOf(styles, block.competence) }}
            title={`${name} · ${clock(block.start)}–${clock(block.end)} · ${hoursText(block.hours)} t${block.replaced ? ' · teller ikke, behovet er dekket av andre' : block.unresolved ? ' · uløst' : ''}`}
          >
            {label === 'short' ? <b>{style?.shortLabel}</b> : label !== 'none' ? <b>{name}</b> : null}
            {label === 'hours' && <em>{hoursText(block.hours)}</em>}
          </span>
        )
      })}
      {cell.away === 'syk' && <span className="bm-sick">Syk{cell.unresolved ? ` · ${cell.unresolved} uløst` : ''}</span>}
      {cell.note && cell.away !== 'syk' && <span className="bm-note">{cell.note}</span>}
      {overtime}
    </span>
  )
}
