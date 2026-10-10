import { useId, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'
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

interface PickFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'list'> {
  value: string
  /** What is typed in the field. */
  onChange: (text: string) => void
  /** The values to pick from. Other text can still be typed. */
  options: string[]
  /** A value that is picked from the list; without it, it is taken as typed. */
  onPick?: (option: string) => void
  /** The value in bold in the list, where it is not the text of the field. */
  current?: string
  /** A few words after a value in the list. */
  note?: (option: string) => ReactNode
  /** Escape closed the list. */
  onCancel?: () => void
}

/**
 * A text field with values to pick from, listed under it while it has the focus: all of them until
 * something is typed, then those that hold the text. Arrow keys and Enter pick, as a click does.
 */
export function PickField({ value, onChange, options, onPick = onChange, current = value, note, onCancel, onBlur, onKeyDown, ...rest }: PickFieldProps) {
  const [open, setOpen] = useState(false)
  // The text the field holds when it is entered is not a search.
  const [typed, setTyped] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  const text = value.trim().toLowerCase()
  const listed = !open ? [] : typed && text ? options.filter((option) => option.toLowerCase().includes(text)) : options
  const show = () => setOpen(true)
  const close = () => {
    setOpen(false)
    setTyped(false)
    setActive(-1)
  }
  const pick = (option: string) => {
    onPick(option)
    close()
  }
  return (
    <span className="field">
      <input
        {...rest}
        role="combobox"
        aria-expanded={listed.length > 0}
        aria-controls={listed.length ? listId : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setTyped(true)
          setActive(-1)
          show()
        }}
        onFocus={show}
        onMouseDown={show}
        onBlur={(e) => {
          close()
          onBlur?.(e)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && listed[active] !== undefined) {
            // Not the Enter that sends a form.
            e.preventDefault()
            pick(listed[active])
            return
          }
          if (e.key === 'Escape' && open) {
            close()
            onCancel?.()
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (!open) show()
            else if (listed.length) setActive((at) => (e.key === 'ArrowDown' ? (at + 1) % listed.length : (at <= 0 ? listed.length : at) - 1))
          }
          onKeyDown?.(e)
        }}
      />
      {listed.length > 0 && (
        <span className="field-list" id={listId} role="listbox">
          {listed.map((option, index) => (
            <button
              key={option}
              type="button"
              role="option"
              tabIndex={-1}
              className={option === current ? 'current' : undefined}
              aria-selected={index === active}
              ref={index === active ? (el) => el?.scrollIntoView?.({ block: 'nearest' }) : undefined}
              // The field keeps the focus, so what was typed to find the value is not saved when it is left.
              onMouseDown={(e) => {
                e.preventDefault()
                pick(option)
              }}
            >
              {option}
              {note && <small>{note(option)}</small>}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

interface TextFieldProps {
  value: string
  onCommit: (value: string) => void
  /** Values to pick from, see `PickField`. */
  options?: string[]
  className?: string
  placeholder?: string
  ariaLabel?: string
}

/** Text edited in place, saved on blur or Enter. */
export function TextField({ value, onCommit, options, className, placeholder, ariaLabel }: TextFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (text: string) => {
    if (text !== value) onCommit(text)
    setDraft(null)
  }
  const props = {
    className: className ? `inline ${className}` : 'inline',
    placeholder,
    'aria-label': ariaLabel,
    value: draft ?? value,
    onBlur: () => draft !== null && commit(draft.trim()),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && e.currentTarget.blur(),
  }
  return options ? (
    <PickField {...props} options={options} current={value} onChange={setDraft} onPick={commit} onCancel={() => setDraft(null)} />
  ) : (
    <input {...props} onChange={(e) => setDraft(e.target.value)} />
  )
}
