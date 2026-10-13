import { Plus, X } from 'lucide-react'
import type { CompetenceKey, CompetenceStyle } from '../../domain/types'
import { Menu } from '../common'
import { competenceColor } from '../dom'

/**
 * The competences someone has, in a cell of a table: each a button that takes it away, and a + that lists the rest to add.
 * `styles` are all the competences in the planner's order; `owner` names who has them, for the label of the +.
 */
export function CompetenceToggles({ styles, held, owner, onToggle }: { styles: CompetenceStyle[]; held: CompetenceKey[]; owner: string; onToggle: (key: CompetenceKey) => void }) {
  const has = styles.filter((style) => held.includes(style.key))
  const lacks = styles.filter((style) => !held.includes(style.key))
  return (
    <span className="comp-toggles">
      {has.map((style) => (
        <button key={style.key} className="comp-toggle" title={`Ta bort ${style.label}`} onClick={() => onToggle(style.key)}>
          <i className="swatch" style={competenceColor(style)} />
          {style.label}
          <X size={11} aria-hidden />
        </button>
      ))}
      {lacks.length > 0 && (
        <Menu label={<Plus size={13} aria-hidden />} ariaLabel={`Gi ${owner} en kompetanse`} title="Legg til kompetanse" className="comp-add">
          {() =>
            lacks.map((style) => (
              <button key={style.key} role="menuitem" onClick={() => onToggle(style.key)}>
                <i className="swatch" style={competenceColor(style)} />
                {style.label}
              </button>
            ))
          }
        </Menu>
      )}
    </span>
  )
}
