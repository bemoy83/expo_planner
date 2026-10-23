import { useCallback } from 'react'
import { requiredHours, type DemandIndex } from '../../domain/calc'
import type { ISODate } from '../../domain/dates'
import { isSuggestedRow } from '../../domain/plannedRows'
import { spreadOpen } from '../../domain/spread'
import type { AllocationRow } from '../../domain/types'
import { useWorkspace } from '../../store/workspaceStore'
import type { AllocLane } from './gridTypes'
import { laneValue } from './strokes'

/**
 * What a cell of the plan holds and how a number is written to it: on a row, or on a folded level, which shares it out over its rows.
 * Every write is a mutation of the store, so the writes of one event are one undo step.
 */
export function usePlanCells(allocLanes: AllocLane[], windowOf: (row: AllocationRow) => Set<ISODate> | undefined, demandIndex: DemandIndex) {
  const { setAllocationFte, setSuggestedFte } = useWorkspace()
  const getValue = useCallback((lane: number, date: ISODate): number | undefined => laneValue(allocLanes[lane] ?? {}, date), [allocLanes])

  const setRowFte = useCallback(
    (row: AllocationRow, date: ISODate, value: number | null) => (isSuggestedRow(row) ? setSuggestedFte(row, date, value) : setAllocationFte(row.id, date, value)),
    [setSuggestedFte, setAllocationFte],
  )

  const setValue = useCallback(
    (lane: number, date: ISODate, value: number | null) => {
      const { row, node } = allocLanes[lane] ?? {}
      if (row) setRowFte(row, date, value)
      else if (node) {
        // A number typed on a level replaces that day for every row below it, shared out by their required hours over the
        // rows that can be worked on that day: those whose window holds it, and those that have no window at all.
        const open = node.rows.map((r) => {
          const window = windowOf(r)
          return !window?.size || window.has(date)
        })
        const parts = value === null ? [] : spreadOpen(value, node.rows.map((r) => requiredHours(demandIndex, r) ?? 0), open)
        node.rows.forEach((r, i) => {
          const part = parts[i] || null
          if (part !== null || r.fte[date] !== undefined) setRowFte(r, date, part)
        })
      }
    },
    [allocLanes, setRowFte, demandIndex, windowOf],
  )

  return { getValue, setRowFte, setValue }
}
