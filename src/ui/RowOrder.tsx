import { useState, type DragEvent } from 'react'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'

/**
 * Rows of a table of the planner's put in order by dragging: what a row and its grip are given. `move` takes a row
 * from one place to another; with `movable` false nothing is dragged, as while a search hides some of the rows.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useRowOrder(move: (from: number, to: number) => void, movable = true) {
  const [dragged, setDragged] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const end = () => (setDragged(null), setOver(null))
  return {
    /** The class of the row at `index`, `op-row` marked while it is dragged or dragged over, and what it does as a drop target. */
    row: (index: number) => ({
      className: dragged === index ? 'op-row mk-dragged' : over === index && dragged !== null ? 'op-row mk-over' : 'op-row',
      onDragOver: (e: DragEvent) => {
        if (dragged === null || !movable) return
        e.preventDefault()
        setOver(index)
      },
      onDrop: () => {
        if (dragged !== null && movable && dragged !== index) move(dragged, index)
        end()
      },
    }),
    /** What the grip of the row at `index` does when it is dragged. */
    grip: (index: number) => ({ draggable: movable, onDragStart: () => setDragged(index), onDragEnd: end }),
  }
}

interface HandleProps {
  index: number
  count: number
  grip: ReturnType<ReturnType<typeof useRowOrder>['grip']>
  movable?: boolean
  onMove: (from: number, to: number) => void
  gripTitle: string
  upTitle?: string
  downTitle?: string
}

/** The grip a row is dragged by, and the arrows that move it one place up or down. */
export function OrderHandle({ index, count, grip, movable = true, onMove, gripTitle, upTitle = 'Flytt opp', downTitle = 'Flytt ned' }: HandleProps) {
  return (
    <span className="mk-order">
      <span className={movable ? 'mk-grip' : 'mk-grip off'} title={gripTitle} {...grip}>
        <GripVertical size={14} aria-hidden />
      </span>
      <span className="mk-arrows">
        <button className="icon-button" title={upTitle} disabled={!movable || index === 0} onClick={() => onMove(index, index - 1)}>
          <ChevronUp size={12} aria-hidden />
        </button>
        <button className="icon-button" title={downTitle} disabled={!movable || index === count - 1} onClick={() => onMove(index, index + 1)}>
          <ChevronDown size={12} aria-hidden />
        </button>
      </span>
    </span>
  )
}
