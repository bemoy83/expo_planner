import type { PersonWeek } from '../../domain/staffing'
import type { CompetenceStyle } from '../../domain/types'
import { competenceColor } from '../dom'
import { ABSENCE_LABELS, blockLabel, type BlockNames, type DayCell } from './dayCell'
import { DAY_INSET, EDGE_W } from './layout'
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

/** Where in a block the time that a pulled end takes from it lies, as shares of the part of the block that is drawn: hatched as hours that go are. */
const cutPlace = (block: { start: number; end: number }, cut: { start: number; end: number }, dayStart: number, dayEnd: number) => {
  const from = Math.max(block.start, dayStart)
  const length = Math.min(block.end, dayEnd) - from
  const start = Math.max(cut.start, from)
  return { left: `${((start - from) / length) * 100}%`, width: `${((Math.min(cut.end, from + length) - start) / length) * 100}%` }
}

/** What a person's day shows when it is folded: a small timeline of the normal day, `width` pixels wide. */
export function FoldedDay({ cell, styles, brush, width, names, links, shapes = links, edges = false, cut, dayStart = 0, dayEnd = 0 }: { cell: DayCell; styles: Map<string, CompetenceStyle>; brush: string | null; width: number; names: BlockNames; /** The blocks that are joined to the day before or after, see `runs.ts`. Their run has the name. */ links?: Map<string, RunLink>; /** How the blocks are drawn at their ends: joined as their run has them, and to what a stroke would put beside them. Without it, as `links`. */ shapes?: Map<string, EndShape>; /** The ends of a run, and of a single day, can be taken hold of. */ edges?: boolean; /** A block of the day that a pulled end of a run is cut back into, with the time of it that goes, and the normal day to place it in. */ cut?: { blockId: string; start: number; end: number }; dayStart?: number; dayEnd?: number }) {
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
        // The blocks share the day's width less the air around them, see `.bm-timeline`.
        const link = links?.get(block.id)
        // The name comes after a stretch the person is away for at the start of the block, in the room that is left.
        const lead = block.away[0]?.left === 0 ? block.away[0].width : 0
        const label = link ? 'none' : blockLabel(((width - 2 * DAY_INSET) * block.width * (100 - lead)) / 10000, name, style?.shortLabel ?? '', names, hoursText(block.hours))
        // A block that goes on reaches over the air beside it, and over the rule after the day.
        // An end is taken hold of only where the block has room for it and for a part to take the block itself by.
        const ends = edges && !block.unresolved ? [i === 0 && !link?.prev, i === cell.blocks.length - 1 && !link?.next] : [false, false]
        const roomy = ((width - 2 * DAY_INSET) * block.width) / 100 >= (ends.filter(Boolean).length + 1) * EDGE_W
        const [atStart, atEnd] = roomy ? ends : [false, false]
        const shape = shapes?.get(block.id)
        const before = shape?.prev ? DAY_INSET : 0
        const after = shape?.next ? DAY_INSET + 1 : 0
        return (
          <span
            key={block.id}
            className={`bm-block ${shape?.prev ? 'join-prev' : ''} ${shape?.next ? 'join-next' : ''} ${shape?.meetsBefore ? 'meet-prev' : ''} ${shape?.meetsAfter ? 'meet-next' : ''} ${block.unresolved ? 'unresolved' : ''} ${block.replaced ? 'replaced' : ''} ${other(block.competence)}`}
            style={{ left: `calc(${block.left}% - ${before}px)`, width: `calc(${block.width}% + ${before + after}px)`, paddingLeft: lead ? `calc(${lead}% + 7px)` : undefined, ...colorOf(styles, block.competence) }}
            title={`${name} · ${block.times} · ${hoursText(block.hours)} t${block.replaced ? ' · teller ikke, behovet er dekket av andre' : block.unresolved ? ' · uløst' : block.away.length ? ' · borte en del av tiden, de timene er tilbake i behovet' : ''}`}
          >
            {cut?.blockId === block.id && <i className="bm-away-part" style={cutPlace(block, cut, dayStart, dayEnd)} />}
            {block.away.map((part) => (
              <i key={part.left} className="bm-away-part" style={{ left: `${part.left}%`, width: `${part.width}%` }} />
            ))}
            {/* An end of a run, or of a single day: the first block of the day where nothing comes before it, the last where nothing follows. */}
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
