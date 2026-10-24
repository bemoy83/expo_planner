import { useState, type ReactNode } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { typeAndRate } from '../../domain/kpi'
import { parseDecimal } from '../../domain/numbers'
import { ownTotals, parseHours, type HallSpans } from '../../domain/ownDemand'
import { DRAFT_BASIS, PLANNED_BASIS, type DemandLine, type KpiConfig } from '../../domain/types'
import { TriCheckbox } from '../common'
import { count } from '../dom'
import { useCompetenceColor } from './format'
import { formatFte, hoursOrDash } from '../format'

const shortDate = (date: string) => `${Number(date.slice(8, 10))}.${Number(date.slice(5, 7))}`

/** A value of a line shown as text, edited in place on a click: saved on Enter or when the field is left, put back on Esc. */
function EditCell({ value, shown, placeholder, className = '', onCommit }: { value: string; shown: ReactNode; placeholder?: string; className?: string; onCommit: (text: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  if (draft === null)
    return (
      <button className={`edit-cell ${className}`} onClick={() => setDraft(value)}>
        {shown || <span className="edit-placeholder">{placeholder}</span>}
      </button>
    )
  return (
    <input
      className={`edit-input ${className}`}
      autoFocus
      value={draft}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft)
        setDraft(null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          e.stopPropagation()
          setDraft(null)
        }
      }}
    />
  )
}

interface Props {
  lines: DemandLine[]
  /** The projects in the order they are listed, with their names. */
  projects: [string, string][]
  /** Per project, the halls it has booked with their days. */
  spans: Map<string, Map<string, HallSpans>>
  /** One project is open: its booked halls are listed even where they have no lines yet. */
  single: boolean
  selected: Set<string>
  onSelect: (selected: Set<string>) => void
  /** Lines just added, which light up for a moment. */
  flash: Set<string>
  kpi: KpiConfig
  hoursPerDay: number
  onUpdate: (line: DemandLine, patch: Partial<DemandLine>) => void
  onRemove: (lines: DemandLine[]) => void
  /** «+ Linje i D1»: the context is set to the project and the hall, and the focus goes to Arbeid. */
  onAddHere: (projectNo: string, hall: string) => void
  onTemplate: (line: DemandLine) => void
}

/** The planner's own lines, grouped by project and hall, edited in place. Totals count the lines that are planned with. */
export function OwnLines({ lines, projects, spans, single, selected, onSelect, flash, kpi, hoursPerDay, onUpdate, onRemove, onAddHere, onTemplate }: Props) {
  const competenceColor = useCompetenceColor()
  const toggle = (ls: DemandLine[], on: boolean) => {
    const next = new Set(selected)
    for (const l of ls) if (on) next.add(l.id)
    else next.delete(l.id)
    onSelect(next)
  }
  /** A new amount gives new hours where the work type is on KPI with a rate. */
  const withQuantity = (line: DemandLine, quantity: number | null): Partial<DemandLine> => {
    const { rate } = typeAndRate(kpi, line.workType)
    if (!rate || !quantity) return { quantity }
    return { quantity, assemblyHours: rate.assembly ? quantity / rate.assembly : 0, dismantleHours: rate.dismantle ? quantity / rate.dismantle : 0 }
  }
  /** Hours typed in a cell, short or not; a text that cannot be read changes nothing, and an empty one is none. */
  const withHours = (line: DemandLine, field: 'assemblyHours' | 'dismantleHours', text: string) => {
    const typed = parseHours(text, hoursPerDay)
    if (!typed) onUpdate(line, { [field]: 0 })
    else if (!Number.isNaN(typed.hours)) onUpdate(line, { [field]: typed.hours })
  }

  const allPicked = lines.every((l) => selected.has(l.id))
  const shown = projects.filter(([no]) => lines.some((l) => l.projectNo === no) || single)
  if (!shown.length) return <p className="muted own-empty">Ingen egne linjer ennå.</p>
  return (
    <table className="ledger canvas-table own-lines">
      <thead>
        <tr>
          <th className="pick">
            {/* One project has no row of its own: its lines are picked all at once in the heading. */}
            {single && lines.length > 0 && <TriCheckbox label="Velg prosjektets linjer" checked={allPicked} partial={!allPicked && lines.some((l) => selected.has(l.id))} onChange={(on) => toggle(lines, on)} />}
          </th>
          <th>Arbeid</th>
          <th>Kompetanse</th>
          <th className="num">Avd.</th>
          <th className="num">Mengde</th>
          <th className="num">Mont. t</th>
          <th className="num">Demont. t</th>
          <th>Grunnlag</th>
          <th className="actions" />
        </tr>
      </thead>
      {shown.map(([no, name]) => {
        const mine = lines.filter((l) => l.projectNo === no)
        const booked = spans.get(no) ?? new Map<string, HallSpans>()
        const halls = [...(single ? booked.keys() : []), ...mine.map((l) => l.hall)].filter((hall, index, all) => all.indexOf(hall) === index)
        halls.sort((a, b) => (a === '' ? 1 : b === '' ? -1 : 0))
        const all = mine.length > 0 && mine.every((l) => selected.has(l.id))
        return (
          <tbody key={no} className="own-project">
            {!single && (
              <tr className="project-row">
                <td className="pick">{mine.length > 0 && <TriCheckbox label="Velg prosjektets linjer" checked={all} partial={!all && mine.some((l) => selected.has(l.id))} onChange={(on) => toggle(mine, on)} />}</td>
                <td colSpan={3}>
                  {name} <span className="project-no">{no}</span> <span className="muted small">{count(mine.length, 'linje', 'linjer')}</span>
                </td>
                <td />
                <td className="num">{hoursOrDash(ownTotals(mine).assembly)}</td>
                <td className="num">{hoursOrDash(ownTotals(mine).dismantle)}</td>
                <td colSpan={2} />
              </tr>
            )}
            {halls.map((hall) => {
              const here = mine.filter((l) => l.hall === hall)
              const days = booked.get(hall)
              return [
                <tr key={`hall|${hall}`} className="hall-row">
                  <td />
                  <td colSpan={4}>
                    <span className="hall-name">{hall ? <b>{hall}</b> : <b className="warn-text">Uten hall</b>}</span>
                    {days ? (
                      <span className="hall-days" title={[days.assembly && `Opp ${days.assembly.start} – ${days.assembly.end}`, days.dismantle && `Ned ${days.dismantle.start} – ${days.dismantle.end}`].filter(Boolean).join(' · ')}>
                        {days.assembly && (
                          <>
                            <i className="phase-swatch mon" aria-hidden />
                            {shortDate(days.assembly.start)}–{shortDate(days.assembly.end)}
                          </>
                        )}
                        {days.dismantle && (
                          <>
                            <i className="phase-swatch dem" aria-hidden />
                            {shortDate(days.dismantle.start)}–{shortDate(days.dismantle.end)}
                          </>
                        )}
                      </span>
                    ) : (
                      hall && <span className="warn-text small">ikke booket av prosjektet</span>
                    )}
                  </td>
                  <td className="num">{here.length > 0 && hoursOrDash(ownTotals(here).assembly)}</td>
                  <td className="num">{here.length > 0 && hoursOrDash(ownTotals(here).dismantle)}</td>
                  <td colSpan={2} className="hall-add">
                    <button className="link" onClick={() => onAddHere(no, hall)}>
                      <Plus size={13} aria-hidden /> Linje i {hall || 'prosjektet'}
                    </button>
                  </td>
                </tr>,
                ...here.map((line) => {
                  const color = competenceColor(line.competence)
                  return (
                    <tr key={line.id} className={[selected.has(line.id) && 'selected', flash.has(line.id) && 'flash', line.basis !== PLANNED_BASIS && 'draft'].filter(Boolean).join(' ') || undefined}>
                      <td className="pick">
                        <input type="checkbox" aria-label="Velg linjen" checked={selected.has(line.id)} onChange={(e) => toggle([line], e.target.checked)} />
                      </td>
                      <td>
                        <span className="own-work-cell">
                          <span className="own-work-name">{line.workType}</span>
                          {line.replaces && (
                            <span className="replaces-tag" title="Erstatter en Visma-linje som er utelatt">
                              erstatter Visma
                            </span>
                          )}
                          <EditCell className="own-comment-cell" value={line.comment} shown={line.comment} placeholder="kommentar" onCommit={(comment) => onUpdate(line, { comment: comment.trim() })} />
                        </span>
                      </td>
                      <td>
                        <span className="competence">
                          {color && <i className="competence-dot" style={{ background: color }} aria-hidden />}
                          {line.competence}
                        </span>
                      </td>
                      <td className="num">{line.avdeling || '–'}</td>
                      <td className="num">
                        <EditCell
                          value={line.quantity === null ? '' : formatFte(line.quantity, 3)}
                          shown={line.quantity === null ? '–' : `${formatFte(line.quantity, 1)} ${line.unit}`}
                          onCommit={(text) => onUpdate(line, withQuantity(line, text.trim() ? (parseDecimal(text) ?? line.quantity) : null))}
                        />
                      </td>
                      <td className="num">
                        <EditCell value={formatFte(line.assemblyHours, 2)} shown={hoursOrDash(line.assemblyHours)} onCommit={(text) => withHours(line, 'assemblyHours', text)} />
                      </td>
                      <td className="num">
                        <EditCell value={formatFte(line.dismantleHours, 2)} shown={hoursOrDash(line.dismantleHours)} onCommit={(text) => withHours(line, 'dismantleHours', text)} />
                      </td>
                      <td>
                        <button
                          className={`pill button ${line.basis === PLANNED_BASIS ? 'ok' : ''}`}
                          title={line.basis === PLANNED_BASIS ? 'Teller i behovet. Klikk for å gjøre den til utkast.' : 'Teller ikke ennå. Klikk for å planlegge med den.'}
                          onClick={() => onUpdate(line, { basis: line.basis === PLANNED_BASIS ? DRAFT_BASIS : PLANNED_BASIS })}
                        >
                          {line.basis || '(uten grunnlag)'}
                        </button>
                      </td>
                      <td className="actions">
                        <button className="row-action" title="Bruk som mal i feltet over" onClick={() => onTemplate(line)}>
                          <Copy size={13} aria-hidden />
                        </button>
                        <button className="row-action" title="Slett" onClick={() => onRemove([line])}>
                          <Trash2 size={13} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  )
                }),
              ]
            })}
          </tbody>
        )
      })}
    </table>
  )
}
