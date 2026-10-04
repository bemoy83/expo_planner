import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildDemandIndex, type DemandIndex } from '../domain/calc'
import type { ISODate } from '../domain/dates'
import type { AllocationRow, CapacityLine, Settings, Workspace } from '../domain/types'
import { deleteAllocation, loadWorkspace, putAllocation, putCapacityLine, putSettings, saveWorkspace } from './db'

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
}

const Context = createContext<WorkspaceStore | null>(null)

const EMPTY_INDEX = buildDemandIndex([])

const withDay = (values: Record<ISODate, number>, date: ISODate, value: number | null) => {
  const next = { ...values }
  if (value === null || value === 0) delete next[date]
  else next[date] = value
  return next
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [status, setStatus] = useState<WorkspaceStore['status']>('loading')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const current = useRef<Workspace | null>(null)
  const pending = useRef(0)

  useEffect(() => {
    loadWorkspace()
      .then((loaded) => {
        current.current = loaded
        setWorkspace(loaded)
        setStatus(loaded ? 'ready' : 'empty')
      })
      .catch(() => setStatus('empty'))
  }, [])

  /** Applies a change in memory immediately and persists the affected record in the background. */
  const commit = useCallback((next: Workspace, persist: () => Promise<unknown>) => {
    current.current = next
    setWorkspace(next)
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
  }, [])

  const replaceWorkspace = useCallback(async (next: Workspace) => {
    setSaveState('saving')
    await saveWorkspace(next)
    current.current = next
    setWorkspace(next)
    setStatus('ready')
    setSaveState('saved')
  }, [])

  const updateRow = useCallback(
    (rowId: string, change: (row: AllocationRow) => AllocationRow) => {
      const ws = current.current
      const row = ws?.allocations.find((r) => r.id === rowId)
      if (!ws || !row) return
      const updated = change(row)
      commit({ ...ws, allocations: ws.allocations.map((r) => (r.id === rowId ? updated : r)) }, () => putAllocation(updated))
    },
    [commit],
  )

  const setAllocationFte = useCallback(
    (rowId: string, date: ISODate, value: number | null) => updateRow(rowId, (row) => ({ ...row, fte: withDay(row.fte, date, value) })),
    [updateRow],
  )

  const setAllocationNote = useCallback(
    (rowId: string, date: ISODate, note: string) =>
      updateRow(rowId, (row) => {
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
      commit({ ...ws, allocations: [...ws.allocations, row] }, () => putAllocation(row))
      return row
    },
    [commit],
  )

  const updateAllocation = useCallback((row: AllocationRow) => updateRow(row.id, () => row), [updateRow])

  const removeAllocation = useCallback(
    (rowId: string) => {
      const ws = current.current
      if (!ws) return
      commit({ ...ws, allocations: ws.allocations.filter((r) => r.id !== rowId) }, () => deleteAllocation(rowId))
    },
    [commit],
  )

  const setCapacityValue = useCallback(
    (lineId: string, date: ISODate, field: 'values' | 'hours', value: number | null) => {
      const ws = current.current
      const line = ws?.capacity.find((l) => l.id === lineId)
      if (!ws || !line) return
      const updated: CapacityLine = { ...line, [field]: withDay(line[field] ?? {}, date, value) }
      commit({ ...ws, capacity: ws.capacity.map((l) => (l.id === lineId ? updated : l)) }, () => putCapacityLine(updated))
    },
    [commit],
  )

  const updateSettings = useCallback(
    (settings: Settings) => {
      const ws = current.current
      if (ws) commit({ ...ws, settings }, () => putSettings(settings))
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
  }
  return <Context.Provider value={value}>{children}</Context.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useWorkspace = (): WorkspaceStore => {
  const store = useContext(Context)
  if (!store) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return store
}
