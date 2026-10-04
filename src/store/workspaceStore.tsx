import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildDemandIndex, type DemandIndex } from '../domain/calc'
import type { ISODate } from '../domain/dates'
import type { AllocationRow, CapacityLine, Settings, Workspace } from '../domain/types'
import { db, deleteAllocation, loadWorkspace, putAllocation, putCapacityLine, putSettings, saveWorkspace } from './db'
import { applyChange, changeWrites, emptyChange, isEmptyChange, recordAllocation, recordCapacity, recordSettings, type Change, type Direction } from './history'

const HISTORY_LIMIT = 200

type SaveState = 'saved' | 'saving' | 'error'

interface WorkspaceStore {
  status: 'loading' | 'empty' | 'ready'
  workspace: Workspace | null
  demandIndex: DemandIndex
  saveState: SaveState
  replaceWorkspace: (workspace: Workspace) => Promise<void>
  setAllocationFte: (rowId: string, date: ISODate, value: number | null) => void
  setAllocationNote: (rowId: string, date: ISODate, note: string) => void
  addAllocation: (row: Omit<AllocationRow, 'id' | 'order' | 'fte' | 'notes' | 'importedHours'>) => AllocationRow
  updateAllocation: (row: AllocationRow) => void
  removeAllocation: (rowId: string) => void
  setCapacityValue: (lineId: string, date: ISODate, field: 'values' | 'hours', value: number | null) => void
  updateSettings: (settings: Settings) => void
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
}

const Context = createContext<WorkspaceStore | null>(null)

const EMPTY_INDEX = buildDemandIndex([])

const withDay = (values: Record<ISODate, number>, date: ISODate, value: number | null) => {
  const next = { ...values }
  if (value === null || value === 0) delete next[date]
  else next[date] = value
  return next
}

/** True when the cell already holds the value, so the edit would change nothing. */
const sameDay = (values: Record<ISODate, number>, date: ISODate, value: number | null) => (values[date] ?? 0) === (value ?? 0)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [status, setStatus] = useState<WorkspaceStore['status']>('loading')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const current = useRef<Workspace | null>(null)
  const pending = useRef(0)
  const undoStack = useRef<Change[]>([])
  const redoStack = useRef<Change[]>([])
  /** Edits made in the same event (a range fill, a paste) collect here and become one undo step. */
  const openStep = useRef<Change | null>(null)
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 })

  useEffect(() => {
    loadWorkspace()
      .then((loaded) => {
        current.current = loaded
        setWorkspace(loaded)
        setStatus(loaded ? 'ready' : 'empty')
      })
      .catch(() => setStatus('empty'))
  }, [])

  const syncHistorySize = () => setHistorySize({ undo: undoStack.current.length + (openStep.current ? 1 : 0), redo: redoStack.current.length })

  const closeStep = useCallback(() => {
    const step = openStep.current
    openStep.current = null
    if (step && !isEmptyChange(step)) {
      undoStack.current.push(step)
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
      redoStack.current = []
    }
    syncHistorySize()
  }, [])

  const clearHistory = useCallback(() => {
    openStep.current = null
    undoStack.current = []
    redoStack.current = []
    syncHistorySize()
  }, [])

  const track = useCallback(
    (persist: () => Promise<unknown>) => {
      pending.current += 1
      setSaveState('saving')
      persist()
        .then(() => {
          pending.current -= 1
          if (pending.current === 0) setSaveState('saved')
        })
        .catch(() => {
          pending.current -= 1
          setSaveState('error')
        })
    },
    [],
  )

  /** Applies a change in memory immediately, notes it for undo, and persists the affected record in the background. */
  const commit = useCallback((next: Workspace, persist: () => Promise<unknown>, note: (step: Change) => void) => {
    if (!openStep.current) {
      openStep.current = emptyChange()
      setTimeout(closeStep, 0)
    }
    note(openStep.current)
    current.current = next
    setWorkspace(next)
    track(persist)
  }, [closeStep, track])

  const stepThroughHistory = useCallback(
    (direction: Direction) => {
      closeStep()
      const from = direction === 'undo' ? undoStack.current : redoStack.current
      const to = direction === 'undo' ? redoStack.current : undoStack.current
      const step = from.pop()
      const ws = current.current
      if (!step || !ws) return
      to.push(step)
      const next = applyChange(ws, step, direction)
      current.current = next
      setWorkspace(next)
      syncHistorySize()
      const writes = changeWrites(step, direction)
      track(() =>
        db.transaction('rw', [db.allocations, db.capacity, db.meta], async () => {
          await db.allocations.bulkPut(writes.putAllocations)
          await db.allocations.bulkDelete(writes.deleteAllocations)
          await db.capacity.bulkPut(writes.putCapacity)
          if (writes.settings) await putSettings(writes.settings)
        }),
      )
    },
    [closeStep, track],
  )
  const undo = useCallback(() => stepThroughHistory('undo'), [stepThroughHistory])
  const redo = useCallback(() => stepThroughHistory('redo'), [stepThroughHistory])


  const replaceWorkspace = useCallback(async (next: Workspace) => {
    setSaveState('saving')
    await saveWorkspace(next)
    current.current = next
    setWorkspace(next)
    clearHistory()
    setStatus('ready')
    setSaveState('saved')
  }, [clearHistory])

  const updateRow = useCallback(
    (rowId: string, change: (row: AllocationRow) => AllocationRow) => {
      const ws = current.current
      const row = ws?.allocations.find((r) => r.id === rowId)
      if (!ws || !row) return
      const updated = change(row)
      if (updated === row) return
      commit({ ...ws, allocations: ws.allocations.map((r) => (r.id === rowId ? updated : r)) }, () => putAllocation(updated), (step) => recordAllocation(step, rowId, row, updated))
    },
    [commit],
  )

  const setAllocationFte = useCallback(
    (rowId: string, date: ISODate, value: number | null) => updateRow(rowId, (row) => (sameDay(row.fte, date, value) ? row : { ...row, fte: withDay(row.fte, date, value) })),
    [updateRow],
  )

  const setAllocationNote = useCallback(
    (rowId: string, date: ISODate, note: string) =>
      updateRow(rowId, (row) => {
        if ((row.notes[date] ?? '') === note.trim()) return row
        const notes = { ...row.notes }
        if (note.trim()) notes[date] = note.trim()
        else delete notes[date]
        return { ...row, notes }
      }),
    [updateRow],
  )

  const addAllocation = useCallback<WorkspaceStore['addAllocation']>(
    (fields) => {
      const ws = current.current!
      const row: AllocationRow = {
        ...fields,
        id: `row-${crypto.randomUUID()}`,
        order: Math.max(-1, ...ws.allocations.map((r) => r.order)) + 1,
        importedHours: null,
        fte: {},
        notes: {},
      }
      commit({ ...ws, allocations: [...ws.allocations, row] }, () => putAllocation(row), (step) => recordAllocation(step, row.id, null, row))
      return row
    },
    [commit],
  )

  const updateAllocation = useCallback((row: AllocationRow) => updateRow(row.id, () => row), [updateRow])

  const removeAllocation = useCallback(
    (rowId: string) => {
      const ws = current.current
      const row = ws?.allocations.find((r) => r.id === rowId)
      if (!ws || !row) return
      commit({ ...ws, allocations: ws.allocations.filter((r) => r.id !== rowId) }, () => deleteAllocation(rowId), (step) => recordAllocation(step, rowId, row, null))
    },
    [commit],
  )

  const setCapacityValue = useCallback(
    (lineId: string, date: ISODate, field: 'values' | 'hours', value: number | null) => {
      const ws = current.current
      const line = ws?.capacity.find((l) => l.id === lineId)
      if (!ws || !line || sameDay(line[field] ?? {}, date, value)) return
      const updated: CapacityLine = { ...line, [field]: withDay(line[field] ?? {}, date, value) }
      commit({ ...ws, capacity: ws.capacity.map((l) => (l.id === lineId ? updated : l)) }, () => putCapacityLine(updated), (step) => recordCapacity(step, line, updated))
    },
    [commit],
  )

  const updateSettings = useCallback(
    (settings: Settings) => {
      const ws = current.current
      if (ws) commit({ ...ws, settings }, () => putSettings(settings), (step) => recordSettings(step, ws.settings, settings))
    },
    [commit],
  )

  const demand = workspace?.demand
  const demandIndex = useMemo(() => (demand ? buildDemandIndex(demand) : EMPTY_INDEX), [demand])

  const value: WorkspaceStore = {
    status,
    workspace,
    demandIndex,
    saveState,
    replaceWorkspace,
    setAllocationFte,
    setAllocationNote,
    addAllocation,
    updateAllocation,
    removeAllocation,
    setCapacityValue,
    updateSettings,
    canUndo: historySize.undo > 0,
    canRedo: historySize.redo > 0,
    undo,
    redo,
  }
  return <Context.Provider value={value}>{children}</Context.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useWorkspace = (): WorkspaceStore => {
  const store = useContext(Context)
  if (!store) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return store
}
