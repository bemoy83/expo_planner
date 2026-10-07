import { useRef } from 'react'
import { formatFte, FTE_NOISE } from '../../domain/calc'
import type { ISODate } from '../../domain/dates'
import type { AllocationRow } from '../../domain/types'
import { inWindow } from '../dom'
import { useDismiss } from '../useDismiss'
import { fmtDay } from './labels'
import { ArrowRight, Eraser, PanelRight, Pencil, SquarePen, Trash2, X } from 'lucide-react'

/** As wide and as tall as the menu gets, for keeping it inside the window. */
const MENU_W = 280
const MENU_H = 330

interface Props {
  /** Where the mouse was when the menu was asked for. */
  x: number
  y: number
  row: AllocationRow
  date: ISODate
  /** What is left of the row's demand, in FTE-days. */
  remaining: number
  /** The last day of the row's window, where it has one. */
  windowEnd: ISODate | undefined
  /** A suggested row is not stored yet, so there is nothing to edit or delete. */
  stored: boolean
  onClose: () => void
  onSpread: () => void
  onSpreadFromHere: () => void
  onClearCell: () => void
  onClearRow: () => void
  onDetails: () => void
  onEdit: () => void
  onRemove: () => void
}

/** The menu a right-click on a planning cell opens: the common things to do with the cell and its row. */
export function CellMenu({ x, y, row, date, remaining, windowEnd, stored, onClose, onSpread, onSpreadFromHere, onClearCell, onClearRow, onDetails, onEdit, onRemove }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, true, onClose)
  const run = (action: () => void) => () => {
    onClose()
    action()
  }
  const left = remaining > FTE_NOISE
  return (
    <div className="menu-pop cell-menu" role="menu" ref={ref} style={inWindow(x, y, MENU_W, MENU_H)} onContextMenu={(e) => e.preventDefault()}>
      <span className="menu-group first">
        {row.competence || 'Rad'} · {fmtDay(date)}
      </span>
      <button role="menuitem" disabled={!left || !windowEnd} onClick={run(onSpread)}>
        <Pencil size={14} aria-hidden />
        Fordel gjenstående over vinduet
        <span className="menu-key">{left ? formatFte(remaining) : '–'}</span>
      </button>
      <button role="menuitem" disabled={!left || !windowEnd || date > windowEnd} onClick={run(onSpreadFromHere)}>
        <ArrowRight size={14} aria-hidden />
        Fordel herfra til vindusslutt
      </button>
      <button role="menuitem" disabled={!row.fte[date]} onClick={run(onClearCell)}>
        <X size={14} aria-hidden />
        Tøm cellen
        <span className="menu-key">Del</span>
      </button>
      <button role="menuitem" disabled={Object.keys(row.fte).length === 0} onClick={run(onClearRow)}>
        <Eraser size={14} aria-hidden />
        Tøm raden
      </button>
      <span className="menu-rule" />
      <button role="menuitem" onClick={run(onDetails)}>
        <PanelRight size={14} aria-hidden />
        Vis raddetaljer
      </button>
      {stored && (
        <>
          <button role="menuitem" onClick={run(onEdit)}>
            <SquarePen size={14} aria-hidden />
            Endre rad …
          </button>
          <button role="menuitem" className="danger" onClick={run(onRemove)}>
            <Trash2 size={14} aria-hidden />
            Slett rad …
          </button>
        </>
      )}
    </div>
  )
}
