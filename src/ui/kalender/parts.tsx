import { useState } from 'react'

/** Planned within this much of the demand counts as covered; a plan in tenths seldom lands exactly. */
const COVERED_WITHIN = 0.05
/** Planned this far above the demand counts as clearly over. */
const OVER_FROM = 1.15

/** A thin line under a line's figures: how much of its demand is planned. Nothing where there is no demand. */
export function CoverageBar({ required, planned }: { required: number | null; planned: number }) {
  if (!required || required <= 0) return null
  const share = planned / required
  // A small row rounded up to the next tenth is far over in per cent but not in people.
  const state = planned >= required - COVERED_WITHIN ? (share > OVER_FROM && planned - required > 0.25 ? 'over' : 'covered') : 'partly'
  return (
    <span className={`coverage ${state}`} aria-hidden>
      <i style={{ width: `${Math.min(1, share) * 100}%` }} />
    </span>
  )
}

/** The note on the cell in focus, saved when the field is left or Enter is pressed. */
export function NoteEditor({ note, onSave }: { note: string; onSave: (note: string) => void }) {
  const [value, setValue] = useState(note)
  return (
    <input
      className="note-input"
      placeholder="Notat for cellen"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value !== note && onSave(value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}
