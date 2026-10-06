import { useState } from 'react'

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
