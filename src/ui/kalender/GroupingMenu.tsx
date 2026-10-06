import { useRef, useState } from 'react'
import { useDismiss } from '../useDismiss'
import { DIMENSION_LABELS, DIMENSIONS, type Dimension } from './rows'
import { ChevronDown, ChevronUp, Layers, Plus, X } from 'lucide-react'

interface Props {
  grouping: Dimension[]
  onChange: (grouping: Dimension[]) => void
}

/**
 * Chooses the levels of the row hierarchy, like the row fields of a pivot table. The button shows the
 * levels in use as a trail from the top level down; the menu under it moves, removes and adds levels.
 */
export function GroupingMenu({ grouping, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useDismiss(ref, open, setOpen)
  const unused = DIMENSIONS.filter((d) => !grouping.includes(d))
  const trail = grouping.map((d) => DIMENSION_LABELS[d]).join(' › ')

  const swap = (i: number, j: number) => {
    const next = [...grouping]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <span className="menu" ref={ref}>
      <button className="bar-button" aria-haspopup="true" aria-expanded={open} title={`Grupper etter: ${trail || 'ingen nivåer'}`} onClick={() => setOpen(!open)}>
        <Layers size={14} aria-hidden />
        <span className="bar-button-label crumbs">{trail || 'Ingen gruppering'}</span>
        <ChevronDown size={12} aria-hidden />
      </button>
      {open && (
        <div className="menu-pop grouping-pop">
          <span className="menu-group first">Grupper etter</span>
          {grouping.length === 0 && <span className="muted small grouping-flat">Ingen nivåer: radene vises som en flat liste.</span>}
          {grouping.map((dimension, i) => (
            <div key={dimension} className="level-row">
              <span className="level-no">{i + 1}</span>
              <span className="level-name">{DIMENSION_LABELS[dimension]}</span>
              <button disabled={i === 0} aria-label={`Flytt ${DIMENSION_LABELS[dimension]} et nivå opp`} title="Et nivå opp" onClick={() => swap(i, i - 1)}>
                <ChevronUp size={14} aria-hidden />
              </button>
              <button disabled={i === grouping.length - 1} aria-label={`Flytt ${DIMENSION_LABELS[dimension]} et nivå ned`} title="Et nivå ned" onClick={() => swap(i, i + 1)}>
                <ChevronDown size={14} aria-hidden />
              </button>
              <button aria-label={`Fjern ${DIMENSION_LABELS[dimension]} som nivå`} title="Fjern nivå" onClick={() => onChange(grouping.filter((d) => d !== dimension))}>
                <X size={14} aria-hidden />
              </button>
            </div>
          ))}
          {unused.length > 0 && (
            <>
              <span className="menu-group">Legg til nivå</span>
              {unused.map((dimension) => (
                <button key={dimension} role="menuitem" onClick={() => onChange([...grouping, dimension])}>
                  <Plus size={14} aria-hidden />
                  {DIMENSION_LABELS[dimension]}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </span>
  )
}
