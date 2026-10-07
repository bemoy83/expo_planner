import { useRef } from 'react'
import type { CompetenceStyle } from '../../domain/types'
import { useDismiss } from '../useDismiss'
import { ChevronsDownUp, ChevronsUpDown, Eraser, Paintbrush } from 'lucide-react'

const inWindow = (x: number, y: number, width: number, height: number) => ({ left: Math.max(8, Math.min(x, window.innerWidth - width - 10)), top: Math.max(8, Math.min(y, window.innerHeight - height - 10)) })

interface AskProps {
  x: number
  y: number
  /** How many of the days hold work of another competence. */
  count: number
  onCancel: () => void
  onFill: () => void
  onReplace: () => void
}

/** Asked at the pointer when a full-day paint meets days that already hold other work. */
export function PaintAsk({ x, y, count, onCancel, onFill, onReplace }: AskProps) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, true, onCancel)
  return (
    <div className="menu-pop bm-ask" role="dialog" ref={ref} style={inWindow(x, y + 8, 300, 150)}>
      <p>{count === 1 ? 'Dagen har allerede andre oppgaver.' : `${count} av dagene har allerede andre oppgaver.`} Vil du fylle den ledige tiden, eller erstatte alt?</p>
      <div className="dialog-actions">
        <button onClick={onCancel}>Avbryt</button>
        <button onClick={onReplace}>Erstatt</button>
        <button className="primary" autoFocus onClick={onFill}>
          Fyll resten
        </button>
      </div>
    </div>
  )
}

interface MenuProps {
  x: number
  y: number
  title: string
  /** The person's competences, each with whether a full day of it can be painted here. */
  competences: { style: CompetenceStyle; blocked: boolean }[]
  hasBlocks: boolean
  /** Whether the person is open for editing hours. */
  open: boolean
  onToggleOpen: () => void
  onClose: () => void
  onPaint: (competence: string) => void
  onClear: () => void
}

/** The menu a right-click on a person's day opens. */
export function DayMenu({ x, y, title, competences, hasBlocks, open, onToggleOpen, onClose, onPaint, onClear }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, true, onClose)
  const run = (action: () => void) => () => {
    onClose()
    action()
  }
  return (
    <div className="menu-pop cell-menu" role="menu" ref={ref} style={inWindow(x, y, 280, 130 + competences.length * 34)} onContextMenu={(e) => e.preventDefault()}>
      <span className="menu-group first">{title}</span>
      <button role="menuitem" onClick={run(onToggleOpen)}>
        {open ? <ChevronsDownUp size={14} aria-hidden /> : <ChevronsUpDown size={14} aria-hidden />}
        {open ? 'Fold sammen' : 'Utvid til timer'}
        <span className="menu-key">E</span>
      </button>
      <span className="menu-rule" />
      {competences.map(({ style, blocked }) => (
        <button key={style.key} role="menuitem" disabled={blocked} onClick={run(() => onPaint(style.key))}>
          <Paintbrush size={14} aria-hidden />
          Mal hel dag med {style.label}
        </button>
      ))}
      {competences.length > 0 && <span className="menu-rule" />}
      <button role="menuitem" disabled={!hasBlocks} onClick={run(onClear)}>
        <Eraser size={14} aria-hidden />
        Tøm dagen
        <span className="menu-key">Del</span>
      </button>
    </div>
  )
}
