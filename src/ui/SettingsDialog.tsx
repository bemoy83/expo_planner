import { useState } from 'react'
import { decimalText, parseDecimal } from '../domain/numbers'
import { useWorkspace } from '../store/workspaceStore'
import { clockMinutes } from './bemanning/week'
import { clock } from './format'

/** The base crew, the hours of a normal day and its lunch break, and the overhead Resultat adds to the plan. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { workspace, updateSettings } = useWorkspace()
  const settings = workspace!.settings
  // Once people are entered on Faste, they are the crew.
  const people = workspace!.persons?.length ?? 0
  const [baseCrew, setBaseCrew] = useState(String(settings.baseCrew))
  const [hoursPerDay, setHoursPerDay] = useState(decimalText(settings.hoursPerDay))
  const day = settings.workday
  const [lunchFrom, setLunchFrom] = useState(clock(day.breakStart))
  const [lunchTo, setLunchTo] = useState(clock(day.breakEnd))
  const [overheadPct, setOverheadPct] = useState(decimalText(Math.round(settings.overhead * 1000) / 10))

  // An empty crew is none; text that is no number is NaN, which no comparison lets through.
  const crew = parseDecimal(baseCrew) === null ? 0 : (parseDecimal(baseCrew) ?? NaN)
  const hours = parseDecimal(hoursPerDay) ?? NaN
  // The lunch lies within the normal day, on the quarters of an hour the blocks keep to.
  const breakStart = clockMinutes(lunchFrom)
  const breakEnd = clockMinutes(lunchTo)
  const lunchValid = breakStart > day.dayStart && breakEnd > breakStart && breakEnd < day.dayEnd && breakStart % day.snap === 0 && breakEnd % day.snap === 0
  const overhead = (parseDecimal(overheadPct) === null ? 0 : (parseDecimal(overheadPct) ?? NaN)) / 100
  const valid = crew >= 0 && hours > 0 && lunchValid && overhead >= 0 && overhead < 10
  const worked = (day.dayEnd - day.dayStart - (breakEnd - breakStart)) / 60

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          updateSettings({ ...settings, baseCrew: crew, hoursPerDay: hours, workday: { ...day, breakStart, breakEnd }, overhead })
          onClose()
        }}
      >
        <h2>Bemanning, normaltid og overhead</h2>
        {people ? (
          <p className="hint">
            Faste ansatte per arbeidsdag: <b>{people}</b>, de på Mannskap › Faste.
          </p>
        ) : (
          <label>
            Faste ansatte per arbeidsdag (FTE)
            <input inputMode="decimal" value={baseCrew} onChange={(e) => setBaseCrew(e.target.value)} />
            <span className="hint">Gjelder til de faste er lagt inn på Mannskap › Faste; da telles de der.</span>
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
        <label>
          Overhead på planlagte timer (%)
          <input inputMode="decimal" value={overheadPct} onChange={(e) => setOverheadPct(e.target.value)} />
          <span className="hint">Budsjettet på Resultat har overhead i seg, planen bare det direkte arbeidet. Planlagte timer sammenlignes derfor med budsjettet med dette lagt til.</span>
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
