import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildDemandIndex, type DemandIndex } from '../domain/calc'
import type { ISODate } from '../domain/dates'
import { type AllocationRow, type Budgets, type DemandLine, type HallRules, type KpiConfig, type LineOverride, type ProjectRef, type Settings, type VenueBooking, type VismaImport, type VismaRow, type Workspace } from '../domain/types'
import { diffVenue, exportWindow, mergeVenue, withHidden, withVenueIds, type VenueDiff } from '../domain/venueImport'
import { EMPTY_KPI } from '../domain/kpi'
import { followCompetence, rowScope } from '../domain/plannedRows'
import { exampleRules, locateDemand, withChoice } from '../domain/locations'
import { competenceStyles, renameCompetence as withCompetenceRenamed, replaceCompetence, supersededCompetences } from '../domain/competences'
import { hallNames } from '../domain/venue'
import { projectFollowers } from '../domain/projects'
import { budgetsRenumbered } from '../domain/result'
import { withVismaDemand } from '../domain/visma'
import { clearAll, isShared, loadWorkspace, saveWorkspace, writeRecords } from './db'
import { clearPrefs } from './prefs'
import { History, type Step } from './history'
import { applyDeltas, diffWorkspace, effective, mergeDeltas, recordKey, toRecords, writesOf, type Delta, type RecordWrite } from './records'

const HISTORY_LIMIT = 200

type SaveState = 'saved' | 'saving' | 'error'

interface WorkspaceStore {
  status: 'loading' | 'empty' | 'ready'
  workspace: Workspace | null
  demandIndex: DemandIndex
  /** The demand with Hall/Sted read as a hall of the hall ledger, or as unresolved. See `locateDemand`. */
  locatedDemand: DemandLine[]
  replaceWorkspace: (workspace: Workspace) => Promise<void>
  /** Deletes everything stored in the browser, and in a shared workspace for everyone, and returns to the start screen. Cannot be undone. */
  resetWorkspace: () => Promise<void>
  /** Takes in what another computer wrote to the shared copy. It is no step of this planner's undo. */
  applyRemote: (deltas: Delta[]) => void
  /** Who is told when an undo or redo leaves records another planner has changed since: how many, and their ids. */
  setOnLeft: (handler: ((count: number, by: string[]) => void) | null) => void
  setAllocationFte: (rowId: string, date: ISODate, value: number | null) => void
  /** Types FTE into a row suggested from planned demand, which turns it into an ordinary planning row. */
  setSuggestedFte: (suggested: AllocationRow, date: ISODate, value: number | null) => void
  setAllocationNote: (rowId: string, date: ISODate, note: string) => void
  addAllocation: (row: Omit<AllocationRow, 'id' | 'order' | 'fte' | 'notes'>) => AllocationRow
  updateAllocation: (row: AllocationRow) => void
  removeAllocation: (rowId: string) => void
  updateSettings: (settings: Settings) => void
  /** Takes in a Venyou export: hall bookings in the export's period are replaced, the rest are kept. */
  importVenue: (bookings: VenueBooking[], fileName: string) => VenueDiff & { from: string; to: string }
  /**
   * Replaces the project table. Planning rows of an event follow it to the number it gets, and a project given
   * another number (`renumbered`) takes its rows, the planner's own demand lines and its budget along. Returns how many followed.
   */
  setProjects: (projects: ProjectRef[], renumbered?: { from: string; to: string }) => { rows: number; lines: number }
  /** Replaces the budget of every project, on Resultat. */
  setBudgets: (budgets: Budgets) => void
  /** Shows or hides hall bookings in the Kalender; keys come from `venueKey`. */
  setVenueHidden: (keys: string[], hidden: boolean) => void
  /**
   * Replaces the KPI setup and recalculates all Visma lines. Returns how many planned rows followed a product type
   * to its new competence, and the competences that were replaced for the people because nothing else names them any more.
   */
  setKpi: (kpi: KpiConfig) => { rows: number; replaced: string[] }
  /** Gives a competence another name everywhere it is named, as one step. False when the name is empty or that of another competence. */
  renameCompetence: (key: string, label: string) => boolean
  /** Takes in a Visma export; each project in it replaces that project's earlier Visma lines. Returns the project numbers. */
  importVisma: (rows: VismaRow[], fileName: string) => string[]
  /** Changes the planner's decisions for one Visma line (Effekt, in plan, comment, work type). */
  setLineOverride: (projectNo: string, key: string, patch: LineOverride) => void
  /** The same for several lines of a project at once: the project's Visma lines are recalculated and written once. */
  setLineOverrides: (projectNo: string | string[], patches: { key: string; patch: LineOverride }[]) => void
  /** Places every demand line with this Hall/Sted text in a hall, in every project or in the one given; without a hall, the text is read automatically again. */
  setHallChoice: (text: string, hall: string | undefined, projectNo?: string) => void
  /** Replaces the planner's rules for Hall/Sted: his places, his rules for words and his choices for texts. */
  setHallRules: (rules: HallRules) => void
  /** Forgets the decisions made for a Visma line, typically one that has left the export. */
  removeLineOverride: (projectNo: string, key: string) => void
  /** Adds or changes a ledger line that does not come from Visma. */
  saveDemandLine: (line: Omit<DemandLine, 'id'> & { id?: string }) => void
  removeDemandLine: (id: string) => void
  /**
   * Changes people, absence, assignments, moved hours or competence styles: `change` returns the workspace as it should be.
   * Planning rows it adds, changes or removes follow in the same undo step.
   */
  updateStaffing: (change: (workspace: Workspace) => Workspace) => void
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
}

const Context = createContext<WorkspaceStore | null>(null)
// Saving flips state on every edit; kept apart so that only what shows it renders again.
const SaveStateContext = createContext<SaveState>('saved')

const EMPTY_DEMAND: DemandLine[] = []

/** Whether a mouse button is held anywhere on the page: a stroke, a drag or a pull is being drawn. */
let pointerDown = false
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => (pointerDown = true), true)
  window.addEventListener('pointerup', () => (pointerDown = false), true)
  window.addEventListener('pointercancel', () => (pointerDown = false), true)
  window.addEventListener('blur', () => (pointerDown = false))
}

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
  const undoStack = useRef<Step[]>([])
  const redoStack = useRef<Step[]>([])
  const history = useRef(new History())
  const onLeft = useRef<((count: number, by: string[]) => void) | null>(null)
  /** What other computers wrote while the planner held the mouse down: it waits until the stroke or the drag is over. */
  const held = useRef<Delta[] | null>(null)
  /** Edits made in the same event (a range fill, a paste) collect here and become one undo step. */
  const openStep = useRef<Map<string, Delta> | null>(null)
  /** The records written in the same event, each once as it ended up; they are written together when the event is over. */
  const pendingWrites = useRef<Map<string, RecordWrite> | null>(null)
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

  const syncHistorySize = () => {
    const undo = undoStack.current.length + (openStep.current ? 1 : 0)
    const redo = redoStack.current.length
    setHistorySize((size) => (size.undo === undo && size.redo === redo ? size : { undo, redo }))
  }

  const closeStep = useCallback(() => {
    const step = openStep.current
    openStep.current = null
    const deltas = step ? effective(step) : []
    if (deltas.length) {
      undoStack.current.push({ deltas, at: history.current.tick() })
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
      redoStack.current = []
    }
    syncHistorySize()
  }, [])

  const clearHistory = useCallback(() => {
    history.current.forget()
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

  /** Notes records to be written; those of one event are written together, each once, in one transaction, when it is over. */
  const write = useCallback(
    (writes: RecordWrite[]) => {
      if (!pendingWrites.current) {
        const pending = new Map<string, RecordWrite>()
        pendingWrites.current = pending
        track(() =>
          Promise.resolve().then(() => {
            pendingWrites.current = null
            return writeRecords([...pending.values()])
          }),
        )
      }
      for (const w of writes) pendingWrites.current.set(recordKey(w.kind, w.id), w)
    },
    [track],
  )

  /** Applies a change in memory immediately, notes the records it changed for undo, and writes them in the background. */
  const commit = useCallback(
    (next: Workspace) => {
      const before = current.current
      if (!before || next === before) return
      const deltas = diffWorkspace(before, next)
      current.current = next
      setWorkspace(next)
      if (!deltas.length) return
      if (!openStep.current) {
        openStep.current = new Map()
        setTimeout(closeStep, 0)
      }
      mergeDeltas(openStep.current, deltas)
      write(writesOf(deltas, 'after'))
    },
    [closeStep, write],
  )

  const stepThroughHistory = useCallback(
    (direction: 'undo' | 'redo') => {
      closeStep()
      const from = direction === 'undo' ? undoStack.current : redoStack.current
      const to = direction === 'undo' ? redoStack.current : undoStack.current
      const step = from.pop()
      const ws = current.current
      if (!step || !ws) return
      // What another planner has changed since is left as they made it.
      const { deltas, left, by } = history.current.split(step)
      to.push({ deltas: step.deltas, at: history.current.tick() })
      const side = direction === 'undo' ? 'before' : 'after'
      const next = applyDeltas(ws, deltas, side)
      current.current = next
      setWorkspace(next)
      syncHistorySize()
      write(writesOf(deltas, side))
      if (left.length) onLeft.current?.(left.length, by)
    },
    [closeStep, write],
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

  const resetWorkspace = useCallback(async () => {
    // A shared workspace is emptied for everyone: every record is deleted, and the deletes are sent like any write.
    if (isShared()) await writeRecords(current.current ? toRecords(current.current).map(({ kind, id }) => ({ kind, id, value: null })) : [])
    else await clearAll()
    // View preferences (filters, zoom, collapsed projects) belong to the data that is gone.
    clearPrefs()
    current.current = null
    setWorkspace(null)
    clearHistory()
    setStatus('empty')
    setSaveState('saved')
  }, [clearHistory])

  const applyRemote = useCallback((incoming: Delta[]) => {
    // Not under a stroke or a drag that is being drawn: what it shows was worked out from the workspace as it was.
    if (pointerDown) {
      held.current = [...(held.current ?? []), ...incoming]
      return
    }
    const deltas = [...(held.current ?? []), ...incoming]
    held.current = null
    history.current.changedElsewhere(deltas)
    const ws = current.current
    if (!ws) {
      // The first records of a shared workspace this browser has not held before.
      loadWorkspace().then((loaded) => {
        if (!loaded || current.current) return
        current.current = loaded
        setWorkspace(loaded)
        setStatus('ready')
      })
      return
    }
    const next = applyDeltas(ws, deltas, 'after')
    current.current = next
    setWorkspace(next)
    // Emptied for everyone on another computer.
    if (!deltas.some((d) => d.kind === 'settings' && d.after === null)) return
    current.current = null
    setWorkspace(null)
    clearHistory()
    setStatus('empty')
  }, [clearHistory])

  // What was held while the mouse was down is taken in when it is let go, after the stroke has been committed.
  useEffect(() => {
    const up = () => setTimeout(() => held.current && applyRemote([]), 0)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [applyRemote])

  const setOnLeft = useCallback((handler: ((count: number, by: string[]) => void) | null) => {
    onLeft.current = handler
  }, [])

  const updateRow = useCallback(
    (rowId: string, change: (row: AllocationRow) => AllocationRow) => {
      const ws = current.current
      const row = ws?.allocations.find((r) => r.id === rowId)
      if (!ws || !row) return
      const updated = change(row)
      if (updated === row) return
      commit({ ...ws, allocations: ws.allocations.map((r) => (r.id === rowId ? updated : r)) })
    },
    [commit],
  )

  const setAllocationFte = useCallback(
    (rowId: string, date: ISODate, value: number | null) => updateRow(rowId, (row) => (sameDay(row.fte, date, value) ? row : { ...row, fte: withDay(row.fte, date, value) })),
    [updateRow],
  )

  const setSuggestedFte = useCallback(
    (suggested: AllocationRow, date: ISODate, value: number | null) => {
      const ws = current.current
      if (!ws) return
      // Several cells filled in one go arrive one by one; after the first, the row already exists.
      const existing = ws.allocations.find((row) => rowScope(row) === rowScope(suggested))
      if (existing) return setAllocationFte(existing.id, date, value)
      if (!value) return
      const row: AllocationRow = { ...suggested, id: `row-${crypto.randomUUID()}`, order: Math.max(-1, ...ws.allocations.map((r) => r.order)) + 1, fte: { [date]: value }, notes: {} }
      commit({ ...ws, allocations: [...ws.allocations, row] })
    },
    [commit, setAllocationFte],
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
        fte: {},
        notes: {},
      }
      commit({ ...ws, allocations: [...ws.allocations, row] })
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
      commit({ ...ws, allocations: ws.allocations.filter((r) => r.id !== rowId) })
    },
    [commit],
  )

  const updateSettings = useCallback(
    (settings: Settings) => {
      const ws = current.current
      if (ws) commit({ ...ws, settings })
    },
    [commit],
  )

  const importVenue = useCallback<WorkspaceStore['importVenue']>(
    (bookings, fileName) => {
      const ws = current.current
      const window = exportWindow(fileName, bookings)
      if (!ws || !window) throw new Error('Fant ingen datoer i Venyou-filen.')
      const importedAt = new Date().toISOString()
      const incoming = withVenueIds(bookings)
      const diff = diffVenue(ws.venue, incoming, window)
      const venue = mergeVenue(ws.venue, incoming, window)
      // The first halls bring the example rules with them, as the planner's own from then on.
      const hallRules = ws.hallRules ?? exampleRules(hallNames(venue))
      const next: Workspace = { ...ws, venue, venueImport: { fileName, importedAt, ...window }, hallRules }
      commit(next)
      return { ...diff, ...window }
    },
    [commit],
  )

  const setProjects = useCallback<WorkspaceStore['setProjects']>(
    (projects, renumbered) => {
      const ws = current.current
      if (!ws) return { rows: 0, lines: 0 }
      const { allocations, demand } = projectFollowers(ws, projects, renumbered)
      const rows = new Map(allocations.map((row) => [row.id, row]))
      const lines = new Map(demand.map((line) => [line.id, line]))
      const budgets = renumbered ? budgetsRenumbered(ws.budgets, renumbered.from, renumbered.to) : ws.budgets
      const next: Workspace = {
        ...ws,
        projects,
        budgets,
        allocations: rows.size ? ws.allocations.map((row) => rows.get(row.id) ?? row) : ws.allocations,
        demand: lines.size ? ws.demand.map((line) => lines.get(line.id) ?? line) : ws.demand,
      }
      commit(next)
      return { rows: allocations.length, lines: demand.length }
    },
    [commit],
  )

  const setBudgets = useCallback(
    (budgets: Budgets) => {
      const ws = current.current
      if (ws) commit({ ...ws, budgets })
    },
    [commit],
  )

  const setHallRules = useCallback(
    (rules: HallRules) => {
      const ws = current.current
      if (ws) commit({ ...ws, hallRules: rules })
    },
    [commit],
  )

  const setHallChoice = useCallback(
    (text: string, hall: string | undefined, projectNo?: string) => {
      const ws = current.current
      if (ws) setHallRules(withChoice(ws.hallRules, text, hall, projectNo))
    },
    [setHallRules],
  )

  const setVenueHidden = useCallback(
    (keys: string[], hidden: boolean) => {
      const ws = current.current
      if (!ws) return
      commit({ ...ws, hiddenVenue: withHidden(ws.hiddenVenue ?? {}, keys, hidden) })
    },
    [commit],
  )

  const setKpi = useCallback(
    (kpi: KpiConfig) => {
      const ws = current.current
      if (!ws) return { rows: 0, replaced: [] }
      const demand = withVismaDemand({ ...ws, kpi })
      // Rows already planned for a product type that was given another competence follow it there, in the same step.
      const moved = new Map(followCompetence(ws.allocations, ws.kpi ?? EMPTY_KPI, kpi, ws.demand, demand).map((row) => [row.id, row]))
      const planned: Workspace = { ...ws, kpi, demand, allocations: moved.size ? ws.allocations.map((row) => moved.get(row.id) ?? row) : ws.allocations }
      // A competence that only people name after the change is replaced for them too: who had it, their blocks, its colour.
      const replaced = supersededCompetences(ws.kpi ?? EMPTY_KPI, planned)
      const next = replaced.reduce((w, { from, to }) => replaceCompetence(w, from, to), planned)
      commit(next)
      return { rows: moved.size, replaced: replaced.map(({ from }) => competenceStyles(ws).find((style) => style.key === from)?.label ?? from) }
    },
    [commit],
  )

  const renameCompetence = useCallback<WorkspaceStore['renameCompetence']>(
    (key, label) => {
      const ws = current.current
      const next = ws && withCompetenceRenamed(ws, key, label)
      if (!ws || !next) return false
      commit(next)
      return true
    },
    [commit],
  )

  const importVisma = useCallback(
    (rows: VismaRow[], fileName: string) => {
      const ws = current.current
      if (!ws) return []
      // An export can be read before anything is set up; its product types then show up to be filled in.
      const kpi = ws.kpi ?? EMPTY_KPI
      const byProject = new Map<string, VismaRow[]>()
      for (const row of rows) byProject.set(row.projectNo, [...(byProject.get(row.projectNo) ?? []), row])
      const importedAt = new Date().toISOString()
      const imports: VismaImport[] = [...byProject].map(([projectNo, projectRows]) => ({ projectNo, eventName: projectRows[0].eventName, fileName, importedAt, rows: projectRows }))
      const overrides = ws.overrides ?? {}
      const visma = [...(ws.visma ?? []).filter((v) => !byProject.has(v.projectNo)), ...imports]
      commit({ ...ws, visma, overrides, demand: withVismaDemand({ ...ws, kpi, visma, overrides }, [...byProject.keys()]) })
      return [...byProject.keys()]
    },
    [commit],
  )

  const setLineOverrides = useCallback(
    (projectNo: string | string[], patches: { key: string; patch: LineOverride }[]) => {
      const ws = current.current
      if (!ws || !patches.length) return
      const overrides = { ...ws.overrides }
      for (const { key, patch } of patches) overrides[key] = { ...overrides[key], ...patch }
      commit({ ...ws, overrides, demand: withVismaDemand({ ...ws, overrides }, [projectNo].flat()) })
    },
    [commit],
  )

  const setLineOverride = useCallback((projectNo: string, key: string, patch: LineOverride) => setLineOverrides(projectNo, [{ key, patch }]), [setLineOverrides])

  const removeLineOverride = useCallback(
    (projectNo: string, key: string) => {
      const ws = current.current
      if (!ws?.overrides?.[key]) return
      const overrides = { ...ws.overrides }
      delete overrides[key]
      commit({ ...ws, overrides, demand: withVismaDemand({ ...ws, overrides }, [projectNo]) })
    },
    [commit],
  )

  const saveDemandLine = useCallback<WorkspaceStore['saveDemandLine']>(
    (fields) => {
      const ws = current.current
      if (!ws) return
      const line: DemandLine = { ...fields, id: fields.id ?? `manual-${crypto.randomUUID()}` }
      const exists = ws.demand.some((l) => l.id === line.id)
      commit({ ...ws, demand: exists ? ws.demand.map((l) => (l.id === line.id ? line : l)) : [...ws.demand, line] })
    },
    [commit],
  )

  const removeDemandLine = useCallback(
    (id: string) => {
      const ws = current.current
      if (ws) commit({ ...ws, demand: ws.demand.filter((l) => l.id !== id) })
    },
    [commit],
  )

  const updateStaffing = useCallback<WorkspaceStore['updateStaffing']>(
    (change) => {
      const ws = current.current
      if (!ws) return
      commit(change(ws))
    },
    [commit],
  )

  const demand = workspace?.demand
  const venue = workspace?.venue
  // Hours are counted per hall of the hall ledger; demand whose Hall/Sted names none of them is gathered as unresolved.
  const hallRules = workspace?.hallRules
  const locatedDemand = useMemo(() => (demand ? locateDemand(demand, hallNames(venue ?? []), hallRules) : EMPTY_DEMAND), [demand, venue, hallRules])
  const demandIndex = useMemo(() => buildDemandIndex(locatedDemand), [locatedDemand])

  const canUndo = historySize.undo > 0
  const canRedo = historySize.redo > 0
  // The same object as long as nothing in it changed, so a tab renders again only when the data does.
  const value = useMemo<WorkspaceStore>(
    () => ({
      status,
      workspace,
      demandIndex,
      locatedDemand,
      replaceWorkspace,
      resetWorkspace,
      applyRemote,
      setOnLeft,
      setAllocationFte,
      setSuggestedFte,
      setAllocationNote,
      addAllocation,
      updateAllocation,
      removeAllocation,
      updateSettings,
      importVenue,
      setProjects,
      setBudgets,
      setVenueHidden,
      setKpi,
      renameCompetence,
      importVisma,
      setLineOverride,
      setLineOverrides,
      setHallChoice,
      setHallRules,
      removeLineOverride,
      saveDemandLine,
      removeDemandLine,
      updateStaffing,
      canUndo,
      canRedo,
      undo,
      redo,
    }),
    [status, workspace, demandIndex, locatedDemand, replaceWorkspace, resetWorkspace, applyRemote, setOnLeft, setAllocationFte, setSuggestedFte, setAllocationNote, addAllocation, updateAllocation, removeAllocation, updateSettings, importVenue, setProjects, setBudgets, setVenueHidden, setKpi, renameCompetence, importVisma, setLineOverride, setLineOverrides, setHallChoice, setHallRules, removeLineOverride, saveDemandLine, removeDemandLine, updateStaffing, canUndo, canRedo, undo, redo],
  )
  return (
    <Context.Provider value={value}>
      <SaveStateContext.Provider value={saveState}>{children}</SaveStateContext.Provider>
    </Context.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useWorkspace = (): WorkspaceStore => {
  const store = useContext(Context)
  if (!store) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return store
}

/** Whether the latest edits have reached storage. */
// eslint-disable-next-line react-refresh/only-export-components
export const useSaveState = (): SaveState => useContext(SaveStateContext)
