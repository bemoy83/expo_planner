import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildDemandIndex, type DemandIndex } from '../domain/calc'
import type { ISODate } from '../domain/dates'
import { type AllocationRow, type CapacityLine, type DemandLine, type KpiConfig, type LineOverride, type Settings, type VenueBooking, type VismaImport, type VismaRow, type Workspace } from '../domain/types'
import { diffVenue, exportWindow, mergeVenue, VENYOU_ID_PREFIX, withHidden, type VenueDiff } from '../domain/venueImport'
import { harvestOverrides, isVismaLine, vismaDemandLines } from '../domain/visma'
import { db, deleteAllocation, loadWorkspace, putAllocation, putCapacityLine, putSettings, putHiddenVenue, saveWorkspace, writeDemand, writeVenue, type DemandWrite } from './db'
import { applyChange, changeWrites, emptyChange, isEmptyChange, recordAllocation, recordCapacity, recordHiddenVenue, recordLedger, recordSettings, recordVenue, type Change, type Direction } from './history'

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
  /** Takes in a Venyou export: hall bookings in the export's period are replaced, the rest are kept. */
  importVenue: (bookings: VenueBooking[], fileName: string) => VenueDiff & { from: string; to: string }
  /** Shows or hides hall bookings in the Kalender; keys come from `venueKey`. */
  setVenueHidden: (keys: string[], hidden: boolean) => void
  /** Replaces the KPI setup and recalculates all Visma lines. */
  setKpi: (kpi: KpiConfig) => void
  /** Takes in a Visma export; each project in it replaces that project's earlier Visma lines. Returns the project numbers. */
  importVisma: (rows: VismaRow[], fileName: string) => string[]
  /** Changes the planner's decisions for one Visma line (Effekt, in plan, comment, work type). */
  setLineOverride: (projectNo: string, key: string, patch: LineOverride) => void
  /** Forgets the decisions made for a Visma line, typically one that has left the export. */
  removeLineOverride: (projectNo: string, key: string) => void
  /** Adds or changes a ledger line that does not come from Visma. */
  saveDemandLine: (line: Omit<DemandLine, 'id'> & { id?: string }) => void
  removeDemandLine: (id: string) => void
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
        db.transaction('rw', [db.allocations, db.capacity, db.meta, db.demand, db.visma], async () => {
          await db.allocations.bulkPut(writes.putAllocations)
          await db.allocations.bulkDelete(writes.deleteAllocations)
          await db.capacity.bulkPut(writes.putCapacity)
          if (writes.settings) await putSettings(writes.settings)
          await db.demand.bulkDelete(writes.deleteDemand)
          await db.demand.bulkPut(writes.putDemand)
          await db.visma.bulkDelete(writes.deleteVisma)
          await db.visma.bulkPut(writes.putVisma)
          if (writes.overrides) await db.meta.put({ key: 'overrides', value: writes.overrides })
          if (writes.kpi === null) await db.meta.delete('kpi')
          else if (writes.kpi) await db.meta.put({ key: 'kpi', value: writes.kpi })
        })
          .then(() => (writes.venue ? writeVenue(writes.venue.bookings, writes.venue.info) : undefined))
          .then(() => (writes.hiddenVenue ? putHiddenVenue(writes.hiddenVenue) : undefined)),
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

  /** Applies a ledger change in memory, notes it for undo and writes it to storage. */
  const commitDemand = useCallback(
    (next: Workspace, write: DemandWrite) => {
      const before = current.current!
      commit(next, () => writeDemand(write), (step) => recordLedger(step, before, next))
    },
    [commit],
  )

  /** Recalculates the Visma lines of the given projects and swaps them into the ledger. */
  const withVismaLines = (ws: Workspace, projectNos: string[], kpi: KpiConfig, overrides: Record<string, LineOverride>, visma: VismaImport[]) => {
    const affected = new Set(projectNos)
    const removed = ws.demand.filter((line) => affected.has(line.projectNo) && isVismaLine(line))
    const added = visma.filter((v) => affected.has(v.projectNo)).flatMap((v) => vismaDemandLines(v, kpi, overrides))
    const demand = [...ws.demand.filter((line) => !(affected.has(line.projectNo) && isVismaLine(line))), ...added]
    return { demand, write: { deleteIds: removed.map((line) => line.id), putLines: added } }
  }

  const importVenue = useCallback<WorkspaceStore['importVenue']>(
    (bookings, fileName) => {
      const ws = current.current
      const window = exportWindow(fileName, bookings)
      if (!ws || !window) throw new Error('Fant ingen datoer i Venyou-filen.')
      const importedAt = new Date().toISOString()
      const incoming = bookings.map((booking, index) => ({ ...booking, id: `${VENYOU_ID_PREFIX}${importedAt}-${index}` }))
      const diff = diffVenue(ws.venue, incoming, window)
      const next: Workspace = { ...ws, venue: mergeVenue(ws.venue, incoming, window), venueImport: { fileName, importedAt, ...window } }
      commit(next, () => writeVenue(next.venue, next.venueImport), (step) => recordVenue(step, ws, next))
      return { ...diff, ...window }
    },
    [commit],
  )

  const setVenueHidden = useCallback(
    (keys: string[], hidden: boolean) => {
      const ws = current.current
      if (!ws) return
      const before = ws.hiddenVenue ?? {}
      const after = withHidden(before, keys, hidden)
      commit({ ...ws, hiddenVenue: after }, () => putHiddenVenue(after), (step) => recordHiddenVenue(step, before, after))
    },
    [commit],
  )

  const setKpi = useCallback(
    (kpi: KpiConfig) => {
      const ws = current.current
      if (!ws) return
      const visma = ws.visma ?? []
      const { demand, write } = withVismaLines(ws, visma.map((v) => v.projectNo), kpi, ws.overrides ?? {}, visma)
      commitDemand({ ...ws, kpi, demand }, { ...write, kpi })
    },
    [commitDemand],
  )

  const importVisma = useCallback(
    (rows: VismaRow[], fileName: string) => {
      const ws = current.current
      if (!ws) return []
      const kpi = ws.kpi
      if (!kpi?.workTypes.length || !kpi.rates.length) throw new Error('Sett opp KPI (arbeidstyper og satser) før Visma-utskriften leses inn.')
      const byProject = new Map<string, VismaRow[]>()
      for (const row of rows) byProject.set(row.projectNo, [...(byProject.get(row.projectNo) ?? []), row])
      const importedAt = new Date().toISOString()
      const imports: VismaImport[] = [...byProject].map(([projectNo, projectRows]) => ({ projectNo, eventName: projectRows[0].eventName, fileName, importedAt, rows: projectRows }))
      let overrides = ws.overrides ?? {}
      for (const item of imports) {
        // First export for a project in the app: bring along the edits made to its Visma rows in the workbook.
        const first = !(ws.visma ?? []).some((v) => v.projectNo === item.projectNo)
        if (first) overrides = { ...harvestOverrides(ws.demand.filter((line) => line.projectNo === item.projectNo), item.rows, kpi), ...overrides }
      }
      const visma = [...(ws.visma ?? []).filter((v) => !byProject.has(v.projectNo)), ...imports]
      const { demand, write } = withVismaLines(ws, [...byProject.keys()], kpi, overrides, visma)
      commitDemand({ ...ws, visma, overrides, demand }, { ...write, overrides, visma: imports })
      return [...byProject.keys()]
    },
    [commitDemand],
  )

  const setLineOverride = useCallback(
    (projectNo: string, key: string, patch: LineOverride) => {
      const ws = current.current
      if (!ws?.kpi) return
      const overrides = { ...ws.overrides, [key]: { ...ws.overrides?.[key], ...patch } }
      const { demand, write } = withVismaLines(ws, [projectNo], ws.kpi, overrides, ws.visma ?? [])
      commitDemand({ ...ws, overrides, demand }, { ...write, overrides })
    },
    [commitDemand],
  )

  const removeLineOverride = useCallback(
    (projectNo: string, key: string) => {
      const ws = current.current
      if (!ws?.kpi || !ws.overrides?.[key]) return
      const overrides = { ...ws.overrides }
      delete overrides[key]
      const { demand, write } = withVismaLines(ws, [projectNo], ws.kpi, overrides, ws.visma ?? [])
      commitDemand({ ...ws, overrides, demand }, { ...write, overrides })
    },
    [commitDemand],
  )

  const saveDemandLine = useCallback<WorkspaceStore['saveDemandLine']>(
    (fields) => {
      const ws = current.current
      if (!ws) return
      const line: DemandLine = { ...fields, id: fields.id ?? `manual-${crypto.randomUUID()}`, origin: fields.origin ?? 'manual' }
      const exists = ws.demand.some((l) => l.id === line.id)
      commitDemand({ ...ws, demand: exists ? ws.demand.map((l) => (l.id === line.id ? line : l)) : [...ws.demand, line] }, { putLines: [line] })
    },
    [commitDemand],
  )

  const removeDemandLine = useCallback(
    (id: string) => {
      const ws = current.current
      if (ws) commitDemand({ ...ws, demand: ws.demand.filter((l) => l.id !== id) }, { deleteIds: [id] })
    },
    [commitDemand],
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
    importVenue,
    setVenueHidden,
    setKpi,
    importVisma,
    setLineOverride,
    removeLineOverride,
    saveDemandLine,
    removeDemandLine,
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
