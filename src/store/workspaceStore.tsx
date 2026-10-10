import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildDemandIndex, type DemandIndex } from '../domain/calc'
import type { ISODate } from '../domain/dates'
import { type AllocationRow, type DemandLine, type KpiConfig, type LineOverride, type ProjectRef, type Settings, type VenueBooking, type VismaImport, type VismaRow, type Workspace } from '../domain/types'
import { diffVenue, exportWindow, mergeVenue, VENYOU_ID_PREFIX, withHidden, type VenueDiff } from '../domain/venueImport'
import { EMPTY_KPI } from '../domain/kpi'
import { followCompetence, rowScope } from '../domain/plannedRows'
import { locateDemand, withAlias } from '../domain/locations'
import { competenceStyles, renameCompetence as withCompetenceRenamed, replaceCompetence, supersededCompetences, withOneCompetenceName } from '../domain/competences'
import { hallNames } from '../domain/venue'
import { hallsOfProjects, projectFollowers } from '../domain/projects'
import { isVismaLine, vismaDemandLines } from '../domain/visma'
import { clearAll, db, deleteAllocation, loadWorkspace, putSettings, putHallAliases, putHiddenVenue, putStaffing, saveWorkspace, STAFFING_TABLES, writeProjects, writeDemand, writeVenue, type DemandWrite } from './db'
import { clearPrefs } from './prefs'
import { writeQueue } from './writeQueue'
import { applyChange, changeWrites, emptyChange, isEmptyChange, recordAllocation, recordHallAliases, recordHiddenVenue, recordLedger, recordProjects, recordSettings, recordStaffing, recordVenue, type Change, type Direction } from './history'

const HISTORY_LIMIT = 200

type SaveState = 'saved' | 'saving' | 'error'

interface WorkspaceStore {
  status: 'loading' | 'empty' | 'ready'
  workspace: Workspace | null
  demandIndex: DemandIndex
  /** The demand with Hall/Sted read as a hall of the hall ledger, or as unresolved. See `locateDemand`. */
  locatedDemand: DemandLine[]
  replaceWorkspace: (workspace: Workspace) => Promise<void>
  /** Deletes everything stored in the browser and returns to the start screen. Cannot be undone. */
  resetWorkspace: () => Promise<void>
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
   * another number (`renumbered`) takes its rows and the planner's own demand lines along. Returns how many followed.
   */
  setProjects: (projects: ProjectRef[], renumbered?: { from: string; to: string }) => { rows: number; lines: number }
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
  setHallAlias: (text: string, hall: string | undefined, projectNo?: string) => void
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

const withDay = (values: Record<ISODate, number>, date: ISODate, value: number | null) => {
  const next = { ...values }
  if (value === null || value === 0) delete next[date]
  else next[date] = value
  return next
}

/** True when the cell already holds the value, so the edit would change nothing. */
/** A fill or paste changes a row once per cell; the row is written once, when the event is over. */
const rowWrites = writeQueue<AllocationRow>((rows) => db.allocations.bulkPut(rows))

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
      .then(async (stored) => {
        // What was stored while a competence could go by two names is stored again with one, all of it at once.
        const loaded = stored && withOneCompetenceName(stored)
        if (loaded && loaded !== stored) await saveWorkspace(loaded)
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
        db.transaction('rw', [db.allocations, db.meta, db.demand, db.visma, ...STAFFING_TABLES()], async () => {
          await db.allocations.bulkPut(writes.putAllocations)
          await db.allocations.bulkDelete(writes.deleteAllocations)
          if (writes.settings) await putSettings(writes.settings)
          await db.demand.bulkDelete(writes.deleteDemand)
          await db.demand.bulkPut(writes.putDemand)
          await db.visma.bulkDelete(writes.deleteVisma)
          await db.visma.bulkPut(writes.putVisma)
          if (writes.overrides) await db.meta.put({ key: 'overrides', value: writes.overrides })
          if (writes.kpi === null) await db.meta.delete('kpi')
          else if (writes.kpi) await db.meta.put({ key: 'kpi', value: writes.kpi })
          await putStaffing(writes.staffing)
        })
          .then(() => (writes.venue ? writeVenue(writes.venue.bookings, writes.venue.info) : undefined))
          .then(() => (writes.hiddenVenue ? putHiddenVenue(writes.hiddenVenue) : undefined))
          .then(() => (writes.hallAliases ? putHallAliases(writes.hallAliases) : undefined))
          .then(() => (writes.projects ? writeProjects(writes.projects) : undefined)),
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

  const resetWorkspace = useCallback(async () => {
    await clearAll()
    // View preferences (filters, zoom, collapsed projects) belong to the data that is gone.
    clearPrefs()
    current.current = null
    setWorkspace(null)
    clearHistory()
    setStatus('empty')
    setSaveState('saved')
  }, [clearHistory])

  const updateRow = useCallback(
    (rowId: string, change: (row: AllocationRow) => AllocationRow) => {
      const ws = current.current
      const row = ws?.allocations.find((r) => r.id === rowId)
      if (!ws || !row) return
      const updated = change(row)
      if (updated === row) return
      commit({ ...ws, allocations: ws.allocations.map((r) => (r.id === rowId ? updated : r)) }, () => rowWrites.put(updated), (step) => recordAllocation(step, rowId, row, updated))
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
      commit({ ...ws, allocations: [...ws.allocations, row] }, () => rowWrites.put(row), (step) => recordAllocation(step, row.id, null, row))
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
      commit({ ...ws, allocations: [...ws.allocations, row] }, () => rowWrites.put(row), (step) => recordAllocation(step, row.id, null, row))
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
      commit({ ...ws, allocations: ws.allocations.filter((r) => r.id !== rowId) }, () => (rowWrites.drop(rowId), deleteAllocation(rowId)), (step) => recordAllocation(step, rowId, row, null))
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

  const setProjects = useCallback<WorkspaceStore['setProjects']>(
    (projects, renumbered) => {
      const ws = current.current
      if (!ws) return { rows: 0, lines: 0 }
      const { allocations, demand } = projectFollowers(ws, projects, renumbered)
      const rows = new Map(allocations.map((row) => [row.id, row]))
      const lines = new Map(demand.map((line) => [line.id, line]))
      const next: Workspace = {
        ...ws,
        projects,
        allocations: rows.size ? ws.allocations.map((row) => rows.get(row.id) ?? row) : ws.allocations,
        demand: lines.size ? ws.demand.map((line) => lines.get(line.id) ?? line) : ws.demand,
      }
      commit(
        next,
        () => Promise.all([...allocations.map(rowWrites.put), demand.length ? writeDemand({ putLines: demand }) : undefined]).then(() => writeProjects(projects)),
        (step) => {
          recordProjects(step, ws.projects, projects)
          recordLedger(step, ws, next)
          for (const row of ws.allocations) if (rows.has(row.id)) recordAllocation(step, row.id, row, rows.get(row.id)!)
        },
      )
      return { rows: allocations.length, lines: demand.length }
    },
    [commit],
  )

  const setHallAlias = useCallback(
    (text: string, hall: string | undefined, projectNo?: string) => {
      const ws = current.current
      if (!ws) return
      const before = ws.hallAliases ?? {}
      const after = withAlias(before, text, hall, projectNo)
      commit({ ...ws, hallAliases: after }, () => putHallAliases(after), (step) => recordHallAliases(step, before, after))
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
      if (!ws) return { rows: 0, replaced: [] }
      const visma = ws.visma ?? []
      const { demand, write } = withVismaLines(ws, visma.map((v) => v.projectNo), kpi, ws.overrides ?? {}, visma)
      // Rows already planned for a product type that was given another competence follow it there, in the same step.
      const moved = new Map(followCompetence(ws.allocations, ws.kpi ?? EMPTY_KPI, kpi, ws.demand, demand).map((row) => [row.id, row]))
      const planned: Workspace = { ...ws, kpi, demand, allocations: moved.size ? ws.allocations.map((row) => moved.get(row.id) ?? row) : ws.allocations }
      // A competence that only people name after the change is replaced for them too: who had it, their blocks, its colour.
      const replaced = supersededCompetences(ws.kpi ?? EMPTY_KPI, planned)
      const next = replaced.reduce((w, { from, to }) => replaceCompetence(w, from, to), planned)
      const staffing = emptyChange()
      recordStaffing(staffing, ws, next)
      commit(
        next,
        () => Promise.all([writeDemand({ ...write, kpi }), ...[...moved.values()].map(rowWrites.put), putStaffing(changeWrites(staffing, 'redo').staffing)]),
        (step) => {
          recordLedger(step, ws, next)
          recordStaffing(step, ws, next)
          for (const row of ws.allocations) if (moved.has(row.id)) recordAllocation(step, row.id, row, moved.get(row.id)!)
        },
      )
      return { rows: moved.size, replaced: replaced.map(({ from }) => competenceStyles(ws).find((style) => style.key === from)?.label ?? from) }
    },
    [commit],
  )

  const renameCompetence = useCallback<WorkspaceStore['renameCompetence']>(
    (key, label) => {
      const ws = current.current
      const next = ws && withCompetenceRenamed(ws, key, label)
      if (!ws || !next) return false
      if (next === ws) return true
      const before = new Map(ws.demand.map((line) => [line.id, line]))
      const lines = next.demand.filter((line) => before.get(line.id) !== line)
      const rows = next.allocations.filter((row, index) => row !== ws.allocations[index])
      const staffing = emptyChange()
      recordStaffing(staffing, ws, next)
      commit(
        next,
        () => Promise.all([writeDemand({ putLines: lines, kpi: next.kpi !== ws.kpi ? next.kpi : undefined }), ...rows.map(rowWrites.put), putStaffing(changeWrites(staffing, 'redo').staffing)]),
        (step) => {
          recordLedger(step, ws, next)
          recordStaffing(step, ws, next)
          next.allocations.forEach((row, index) => row !== ws.allocations[index] && recordAllocation(step, row.id, ws.allocations[index], row))
        },
      )
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
      const { demand, write } = withVismaLines(ws, [...byProject.keys()], kpi, overrides, visma)
      commitDemand({ ...ws, visma, overrides, demand }, { ...write, overrides, visma: imports })
      return [...byProject.keys()]
    },
    [commitDemand],
  )

  const setLineOverrides = useCallback(
    (projectNo: string | string[], patches: { key: string; patch: LineOverride }[]) => {
      const ws = current.current
      if (!ws || !patches.length) return
      const overrides = { ...ws.overrides }
      for (const { key, patch } of patches) overrides[key] = { ...overrides[key], ...patch }
      const { demand, write } = withVismaLines(ws, [projectNo].flat(), ws.kpi ?? EMPTY_KPI, overrides, ws.visma ?? [])
      commitDemand({ ...ws, overrides, demand }, { ...write, overrides })
    },
    [commitDemand],
  )

  const setLineOverride = useCallback((projectNo: string, key: string, patch: LineOverride) => setLineOverrides(projectNo, [{ key, patch }]), [setLineOverrides])

  const removeLineOverride = useCallback(
    (projectNo: string, key: string) => {
      const ws = current.current
      if (!ws?.overrides?.[key]) return
      const overrides = { ...ws.overrides }
      delete overrides[key]
      const { demand, write } = withVismaLines(ws, [projectNo], ws.kpi ?? EMPTY_KPI, overrides, ws.visma ?? [])
      commitDemand({ ...ws, overrides, demand }, { ...write, overrides })
    },
    [commitDemand],
  )

  const saveDemandLine = useCallback<WorkspaceStore['saveDemandLine']>(
    (fields) => {
      const ws = current.current
      if (!ws) return
      const line: DemandLine = { ...fields, id: fields.id ?? `manual-${crypto.randomUUID()}` }
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

  const updateStaffing = useCallback<WorkspaceStore['updateStaffing']>(
    (change) => {
      const ws = current.current
      if (!ws) return
      const next = change(ws)
      if (next === ws) return
      const step = emptyChange()
      recordStaffing(step, ws, next)
      const rowsBefore = new Map(ws.allocations.map((row) => [row.id, row]))
      const rowsAfter = new Map(next.allocations.map((row) => [row.id, row]))
      for (const [id, row] of rowsAfter) if (rowsBefore.get(id) !== row) recordAllocation(step, id, rowsBefore.get(id) ?? null, row)
      for (const [id, row] of rowsBefore) if (!rowsAfter.has(id)) recordAllocation(step, id, row, null)
      if (isEmptyChange(step)) return
      const writes = changeWrites(step, 'redo')
      commit(
        next,
        () =>
          db.transaction('rw', [db.allocations, db.meta, ...STAFFING_TABLES()], async () => {
            await db.allocations.bulkDelete(writes.deleteAllocations)
            await db.allocations.bulkPut(writes.putAllocations)
            await putStaffing(writes.staffing)
          }),
        (open) => {
          recordStaffing(open, ws, next)
          for (const [id, delta] of step.allocations) recordAllocation(open, id, delta.before, delta.after)
        },
      )
    },
    [commit],
  )

  const demand = workspace?.demand
  const venue = workspace?.venue
  // Hours are counted per hall of the hall ledger; demand whose Hall/Sted names none of them is gathered as unresolved.
  const hallAliases = workspace?.hallAliases
  const projects = workspace?.projects
  const locatedDemand = useMemo(() => (demand ? locateDemand(demand, hallNames(venue ?? []), hallAliases, hallsOfProjects(venue ?? [], projects ?? [])) : EMPTY_DEMAND), [demand, venue, hallAliases, projects])
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
      setAllocationFte,
      setSuggestedFte,
      setAllocationNote,
      addAllocation,
      updateAllocation,
      removeAllocation,
      updateSettings,
      importVenue,
      setProjects,
      setVenueHidden,
      setKpi,
      renameCompetence,
      importVisma,
      setLineOverride,
      setLineOverrides,
      setHallAlias,
      removeLineOverride,
      saveDemandLine,
      removeDemandLine,
      updateStaffing,
      canUndo,
      canRedo,
      undo,
      redo,
    }),
    [status, workspace, demandIndex, locatedDemand, replaceWorkspace, resetWorkspace, setAllocationFte, setSuggestedFte, setAllocationNote, addAllocation, updateAllocation, removeAllocation, updateSettings, importVenue, setProjects, setVenueHidden, setKpi, renameCompetence, importVisma, setLineOverride, setLineOverrides, setHallAlias, removeLineOverride, saveDemandLine, removeDemandLine, updateStaffing, canUndo, canRedo, undo, redo],
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
