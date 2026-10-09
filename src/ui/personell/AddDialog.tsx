import { useState } from 'react'

interface AddProps {
  title: string
  label: string
  /** Whether the name cannot be used because it is there already. */
  taken: (name: string) => boolean
  onAdd: (name: string) => void
  onClose: () => void
}

/** Asks for the name of a new person or competence. */
export function AddDialog({ title, label, taken, onAdd, onClose }: AddProps) {
  const [name, setName] = useState('')
  const duplicate = name.trim() !== '' && taken(name)
  const valid = name.trim() !== '' && !duplicate
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) onAdd(name)
        }}
      >
        <h2>{title}</h2>
        <label>
          {label}
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        {duplicate && <span className="issue">Finnes allerede i listen.</span>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Avbryt
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            Legg til
          </button>
        </div>
      </form>
    </div>
  )
}
