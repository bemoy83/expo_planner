import { useState } from 'react'
import { decimalText, parseDecimal } from '../domain/numbers'
import { useWorkspace } from '../store/workspaceStore'

/** The base crew and the hours of a normal day. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { workspace, updateSettings } = useWorkspace()
  const settings = workspace!.settings
  // Once people are entered on Personell, the active ones are the crew.
  const people = workspace!.persons?.length ?? 0
  const active = workspace!.persons?.filter((person) => person.active).length ?? 0
  const [baseCrew, setBaseCrew] = useState(String(settings.baseCrew))
  const [hoursPerDay, setHoursPerDay] = useState(decimalText(settings.hoursPerDay))

  // An empty crew is none; text that is no number is NaN, which no comparison lets through.
  const crew = parseDecimal(baseCrew) === null ? 0 : (parseDecimal(baseCrew) ?? NaN)
  const hours = parseDecimal(hoursPerDay) ?? NaN
  const valid = crew >= 0 && hours > 0

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          updateSettings({ ...settings, baseCrew: crew, hoursPerDay: hours })
          onClose()
        }}
      >
        <h2>Bemanning og normaltid</h2>
        {people ? (
          <p className="hint">
            Faste ansatte per arbeidsdag: <b>{active}</b>, de aktive på Personell.
          </p>
        ) : (
          <label>
            Faste ansatte per arbeidsdag (FTE)
            <input inputMode="decimal" value={baseCrew} onChange={(e) => setBaseCrew(e.target.value)} />
            <span className="hint">Gjelder til de faste er lagt inn på Personell; da telles de aktive der.</span>
          </label>
        )}
        <label>
          Timer per FTE-dag (normaltid)
          <input inputMode="decimal" value={hoursPerDay} onChange={(e) => setHoursPerDay(e.target.value)} />
          <span className="hint">Brukes til å regne behov i timer om til FTE-dager.</span>
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
