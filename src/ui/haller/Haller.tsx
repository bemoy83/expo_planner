import { useEffect, useMemo, useRef, useState } from 'react'
import { todayIso, type ISODate } from '../../domain/dates'
import { VENUE_PHASES, type DateSpan, type VenueBooking, type VenuePhase } from '../../domain/types'
import { eventKey, venueEvents, type VenueEvent } from '../../domain/projects'
import { phaseSpans } from '../../domain/venue'
import { anchorDate, venueKey } from '../../domain/venueImport'
import { readProjectList } from '../../import/venyouExport'
import { useWorkspace } from '../../store/workspaceStore'
import { MessageBanner, Twisty, UndoRedoButtons, type Message } from '../common'
import { errorText, takeFile } from '../files'
import { TextField } from '../fields'

const PHASE_HEADERS: Record<VenuePhase, string> = { assembly: 'Montering', movingIn: 'Innflytting', event: 'Arrangement', movingOut: 'Utflytting', dismantle: 'Demontering' }

const day = (date: ISODate) => `${date.slice(8)}.${date.slice(5, 7)}`
const span = (s?: DateSpan) => (!s ? '' : s.start === s.end ? day(s.start) : `${day(s.start)}–${day(s.end)}`)
const lastDate = (booking: VenueBooking): ISODate => VENUE_PHASES.flatMap((phase) => booking.phases[phase]?.end ?? []).sort().at(-1) ?? ''

interface EventGroup {
  /** The event among those listed: its name and the month it takes place. */
  key: string
  name: string
  anchor: ISODate
  bookings: VenueBooking[]
  /** The event as a project: its key and project number. */
  event?: VenueEvent
}

type Visibility = 'all' | 'shown' | 'hidden'

/** The hall ledger: every hall booking, with a tick for whether it shows in the Kalender. */
export function Haller() {
  const { workspace, setVenueHidden, setEventProject, importProjects } = useWorkspace()
  const ws = workspace!
  const hidden = useMemo(() => ws.hiddenVenue ?? {}, [ws.hiddenVenue])
  const [search, setSearch] = useState('')
  const [hall, setHall] = useState('')
  const [status, setStatus] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('all')
  const [includePast, setIncludePast] = useState(false)
  const [onlyUnlinked, setOnlyUnlinked] = useState(false)
  /** The events whose halls are folded away, for as long as the tab is open. */
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const [message, setMessage] = useState<Message | null>(null)
  const listInput = useRef<HTMLInputElement>(null)
  const [today] = useState(todayIso)

  const halls = useMemo(() => [...new Set(ws.venue.map((b) => b.hall))].sort((a, b) => a.localeCompare(b, 'nb')), [ws.venue])
  const statuses = useMemo(() => [...new Set(ws.venue.map((b) => b.status).filter(Boolean))].sort(), [ws.venue])

  const events = useMemo(() => new Map(venueEvents(ws.venue, ws.eventLinks, ws.projects).map((event) => [event.key, event])), [ws.venue, ws.eventLinks, ws.projects])
  const unlinkedCount = useMemo(() => [...events.values()].filter((event) => !event.projectNo).length, [events])

  const onProjectList = async (file: File) => {
    try {
      const count = importProjects(readProjectList(new Uint8Array(await file.arrayBuffer())))
      setMessage({ kind: 'ok', text: `${file.name}: ${count} navn med prosjektnummer lest inn. Arrangementer med likt navn har fått nummer.` })
    } catch (e) {
      setMessage({ kind: 'error', text: errorText(e) })
    }
  }

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
      const event = events.get(eventKey(booking.eventName, anchor))
      if (onlyUnlinked && event?.projectNo) continue
      const key = `${booking.eventName}|${anchor.slice(0, 7)}`
      const group = byEvent.get(key) ?? { key, name: booking.eventName, anchor, bookings: [], event }
      group.bookings.push(booking)
      if (anchor < group.anchor) group.anchor = anchor
      byEvent.set(key, group)
    }
    const list = [...byEvent.values()].sort((a, b) => a.anchor.localeCompare(b.anchor) || a.name.localeCompare(b.name, 'nb'))
    for (const group of list) group.bookings.sort((a, b) => a.hall.localeCompare(b.hall, 'nb'))
    return list
  }, [ws.venue, hidden, search, hall, status, visibility, includePast, today, events, onlyUnlinked])

  const rowCount = groups.reduce((n, g) => n + g.bookings.length, 0)
  const hiddenCount = useMemo(() => ws.venue.filter((b) => hidden[venueKey(b)]).length, [ws.venue, hidden])
  const listed = useMemo(() => groups.flatMap((g) => g.bookings.map(venueKey)), [groups])
  const listedShown = listed.filter((key) => !hidden[key]).length
  const allFolded = groups.length > 0 && groups.every((g) => folded.has(g.key))
  const toggleFold = (key: string) =>
    setFolded((before) => {
      const next = new Set(before)
      if (!next.delete(key)) next.add(key)
      return next
    })

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
        <label className="check" title="Vis bare arrangementer som mangler prosjektnummer">
          <input type="checkbox" checked={onlyUnlinked} onChange={(e) => setOnlyUnlinked(e.target.checked)} />
          Uten prosjektnr.
        </label>
        <span className="toolbar-gap" />
        <button onClick={() => listInput.current?.click()} title="Les inn Prosjekt.xlsx: navn og prosjektnummer">
          Importer prosjektliste
        </button>
        <input
          ref={listInput}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(e) => takeFile(e, onProjectList)}
        />
        <UndoRedoButtons />
      </div>

      <MessageBanner message={message} onClose={() => setMessage(null)} />

      <div className="behov-body">
        <p className="hint">
          Hvert arrangement er et prosjekt i Kalender. Prosjektnummeret kobler det til Visma; det hentes fra prosjektlisten når navnet er likt, ellers skriver du det inn her.{' '}
          {unlinkedCount > 0 && `${unlinkedCount} arrangementer mangler nummer. `}
          Haken bestemmer om bookingen vises i hallkalenderen; haken i overskriften gjelder alle i listen. Skjulte bookinger blir liggende her, og valget beholdes når du leser inn en ny Venyou-fil.{' '}
          {ws.venue.length} bookinger totalt, {hiddenCount} skjult.
          {ws.venueImport && ` Sist oppdatert fra ${ws.venueImport.fileName} (${ws.venueImport.from} til ${ws.venueImport.to}).`}
        </p>
        {rowCount ? (
          <table className="ledger halls">
            <thead>
              <tr>
                <th className="center" title="Vises i Kalender. Haken her viser eller skjuler alle bookingene i listen.">
                  <TriCheckbox checked={listedShown === listed.length} partial={listedShown > 0 && listedShown < listed.length} label="Vis alle i listen" onChange={(show) => setVenueHidden(listed, !show)} />
                </th>
                <th>
                  <Twisty open={!allFolded} show="Vis hallene under hvert arrangement" hide="Vis bare én rad per arrangement" onToggle={() => setFolded(allFolded ? new Set() : new Set(groups.map((g) => g.key)))} />
                  Arrangement / hall
                </th>
                {VENUE_PHASES.map((phase) => (
                  <th key={phase}>{PHASE_HEADERS[phase]}</th>
                ))}
                <th>Status</th>
                <th title="Prosjektnummeret i Visma">Prosjektnr.</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group, index) => {
                const keys = group.bookings.map(venueKey)
                const shown = keys.filter((key) => !hidden[key]).length
                const open = !folded.has(group.key)
                const spans = phaseSpans(group.bookings)
                // Shown once, on the event, when its halls agree; else on each hall.
                const status = group.bookings.every((b) => b.status === group.bookings[0].status) ? group.bookings[0].status : null
                const candidates = group.event && group.event.candidates.length > 1 ? group.event.candidates : null
                const candidatesId = `project-candidates-${index}`
                return [
                  <tr key={`${group.name}|${group.anchor}`} className={group.event && !group.event.projectNo ? 'event-row has-issue' : 'event-row'}>
                    <td className="center">
                      <TriCheckbox
                        checked={shown === keys.length}
                        partial={shown > 0 && shown < keys.length}
                        label={`Vis hele ${group.name}`}
                        onChange={(show) => setVenueHidden(keys, !show)}
                      />
                    </td>
                    <td className="event-name">
                      <Twisty open={open} show={`Vis hallene til ${group.name}`} hide={`Skjul hallene til ${group.name}`} onToggle={() => toggleFold(group.key)} />
                      <strong>{group.name}</strong>{' '}
                      <span className="muted">
                        {group.anchor ? `${day(group.anchor)}.${group.anchor.slice(0, 4)}` : ''} · {shown} av {keys.length} {keys.length === 1 ? 'hall' : 'haller'} vises
                      </span>
                    </td>
                    {/* The event's days over all its halls that are listed. */}
                    {VENUE_PHASES.map((phase) => (
                      <td key={phase} className="date">{span(spans[phase])}</td>
                    ))}
                    <td>{status}</td>
                    <td className="project-no">
                      {group.event && (
                        <>
                          {/* Clearing a hand-set number goes back to the match from the project list. */}
                          <TextField
                            className={`project-no-input ${group.event.projectNo ? '' : 'missing'}`}
                            placeholder="Prosjektnr."
                            list={candidates ? candidatesId : undefined}
                            ariaLabel={`Prosjektnummer for ${group.event.name}`}
                            value={group.event.projectNo}
                            onCommit={(value) => setEventProject(group.event!, value)}
                          />
                          <span className="muted small">
                            {group.event.linkSource === 'list' ? ' fra listen' : group.event.ambiguous ? ` velg blant ${group.event.candidates.length} i listen` : group.event.linkSource === 'none' ? '' : ' satt for hånd'}
                          </span>
                          {candidates && (
                            <datalist id={candidatesId}>
                              {candidates.map((no) => (
                                <option key={no} value={no} />
                              ))}
                            </datalist>
                          )}
                        </>
                      )}
                    </td>
                  </tr>,
                  ...(open ? group.bookings : []).map((booking) => {
                    const key = venueKey(booking)
                    return (
                      <tr key={booking.id} className={hidden[key] ? 'hidden-row' : ''}>
                        <td className="center">
                          <input type="checkbox" checked={!hidden[key]} onChange={(e) => setVenueHidden([key], !e.target.checked)} aria-label={`Vis ${booking.eventName} i ${booking.hall}`} />
                        </td>
                        <td className="hall-name">{booking.hall}</td>
                        {VENUE_PHASES.map((phase) => (
                          <td key={phase} className="date">{span(booking.phases[phase])}</td>
                        ))}
                        <td>{status === null ? booking.status : ''}</td>
                        <td />
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
