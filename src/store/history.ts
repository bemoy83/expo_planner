import type { AllocationRow, CapacityLine, Settings, Workspace } from '../domain/types'

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
}

export const emptyChange = (): Change => ({ allocations: new Map(), capacity: new Map() })

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

export const isEmptyChange = (change: Change): boolean =>
  !change.settings &&
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
  return { ...workspace, allocations, capacity, settings }
}

/** What has to be written to storage after applying a change in the given direction. */
export const changeWrites = (change: Change, direction: Direction) => ({
  putAllocations: [...change.allocations.values()].flatMap((delta) => target(delta, direction) ?? []),
  deleteAllocations: [...change.allocations].filter(([, delta]) => target(delta, direction) === null).map(([id]) => id),
  putCapacity: [...change.capacity.values()].map((delta) => target(delta, direction)),
  settings: change.settings ? target(change.settings, direction) : null,
})
