import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { DemandIndex } from '../../domain/calc'
import type { ISODate } from '../../domain/dates'
import { decimalText } from '../../domain/numbers'
import { isSuggestedRow } from '../../domain/plannedRows'
import type { AllocationRow, Settings } from '../../domain/types'
import type { AllocLane, CellEdit, GridActions } from './gridTypes'
import { rowTitle } from './labels'
import { LEFT_W, parseCellInput, ROW_H } from './layout'
import { followLanes, rangeOf, type Cell, type LaneKey, type Press, type Selection, type Tool } from './selection'
import type { FocusInfo } from './StatusBar'
import { copyText, pasteCells, spanEndAt } from './strokes'
import { useGridDrag } from './useGridDrag'
import { usePlanCells } from './usePlanCells'
import { usePlanStrokes } from './usePlanStrokes'
import { count } from '../dom'

/** What a cell menu is opened on: where, and the row and day of its cell. */
export interface CellMenuAt {
  x: number
  y: number
  rowId: string
  col: number
}

interface Options {
  scrollRef: RefObject<HTMLDivElement | null>
  dates: ISODate[]
  /** The selection is the Kalender's, which lets go of it when the lines or the period change under it. */
  selection: Selection | null
  setSelection: Dispatch<SetStateAction<Selection | null>>
  allocLanes: AllocLane[]
  laneOfRow: Map<string, number>
  laneKeys: LaneKey[]
  windowOf: (row: AllocationRow) => Set<ISODate> | undefined
  demandIndex: DemandIndex
  settings: Settings
  /** The tool chosen in the planning bar. */
  tool: Tool
  colW: number
  /** The day at the left edge of what is seen. */
  firstVisibleCol: number
  /** Where each line starts, see `lineTops`, and how much of the rows is covered above a line by what is pinned over them. */
  rowTops: number[]
  topHeight: number
  coveredAbove: (index: number) => number
  /** The cell menu is open: Escape is its own then. */
  menuOpen: boolean
  setCellMenu: (menu: CellMenuAt | null) => void
}

/**
 * The selection of the plan and everything that works on it: clicks and drags across the cells, the keys, a number typed in a cell,
 * copy and paste, and the tools that are drawn across the days (`usePlanStrokes`). It hands the lines of the grid their handlers
 * and what each line is told of the selection, as plain values (`editOf`).
 */
export function usePlanGrid({ scrollRef, dates, selection, setSelection, allocLanes, laneOfRow, laneKeys, windowOf, demandIndex, settings, tool, colW, firstVisibleCol, rowTops, topHeight, coveredAbove, menuOpen, setCellMenu }: Options) {
  const [notice, setNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)
  // The cell to scroll to, and whether the grid takes the keys, once it is selected.
  const [reveal, setReveal] = useState<{ cell: Cell; takeKeys: boolean } | null>(null)
  const dragging = useRef(false)
  // The press that has selected nothing yet: a click once the mouse is let go, a range or a stroke once it reaches another cell, and on an end of a span a pull once it moves sideways.
  const press = useRef<Press | null>(null)
  // What was selected when the mouse went down: a stroke gives it back when it ends.
  const before = useRef<Selection | null>(null)
  const selectionRef = useRef<Selection | null>(null)

  const { getValue, setRowFte, setValue } = usePlanCells(allocLanes, windowOf, demandIndex)
  const strokes = usePlanStrokes({ dates, allocLanes, demandIndex, settings, windowOf, getValue, setValue, setRowFte, selection, selectionRef, setNotice })
  const { stroke, setStroke, strokeRef, pull, setPull, pullRef, pullView, startPull, commitPull, drawDemand, eraseDrawn, ghost } = strokes

  const [seenLaneKeys, setSeenLaneKeys] = useState(laneKeys)
  if (seenLaneKeys !== laneKeys) {
    setSeenLaneKeys(laneKeys)
    const followed = selection && followLanes(selection, seenLaneKeys, laneKeys)
    if (followed !== selection) {
      setSelection(followed)
      // The grid does not take the keys here: the list may have changed because of something typed in a field.
      setReveal(followed && { cell: followed.focus, takeKeys: false })
    }
  }

  const ensureVisible = useCallback(
    (cell: Cell) => {
      const el = scrollRef.current
      if (!el) return
      const x = cell.col * colW
      if (x < el.scrollLeft) el.scrollLeft = x
      else if (x + colW > el.scrollLeft + el.clientWidth - LEFT_W) el.scrollLeft = x + colW - (el.clientWidth - LEFT_W)
      const index = allocLanes[cell.lane]?.index ?? 0
      const y = rowTops[index] ?? 0
      const bottom = rowTops[index + 1] ?? y + ROW_H
      const pinned = coveredAbove(index)
      if (topHeight + y < el.scrollTop + pinned) el.scrollTop = topHeight + y - pinned
      else if (topHeight + bottom > el.scrollTop + el.clientHeight) el.scrollTop = topHeight + bottom - el.clientHeight
    },
    [scrollRef, colW, allocLanes, rowTops, topHeight, coveredAbove],
  )

  // Select the first visible day of a row that was just added or edited, once it is among the lines.
  const pendingLane = pendingFocus ? laneOfRow.get(pendingFocus) : undefined
  if (pendingLane !== undefined) {
    const cell = { lane: pendingLane, col: firstVisibleCol }
    setPendingFocus(null)
    setSelection({ anchor: cell, focus: cell })
    setReveal({ cell, takeKeys: true })
  }
  useEffect(() => {
    if (!reveal) return
    ensureVisible(reveal.cell)
    if (reveal.takeKeys) scrollRef.current?.focus({ preventScroll: true })
  }, [reveal]) // eslint-disable-line react-hooks/exhaustive-deps

  const fillSelection = useCallback(
    (value: number | null) => {
      if (!selection) return
      const { lane0, lane1, col0, col1 } = rangeOf(selection)
      for (let lane = lane0; lane <= lane1; lane++) for (let col = col0; col <= col1; col++) setValue(lane, dates[col], value)
    },
    [selection, setValue, dates],
  )

  const move = useCallback(
    (dLane: number, dCol: number, extend = false) => {
      setSelection((sel) => {
        if (!sel) return sel
        const focus = {
          lane: Math.min(allocLanes.length - 1, Math.max(0, sel.focus.lane + dLane)),
          col: Math.min(dates.length - 1, Math.max(0, sel.focus.col + dCol)),
        }
        ensureVisible(focus)
        return { anchor: extend ? sel.anchor : focus, focus }
      })
    },
    [dates.length, ensureVisible], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Escape leaves the field without writing what was typed, though the field loses the focus as it does when it is left.
  const draftCancelled = useRef(false)
  const commitDraft = useCallback(
    (then?: () => void) => {
      if (draft === null || !selection || draftCancelled.current) return
      const value = parseCellInput(draft)
      setDraft(null)
      if (value !== undefined) fillSelection(value)
      then?.()
      scrollRef.current?.focus({ preventScroll: true })
    },
    [scrollRef, draft, selection, fillSelection],
  )

  const select = (cell: Cell, extend: boolean) => {
    if (draft !== null) commitDraft()
    setNotice(null)
    setSelection((sel) => (extend && sel ? { ...sel, focus: cell } : { anchor: cell, focus: cell }))
    scrollRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    selectionRef.current = selection
  }, [selection])
  /** A press selects its cell only once it is a click, or, on an end of a span, when it is dragged up or down and so is no pull. */
  const pressSelect = ({ lane, col }: Cell, extend = false) => {
    const cell = { lane, col }
    select(cell, extend)
    // A stroke that ends in the same event reads the selection from here.
    if (!extend) selectionRef.current = { anchor: cell, focus: cell }
  }

  useGridDrag({ scrollRef, dragging, strokeRef, press, pullRef, before, setPull, setSelection, setStroke, drawDemand, eraseDrawn, startPull, commitPull, pressSelect, colW, dayCount: dates.length })

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (draft !== null || !selection) return
    if (e.target !== scrollRef.current) return
    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    if (arrows[e.key]) {
      e.preventDefault()
      move(...arrows[e.key], e.shiftKey)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      move(0, e.shiftKey ? -1 : 1)
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      const current = getValue(selection.focus.lane, dates[selection.focus.col])
      setDraft(current === undefined ? '' : decimalText(current))
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      fillSelection(null)
    } else if (e.key === 'Escape') {
      // Escape first puts the pencil or the eraser away, see the tool keys.
      if (tool === 'select' && !menuOpen) setSelection(null)
    } else if (/^[0-9,.-]$/.test(e.key) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      setDraft(e.key)
    }
  }

  const onCopy = (e: React.ClipboardEvent) => {
    if (!selection || draft !== null) return
    e.clipboardData.setData('text/plain', copyText(selection, dates, getValue))
    e.preventDefault()
  }

  const onPaste = (e: React.ClipboardEvent) => {
    if (!selection || draft !== null) return
    const textData = e.clipboardData.getData('text/plain')
    if (!textData) return
    e.preventDefault()
    for (const cell of pasteCells(textData, selection, dates, allocLanes.length)) setValue(cell.lane, cell.date, cell.value)
  }

  const selectionRange = selection ? rangeOf(selection) : null

  /** What the cells and the labels of the lines ask of the selection. The rest of `GridActions` is the Kalender's. */
  const cellActions: Pick<GridActions, 'cellDown' | 'cellEnter' | 'cellMenu' | 'selectRow' | 'editCell' | 'setDraft' | 'commitDraft' | 'draftKey'> = {
    cellDown: (lane, col, e) => {
      e.preventDefault()
      const drags = e.button === 0 && !(e.target instanceof HTMLInputElement)
      // Alt clears for this one stroke. With «Velg», Shift extends the selection, on a click as in Excel and on along a drag.
      const erases = drags && e.altKey
      const extends_ = e.shiftKey && !erases && (!drags || tool === 'select')
      before.current = selection
      // An end of a span is also its grip: dragged sideways it pulls that end, with any tool. Shift steers the pull
      // from the press or from later on, and Alt once it has started; let go without a drag, or dragged up or down,
      // a press with Shift is what it is on any cell. Alt at the press is the eraser, here as anywhere.
      const span = drags && !erases && allocLanes[lane] ? spanEndAt(allocLanes[lane], dates, col) : null
      const started = extends_ ? null : erases ? 'eraser' : tool === 'select' ? null : tool
      // A plain press with «Velg» selects nothing yet either: let go, it is a click on the cell, and dragged on to another cell a range from it.
      const waits = !!span || (drags && tool === 'select' && !e.shiftKey && !erases)
      press.current = waits ? { lane, col, x: e.clientX, y: e.clientY, stroke: started, extend: extends_, span: span ? { ...span, end: col === span.from && span.from !== span.to ? 'start' : 'end' } : undefined } : null
      if (waits) {
        if (draft !== null) commitDraft()
        setNotice(null)
        scrollRef.current?.focus({ preventScroll: true })
      } else select({ lane, col }, extends_)
      // What a press on an end of a span is shows once the mouse moves or is let go: until then no stroke is drawn from it.
      if (!drags || span) {
        strokeRef.current = null
        setStroke(null)
        return
      }
      dragging.current = true
      strokeRef.current = started
      setStroke(started)
    },
    cellEnter: (lane, col) => {
      if (dragging.current && press.current) {
        const { lane: fromLane, col: fromCol } = press.current
        if (fromLane === lane && fromCol === col) return
        press.current = null
        setSelection({ anchor: { lane: fromLane, col: fromCol }, focus: { lane, col } })
      } else if (dragging.current) setSelection((sel) => sel && { ...sel, focus: { lane, col } })
    },
    cellMenu: (lane, col, e) => {
      const row = allocLanes[lane]?.row
      if (!row) return
      e.preventDefault()
      // The press that asked for the menu is no drag.
      dragging.current = false
      strokeRef.current = null
      press.current = null
      setStroke(null)
      select({ lane, col }, false)
      setCellMenu({ x: e.clientX, y: e.clientY, rowId: row.id, col })
    },
    selectRow: (lane) => select({ lane, col: selection ? selection.focus.col : firstVisibleCol }, false),
    editCell: (value) => setDraft(value === undefined ? '' : decimalText(value)),
    setDraft,
    commitDraft: () => commitDraft(),
    draftKey: (e) => {
      // A number typed over several cells fills them all, and they stay selected, as in Excel; on a single cell Enter and Tab move on.
      const several = !!selectionRange && (selectionRange.lane0 !== selectionRange.lane1 || selectionRange.col0 !== selectionRange.col1)
      if (e.key === 'Enter') {
        e.preventDefault()
        commitDraft(several ? undefined : () => move(e.shiftKey ? -1 : 1, 0))
      } else if (e.key === 'Tab') {
        e.preventDefault()
        commitDraft(several ? undefined : () => move(0, e.shiftKey ? -1 : 1))
      } else if (e.key === 'Escape') {
        draftCancelled.current = true
        setDraft(null)
        scrollRef.current?.focus({ preventScroll: true })
        draftCancelled.current = false
      }
    },
  }

  // What one line of cells is told about the selection: plain values, so only the lines it touches are drawn again.
  // While a stroke is drawn or an end of a span is pulled, the cells are not marked as selected: the preview and its pill say what is happening.
  const quiet = !!stroke || !!pull
  const editOf = (lane: number): CellEdit => {
    const selected = !quiet && !!selectionRange && lane >= selectionRange.lane0 && lane <= selectionRange.lane1
    const focused = !quiet && selection?.focus.lane === lane
    return {
      selFrom: selected ? selectionRange.col0 : -1,
      selTo: selected ? selectionRange.col1 : -1,
      focusCol: focused ? selection.focus.col : -1,
      draft: focused ? draft : null,
      ghost: ghost.get(lane),
      livePlanned: pull?.lane === lane ? pullView?.planned : undefined,
    }
  }

  // ---- selection details for the status bar -------------------------------------------------
  const focusInfo = ((): FocusInfo | null => {
    if (!selection) return null
    const date = dates[selection.focus.col]
    const { row: r, node } = allocLanes[selection.focus.lane] ?? {}
    if (node) return { title: `${node.label} · fordeles på ${count(node.rows.length, 'rad', 'rader')}`, date, value: node.daily.get(date), note: '', rowId: null }
    if (!r) return null
    return { title: rowTitle(r), date, value: r.fte[date], note: r.notes[date] ?? '', rowId: isSuggestedRow(r) ? null : r.id }
  })()
  const selectionSum = (() => {
    if (!selection) return null
    const { lane0, lane1, col0, col1 } = rangeOf(selection)
    if (lane0 === lane1 && col0 === col1) return null
    let sum = 0
    for (let lane = lane0; lane <= lane1; lane++) for (let col = col0; col <= col1; col++) sum += getValue(lane, dates[col]) ?? 0
    return sum
  })()

  return {
    ...strokes,
    notice, setNotice, setPendingFocus, getValue, setRowFte,
    onKeyDown, onCopy, onPaste, cellActions, editOf, focusInfo, selectionSum,
  }
}
