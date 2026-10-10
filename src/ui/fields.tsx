import { useId, useState } from 'react'
import { decimalText, parseDecimal } from '../domain/numbers'

/** A number that is edited in place and saved when the field is left or Enter is pressed. Empty means 0. */
export function NumberField({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const shown = value ? decimalText(value) : ''
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className="inline num"
      inputMode="decimal"
      value={draft ?? shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === null) return
        const n = parseDecimal(draft)
        if (n !== undefined && (n ?? 0) !== value) onCommit(n ?? 0)
        setDraft(null)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

interface TextFieldProps {
  value: string
  onCommit: (value: string) => void
  /** Values to pick from, listed under the field while it is edited. Other text can still be typed. */
  options?: string[]
  className?: string
  placeholder?: string
  ariaLabel?: string
}

/** Text edited in place, saved on blur or Enter. */
export function TextField({ value, onCommit, options, className, placeholder, ariaLabel }: TextFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  // All of them are listed until something is typed: the value the field holds is not a search.
  const typed = draft?.trim().toLowerCase()
  const listed = open && options ? (typed ? options.filter((option) => option.toLowerCase().includes(typed)) : options) : []
  const show = options ? () => setOpen(true) : undefined
  const close = () => {
    setOpen(false)
    setActive(-1)
  }
  const commit = (text: string) => {
    if (text !== value) onCommit(text)
    setDraft(null)
    close()
  }
  const input = (
    <input
      className={className ? `inline ${className}` : 'inline'}
      placeholder={placeholder}
      aria-label={ariaLabel}
      role={options ? 'combobox' : undefined}
      aria-expanded={options ? listed.length > 0 : undefined}
      aria-controls={listed.length ? listId : undefined}
      autoComplete={options ? 'off' : undefined}
      value={draft ?? value}
      onChange={(e) => {
        setDraft(e.target.value)
        setActive(-1)
        show?.()
      }}
      onFocus={show}
      onMouseDown={show}
      onBlur={() => (draft === null ? close() : commit(draft.trim()))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          if (listed[active] !== undefined) commit(listed[active])
          else (e.target as HTMLInputElement).blur()
        } else if (e.key === 'Escape' && open) {
          setDraft(null)
          close()
        } else if (options && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
          e.preventDefault()
          if (!open) setOpen(true)
          else if (listed.length) setActive((at) => (e.key === 'ArrowDown' ? (at + 1) % listed.length : (at <= 0 ? listed.length : at) - 1))
        }
      }}
    />
  )
  if (!options) return input
  return (
    <span className="field">
      {input}
      {listed.length > 0 && (
        <span className="field-list" id={listId} role="listbox">
          {listed.map((option, index) => (
            <button
              key={option}
              type="button"
              role="option"
              tabIndex={-1}
              className={option === value ? 'current' : undefined}
              aria-selected={index === active}
              ref={index === active ? (el) => el?.scrollIntoView?.({ block: 'nearest' }) : undefined}
              // The field keeps the focus, so the choice is not taken for what was typed when it is left.
              onMouseDown={(e) => {
                e.preventDefault()
                commit(option)
              }}
            >
              {option}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}
