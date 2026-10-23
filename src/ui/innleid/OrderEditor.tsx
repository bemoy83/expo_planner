import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsDownUp, Plus, X } from 'lucide-react'
import { dayOfMonth, dayText, monthShort, weekdayShort, type ISODate } from '../../domain/dates'
import { groupWaits, HOURS_NOISE, shiftText, type OrderGroup } from '../../domain/hire'
import type { CompetenceStyle } from '../../domain/types'
import { hoursShort } from '../bemanning/week'
import { signedHours } from './hours'
import { useInnleid } from './InnleidScope'
import { AnswerGlyph, Stepper } from './OrderPopovers'

/** The days picked, as text: «tor 8. okt», or «tor 8.–man 12. okt». */
const daysText = (from: ISODate, to: ISODate) => (from === to ? dayText(from) : `${weekdayShort(from)} ${dayOfMonth(from)}.${monthShort(from) === monthShort(to) ? '' : ` ${monthShort(from)}`}–${dayText(to)}`)

const people = (group: OrderGroup): string => {
  const counts = group.orders.map((order) => order.fte)
  const low = Math.min(...counts)
  const high = Math.max(...counts)
  return low === high ? String(low) : `${low}–${high}`
}

/**
 * The label of a competence whose days are picked: the editor of its orders on those days. A line per supplier
 * and time, with the supplier, the shift, the people, the answer and a cross; and «+ Leverandør» under them.
 */
export function OrderEditor({ style }: { style: CompetenceStyle }) {
  const il = useInnleid()
  const { open, openDates, groups, picked, summary, suppliers, wd, edits, setPop, projectLines, projectName } = il
  if (!open || !summary) return null
  const nameOf = (id: string) => suppliers.find((supplier) => supplier.id === id)?.name ?? 'Ukjent leverandør'
  const offers = suppliers.filter((supplier) => supplier.competences.includes(style.key) && supplier.shifts.length)
  const several = openDates.length > 1
  const pop = (kind: 'add' | 'supplier' | 'shift' | 'answer', group: OrderGroup | null) => (e: React.MouseEvent<HTMLElement>) => {
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
        <button className="icon-button" aria-label="Forrige kompetanse" title="Forrige kompetanse" onClick={() => il.stepCompetence(-1)}>
          <ChevronUp size={15} aria-hidden />
        </button>
        <button className="icon-button" aria-label="Neste kompetanse" title="Neste kompetanse" onClick={() => il.stepCompetence(1)}>
          <ChevronDown size={15} aria-hidden />
        </button>
      </div>
      <div className="il-daybar">
        <span className="il-days">
          <button aria-label="Forrige dag som mangler timer" title={il.shortBefore ? `Forrige dag som mangler timer: ${dayText(il.shortBefore)}` : 'Ingen tidligere dag mangler timer'} disabled={!il.shortBefore} onClick={() => il.stepShort(-1)}>
            <ChevronLeft size={14} aria-hidden />
          </button>
          <b title="Piltastene flytter en dag om gangen. Shift utvider.">{daysText(open.from, open.to)}</b>
          <button aria-label="Neste dag som mangler timer" title={il.shortAfter ? `Neste dag som mangler timer: ${dayText(il.shortAfter)}` : 'Ingen senere dag mangler timer'} disabled={!il.shortAfter} onClick={() => il.stepShort(1)}>
            <ChevronRight size={14} aria-hidden />
          </button>
        </span>
        <span className="il-sum">
          {summary.rest <= HOURS_NOISE && !groups.length ? (
            <span>Ingen restbehov</span>
          ) : summary.short > HOURS_NOISE ? (
            <b>
              {signedHours(-summary.short)} t ≈ {summary.peopleShort} pers.
            </b>
          ) : summary.over > HOURS_NOISE ? (
            <b>{signedHours(summary.over)} t over</b>
          ) : (
            <span>Dekket</span>
          )}
          <small>
            {summary.people} {several ? 'persondager' : 'pers.'} · {hoursShort(summary.planned)} av {hoursShort(summary.rest)} t
          </small>
        </span>
      </div>
      {groups.length > 0 && (
        <div className="il-orders">
          {groups.map((group) => {
            const waits = groupWaits(group)
            const have = new Set(group.orders.map((order) => order.date))
            return (
              <div key={group.key} className={`il-order ${group === picked ? 'on' : ''}`} onClick={() => il.pick(group.key)}>
                <div className="il-order-line">
                  <button className="il-order-supplier" title="Bytt leverandør" onClick={pop('supplier', group)}>
                    <span>{nameOf(group.supplierId)}</span>
                    <ChevronDown size={11} aria-hidden />
                  </button>
                  <button className="il-order-shift" title="Skift eller egen tid" onClick={pop('shift', group)}>
                    {shiftText(group, wd)}
                    <ChevronDown size={11} aria-hidden />
                  </button>
                  <Stepper value={group.orders[0].fte} label="Antall personer" onStep={(by) => edits.count(group, by)} />
                  {people(group) !== String(group.orders[0].fte) && <span className="il-order-spread" title="Antallet varierer over dagene">{people(group)}</span>}
                  <button className={`il-status ${waits ? 'waits' : ''}`} data-answer={group.key} title="Svar fra leverandøren (Enter)" onClick={pop('answer', group)}>
                    <AnswerGlyph waits={waits} />
                    {waits ? 'Venter' : 'OK'}
                  </button>
                  <button className="row-action" aria-label="Fjern bestillingen" title="Fjern (Delete)" onClick={(e) => (e.stopPropagation(), edits.remove(group))}>
                    <X size={13} aria-hidden />
                  </button>
                </div>
                <div className="il-order-for">
                    <select
                      className="il-order-project"
                      aria-label="Prosjekt"
                      title="Prosjektet folkene skal til. Det står i bestillingen til leverandøren."
                      value={group.projectNo ?? ''}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => edits.project(group, e.target.value || null)}
                    >
                      <option value="">Uten prosjekt</option>
                      {[...new Set([...(group.projectNo ? [group.projectNo] : []), ...projectLines.map((line) => line.projectNo)])].map((projectNo) => (
                        <option key={projectNo} value={projectNo}>
                          {projectName(projectNo)}
                        </option>
                      ))}
                    </select>
                </div>
                {several && have.size < openDates.length && (
                  <div className="il-order-days">
                    {openDates.map((date) => (
                      <i key={date} className={have.has(date) ? 'on' : ''} title={dayText(date)} />
                    ))}
                    <button className="link" title="Bestill det samme på de valgte dagene som mangler" onClick={(e) => (e.stopPropagation(), edits.fill(group))}>
                      Fyll
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="il-add">
        <button disabled={!offers.length} onClick={pop('add', null)}>
          <Plus size={13} aria-hidden /> Leverandør <ChevronDown size={11} aria-hidden />
        </button>
        <span>
          {!offers.length
            ? `Ingen leverandør tilbyr ${style.label} ennå.`
            : summary.short > HOURS_NOISE
              ? 'Antallet fylles ut så det dekker det som mangler.'
              : groups.length
                ? 'Legg til en leverandør til med én person per dag.'
                : `Ingen innleid ${several ? 'disse dagene' : 'denne dagen'}${summary.rest <= HOURS_NOISE ? ' – og ikke noe restbehov' : ''}.`}
        </span>
      </div>
    </div>
  )
}
