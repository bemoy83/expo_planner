import { useState } from 'react'
import type { CompetenceKey, CompetenceStyle } from '../../domain/types'
import { FormDialog } from '../common'
import { CompetencePicker } from './CompetenceChips'

interface AddProps {
  title: string
  label: string
  /** A line under the title. */
  lead?: string
  /** Whether the name cannot be used because it is there already. */
  taken: (name: string) => boolean
  /** The competences to tick for someone new, where the new one has competences: a person or a supplier. */
  styles?: CompetenceStyle[]
  onAdd: (name: string, competences: CompetenceKey[]) => void
  onClose: () => void
}

/** Asks for the name of a new person, supplier or competence, and for a person or a supplier the competences it has. */
export function AddDialog({ title, label, lead, taken, styles, onAdd, onClose }: AddProps) {
  const [name, setName] = useState('')
  const [held, setHeld] = useState<CompetenceKey[]>([])
  const duplicate = name.trim() !== '' && taken(name)
  return (
    <FormDialog title={title} lead={lead} wide={!!styles} issue={duplicate && 'Finnes allerede i listen.'} valid={name.trim() !== '' && !duplicate} onSubmit={() => onAdd(name.trim(), held)} onClose={onClose}>
      <label>
        {label}
        <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </label>
      {styles && styles.length > 0 && (
        <div className="dialog-field">
          <span>
            Kompetanser <small>· kan settes senere</small>
          </span>
          <CompetencePicker styles={styles} held={held} onChange={setHeld} />
        </div>
      )}
    </FormDialog>
  )
}
