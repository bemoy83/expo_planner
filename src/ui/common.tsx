import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useWorkspace } from '../store/workspaceStore'
import { useDismiss } from './useDismiss'
import { ChevronDown, ChevronRight, PanelRight, Redo2, Undo2 } from 'lucide-react'

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

/** The room a menu is kept inside: the window, and the nearest part of the page around it that scrolls and so cuts what sticks out of it. */
const roomAround = (el: HTMLElement) => {
  const room = { left: 0, right: window.innerWidth, bottom: window.innerHeight }
  for (let parent = el.parentElement; parent; parent = parent.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(parent)
    if (![overflowX, overflowY].some((overflow) => overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden')) continue
    const box = parent.getBoundingClientRect()
    return { left: Math.max(room.left, box.left), right: Math.min(room.right, box.left + parent.clientWidth), bottom: Math.min(room.bottom, box.top + parent.clientHeight) }
  }
  return room
}

const EDGE = 8

/**
 * A button that opens a menu or a small panel under it. Closes on a click outside and on Escape. A menu that
 * would reach past an edge of the window is moved in from it, and one that would reach below it scrolls.
 * What is marked `data-focus` in it gets the focus when it opens.
 */
export function Menu({ label, title, ariaLabel, className = '', align = 'left', children }: MenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  useDismiss(ref, open, setOpen)
  useLayoutEffect(() => {
    const el = pop.current
    if (!open || !el) return
    const room = roomAround(el)
    const box = el.getBoundingClientRect()
    const shift = box.right > room.right - EDGE ? room.right - EDGE - box.right : box.left < room.left + EDGE ? room.left + EDGE - box.left : 0
    // Never so far that the other edge is passed: a menu wider than the room starts at its left edge. It is placed, not
    // drawn elsewhere, so that it does not make the page around it wider to scroll in.
    const moved = Math.max(shift, room.left + EDGE - box.left)
    if (align === 'right') el.style.right = `${-moved}px`
    else el.style.left = `${moved}px`
    if (box.bottom > room.bottom - EDGE) {
      el.style.maxHeight = `${Math.max(120, room.bottom - EDGE - box.top)}px`
      el.style.overflowY = 'auto'
    }
    // The field to type in gets the focus here, when the menu is in place: a field that takes it by itself is scrolled to where the menu first was.
    el.querySelector<HTMLElement>('[data-focus]')?.focus({ preventScroll: true })
  }, [open, align])
  return (
    <span className="menu" ref={ref}>
      <button className={`menu-button ${className}`} aria-haspopup="true" aria-expanded={open} aria-label={ariaLabel} title={title} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && (
        <div ref={pop} className={`menu-pop ${align}`}>
          {children(() => setOpen(false))}
        </div>
      )}
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

export interface ToolChoice<T extends string> {
  value: T
  icon: ReactNode
  name: ReactNode
  /** The key that picks the tool, shown on its button. */
  shortcut: string
  title: string
}

/** The tool switch of a planning page: every tool shows its icon, its name and its key. */
export function ToolSwitch<T extends string>({ tool, tools, onChange }: { tool: T; tools: ToolChoice<T>[]; onChange: (tool: T) => void }) {
  return (
    <span className="tool-switch">
      <Segmented
        label="Verktøy"
        value={tool}
        onChange={onChange}
        options={tools.map(({ value, icon, name, shortcut, title }) => ({
          value,
          title,
          label: (
            <>
              {icon} {name} <kbd>{shortcut}</kbd>
            </>
          ),
        }))}
      />
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

/** The arrow that folds a section or a level. `show` and `hide` say what a click does. */
export function Twisty({ open, show, hide, onToggle, style }: { open: boolean; show: string; hide: string; onToggle: () => void; style?: React.CSSProperties }) {
  return (
    <button className="twisty" style={style} aria-expanded={open} aria-label={open ? hide : show} onClick={onToggle}>
      {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
    </button>
  )
}

/** The button in the page header that slides the details panel in over the grid. `what` names the details: «raddetaljer». */
export function PanelToggle({ open, what, hint, disabled, onToggle }: { open: boolean; what: string; hint: string; disabled?: boolean; onToggle: () => void }) {
  return (
    <button className={`ghost icon-button ${open ? 'active' : ''}`} aria-pressed={open} disabled={disabled} aria-label={open ? `Skjul ${what}` : `Vis ${what}`} title={open ? `Skjul ${what}` : `Vis ${what}: ${hint}`} onClick={onToggle}>
      <PanelRight size={16} aria-hidden />
    </button>
  )
}

/** A checkbox for several things at once: ticked when all of them are, and marked as partial when some are. */
export function TriCheckbox({ checked, partial, label, onChange }: { checked: boolean; partial: boolean; label: string; onChange: (checked: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial
  }, [partial])
  return <input ref={ref} type="checkbox" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
}
