import { Check, ChevronDown, ChevronsDownUp, Ellipsis, Paintbrush } from 'lucide-react'
import { dayOfMonth, dayText, monthShort, weekdayShort, type ISODate } from '../../domain/dates'
import { groupWaits, shiftOf, shiftText, type OrderGroup } from '../../domain/hire'
import type { CompetenceStyle } from '../../domain/types'
import { useInnleid } from './InnleidScope'
import { AnswerGlyph, Stepper } from './OrderPopovers'

/** The days picked, as text: «tor 8. okt», or «tor 8.–man 12. okt». */
const daysText = (from: ISODate, to: ISODate) => (from === to ? dayText(from) : `${weekdayShort(from)} ${dayOfMonth(from)}.${monthShort(from) === monthShort(to) ? '' : ` ${monthShort(from)}`}–${dayText(to)}`)

/** The people of a line: the count of most of its days (the median), marked where the days differ. */
const people = (group: OrderGroup): { count: number; differs: boolean } => {
  const counts = group.orders.map((order) => order.fte).sort((a, b) => a - b)
  return { count: counts[Math.floor(counts.length / 2)], differs: counts[0] !== counts[counts.length - 1] }
}

/**
 * The label of a competence whose days are picked: the editor of its orders on those days, slim, as what the grid
 * says is left out of it: the days are picked in the grid (← → move them), the sums are the label on the open line,
 * and the project is the line the days were picked on. A line per order, on the editor's track: the supplier, the
 * people, the answer and ⋯; and under them the supplier of the brush, picked from those that offer the competence: picking it orders nothing, a stroke does.
 */
export function OrderEditor({ style }: { style: CompetenceStyle }) {
  const il = useInnleid()
  const { open, openDates, openLine, groups, picked, suppliers, wd, edits, setPop, projectName, tool, brush } = il
  if (!open) return null
  const nameOf = (id: string) => suppliers.find((supplier) => supplier.id === id)?.name ?? 'Ukjent leverandør'
  const offers = suppliers.filter((supplier) => supplier.competences.includes(style.key) && supplier.shifts.length)
  const several = openDates.length > 1
  // The brush, where it is held with a supplier that offers the competence.
  const brushed = tool === 'paint' && brush?.competences.includes(style.key) ? brush : null
  const pop = (kind: 'brush' | 'more' | 'answer', group: OrderGroup | null) => (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    if (group) il.pick(group.key)
    setPop({ kind, group: group?.key ?? null, at: e.currentTarget.getBoundingClientRect() })
  }
  return (
    <div className="il-editor" onMouseDown={(e) => e.stopPropagation()}>
      <div className="il-editor-head">
        <button className="il-fold" title="Fold sammen (Esc)" onClick={il.fold}>
          <ChevronsDownUp size={14} aria-hidden />
          <i className="swatch" />
          {style.label}
        </button>
        <span className="il-editor-for" title="Piltastene flytter dagene. Shift utvider.">
          {openLine ? `${openLine.name} · ` : ''}
          {open.from && open.to ? daysText(open.from, open.to) : 'Velg dager i rutenettet'}
        </span>
      </div>
      {groups.length > 0 && (
        <div className="il-orders">
          {groups.map((group) => {
            const waits = groupWaits(group)
            const days = new Set(group.orders.map((order) => order.date)).size
            const { count, differs } = people(group)
            return (
              <div key={group.key} className={`il-order ${group === picked ? 'on' : ''}`} onClick={() => il.pick(group === picked ? null : group.key)}>
                <span className="il-order-supplier" title={`${nameOf(group.supplierId)} · ${group.projectNo ? projectName(group.projectNo) : 'Uten prosjekt'} · ${shiftText(group, wd)}${days < openDates.length ? `\n${days} av ${openDates.length} dager` : ''}`}>
                  <span>{nameOf(group.supplierId)}</span>
                  {!openLine && <small>{group.projectNo ? projectName(group.projectNo) : 'Uten prosjekt'}</small>}
                  {shiftOf(group, wd) !== 'dag' && <small className="il-order-num">{shiftText(group, wd)}</small>}
                  {several && days < openDates.length && <small className="il-order-num">{days}/{openDates.length} d</small>}
                </span>
                <span onClick={(e) => e.stopPropagation()}>
                  <Stepper value={count} label={differs ? 'Antall personer (varierer over dagene)' : 'Antall personer'} onStep={(by) => edits.count(group, by)} />
                </span>
                <button className={`il-status ${waits ? 'waits' : ''}`} data-answer={group.key} title="Svar fra leverandøren (Enter)" onClick={pop('answer', group)}>
                  {waits ? <AnswerGlyph waits /> : <Check size={13} aria-hidden />}
                  {waits ? 'Venter' : 'Bekreftet'}
                </button>
                <button className="icon-button il-order-more" aria-label="Mer" title="Fyll, bytt, flytt eller fjern" onClick={pop('more', group)}>
                  <Ellipsis size={15} aria-hidden />
                </button>
              </div>
            )
          })}
        </div>
      )}
      <div className="il-add">
        <button disabled={!offers.length} title="Velg leverandøren penselen bestiller fra" onClick={pop('brush', null)}>
          <Paintbrush size={13} aria-hidden /> {brushed ? brushed.name : 'Leverandør'} <ChevronDown size={11} aria-hidden />
        </button>
        <span>{!offers.length ? `Ingen leverandør tilbyr ${style.label} ennå.` : brushed ? `Mal over dagene for å bestille det som mangler${openLine ? '' : ', fordelt på prosjektene'}.` : 'Velg en leverandør, og mal over dagene med penselen.'}</span>
      </div>
    </div>
  )
}
