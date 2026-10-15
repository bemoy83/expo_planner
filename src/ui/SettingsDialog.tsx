import { useState } from 'react'
import { decimalText, parseDecimal } from '../domain/numbers'
import { useWorkspace } from '../store/workspaceStore'
import { clock, clockMinutes } from './bemanning/week'

/** The base crew, the hours of a normal day and its lunch break. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { workspace, updateSettings } = useWorkspace()
  const settings = workspace!.settings
  // Once people are entered on Personell, the active ones are the crew.
  const people = workspace!.persons?.length ?? 0
  const active = workspace!.persons?.filter((person) => person.active).length ?? 0
  const [baseCrew, setBaseCrew] = useState(String(settings.baseCrew))
  const [hoursPerDay, setHoursPerDay] = useState(decimalText(settings.hoursPerDay))
  const day = settings.workday
  const [lunchFrom, setLunchFrom] = useState(clock(day.breakStart))
  const [lunchTo, setLunchTo] = useState(clock(day.breakEnd))

  // An empty crew is none; text that is no number is NaN, which no comparison lets through.
  const crew = parseDecimal(baseCrew) === null ? 0 : (parseDecimal(baseCrew) ?? NaN)
  const hours = parseDecimal(hoursPerDay) ?? NaN
  // The lunch lies within the normal day, on the quarters of an hour the blocks keep to.
  const breakStart = clockMinutes(lunchFrom)
  const breakEnd = clockMinutes(lunchTo)
  const lunchValid = breakStart > day.dayStart && breakEnd > breakStart && breakEnd < day.dayEnd && breakStart % day.snap === 0 && breakEnd % day.snap === 0
  const valid = crew >= 0 && hours > 0 && lunchValid
  const worked = (day.dayEnd - day.dayStart - (breakEnd - breakStart)) / 60

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          updateSettings({ ...settings, baseCrew: crew, hoursPerDay: hours, workday: { ...day, breakStart, breakEnd } })
          onClose()
        }}
      >
        <h2>Bemanning og normaltid</h2>
        {people ? (
          <p className="hint">
            Faste ansatte per arbeidsdag: <b>{active}</b>, de aktive på Mannskap › Faste.
          </p>
        ) : (
          <label>
            Faste ansatte per arbeidsdag (FTE)
            <input inputMode="decimal" value={baseCrew} onChange={(e) => setBaseCrew(e.target.value)} />
            <span className="hint">Gjelder til de faste er lagt inn på Mannskap › Faste; da telles de aktive der.</span>
          </label>
        )}
        <label>
          Timer per FTE-dag (normaltid)
          <input inputMode="decimal" value={hoursPerDay} onChange={(e) => setHoursPerDay(e.target.value)} />
          <span className="hint">Brukes til å regne behov i timer om til FTE-dager.</span>
        </label>
        <label>
          Lunsj i Bemanning
          <span className="time-range">
            <input type="time" step={day.snap * 60} value={lunchFrom} onChange={(e) => setLunchFrom(e.target.value)} aria-label="Lunsj fra" />
            –
            <input type="time" step={day.snap * 60} value={lunchTo} onChange={(e) => setLunchTo(e.target.value)} aria-label="Lunsj til" />
          </span>
          <span className="hint">
            {lunchValid
              ? `Normaldagen er ${clock(day.dayStart)}–${clock(day.dayEnd)}, som med denne lunsjen gir ${decimalText(worked)} timer. Lunsjen er ubetalt.`
              : `Lunsjen må ligge innenfor normaldagen ${clock(day.dayStart)}–${clock(day.dayEnd)}, på hele kvarter.`}
          </span>
        </label>
        <p className="hint">
          Kalenderens periode følger hallbookingene fra Venyou. Helger, helligdager og julaften regnes som fridager.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Avbryt
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            Lagre
          </button>
        </div>
      </form>
    </div>
  )
}
