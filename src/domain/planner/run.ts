import type { ISODate } from '../dates'
import type { AllocationRow, Workspace } from '../types'
import { scorePlan, stagePlace, weightsOf, type Score } from './score'
import { solve, type Solution } from './solve'

/**
 * One run of the engine as plain data, so that it can be handed to a Web Worker and the page goes on while it works:
 * what the Kalender knows of each row (what it needs, its window, its hours by product type and the free days next to
 * its window) written out per row, and the plan with its score before and after.
 */
export interface EngineData {
  ws: Workspace
  rows: AllocationRow[]
  /** By row id: the FTE-days the row needs in all. */
  required: Record<string, number>
  /** By row id: the days of its window. */
  windows: Record<string, ISODate[]>
  /** By row id: its required hours by product type. */
  hoursByWork: Record<string, [string, number][]>
  /** By row id: the free days next to its window, nearest first; none where the window is held. */
  nearby: Record<string, ISODate[]>
  dates: ISODate[]
  keepTyped: boolean
}

export interface EngineResult {
  solution: Solution
  before: Score
  after: Score
}

/** What the Kalender knows of the rows, written out for a run. */
export const engineData = (
  ws: Workspace,
  rows: AllocationRow[],
  dates: ISODate[],
  of: {
    required: (row: AllocationRow) => number
    hoursByWork: (row: AllocationRow) => Map<string, number>
    windowOf: (row: AllocationRow) => Set<ISODate> | undefined
    nearby?: (row: AllocationRow) => ISODate[]
  },
  keepTyped: boolean,
): EngineData => {
  const data: EngineData = { ws, rows, required: {}, windows: {}, hoursByWork: {}, nearby: {}, dates, keepTyped }
  for (const row of rows) {
    data.required[row.id] = of.required(row)
    data.hoursByWork[row.id] = [...of.hoursByWork(row)]
    const window = of.windowOf(row)
    if (window) data.windows[row.id] = [...window]
    if (of.nearby) data.nearby[row.id] = of.nearby(row)
  }
  return data
}

/**
 * The plan for the data and its score before and after. A row the engine stored anew is known by the row it came from,
 * and a row not given by its project, hall and phase, as the window is the same for all of them.
 */
export const runEngine = (data: EngineData): EngineResult => {
  const { ws, rows, dates, keepTyped } = data
  const alias = new Map<string, string>()
  const byPlace = new Map<string, string>()
  for (const row of rows) if (!byPlace.has(stagePlace(row))) byPlace.set(stagePlace(row), row.id)
  const idOf = (row: AllocationRow) => alias.get(row.id) ?? (row.id in data.required ? row.id : (byPlace.get(stagePlace(row)) ?? row.id))
  const windowSets = new Map(Object.entries(data.windows).map(([id, days]) => [id, new Set(days)]))
  const required = (row: AllocationRow) => data.required[idOf(row)] ?? 0
  const hoursByWork = (row: AllocationRow) => new Map(data.hoursByWork[idOf(row)] ?? [])
  const windowOf = (row: AllocationRow) => windowSets.get(idOf(row))
  const nearby = (row: AllocationRow) => data.nearby[idOf(row)] ?? []

  const solution = solve({ ws, rows, required, hoursByWork, windowOf, nearby, keepTyped })
  solution.rows.forEach((row, i) => row.id !== rows[i].id && alias.set(row.id, rows[i].id))
  const weights = weightsOf(ws.settings)
  // Demand put on no day counts as uncovered, so a plan not yet made is not scored as one that costs nothing.
  const before = scorePlan(ws, dates, windowOf, weights, { rows, required, hoursByWork })
  const after = scorePlan(solution.workspace, dates, windowOf, weights, { rows: solution.rows, required, hoursByWork })
  return { solution, before, after }
}
