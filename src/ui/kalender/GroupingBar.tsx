import { useEffect, useRef, useState } from 'react'
import { DIMENSION_LABELS, DIMENSIONS, type Dimension } from './rows'

interface Props {
  grouping: Dimension[]
  onChange: (grouping: Dimension[]) => void
}

/**
 * Chooses the levels of the row hierarchy, like the row fields of a pivot table:
 * the properties in use, in order from the top level down, and the ones left out.
 */
export function GroupingBar({ grouping, onChange }: Props) {
  const [dragged, setDragged] = useState<Dimension | null>(null)
  const unused = DIMENSIONS.filter((d) => !grouping.includes(d))
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLSpanElement>(null)

  // The menu closes on a click outside it and on Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  /** Puts `dimension` at `index` among the levels, whether it was in use or not. */
  const place = (dimension: Dimension, index: number) => {
    const next = grouping.filter((d) => d !== dimension)
    next.splice(Math.max(0, Math.min(next.length, index)), 0, dimension)
    if (next.join() !== grouping.join()) onChange(next)
  }

  return (
    <div className="grouping-bar">
      <span className="grouping-title">Grupper etter</span>
      {grouping.length > 0 && (
        <span className="grouping-track">
          {grouping.map((dimension, i) => (
            <span key={dimension} className="grouping-step">
              {i > 0 && <span className="grouping-sep">→</span>}
              <span
                className={`chip ${dragged === dimension ? 'dragging' : ''}`}
                draggable
                title="Dra for å endre rekkefølgen"
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', dimension)
                  setDragged(dimension)
                }}
                onDragEnd={() => setDragged(null)}
                onDragOver={(e) => dragged && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragged) place(dragged, i)
                  setDragged(null)
                }}
              >
                <button className="chip-move" disabled={i === 0} aria-label={`Flytt ${DIMENSION_LABELS[dimension]} et nivå opp`} title="Et nivå opp" onClick={() => place(dimension, i - 1)}>
                  ◂
                </button>
                {DIMENSION_LABELS[dimension]}
                <button className="chip-move" disabled={i === grouping.length - 1} aria-label={`Flytt ${DIMENSION_LABELS[dimension]} et nivå ned`} title="Et nivå ned" onClick={() => place(dimension, i + 1)}>
                  ▸
                </button>
                <button className="chip-remove" aria-label={`Fjern ${DIMENSION_LABELS[dimension]} som nivå`} title="Ikke grupper etter denne" onClick={() => onChange(grouping.filter((d) => d !== dimension))}>
                  ×
                </button>
              </span>
            </span>
          ))}
        </span>
      )}
      {grouping.length === 0 && <span className="muted small">Ingen nivåer: radene vises som en flat liste.</span>}
      {unused.length > 0 && (
        <span
          className="grouping-unused"
          ref={menuRef}
          onDragOver={(e) => dragged && e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (dragged) place(dragged, grouping.length)
            setDragged(null)
          }}
        >
          <button className="grouping-add" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Legg til nivå" title="Legg til nivå" onClick={() => setMenuOpen(!menuOpen)}>
            +
          </button>
          {menuOpen && (
            <span className="grouping-menu" role="menu">
              {unused.map((dimension) => (
                <button
                  key={dimension}
                  role="menuitem"
                  onClick={() => {
                    onChange([...grouping, dimension])
                    setMenuOpen(false)
                  }}
                >
                  {DIMENSION_LABELS[dimension]}
                </button>
              ))}
            </span>
          )}
        </span>
      )}
    </div>
  )
}
