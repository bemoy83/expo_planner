import { useEffect, useMemo, useRef, useState } from 'react'
import type { ISODate } from '../../domain/dates'
import { VENUE_PHASES, type DateSpan, type VenueBooking, type VenuePhase } from '../../domain/types'
import { anchorDate, VENYOU_ID_PREFIX, venueKey } from '../../domain/venueImport'
import { useWorkspace } from '../../store/workspaceStore'

const PHASE_HEADERS: Record<VenuePhase, string> = { assembly: 'Montering', movingIn: 'Innflytting', event: 'Arrangement', movingOut: 'Utflytting', dismantle: 'Demontering' }

const day = (date: ISODate) => `${date.slice(8)}.${date.slice(5, 7)}`
const span = (s?: DateSpan) => (!s ? '' : s.start === s.end ? day(s.start) : `${day(s.start)}–${day(s.end)}`)
const lastDate = (booking: VenueBooking): ISODate => VENUE_PHASES.flatMap((phase) => booking.phases[phase]?.end ?? []).sort().at(-1) ?? ''

interface EventGroup {
  name: string
  anchor: ISODate
  bookings: VenueBooking[]
}

type Visibility = 'all' | 'shown' | 'hidden'

/** The hall ledger: every hall booking, with a tick for whether it shows in the Kalender. */
export function Haller() {
  const { workspace, setVenueHidden, undo, redo, canUndo, canRedo } = useWorkspace()
  const ws = workspace!
  const hidden = useMemo(() => ws.hiddenVenue ?? {}, [ws.hiddenVenue])
  const [search, setSearch] = useState('')
  const [hall, setHall] = useState('')
  const [status, setStatus] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('all')
  const [includePast, setIncludePast] = useState(false)
  const [today] = useState(() => new Date().toISOString().slice(0, 10))

  const halls = useMemo(() => [...new Set(ws.venue.map((b) => b.hall))].sort((a, b) => a.localeCompare(b, 'nb')), [ws.venue])
  const statuses = useMemo(() => [...new Set(ws.venue.map((b) => b.status).filter(Boolean))].sort(), [ws.venue])

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const byEvent = new Map<string, EventGroup>()
    for (const booking of ws.venue) {
      if (hall && booking.hall !== hall) continue
      if (status && booking.status !== status) continue
      if (q && !`${booking.eventName} ${booking.hall}`.toLowerCase().includes(q)) continue
      if (!includePast && lastDate(booking) < today) continue
      const isHidden = !!hidden[venueKey(booking)]
      if (visibility === 'shown' && isHidden) continue
      if (visibility === 'hidden' && !isHidden) continue
      const anchor = anchorDate(booking) ?? ''
      // Events with the same name in different periods (two years, two editions) are separate entries.
      const key = `${booking.eventName}|${anchor.slice(0, 7)}`
      const group = byEvent.get(key) ?? { name: booking.eventName, anchor, bookings: [] }
      group.bookings.push(booking)
      if (anchor < group.anchor) group.anchor = anchor
      byEvent.set(key, group)
    }
    const list = [...byEvent.values()].sort((a, b) => a.anchor.localeCompare(b.anchor) || a.name.localeCompare(b.name, 'nb'))
    for (const group of list) group.bookings.sort((a, b) => a.hall.localeCompare(b.hall, 'nb'))
    return list
  }, [ws.venue, hidden, search, hall, status, visibility, includePast, today])

  const rowCount = groups.reduce((n, g) => n + g.bookings.length, 0)
  const hiddenCount = useMemo(() => ws.venue.filter((b) => hidden[venueKey(b)]).length, [ws.venue, hidden])
  const listed = useMemo(() => groups.flatMap((g) => g.bookings.map(venueKey)), [groups])

  return (
    <div className="behov">
      <div className="toolbar">
        <input className="search" type="search" placeholder="Søk arrangement eller hall" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label>
          Hall
          <select value={hall} onChange={(e) => setHall(e.target.value)}>
            <option value="">Alle</option>
            {halls.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Alle</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Vis
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
            <option value="all">Alle</option>
            <option value="shown">Bare de som vises i Kalender</option>
            <option value="hidden">Bare de som er skjult</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={includePast} onChange={(e) => setIncludePast(e.target.checked)} />
          Ta med tidligere
        </label>
        <span className="toolbar-gap" />
        <button onClick={undo} disabled={!canUndo} title="Angre (Ctrl/Cmd+Z)">
          ↶ Angre
        </button>
        <button onClick={redo} disabled={!canRedo} title="Gjør om (Ctrl/Cmd+Shift+Z)">
          ↷ Gjør om
        </button>
        <button onClick={() => setVenueHidden(listed, false)} disabled={!rowCount}>
          Vis alle i listen
        </button>
        <button onClick={() => setVenueHidden(listed, true)} disabled={!rowCount}>
          Skjul alle i listen
        </button>
      </div>

      <div className="behov-body">
        <p className="hint">
          Haken bestemmer om bookingen vises i hallkalenderen. Skjulte bookinger blir liggende her, og valget beholdes når du leser inn en ny Venyou-fil.{' '}
          {ws.venue.length} bookinger totalt, {hiddenCount} skjult.
          {ws.venueImport && ` Sist oppdatert fra ${ws.venueImport.fileName} (${ws.venueImport.from} til ${ws.venueImport.to}).`}
        </p>
        {rowCount ? (
          <table className="ledger halls">
            <thead>
              <tr>
                <th title="Vises i Kalender">Vis</th>
                <th>Arrangement / hall</th>
                {VENUE_PHASES.map((phase) => (
                  <th key={phase}>{PHASE_HEADERS[phase]}</th>
                ))}
                <th>Status</th>
                <th>Kilde</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const keys = group.bookings.map(venueKey)
                const shown = keys.filter((key) => !hidden[key]).length
                return [
                  <tr key={`${group.name}|${group.anchor}`} className="event-row">
                    <td className="center">
                      <TriCheckbox
                        checked={shown === keys.length}
                        partial={shown > 0 && shown < keys.length}
                        label={`Vis hele ${group.name}`}
                        onChange={(show) => setVenueHidden(keys, !show)}
                      />
                    </td>
                    <td colSpan={8}>
                      <strong>{group.name}</strong>{' '}
                      <span className="muted">
                        {group.anchor ? `${day(group.anchor)}.${group.anchor.slice(0, 4)}` : ''} · {shown} av {keys.length} {keys.length === 1 ? 'hall' : 'haller'} vises
                      </span>
                    </td>
                  </tr>,
                  ...group.bookings.map((booking) => {
                    const key = venueKey(booking)
                    return (
                      <tr key={booking.id} className={hidden[key] ? 'hidden-row' : ''}>
                        <td className="center">
                          <input type="checkbox" checked={!hidden[key]} onChange={(e) => setVenueHidden([key], !e.target.checked)} aria-label={`Vis ${booking.eventName} i ${booking.hall}`} />
                        </td>
                        <td className="hall-name">{booking.hall}</td>
                        {VENUE_PHASES.map((phase) => (
                          <td key={phase}>{span(booking.phases[phase])}</td>
                        ))}
                        <td>{booking.status}</td>
                        <td className="muted">{booking.id.startsWith(VENYOU_ID_PREFIX) ? 'Venyou' : 'Arbeidsbok'}</td>
                      </tr>
                    )
                  }),
                ]
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted">Ingen bookinger passer filteret.</p>
        )}
      </div>
    </div>
  )
}

function TriCheckbox({ checked, partial, label, onChange }: { checked: boolean; partial: boolean; label: string; onChange: (checked: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial
  }, [partial])
  return <input ref={ref} type="checkbox" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
}
