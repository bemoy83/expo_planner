import { useState } from 'react'
import { Copy, History, Plus, X } from 'lucide-react'
import { formatFte } from '../../domain/calc'
import type { DemandLine } from '../../domain/types'
import { count } from '../dom'

const hours = (value: number) => (value ? formatFte(value, 1) : '–')

interface Props {
  /** The name of the project the year before. */
  previousName: string
  missing: DemandLine[]
  /** How many of last year's lines are registered this year already. */
  present: number
  /** The halls the project has booked this year: a line for another hall is marked. */
  booked: Set<string>
  competenceColor: (competence: string) => string | undefined
  onFetch: (lines: DemandLine[]) => void
  /** «Juster først»: the line fills the form. */
  onAdjust: (line: DemandLine) => void
  /** «Ikke i år»: the line is not offered again for this project. */
  onDismiss: (line: DemandLine) => void
}

/** «Fra i fjor»: the planner's own lines of the year before that are not registered this year, folded until it is opened. */
export function FromLastYear({ previousName, missing, present, booked, competenceColor, onFetch, onAdjust, onDismiss }: Props) {
  const [open, setOpen] = useState(false)
  if (!missing.length) return null
  const sum = (field: 'assemblyHours' | 'dismantleHours') => missing.reduce((total, line) => total + line[field], 0)
  return (
    <section className="last-year" aria-label="Fra i fjor">
      <div className="last-year-head">
        <History size={15} aria-hidden />
        <b>Fra i fjor · {previousName}</b>
        <span className="muted">
          {count(missing.length, 'linje er', 'linjer er')} ikke registrert i år · {hours(sum('assemblyHours'))} t mont · {hours(sum('dismantleHours'))} t dem
          {present > 0 && ` · ${present} finnes allerede`}
        </span>
        <span className="toolbar-gap" />
        <button className="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Skjul' : 'Vis'}
        </button>
        <button onClick={() => onFetch(missing)}>Hent alle {missing.length}</button>
      </div>
      {open && (
        <ul className="last-year-list">
          {missing.map((line) => {
            const color = competenceColor(line.competence)
            const hallOk = !line.hall || booked.has(line.hall)
            return (
              <li key={line.id}>
                {color ? <i className="competence-dot" style={{ background: color }} aria-hidden /> : <i className="competence-dot" aria-hidden />}
                <span className="last-year-work">
                  {line.workType}
                  {line.comment && <small className="muted">{line.comment}</small>}
                </span>
                <span className={hallOk ? '' : 'warn-text'} title={hallOk ? '' : `Prosjektet har ikke booket ${line.hall} i år`}>
                  {line.hall || 'Uten hall'}
                  {!hallOk && ' – ikke booket i år'}
                </span>
                <span className="num">{hours(line.assemblyHours)}</span>
                <span className="num">{hours(line.dismantleHours)}</span>
                <span className="last-year-actions">
                  <button className="row-action" title="Ikke i år: arbeidet skal ikke gjøres i år, og foreslås ikke igjen" aria-label="Ikke i år" onClick={() => onDismiss(line)}>
                    <X size={13} aria-hidden />
                  </button>
                  <button className="row-action" title="Juster først: fyller feltet over" aria-label="Juster først" onClick={() => onAdjust(line)}>
                    <Copy size={13} aria-hidden />
                  </button>
                  <button className="ghost" onClick={() => onFetch([line])}>
                    <Plus size={13} aria-hidden /> Hent
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
