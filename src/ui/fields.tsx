import { useState } from 'react'

/** A number that is edited in place and saved when the field is left or Enter is pressed. Empty means 0. */
export function NumberField({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const shown = value ? String(value).replace('.', ',') : ''
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className="inline num"
      inputMode="decimal"
      value={draft ?? shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === null) return
        const n = draft.trim() === '' ? 0 : Number(draft.replace(',', '.'))
        if (Number.isFinite(n) && n !== value) onCommit(n)
        setDraft(null)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

interface TextFieldProps {
  value: string
  onCommit: (value: string) => void
  list?: string
  className?: string
  placeholder?: string
  ariaLabel?: string
}

/** Text edited in place, saved on blur or Enter. */
export function TextField({ value, onCommit, list, className, placeholder, ariaLabel }: TextFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className={className ? `inline ${className}` : 'inline'}
      list={list}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft.trim() !== value) onCommit(draft.trim())
        setDraft(null)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}
