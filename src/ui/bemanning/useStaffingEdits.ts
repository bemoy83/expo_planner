import type { Dispatch, SetStateAction } from 'react'
import { dayText, weekdayName, type ISODate } from '../../domain/dates'
import { removeUnresolved } from '../../domain/staffing/balance'
import { clearDays, copyDays, moveDay, onlyOffDays, paintBlock, paintDays, paintGaps, pasteDays, type Clipboard, type DayCell as Day } from '../../domain/staffing/edit'
import type { CompetenceStyle, Person, Work, Workspace } from '../../domain/types'
import type { Toast } from '../Toasts'
import type { DayGrid } from './dayGrid'
import type { Rect } from './tools'
import { count } from '../dom'

interface Options {
  ws: Workspace
  updateStaffing: (change: (w: Workspace) => Workspace) => void
  undo: () => void
  toast: (text: string, action?: Toast['action']) => void
  dates: ISODate[]
  grid: DayGrid
  persons: Person[]
  styles: Map<string, CompetenceStyle>
  /** The competence in focus and what the brush paints with it. */
  brush: string | null
  brushWork: Work | null
  selection: Rect | null
  clip: Clipboard | null
  setClip: Dispatch<SetStateAction<Clipboard | null>>
  /** The day under the pointer, where a paste lands. */
  hover: { row: number; col: number } | null
}

/**
 * What the tools of Bemanning write to the people's days: paint, clear, a day's blocks moved or copied, and the selection copied and
 * pasted. Each is one undo step; what cannot be done is told on a toast, and nothing is written.
 */
export function useStaffingEdits({ ws, updateStaffing, undo, toast, dates, grid, persons, styles, brush, brushWork, selection, clip, setClip, hover }: Options) {
  const { blocksOn, strokeCells, pasteOnto } = grid
  const nameOf = (personId: string) => persons.find((p) => p.id === personId)?.name ?? ''
  const labelOf = (competence: string) => styles.get(competence)?.label ?? competence
  const dayName = weekdayName

  /** Why a day cannot be painted, for the one day a click hit. */
  const blockText = (cell: Day, competence: string): string => {
    const why = paintBlock(ws, cell, competence, true)
    if (why === 'ineligible') return `${nameOf(cell.personId)} har ikke ${labelOf(competence)}.`
    if (!why) return `${nameOf(cell.personId)} har ingen ledig tid ${dayName(cell.date)}.`
    const away = (ws.unavailability ?? []).some((u) => u.personId === cell.personId && u.date === cell.date)
    return `${nameOf(cell.personId)} er ikke tilgjengelig ${dayName(cell.date)}${away ? ' (borte)' : ''}.`
  }

  /** Paints the free time of the days (R6). A paint never replaces what is there. */
  const paint = (cells: Day[], competence: string, half: boolean) => {
    const span = half ? 'half' : 'full'
    if (cells.every((cell) => !paintGaps(ws, cell, competence, span, onlyOffDays(cells)).length)) {
      if (cells.length === 1) toast(blockText(cells[0], competence))
      return
    }
    updateStaffing((w) => ({ ...w, assignments: paintDays(w, cells, competence === brush && brushWork ? brushWork : competence, span) }))
  }
  const clear = (cells: Day[]) => updateStaffing((w) => ({ ...w, assignments: clearDays(w.assignments ?? [], cells) }))
  const removeOpen = () => updateStaffing((w) => ({ ...w, assignments: removeUnresolved(w, dates) }))

  /** R38: moves the blocks of a day to another day or person, or copies them there. */
  const moveBlocks = (from: Day, to: Day, copy: boolean) => {
    const move = { from, to, blockIds: blocksOn(from).map((a) => a.id), copy }
    const result = moveDay(ws, move)
    if (result === 'ineligible') return toast(`${nameOf(to.personId)} har ikke kompetansen for arbeidet.`)
    if (result === 'away') return toast(`${nameOf(to.personId)} er borte ${dayName(to.date)}.`)
    if (result === 'overlap') return toast(`${nameOf(to.personId)} har ingen ledig tid da ${dayName(to.date)}.`)
    updateStaffing((w) => {
      const moved = moveDay(w, move)
      return typeof moved === 'string' ? w : { ...w, assignments: moved }
    })
  }
  const selectionCells = (): Day[] => (selection ? strokeCells({ mode: 'select', half: false, ...selection }) : [])
  const copySelection = () => {
    const copied = copyDays(ws, selectionCells())
    if (!copied) return toast(selection ? 'Ingen blokker å kopiere i det som er valgt.' : 'Velg dager med «Velg» for å kopiere dem.')
    setClip(copied)
  }
  /** R34: pastes at the day under the pointer, else at the first selected day. */
  const pasteClip = () => {
    const at = hover ?? (selection ? { row: Math.min(selection.row0, selection.row1), col: Math.min(selection.col0, selection.col1) } : null)
    if (!clip || !at) return
    const anchor = dates[at.col]
    const onto = pasteOnto(clip, at.row)
    const lastDate = dates[dates.length - 1]
    const { pasted, skipped } = pasteDays(ws, clip, anchor, lastDate, onto)
    const skippedText = skipped ? ` · ${skipped} hoppet over` : ''
    if (!pasted) return toast(`Ingenting ble limt inn fra ${dayText(anchor)}: dagene er opptatt, eller personen er borte eller har ikke kompetansen.`)
    updateStaffing((w) => ({ ...w, assignments: pasteDays(w, clip, anchor, lastDate, onto).assignments }))
    toast(`Limte inn ${count(pasted, 'blokk', 'blokker')} fra ${dayText(anchor)}${skippedText}`, { label: 'Angre', run: undo })
  }

  return { nameOf, labelOf, dayName, paint, clear, removeOpen, moveBlocks, selectionCells, copySelection, pasteClip }
}
