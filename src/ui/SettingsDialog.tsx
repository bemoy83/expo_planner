import { useState } from 'react'
import { useWorkspace } from '../store/workspaceStore'

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { workspace, updateSettings } = useWorkspace()
  const settings = workspace!.settings
  const [baseCrew, setBaseCrew] = useState(String(settings.baseCrew))
  const [hoursPerDay, setHoursPerDay] = useState(String(settings.hoursPerDay).replace('.', ','))

  const crew = Number(baseCrew.replace(',', '.'))
  const hours = Number(hoursPerDay.replace(',', '.'))
  const valid = Number.isFinite(crew) && crew >= 0 && Number.isFinite(hours) && hours > 0

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
        <h2>Innstillinger</h2>
        <label>
          Faste ansatte per arbeidsdag (FTE)
          <input inputMode="decimal" value={baseCrew} onChange={(e) => setBaseCrew(e.target.value)} />
        </label>
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
