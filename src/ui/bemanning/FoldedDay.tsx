import type { PersonWeek } from '../../domain/staffing'
import type { CompetenceStyle } from '../../domain/types'
import { competenceColor } from '../dom'
import { ABSENCE_LABELS, blockLabel, type BlockNames, type DayCell, type Span } from './dayCell'
import { DAY_INSET, EDGE_W, joinedClass, joinedPlace } from './layout'
import type { EndShape, RunLink } from './runs'
import { EPSILON, hoursText } from './week'

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

interface Props {
  cell: DayCell
  styles: Map<string, CompetenceStyle>
  brush: string | null
  /** The width of the day, in pixels. */
  width: number
  names: BlockNames
  /** The blocks that are joined to the day before or after, see `runs.ts`. Their run has the name, and its ends are the ends to take hold of. */
  links: Map<string, RunLink>
  /** How the blocks are drawn at their ends: joined as their run has them, and to what a stroke would put beside them. */
  shapes: Map<string, EndShape>
  /** A block of the day that a pulled end of a run is cut back into, and where in the block the time that goes lies: hatched as hours that go are. */
  cut?: Span & { blockId: string }
}

/** What a person's day shows when it is folded: a small timeline of the normal day. */
export function FoldedDay({ cell, styles, brush, width, names, links, shapes, cut }: Props) {
  const other = (competence: string) => (brush && brush !== competence ? 'other' : '')
  const overtime = cell.overtime > EPSILON ? <span className="bm-ot-tag" title={`${hoursText(cell.overtime)} t overtid`}>+{hoursText(cell.overtime)}</span> : null
  // A weekend or a holiday with nothing on it is left empty, whatever absence covers it.
  if (cell.offDay && !cell.blocks.length) return overtime && <span className="bm-timeline">{overtime}</span>
  return (
    <span className="bm-timeline">
      {cell.hatches.map((hatch) => (
        <i key={hatch.left} className="bm-hatch" style={{ left: `${hatch.left}%`, width: `${hatch.width}%` }} />
      ))}
      {cell.blocks.map((block, i) => {
        const style = styles.get(block.competence)
        const name = style?.label ?? block.competence
        const link = links.get(block.id)
        // The blocks share the day's width less the air around them, see `.bm-timeline`.
        const blockW = ((width - 2 * DAY_INSET) * block.width) / 100
        // The name comes after a stretch the person is away for at the start of the block, in the room that is left.
        const lead = block.away[0]?.left === 0 ? block.away[0].width : 0
        const label = link ? 'none' : blockLabel((blockW * (100 - lead)) / 100, name, style?.shortLabel ?? '', names, hoursText(block.hours))
        // An end of a run, or of a single day: the first block of the day where nothing comes before it, the last where nothing follows.
        // It is taken hold of only where the block has room for it and for a part to take the block itself by.
        const ends = block.unresolved ? [false, false] : [i === 0 && !link?.prev, i === cell.blocks.length - 1 && !link?.next]
        const roomy = blockW >= (ends.filter(Boolean).length + 1) * EDGE_W
        const [atStart, atEnd] = roomy ? ends : [false, false]
        const shape = shapes.get(block.id)
        return (
          <span
            key={block.id}
            className={`bm-block ${joinedClass(shape)} ${block.unresolved ? 'unresolved' : ''} ${block.replaced ? 'replaced' : ''} ${other(block.competence)}`}
            style={{ ...joinedPlace(block, shape), paddingLeft: lead ? `calc(${lead}% + 7px)` : undefined, ...colorOf(styles, block.competence) }}
            title={`${name} · ${block.times} · ${hoursText(block.hours)} t${block.replaced ? ' · teller ikke, behovet er dekket av andre' : block.unresolved ? ' · uløst' : block.away.length ? ' · borte en del av tiden, de timene er tilbake i behovet' : ''}`}
          >
            {(cut?.blockId === block.id ? [cut, ...block.away] : block.away).map((part, at) => (
              <i key={at} className="bm-away-part" style={{ left: `${part.left}%`, width: `${part.width}%` }} />
            ))}
            {atStart && <i className="bm-edge start" data-edge="start" data-block={block.id} />}
            {atEnd && <i className="bm-edge end" data-edge="end" data-block={block.id} />}
            {label === 'short' ? <b>{style?.shortLabel}</b> : label !== 'none' ? <b>{name}</b> : null}
            {label === 'hours' && <em>{hoursText(block.hours)}</em>}
          </span>
        )
      })}
      {cell.away && (
        <span className={`bm-reason ${cell.away === 'syk' ? 'sick' : ''}`} title={cell.note || undefined}>
          {ABSENCE_LABELS[cell.away]}
          {cell.unresolved ? ` · ${cell.unresolved} uløst` : ''}
        </span>
      )}
      {cell.note && !cell.away && <span className="bm-note">{cell.note}</span>}
      {overtime}
    </span>
  )
}
