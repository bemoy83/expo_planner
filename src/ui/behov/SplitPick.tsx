import { useState, type ReactNode, type Ref } from 'react'
import { ChevronDown } from 'lucide-react'
import { PickField } from '../fields'

interface Props {
  /** What the cell holds once it is resolved, as quiet text that opens the list on a click. */
  value?: string
  /** The value was picked by the planner, not read: a dot says so. */
  chosen?: boolean
  /** The value offered where there is none: it is first in the list, and marked, so that Enter takes it. */
  offer?: string
  /** Why it is offered. */
  offerTitle?: string
  /** What the button says where there is neither: «Velg hall». */
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
  /** A list to pick from where nothing is missing, as «Annen» on a card of «Avklar»: no mark of attention. */
  plain?: boolean
}

/**
 * A value that is resolved in its cell: quiet text once it is there, else the button of what needs the planner (`NeedButton`)
 * with the offer and a «?», or what is missing. A click always opens the list, a `PickField` to type in, with the offer first.
 */
export function SplitPick({ value, chosen, offer, offerTitle, missing, options, note, title, label, onPick, className = '', buttonRef, plain }: Props) {
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
          options={offer ? [offer, ...options.filter((option) => option !== offer)] : options}
          marked={offer}
          note={(option) => (option === offer ? 'forslag' : note?.(option))}
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
  if (plain)
    return (
      <button ref={buttonRef} className={`plain-chip ${className}`} title={title} aria-label={label} onClick={show}>
        {missing}
        <ChevronDown size={12} aria-hidden />
      </button>
    )
  return (
    <NeedButton
      buttonRef={buttonRef}
      className={className}
      offer={offer}
      missing={missing}
      label={label}
      title={offer ? `Forslag: ${offerTitle ?? offer}. Klikk og Enter for å bruke det.` : title}
      onClick={show}
    />
  )
}

interface NeedProps {
  /** The value offered: the button shows it with a «?». */
  offer?: string
  /** What it says without an offer: «Velg hall», «uten sats». */
  missing: string
  label?: string
  title?: string
  onClick: () => void
  className?: string
  buttonRef?: Ref<HTMLButtonElement>
  /** It opens a list: a caret says so. Without, it goes somewhere else to resolve it, as «uten sats» to KPI. */
  list?: boolean
}

/** The one button of what needs the planner on Behov: raised, with a dot of attention, the offer with a «?» or what is missing. */
export function NeedButton({ offer, missing, label, title, onClick, className = '', buttonRef, list = true }: NeedProps) {
  return (
    <button ref={buttonRef} className={`need-button ${className}`} title={title} aria-label={label && `${label}: ${offer ? `forslag ${offer}` : missing}`} onClick={onClick}>
      <span className="ellipsis">{offer ?? missing}</span>
      {offer && <span className="need-mark">?</span>}
      {list && <ChevronDown size={12} aria-hidden />}
    </button>
  )
}
