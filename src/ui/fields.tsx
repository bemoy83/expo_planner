import { useId, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref } from 'react'
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

/** A value of a `PickField` in a group: what is picked, how it is shown, and a few words after it. */
export interface PickItem {
  value: string
  /** What the list shows, where it is not the value itself. */
  label?: string
  note?: ReactNode
  /** A colour before it, as a competence's. */
  dot?: string
}

/** Values of a `PickField` under a heading, with a few words beside the heading: «Forslag · teksten nevner D1». */
export interface PickGroup {
  label?: string
  hint?: string
  items: PickItem[]
}

interface PickFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'list'> {
  value: string
  /** What is typed in the field. */
  onChange: (text: string) => void
  /** The values to pick from. Other text can still be typed. */
  options?: string[]
  /** The values in groups under headings, in place of `options`. */
  groups?: PickGroup[]
  /** A line above the list: what is being picked for. */
  head?: ReactNode
  /** A value that is picked from the list; without it, it is taken as typed. */
  onPick?: (option: string) => void
  /** The value in bold in the list, where it is not the text of the field. */
  current?: string
  /** A few words after a value in the list. */
  note?: (option: string) => ReactNode
  /** Escape closed the list. */
  onCancel?: () => void
  /** The field itself, for the page to put the focus in. */
  ref?: Ref<HTMLInputElement>
  /** A value that is marked when the list opens before anything is typed, so that Enter takes it: an offer. */
  marked?: string
}

/**
 * A text field with values to pick from, listed under it while it has the focus: all of them until
 * something is typed, then those that hold the text. Arrow keys and Enter pick, as a click does.
 * The values can stand in groups under headings, with a line above them all.
 */
export function PickField({ value, onChange, options = [], groups, head, onPick = onChange, current = value, note, onCancel, onBlur, onKeyDown, marked, ...rest }: PickFieldProps) {
  const [open, setOpen] = useState(false)
  // The text the field holds when it is entered is not a search.
  const [typed, setTyped] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  const text = value.trim().toLowerCase()
  const all: PickGroup[] = groups ?? [{ items: options.map((option) => ({ value: option, note: note?.(option) })) }]
  const shown = (item: PickItem) => `${item.label ?? item.value}`.toLowerCase().includes(text)
  const sections = !open ? [] : (typed && text ? all.map((group) => ({ ...group, items: group.items.filter(shown) })) : all).filter((group) => group.items.length > 0)
  const listed = sections.flatMap((group) => group.items)
  const show = () => {
    if (!open && marked !== undefined) setActive(all.flatMap((group) => group.items).findIndex((item) => item.value === marked))
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    setTyped(false)
    setActive(-1)
  }
  const pick = (option: string) => {
    onPick(option)
    close()
  }
  let at = -1
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
            pick(listed[active].value)
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
        <span className={`field-list ${groups ? 'grouped' : ''}`} id={listId} role="listbox">
          {head && <span className="field-head">{head}</span>}
          {sections.map((group, g) => (
            <span key={g} className="field-group" role="group" aria-label={group.label}>
              {group.label && (
                <span className="field-group-head">
                  {group.label}
                  {group.hint && <small>{group.hint}</small>}
                </span>
              )}
              {group.items.map((item) => {
                const index = ++at
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    className={item.value === current ? 'current' : undefined}
                    aria-selected={index === active}
                    ref={index === active ? (el) => el?.scrollIntoView?.({ block: 'nearest' }) : undefined}
                    onMouseEnter={groups ? () => setActive(index) : undefined}
                    // The field keeps the focus, so what was typed to find the value is not saved when it is left.
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pick(item.value)
                    }}
                  >
                    {item.dot && <i className="field-dot" style={{ background: item.dot }} aria-hidden />}
                    {item.label ?? item.value}
                    {item.note && <small>{item.note}</small>}
                  </button>
                )
              })}
            </span>
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
