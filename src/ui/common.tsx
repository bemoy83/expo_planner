import { useRef, useState, type ReactNode } from 'react'
import { useWorkspace } from '../store/workspaceStore'
import { useDismiss } from './useDismiss'
import { Redo2, Undo2 } from 'lucide-react'

interface MenuProps {
  label: ReactNode
  title?: string
  /** What the button is called when its label is an icon alone. */
  ariaLabel?: string
  className?: string
  /** Which edge of the button the menu lines up with. */
  align?: 'left' | 'right'
  /** The content, given a function that closes the menu. */
  children: (close: () => void) => ReactNode
}

/** A button that opens a menu or a small panel under it. Closes on a click outside and on Escape. */
export function Menu({ label, title, ariaLabel, className = '', align = 'left', children }: MenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useDismiss(ref, open, setOpen)
  return (
    <span className="menu" ref={ref}>
      <button className={`menu-button ${className}`} aria-haspopup="true" aria-expanded={open} aria-label={ariaLabel} title={title} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && <div className={`menu-pop ${align}`}>{children(() => setOpen(false))}</div>}
    </span>
  )
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (value: T) => void
}

/** A choice between a few values, shown as buttons in one track. */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <span className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} className={option.value === value ? 'active' : ''} aria-pressed={option.value === value} title={option.title} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </span>
  )
}

/** Undo and redo, as they sit in every tab's toolbar: icons alone, named in the tooltip. */
export function UndoRedoButtons() {
  const { undo, redo, canUndo, canRedo } = useWorkspace()
  return (
    <>
      <button className="icon-button" onClick={undo} disabled={!canUndo} aria-label="Angre" title="Angre (Ctrl/Cmd+Z)">
        <Undo2 size={16} aria-hidden />
      </button>
      <button className="icon-button" onClick={redo} disabled={!canRedo} aria-label="Gjør om" title="Gjør om (Ctrl/Cmd+Shift+Z)">
        <Redo2 size={16} aria-hidden />
      </button>
    </>
  )
}

/** What a tab tells the planner after an import or another action. */
export interface Message {
  kind: 'ok' | 'error'
  text: string
}

export function MessageBanner({ message, onClose }: { message: Message | null; onClose: () => void }) {
  if (!message) return null
  return (
    <div className={message.kind === 'ok' ? 'info-banner' : 'error-banner'} role="status">
      {message.text}{' '}
      <button className="link" onClick={onClose}>
        Lukk
      </button>
    </div>
  )
}

interface MergeReplaceProps {
  title: string
  /** The file or files being read. */
  source: string
  /** What the import would change, one line per table. */
  results: string[]
  /** What «Erstatt alt» does, after the words «Erstatt alt:». */
  replaceText: string
  onCancel: () => void
  onApply: (mode: 'merge' | 'replace') => void
}

/** Asks whether a file should be merged into a table that already has content, or replace it. */
export function MergeReplaceDialog({ title, source, results, replaceText, onCancel, onApply }: MergeReplaceProps) {
  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h2>{title}</h2>
        <p className="hint">{source}</p>
        {results.map((result) => (
          <p key={result} className="dialog-result">
            {result}
          </p>
        ))}
        <p className="hint">
          <strong>Slå sammen:</strong> filen vinner der den har en rad, det som bare finnes i appen beholdes.
          <br />
          <strong>Erstatt alt:</strong> {replaceText}.
        </p>
        <div className="dialog-actions">
          <button onClick={onCancel}>Avbryt</button>
          <button onClick={() => onApply('replace')}>Erstatt alt</button>
          <button className="primary" onClick={() => onApply('merge')}>
            Slå sammen
          </button>
        </div>
      </div>
    </div>
  )
}
