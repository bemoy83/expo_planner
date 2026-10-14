import { useState, type ReactNode, type Ref } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { PickField } from '../fields'

interface Props {
  /** What the cell holds once it is resolved, as quiet text that opens the list on a click. */
  value?: string
  /** The value was picked by the planner, not read: a dot says so. */
  chosen?: boolean
  /** The value offered where there is none: one click takes it. */
  offer?: string
  /** Why it is offered. */
  offerTitle?: string
  /** What the alert chip says where there is neither: «Velg hall». */
  missing: string
  options: string[]
  note?: (option: string) => ReactNode
  /** What a pick does, and for whom: the title of what opens the list. */
  title?: string
  label: string
  onPick: (option: string) => void
  /** A class for what is shown, as `crumb` in the form of Egen registrering. */
  className?: string
  /** The button that opens the list, for the form to put the focus on. */
  buttonRef?: Ref<HTMLButtonElement>
}

/**
 * A value that is resolved in its cell: quiet text once it is there, the offer with a tick and the list beside it («✓ D1 ▾»),
 * or a solid alert chip that opens the list. The list is a `PickField`, which is typed in to find a value.
 */
export function SplitPick({ value, chosen, offer, offerTitle, missing, options, note, title, label, onPick, className = '', buttonRef }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const show = () => (setText(''), setOpen(true))
  if (open)
    return (
      <span className={`split-field ${className}`}>
        <PickField
          autoFocus
          value={text}
          onChange={setText}
          options={options}
          note={note}
          current={value}
          aria-label={label}
          placeholder="Søk …"
          onPick={(option) => (setOpen(false), onPick(option))}
          onCancel={() => setOpen(false)}
          onBlur={() => setOpen(false)}
        />
      </span>
    )
  if (value)
    return (
      <button ref={buttonRef} className={`quiet-chip ${className}`} title={title} aria-label={`${label}: ${value}`} onClick={show}>
        <span className="ellipsis">{value}</span>
        {chosen && <i className="chosen-dot" title="Valgt av deg" />}
        <ChevronDown size={12} aria-hidden />
      </button>
    )
  if (offer)
    return (
      <span className="split">
        <button title={offerTitle} onClick={() => onPick(offer)}>
          <Check size={12} aria-hidden />
          <span className="ellipsis">{offer}</span>
        </button>
        <button className="split-more" title={title ?? 'Velg en annen'} aria-label={`${label}: velg en annen`} onClick={show}>
          <ChevronDown size={12} aria-hidden />
        </button>
      </span>
    )
  return (
    <button ref={buttonRef} className={`alert-chip ${className}`} title={title} aria-label={label} onClick={show}>
      {missing}
      <ChevronDown size={12} aria-hidden />
    </button>
  )
}
