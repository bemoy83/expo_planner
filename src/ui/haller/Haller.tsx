import { Fragment, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Minus, RefreshCw } from 'lucide-react'
import { capitalized, monthName, todayIso, type ISODate } from '../../domain/dates'
import { VENUE_PHASES, type DateSpan, type VenueBooking, type VenuePhase } from '../../domain/types'
import { eventKey, venueEvents, type VenueEvent } from '../../domain/projects'
import { phaseSpans } from '../../domain/venue'
import { anchorDate, venueKey } from '../../domain/venueImport'
import { useWorkspace } from '../../store/workspaceStore'
import { Segmented, Switch } from '../common'
import { NeedButton } from '../behov/SplitPick'
import type { TablePage } from '../RegisterHead'

const PHASE_HEADERS: Record<VenuePhase, string> = { assembly: 'Montering', movingIn: 'Innflytting', event: 'Arrangement', movingOut: 'Utflytting', dismantle: 'Demontering' }

const day = (date: ISODate) => `${Number(date.slice(8))}.${Number(date.slice(5, 7))}`
/** A span of days as short as it reads: «3.–5.10», or «30.9–2.10» across months. */
const span = (s?: DateSpan) => (!s ? '' : s.start === s.end ? day(s.start) : s.start.slice(0, 7) === s.end.slice(0, 7) ? `${Number(s.start.slice(8))}.–${day(s.end)}` : `${day(s.start)}–${day(s.end)}`)
const lastDate = (booking: VenueBooking): ISODate => VENUE_PHASES.flatMap((phase) => booking.phases[phase]?.end ?? []).sort().at(-1) ?? ''
const firstDate = (booking: VenueBooking): ISODate => VENUE_PHASES.flatMap((phase) => booking.phases[phase]?.start ?? []).sort()[0] ?? ''
const sameDays = (bookings: VenueBooking[]) => bookings.every((b) => VENUE_PHASES.every((phase) => span(b.phases[phase]) === span(bookings[0].phases[phase])))

type Filter = 'alle' | 'kalender' | 'mangler' | 'skjult'

interface EventGroup {
  /** The event among those listed: its name and the month it takes place. */
  key: string
  name: string
  anchor: ISODate
  end: ISODate
  bookings: VenueBooking[]
  keys: string[]
  /** How many of its halls show in the Kalender. */
  shown: number
  /** The event as a project: its key and project number. */
  event?: VenueEvent
}

/** A box ticked, unticked, or marked where some of what it stands for is ticked. */
function TriCheck({ state, label, onChange }: { state: 'on' | 'part' | 'off'; label: string; onChange: (on: boolean) => void }) {
  return (
    <button role="checkbox" aria-checked={state === 'part' ? 'mixed' : state === 'on'} aria-label={label} title={label} className={`hl-check ${state}`} onClick={() => onChange(state !== 'on')}>
      {state === 'on' ? <Check size={11} aria-hidden /> : state === 'part' ? <Minus size={11} aria-hidden /> : null}
    </button>
  )
}
const stateOf = (n: number, of: number) => (n === of ? 'on' : n ? 'part' : 'off')

interface Props extends TablePage {
  onOpenProjects: () => void
  onReadVenyou: () => void
  venyouTitle: string
}

/**
 * The hall ledger: every event from Venyou by the month it starts, with its halls as buttons that show or hide them
 * in the Kalender, and the days of its phases. An event's halls fold out under it with their own days. The project
 * number of an event is read from the project table.
 */
export function Haller({ head, notify, onOpenProjects, onReadVenyou, venyouTitle }: Props) {
  const { workspace, setVenueHidden } = useWorkspace()
  const ws = workspace!
  const hidden = useMemo(() => ws.hiddenVenue ?? {}, [ws.hiddenVenue])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('alle')
  const [includePast, setIncludePast] = useState(false)
  /** The events whose halls are folded out, for as long as the tab is open. */
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [today] = useState(todayIso)

  const events = useMemo(() => new Map(venueEvents(ws.venue, ws.projects).map((event) => [event.key, event])), [ws.venue, ws.projects])

  /** The events of the bookings «Ta med tidligere» lets through. Events with the same name in two periods are two. */
  const groups = useMemo(() => {
    const byEvent = new Map<string, EventGroup>()
    for (const booking of ws.venue) {
      if (!includePast && lastDate(booking) < today) continue
      const anchor = anchorDate(booking) ?? firstDate(booking)
      const key = `${booking.eventName}|${anchor.slice(0, 7)}`
      const group = byEvent.get(key) ?? { key, name: booking.eventName, anchor: firstDate(booking), end: '', bookings: [], keys: [], shown: 0, event: events.get(eventKey(booking.eventName, anchor)) }
      group.bookings.push(booking)
      if (firstDate(booking) < group.anchor) group.anchor = firstDate(booking)
      if (lastDate(booking) > group.end) group.end = lastDate(booking)
      byEvent.set(key, group)
    }
    const list = [...byEvent.values()].sort((a, b) => a.anchor.localeCompare(b.anchor) || a.name.localeCompare(b.name, 'nb'))
    for (const group of list) {
      group.bookings.sort((a, b) => a.hall.localeCompare(b.hall, 'nb'))
      group.keys = group.bookings.map(venueKey)
      group.shown = group.keys.filter((key) => !hidden[key]).length
    }
    return list
  }, [ws.venue, includePast, today, events, hidden])

  const missing = groups.filter((g) => g.event && !g.event.projectNo).length
  const someHidden = groups.filter((g) => g.shown < g.keys.length).length
  const inKalender = groups.filter((g) => g.shown > 0).length
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return groups.filter(
      (g) =>
        (!q || `${g.name} ${g.bookings.map((b) => b.hall).join(' ')}`.toLowerCase().includes(q)) &&
        (filter === 'alle' || (filter === 'kalender' ? g.shown > 0 : filter === 'mangler' ? !!g.event && !g.event.projectNo : g.shown < g.keys.length)),
    )
  }, [groups, search, filter])
  const months = [...new Set(shown.map((g) => g.anchor.slice(0, 7)))]
  const listed = shown.flatMap((g) => g.keys)
  const listedShown = listed.filter((key) => !hidden[key]).length

  const hide = (keys: string[], hide: boolean, text: string) => {
    setVenueHidden(keys, hide)
    notify(text)
  }
  const toggleOpen = (key: string) =>
    setOpen((before) => {
      const next = new Set(before)
      if (!next.delete(key)) next.add(key)
      return next
    })

  const row = (group: EventGroup) => {
    const unfolded = open.has(group.key)
    const spans = phaseSpans(group.bookings)
    // Shown once, on the event, when its halls agree; else on each hall.
    const status = group.bookings.every((b) => b.status === group.bookings[0].status) ? group.bookings[0].status : null
    const ongoing = group.anchor <= today && group.end >= today
    return (
      <Fragment key={group.key}>
        <div className={`op-row ${group.shown ? '' : 'hl-hidden'} ${unfolded ? 'unfolded' : ''}`}>
          <span className="mk-center">
            <TriCheck state={stateOf(group.shown, group.keys.length)} label={`Vis ${group.name} i Kalender`} onChange={(on) => hide(group.keys, !on, on ? `${group.name} vises i Kalender` : `${group.name} er skjult i Kalender`)} />
          </span>
          <span className="op-fold">
            <button className="icon-button" title={unfolded ? 'Skjul hallene' : 'Vis datoene for hver hall'} aria-expanded={unfolded} onClick={() => toggleOpen(group.key)}>
              {unfolded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
            </button>
          </span>
          <span className="op-name">
            <strong className="ellipsis">{group.name}</strong>
            {ongoing && <span className="hl-now">Pågår</span>}
            {!sameDays(group.bookings) && (
              <span className="op-tag" title="Hallene har ulike datoer. Åpne raden for å se dem.">
                ulike datoer
              </span>
            )}
          </span>
          <span className="hl-halls">
            {group.bookings.map((booking, i) => {
              const key = group.keys[i]
              const on = !hidden[key]
              return (
                <button key={booking.id} className={on ? 'on' : ''} aria-pressed={on} title={`${booking.hall} ${on ? 'vises' : 'er skjult'} i Kalender`} onClick={() => hide([key], on, `${group.name} · ${booking.hall} ${on ? 'skjult' : 'vises'}`)}>
                  {booking.hall}
                </button>
              )
            })}
          </span>
          {VENUE_PHASES.map((phase) => (
            <span key={phase} className={`num hl-days ${phase}`}>
              {span(spans[phase])}
            </span>
          ))}
          <span className={`small ${status === 'Opsjon' ? 'hl-option' : 'muted'}`}>{status ?? 'Blandet'}</span>
          <span>
            {group.event &&
              (group.event.projectNo ? (
                <span className="num">{group.event.projectNo}</span>
              ) : (
                <NeedButton missing={group.event.ambiguous ? 'Flere' : 'Mangler'} list={false} title="Arrangementet har ikke noe prosjekt. Gi det et nummer på Prosjekter." onClick={onOpenProjects} />
              ))}
          </span>
        </div>
        {unfolded &&
          group.bookings.map((booking, i) => {
            const key = group.keys[i]
            const on = !hidden[key]
            return (
              <div key={booking.id} className={`op-row op-sub ${on ? '' : 'hl-hidden'}`}>
                <span className="mk-center">
                  <TriCheck state={on ? 'on' : 'off'} label={`Vis ${group.name} i ${booking.hall}`} onChange={(show) => hide([key], !show, `${group.name} · ${booking.hall} ${show ? 'vises' : 'skjult'}`)} />
                </span>
                <span />
                <span className="muted small">{on ? 'Vises i Kalender' : 'Skjult i Kalender'}</span>
                <span className="num hl-hall">{booking.hall}</span>
                {VENUE_PHASES.map((phase) => (
                  <span key={phase} className={`num hl-days ${phase}`}>
                    {span(booking.phases[phase])}
                  </span>
                ))}
                <span className={`small ${booking.status === 'Opsjon' ? 'hl-option' : 'muted'}`}>{status ? '' : booking.status}</span>
                <span />
              </div>
            )
          })}
      </Fragment>
    )
  }

  return (
    <>
      {head(
        <>
          {ws.venueImport && (
            <span className="page-meta hl-meta" title={`${ws.venueImport.from} til ${ws.venueImport.to}`}>
              Sist lest {day(ws.venueImport.importedAt.slice(0, 10))} · {ws.venueImport.fileName}
            </span>
          )}
          <button className="primary" onClick={onReadVenyou} title={venyouTitle}>
            <RefreshCw size={14} aria-hidden /> {ws.venueImport ? 'Oppdater fra VenYou' : 'Les inn VenYou'}
          </button>
        </>,
      )}
      <div className="op">
        <div className="op-bar">
          <input className="search" type="search" placeholder="Søk arrangement eller hall" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Segmented
            label="Vis"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'alle', label: <>Alle <span className="count">{groups.length}</span></> },
              { value: 'kalender', label: <>I Kalender <span className="count">{inKalender}</span></>, title: 'Arrangementene med minst én hall som vises i Kalender' },
              { value: 'mangler', label: <>Mangler prosjekt {missing ? <span className="count-chip alert">{missing}</span> : <span className="count">0</span>}</> },
              { value: 'skjult', label: <>Skjult i Kalender <span className="count">{someHidden}</span></> },
            ]}
          />
          <label className="hl-past">
            <Switch on={includePast} label="Ta med tidligere" onChange={setIncludePast} />
            Ta med tidligere
          </label>
        </div>
        <p className="op-flow">
          <span>
            Hvert arrangement er et <strong>prosjekt</strong> i Kalender; nummeret hentes fra Prosjekter.
          </span>
          <span>
            Haken og hallknappene styrer hva som <strong>vises</strong> i Kalender, også etter ny innlesing.
          </span>
        </p>

        {ws.venue.length ? (
          <div className="op-table hl-venyou">
            <div className="op-row op-head">
              <span className="mk-center">
                <TriCheck state={stateOf(listedShown, listed.length)} label="Vis alle i listen" onChange={(on) => hide(listed, !on, on ? 'Alle i listen vises' : 'Alle i listen er skjult')} />
              </span>
              <span />
              <span>Arrangement</span>
              <span title="Klikk en hall for å vise eller skjule den i Kalender">Haller</span>
              {VENUE_PHASES.map((phase) => (
                <span key={phase} className={`hl-days ${phase}`}>
                  {(phase === 'assembly' || phase === 'dismantle') && <i className={`op-phase ${phase === 'assembly' ? 'mon' : 'dem'}`} aria-hidden />}
                  {PHASE_HEADERS[phase]}
                </span>
              ))}
              <span>Status</span>
              <span title="Prosjektnummeret fra Prosjekter">Prosjekt</span>
            </div>
            <div className="op-body">
              {months.map((month) => {
                const inMonth = shown.filter((g) => g.anchor.startsWith(month))
                return (
                  <section key={month} className="op-group">
                    <div className="op-group-head">
                      {capitalized(monthName(month))} {month.slice(0, 4)} <span className="op-group-count">{inMonth.length}</span>
                    </div>
                    {inMonth.map(row)}
                  </section>
                )
              })}
              {!shown.length && <p className="op-empty">Ingen arrangementer passer søket eller filteret.</p>}
            </div>
          </div>
        ) : (
          <p className="op-empty">Ingen hallbookinger ennå. Les inn eksporten fra Venyou med «Les inn VenYou».</p>
        )}
      </div>
    </>
  )
}
