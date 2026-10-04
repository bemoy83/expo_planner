import type { AllocationRow, CapacityLine, DemandLine, KpiConfig, LineOverride, Settings, VismaImport, Workspace } from '../domain/types'

interface Delta<T> {
  before: T
  after: T
}

/** One undoable step: the records it touched, as they were before and after. */
export interface Change {
  /** `null` means the row did not exist (before an add, after a delete). */
  allocations: Map<string, Delta<AllocationRow | null>>
  capacity: Map<string, Delta<CapacityLine>>
  settings?: Delta<Settings>
  /** Ledger lines, `null` where the line did not exist. */
  demand: Map<string, Delta<DemandLine | null>>
  /** Visma exports per project number, `null` where none was held. */
  visma: Map<string, Delta<VismaImport | null>>
  overrides?: Delta<Record<string, LineOverride>>
  kpi?: Delta<KpiConfig | undefined>
}

export const emptyChange = (): Change => ({ allocations: new Map(), capacity: new Map(), demand: new Map(), visma: new Map() })

/** Several edits to the same record within one step keep the first `before` and the last `after`. */
const record = <T,>(map: Map<string, Delta<T>>, id: string, before: T, after: T) => {
  const existing = map.get(id)
  map.set(id, { before: existing ? existing.before : before, after })
}

export const recordAllocation = (change: Change, id: string, before: AllocationRow | null, after: AllocationRow | null) =>
  record(change.allocations, id, before, after)

export const recordCapacity = (change: Change, before: CapacityLine, after: CapacityLine) => record(change.capacity, before.id, before, after)

export const recordSettings = (change: Change, before: Settings, after: Settings) => {
  change.settings = { before: change.settings ? change.settings.before : before, after }
}

/** Notes what a ledger change did, by comparing the workspace before and after it. */
export const recordLedger = (change: Change, before: Workspace, after: Workspace) => {
  if (before.demand !== after.demand) {
    const old = new Map(before.demand.map((line) => [line.id, line]))
    for (const line of after.demand) {
      const previous = old.get(line.id) ?? null
      if (previous !== line) record(change.demand, line.id, previous, line)
      old.delete(line.id)
    }
    for (const [id, line] of old) record(change.demand, id, line, null)
  }
  if (before.visma !== after.visma) {
    const old = new Map((before.visma ?? []).map((v) => [v.projectNo, v]))
    for (const v of after.visma ?? []) {
      const previous = old.get(v.projectNo) ?? null
      if (previous !== v) record(change.visma, v.projectNo, previous, v)
      old.delete(v.projectNo)
    }
    for (const [projectNo, v] of old) record(change.visma, projectNo, v, null)
  }
  if (before.overrides !== after.overrides) change.overrides = { before: change.overrides ? change.overrides.before : (before.overrides ?? {}), after: after.overrides ?? {} }
  if (before.kpi !== after.kpi) change.kpi = { before: change.kpi ? change.kpi.before : before.kpi, after: after.kpi }
}

export const isEmptyChange = (change: Change): boolean =>
  !change.settings &&
  !change.overrides &&
  !change.kpi &&
  [...change.demand.values()].every((d) => d.before === d.after) &&
  [...change.visma.values()].every((d) => d.before === d.after) &&
  [...change.allocations.values()].every((d) => d.before === d.after) &&
  [...change.capacity.values()].every((d) => d.before === d.after)

export type Direction = 'undo' | 'redo'

const target = <T,>(delta: Delta<T>, direction: Direction): T => (direction === 'undo' ? delta.before : delta.after)

/** Returns the workspace with the change reverted (undo) or applied again (redo). */
export const applyChange = (workspace: Workspace, change: Change, direction: Direction): Workspace => {
  let allocations = workspace.allocations
  if (change.allocations.size) {
    const remaining = allocations.filter((row) => !change.allocations.has(row.id))
    const restored = [...change.allocations.values()].flatMap((delta) => target(delta, direction) ?? [])
    allocations = [...remaining, ...restored].sort((a, b) => a.order - b.order)
  }
  const capacity = change.capacity.size
    ? workspace.capacity.map((line) => {
        const delta = change.capacity.get(line.id)
        return delta ? target(delta, direction) : line
      })
    : workspace.capacity
  const settings = change.settings ? target(change.settings, direction) : workspace.settings
  const demand = change.demand.size
    ? [...workspace.demand.filter((line) => !change.demand.has(line.id)), ...[...change.demand.values()].flatMap((delta) => target(delta, direction) ?? [])]
    : workspace.demand
  const visma = change.visma.size
    ? [...(workspace.visma ?? []).filter((v) => !change.visma.has(v.projectNo)), ...[...change.visma.values()].flatMap((delta) => target(delta, direction) ?? [])]
    : workspace.visma
  const overrides = change.overrides ? target(change.overrides, direction) : workspace.overrides
  const kpi = change.kpi ? target(change.kpi, direction) : workspace.kpi
  return { ...workspace, allocations, capacity, settings, demand, visma, overrides, kpi }
}

/** What has to be written to storage after applying a change in the given direction. */
export const changeWrites = (change: Change, direction: Direction) => ({
  putAllocations: [...change.allocations.values()].flatMap((delta) => target(delta, direction) ?? []),
  deleteAllocations: [...change.allocations].filter(([, delta]) => target(delta, direction) === null).map(([id]) => id),
  putCapacity: [...change.capacity.values()].map((delta) => target(delta, direction)),
  settings: change.settings ? target(change.settings, direction) : null,
  putDemand: [...change.demand.values()].flatMap((delta) => target(delta, direction) ?? []),
  deleteDemand: [...change.demand].filter(([, delta]) => target(delta, direction) === null).map(([id]) => id),
  putVisma: [...change.visma.values()].flatMap((delta) => target(delta, direction) ?? []),
  deleteVisma: [...change.visma].filter(([, delta]) => target(delta, direction) === null).map(([projectNo]) => projectNo),
  overrides: change.overrides ? target(change.overrides, direction) : null,
  /** `undefined` means the KPI data is unchanged; `null` means it should be removed. */
  kpi: change.kpi ? (target(change.kpi, direction) ?? null) : undefined,
})
