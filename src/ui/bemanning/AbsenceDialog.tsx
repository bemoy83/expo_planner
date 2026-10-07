import { useState } from 'react'
import type { ISODate } from '../../domain/dates'
import { absenceSpans, addAbsence, type AbsenceInput } from '../../domain/staffing'
import type { Person, Unavailability, UnavailabilityKind, WorkdaySettings } from '../../domain/types'
import { X } from 'lucide-react'
import { ABSENCE_LABELS } from './dayCell'
import { clock } from './week'

const KINDS: UnavailabilityKind[] = ['ferie', 'kurs', 'syk', 'annet']

const fmtDate = (date: ISODate) => `${Number(date.slice(8))}.${Number(date.slice(5, 7))}.${date.slice(0, 4)}`
/** «12:00» as minutes after midnight, or `null`. */
const minutes = (text: string): number | null => (/^\d{2}:\d{2}$/.test(text) ? Number(text.slice(0, 2)) * 60 + Number(text.slice(3)) : null)

interface Props {
  person: Person
  unavailability: Unavailability[]
  workday: WorkdaySettings
  /** The day the dialog was opened from, which the new absence starts on. */
  date: ISODate
  onChange: (change: (unavailability: Unavailability[]) => Unavailability[]) => void
  onClose: () => void
}

/** A person's absence: what is noted, and a form for days of holiday, course, sickness or other absence, whole or part of the day. */
export function AbsenceDialog({ person, unavailability, workday, date, onChange, onClose }: Props) {
  const [from, setFrom] = useState(date)
  const [to, setTo] = useState(date)
  const [kind, setKind] = useState<UnavailabilityKind>('ferie')
  const [wholeDay, setWholeDay] = useState(true)
  const [start, setStart] = useState(clock(workday.breakEnd))
  const [end, setEnd] = useState(clock(workday.dayEnd))
  const [note, setNote] = useState('')
  const spans = absenceSpans(unavailability, person.id)
  const startMin = minutes(start)
  const endMin = minutes(end)
  const valid = from !== '' && to !== '' && to >= from && (wholeDay || (startMin !== null && endMin !== null && endMin > startMin))

  const add = () => {
    if (!valid) return
    const input: AbsenceInput = { personId: person.id, from, to, kind, note: note.trim() || undefined, ...(wholeDay ? {} : { start: startMin!, end: endMin! }) }
    onChange((list) => addAbsence(list, input))
    setNote('')
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog bm-absence"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <h2>Fravær for {person.name}</h2>
        {spans.length > 0 ? (
          <ul>
            {spans.map((span) => (
              <li key={span.ids[0]}>
                <b>{ABSENCE_LABELS[span.kind]}</b>
                <span>
                  {span.from === span.to ? fmtDate(span.from) : `${fmtDate(span.from)}–${fmtDate(span.to)}`}
                  {span.start !== undefined && span.end !== undefined && ` · ${clock(span.start)}–${clock(span.end)}`}
                  {span.note && ` · ${span.note}`}
                </span>
                <button type="button" className="row-action" aria-label="Fjern fraværet" title="Fjern fraværet" onClick={() => onChange((list) => list.filter((u) => !span.ids.includes(u.id)))}>
                  <X size={13} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Ingen fravær registrert.</p>
        )}
        <div className="field-row">
          <label>
            Fra
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value) }} />
          </label>
          <label>
            Til og med
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label>
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value as UnavailabilityKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {ABSENCE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="radio">
          <input type="checkbox" checked={wholeDay} onChange={(e) => setWholeDay(e.target.checked)} />
          Hele dagen
        </label>
        {!wholeDay && (
          <div className="field-row">
            <label>
              Borte fra kl.
              <input type="time" step={workday.snap * 60} value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label>
              Til kl.
              <input type="time" step={workday.snap * 60} value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
        )}
        <label>
          Notat
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Valgfritt, f.eks. Går 12:00" />
        </label>
        <p className="hint">Tildelinger på dagene beholdes, men merkes uløst, og timene går tilbake i behovet. Fravær som allerede står på dagene, erstattes.</p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Lukk
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            Legg til fravær
          </button>
        </div>
      </form>
    </div>
  )
}
