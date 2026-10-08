import { useState } from 'react'
import { Pencil, Plus, X } from 'lucide-react'
import { addDays, dayOfMonth, isoWeek, monthShort, type ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { absenceSpans, addAbsence, editAbsence, overtimeByWeek, paidHours, personWeek, type AbsenceInput, type AbsenceSpan } from '../../domain/staffing'
import type { UnavailabilityKind, WorkdaySettings } from '../../domain/types'
import { competenceColor } from '../dom'
import { useBemanning } from './BemanningScope'
import { ABSENCE_LABELS } from './dayCell'
import { clock, EPSILON, hoursText } from './week'

const KINDS: UnavailabilityKind[] = ['ferie', 'kurs', 'syk', 'annet']

/** «21.–23. okt», «30. sep–2. okt», or «21. okt» for one day. */
const periodText = (from: ISODate, to: ISODate): string =>
  from === to ? `${dayOfMonth(from)}. ${monthShort(from)}` : monthShort(from) === monthShort(to) && from.slice(0, 4) === to.slice(0, 4) ? `${dayOfMonth(from)}.–${dayOfMonth(to)}. ${monthShort(to)}` : `${dayOfMonth(from)}. ${monthShort(from)}–${dayOfMonth(to)}. ${monthShort(to)}`
/** «12:00» as minutes after midnight, or `null`. */
const minutes = (text: string): number | null => (/^\d{2}:\d{2}$/.test(text) ? Number(text.slice(0, 2)) * 60 + Number(text.slice(3)) : null)

/** What the absence form starts with: a new absence from a day, or a period that is being changed. */
export interface AbsenceDraft {
  kind: UnavailabilityKind
  from: ISODate
  to: ISODate
  /** The period being changed; none for a new absence. */
  span?: AbsenceSpan
}

interface FormProps {
  personId: string
  draft: AbsenceDraft
  workday: WorkdaySettings
  onSave: (input: AbsenceInput) => void
  onCancel: () => void
}

/** The form for a stretch of absence: its kind, its days, the whole day or a part of it, and a note (R35). */
function AbsenceForm({ personId, draft, workday, onSave, onCancel }: FormProps) {
  const [kind, setKind] = useState(draft.kind)
  const [from, setFrom] = useState(draft.from)
  const [to, setTo] = useState(draft.to)
  const partial = draft.span?.start !== undefined && draft.span.end !== undefined
  const [wholeDay, setWholeDay] = useState(!partial)
  const [start, setStart] = useState(clock(draft.span?.start ?? workday.breakEnd))
  const [end, setEnd] = useState(clock(draft.span?.end ?? workday.dayEnd))
  const [note, setNote] = useState(draft.span?.note ?? '')
  const startMin = minutes(start)
  const endMin = minutes(end)
  const valid = from !== '' && to !== '' && to >= from && (wholeDay || (startMin !== null && endMin !== null && endMin > startMin))
  return (
    <form
      className="pp-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSave({ personId, from, to, kind, note: note.trim() || undefined, ...(wholeDay ? {} : { start: startMin!, end: endMin! }) })
      }}
    >
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
      <div className="field-row">
        <label>
          Fra
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              if (e.target.value > to) setTo(e.target.value)
            }}
          />
        </label>
        <label>
          Til og med
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
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
      <p className="insp-note">Tildelinger på dagene beholdes, men merkes uløst, og timene går tilbake i behovet. Annet fravær på dagene erstattes.</p>
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          Avbryt
        </button>
        <button type="submit" className="primary" disabled={!valid}>
          {draft.span ? 'Lagre' : 'Legg til fravær'}
        </button>
      </div>
    </form>
  )
}

/**
 * The Person panel: one person's hours, overtime per week and absence over the whole period. It slides in
 * over the right edge of the grid, as the row details do in the plan. Absence is entered here, as periods.
 */
export function PersonPanel() {
  const bm = useBemanning()
  const { ws, panel, persons, staffed, dates, keyOf, brush, overtimeLimit, updateStaffing } = bm
  const person = panel && persons.find((p) => p.id === panel.personId)
  if (!panel || !person) return null
  const wd = ws.settings.workday
  const period = personWeek(ws, person.id, dates)
  const weeks = [...overtimeByWeek(ws, person.id)].filter(([monday]) => monday <= dates[dates.length - 1] && monday >= dates[0])
  const over = weeks.filter(([, hours]) => hours > overtimeLimit).length
  const spans = absenceSpans(ws.unavailability ?? [], person.id)
  const awayDays = new Set((ws.unavailability ?? []).filter((u) => u.personId === person.id && dayType(u.date) === 'arbeidsdag').map((u) => u.date)).size
  const line = bm.lines.find((l) => l.person.id === person.id)
  const worked = new Map<string, number>()
  for (const blocks of line?.assignments?.values() ?? []) for (const a of blocks) if (bm.isOk(a)) worked.set(a.competence, (worked.get(a.competence) ?? 0) + paidHours(a, wd))
  const own = staffed.filter((style) => person.competences.includes(style.key))
  // A new absence starts on the selected day of the person, else on the first workday in view.
  const startDay = bm.selected?.personId === person.id ? bm.selected.date : bm.firstWorkday

  const save = (input: AbsenceInput) => {
    const span = panel.draft?.span
    updateStaffing((w) => ({ ...w, unavailability: span ? editAbsence(w.unavailability ?? [], span, input) : addAbsence(w.unavailability ?? [], input) }))
    bm.setPanel({ personId: person.id })
  }
  return (
    <aside
      className="inspector"
      aria-label="Persondetaljer"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        bm.setPanel(panel.draft ? { personId: person.id } : null)
      }}
    >
      <header className="insp-head">
        <div className="insp-head-text">
          <div className="insp-title">{person.name}</div>
          <div className="insp-sub">
            Fast ansatt · {own.length} av {staffed.length} kompetanser
          </div>
        </div>
        <div className="insp-actions">
          <button className="ghost icon-button" aria-label="Lukk" title="Lukk persondetaljer (Esc)" onClick={() => bm.setPanel(null)}>
            <X size={16} aria-hidden />
          </button>
        </div>
      </header>
      <div className="insp-body">
        <section className="insp-sec">
          <h3 className="insp-h">
            Timer <span>hele perioden</span>
          </h3>
          <div className="stats">
            <div>
              <span>Normaltid</span>
              <b>{hoursText(period.normal)}</b>
              <em>av {hoursText(period.capacity)}</em>
            </div>
            <div className={over ? 'over' : ''}>
              <span>Overtid</span>
              <b>{hoursText(period.overtime)}</b>
              <em>{over ? `${over} ${over === 1 ? 'uke' : 'uker'} over grensen` : ''}</em>
            </div>
            <div>
              <span>Fravær</span>
              <b>{awayDays}</b>
              <em>{awayDays === 1 ? 'dag' : 'dager'}</em>
            </div>
          </div>
          {weeks.length > 0 && (
            <table className="insp-days pp-weeks">
              <thead>
                <tr>
                  <th>Uke</th>
                  <th>Overtid</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map(([monday, hours]) => (
                  <tr key={monday} className={`${hours > overtimeLimit ? 'over' : ''} ${panel.week === monday ? 'lit' : ''}`} title="Vis uken" onClick={() => bm.onShowDate(monday)}>
                    <td>
                      Uke {isoWeek(monday)} <span>{periodText(monday, addDays(monday, 6))}</span>
                    </td>
                    <td>{hoursText(hours)} t</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="insp-sec">
          <h3 className="insp-h">Fravær</h3>
          {spans.length === 0 && !panel.draft && <p className="insp-note">Ingen fravær registrert.</p>}
          <ul className="pp-periods">
            {spans.map((span) =>
              panel.draft?.span?.ids[0] === span.ids[0] ? null : (
                <li key={span.ids[0]} className={span.kind === 'syk' ? 'sick' : ''}>
                  <button className="pp-period" title="Vis dagene" onClick={() => bm.onShowDate(span.from)}>
                    <b>{ABSENCE_LABELS[span.kind]}</b>
                    <span>
                      {periodText(span.from, span.to)}
                      {span.start !== undefined && span.end !== undefined && ` · ${clock(span.start)}–${clock(span.end)}`}
                      {span.note && ` · ${span.note}`}
                    </span>
                  </button>
                  <button className="row-action" aria-label="Endre fraværet" title="Endre fraværet" onClick={() => bm.setPanel({ personId: person.id, draft: { kind: span.kind, from: span.from, to: span.to, span } })}>
                    <Pencil size={13} aria-hidden />
                  </button>
                  <button className="row-action" aria-label="Fjern fraværet" title="Fjern fraværet" onClick={() => updateStaffing((w) => ({ ...w, unavailability: (w.unavailability ?? []).filter((u) => !span.ids.includes(u.id)) }))}>
                    <X size={13} aria-hidden />
                  </button>
                </li>
              ),
            )}
          </ul>
          {panel.draft ? (
            <AbsenceForm key={`${panel.draft.span?.ids[0] ?? 'new'}|${panel.draft.kind}|${panel.draft.from}`} personId={person.id} draft={panel.draft} workday={wd} onSave={save} onCancel={() => bm.setPanel({ personId: person.id })} />
          ) : (
            <button className="ghost pp-add" onClick={() => bm.setPanel({ personId: person.id, draft: { kind: 'ferie', from: startDay, to: startDay } })}>
              <Plus size={14} aria-hidden /> Legg til fravær
            </button>
          )}
        </section>
        <section className="insp-sec">
          <h3 className="insp-h">
            Kompetanse <span>timer i perioden</span>
          </h3>
          <div className="bm-competences">
            {own.map((style) => (
              <button key={style.key} className={style.key === brush ? 'on' : ''} aria-pressed={style.key === brush} style={competenceColor(style)} title={`Mal med ${style.label}`} onClick={() => (style.key === brush ? bm.clearBrush() : bm.pickBrush(style.key))}>
                <i className="swatch" />
                <span className="bm-name">{style.label}</span>
                {keyOf.has(style.key) && <kbd>{keyOf.get(style.key)}</kbd>}
                <span className={`bm-competence-hours ${worked.has(style.key) ? '' : 'nil'}`}>{(worked.get(style.key) ?? 0) > EPSILON ? `${hoursText(worked.get(style.key)!)} t` : '–'}</span>
              </button>
            ))}
            {own.length === 0 && <p className="insp-note">Ingen kompetanser. De legges inn på Personell.</p>}
          </div>
        </section>
      </div>
    </aside>
  )
}
