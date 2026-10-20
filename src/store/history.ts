import { recordKey, type Delta } from './records'

/**
 * Undo in a shared workspace: a planner undoes their own steps, never another's. A step is the records one action
 * changed, with the moment it was taken (or last undone or redone); a record another planner has changed since is left
 * as they made it, and the planner is told.
 */
export interface Step {
  deltas: Delta[]
  /** When the step was taken, or last undone or redone, on the clock of `History`. */
  at: number
}

export class History {
  private clock = 0
  /** For each record changed by another planner, when and by whom. */
  private remote = new Map<string, { at: number; by?: string }>()

  tick(): number {
    return ++this.clock
  }

  /** Notes records another planner changed. */
  changedElsewhere(deltas: Delta[]) {
    const at = this.tick()
    for (const delta of deltas) this.remote.set(recordKey(delta.kind, delta.id), { at, by: delta.by })
  }

  /** What of a step can be undone or redone now: what no other planner has changed since, and who changed the rest. */
  split(step: Step): { deltas: Delta[]; left: Delta[]; by: string[] } {
    const deltas: Delta[] = []
    const left: Delta[] = []
    const by = new Set<string>()
    for (const delta of step.deltas) {
      const other = this.remote.get(recordKey(delta.kind, delta.id))
      if (other && other.at > step.at) {
        left.push(delta)
        if (other.by) by.add(other.by)
      } else deltas.push(delta)
    }
    return { deltas, left, by: [...by] }
  }

  forget() {
    this.remote.clear()
  }
}
