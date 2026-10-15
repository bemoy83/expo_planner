import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { CompetenceKey, CompetenceStyle } from '../../domain/types'
import { competenceColor } from '../dom'
import { PickField } from '../fields'

/**
 * The competences someone has, in a cell of a table: a chip each, which takes it away on a click (its × shows under
 * the pointer), and a + that lists the rest to add. Someone without any is asked for one by a raised «+ Kompetanse».
 * `styles` are all the competences in the planner's order; `owner` names who has them, for the head of the list.
 */
export function CompetenceChips({ styles, held, owner, onToggle }: { styles: CompetenceStyle[]; held: CompetenceKey[]; owner: string; onToggle: (key: CompetenceKey, on: boolean) => void }) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const has = styles.filter((style) => held.includes(style.key))
  const lacks = styles.filter((style) => !held.includes(style.key))
  return (
    <span className="mk-chips">
      {has.map((style) => (
        <button key={style.key} className="mk-chip" title={`Ta bort ${style.label}`} onClick={() => onToggle(style.key, false)}>
          <i className="swatch" style={competenceColor(style)} />
          {style.label}
          <X size={11} aria-hidden />
        </button>
      ))}
      {adding ? (
        <span className="mk-pick">
          <PickField
            autoFocus
            floating
            value={text}
            onChange={setText}
            head={`Gi ${owner} en kompetanse`}
            groups={[{ items: lacks.map((style) => ({ value: style.key, label: style.label, dot: `var(--${style.color})` })) }]}
            aria-label={`Gi ${owner} en kompetanse`}
            placeholder="Søk …"
            marked={lacks[0]?.key}
            onPick={(key) => (setAdding(false), setText(''), onToggle(key, true))}
            onCancel={() => setAdding(false)}
            onBlur={() => setAdding(false)}
          />
        </span>
      ) : (
        lacks.length > 0 && (
          <button className={`mk-add ${has.length ? '' : 'want'}`} title="Legg til kompetanse" aria-label={`Gi ${owner} en kompetanse`} onClick={() => setAdding(true)}>
            <Plus size={13} aria-hidden />
            {!has.length && 'Kompetanse'}
          </button>
        )
      )}
    </span>
  )
}

/** The competences to tick for someone new, in the planner's order: outlined, and filled once ticked. */
export function CompetencePicker({ styles, held, onChange }: { styles: CompetenceStyle[]; held: CompetenceKey[]; onChange: (held: CompetenceKey[]) => void }) {
  return (
    <span className="mk-chips mk-pickall">
      {styles.map((style) => {
        const on = held.includes(style.key)
        return (
          <button type="button" key={style.key} className={`mk-chip outline ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onChange(on ? held.filter((key) => key !== style.key) : [...held, style.key])}>
            <i className="swatch" style={competenceColor(style)} />
            {style.label}
          </button>
        )
      })}
    </span>
  )
}
