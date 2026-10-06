import { useState } from 'react'
import { formatFte } from '../../domain/calc'
import type { ISODate } from '../../domain/dates'
import { fmtDate } from './labels'

/** The cell in focus, as the status bar tells it. */
export interface FocusInfo {
  title: string
  date: ISODate
  value: number | undefined
  note: string
  /** The stored planning row the cell belongs to, which can take a note; null on levels, suggested rows and staffing lines. */
  rowId: string | null
}

interface Props {
  focus: FocusInfo | null
  /** The sum of the selection, when it is more than one cell. */
  selectionSum: number | null
  /** What the last action did. */
  notice: string | null
  /** What the stroke or the drag in progress would do; shown in place of the notice while it lasts. */
  progress: string | null
  onSaveNote: (rowId: string, date: ISODate, note: string) => void
}

/** The line under the grid: the cell in focus, its note, and what the last action did. */
export function StatusBar({ focus, selectionSum, notice, progress, onSaveNote }: Props) {
  return (
    <div className="statusbar">
      {focus ? (
        <>
          <span className="status-title">{focus.title}</span>
          <span>{fmtDate(focus.date)}</span>
          <span>{focus.value === undefined ? '–' : `${formatFte(focus.value, 2)}`}</span>
          {selectionSum !== null && <span>Sum markert: {formatFte(selectionSum, 2)}</span>}
          {(progress ?? notice) && <span className="status-notice">{progress ?? notice}</span>}
          {focus.rowId && <NoteEditor key={`${focus.rowId}:${focus.date}`} note={focus.note} onSave={(note) => onSaveNote(focus.rowId!, focus.date, note)} />}
          {!focus.rowId && focus.note && <span>Notat: {focus.note}</span>}
        </>
      ) : notice ? (
        <span className="status-notice">{notice}</span>
      ) : (
        <span className="muted">Klikk en celle for å planlegge. Skriv tall (f.eks. 1,5), Enter for neste rad, dra eller Shift+klikk for å markere flere, Ctrl/Cmd+C/V for kopier og lim inn.</span>
      )}
    </div>
  )
}

/** The note on the cell in focus, saved when the field is left or Enter is pressed. */
function NoteEditor({ note, onSave }: { note: string; onSave: (note: string) => void }) {
  const [value, setValue] = useState(note)
  return (
    <input
      className="note-input"
      placeholder="Notat for cellen"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value !== note && onSave(value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}
