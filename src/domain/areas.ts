import type { HallRules } from './types'

/**
 * The halls of the ledger gathered in areas, as «NV HALLS» for A to E and «NOVA STUDIOS» for the studios. An area is
 * the planner's own, a name and the halls ticked for it (`HallRules.areas`), and decides only what is shown: the
 * Kalender lists the halls by area, and the planner ticks the areas and halls to work with (`HallFilter`). Where
 * demand counts is another matter, that of the places (`locations.ts`).
 */

/** An area of the planner's: a name, and its halls. */
export type Area = NonNullable<HallRules['areas']>[number]

/** The name of the node that holds the halls of no area. */
export const NO_AREA = ''

/** An area with the halls of the ledger it holds, or the halls of no area (`NO_AREA`). */
export interface AreaNode {
  name: string
  halls: string[]
}

const lower = (text: string): string => text.trim().toLowerCase()
const inOrder = (halls: string[]): string[] => [...halls].sort((a, b) => a.localeCompare(b, 'nb', { numeric: true }))

/**
 * The halls of the ledger as a tree: the planner's areas in his order, each with its halls, and last the halls of no
 * area. A hall ticked for several areas is in the first of them, and an area with no hall of the ledger is left out.
 */
export const areaTree = (halls: string[], rules?: Pick<HallRules, 'areas'>): AreaNode[] => {
  const left = new Set(halls)
  const nodes: AreaNode[] = []
  for (const area of rules?.areas ?? []) {
    const members = new Set(area.halls.map(lower))
    const own = inOrder([...left].filter((hall) => members.has(lower(hall))))
    for (const hall of own) left.delete(hall)
    if (area.name.trim() && own.length) nodes.push({ name: area.name.trim(), halls: own })
  }
  return left.size ? [...nodes, { name: NO_AREA, halls: inOrder([...left]) }] : nodes
}

/**
 * What the planner has unticked in the Kalender: whole areas, and single halls of the areas that are shown. Kept as
 * what is left out, so a hall that is new in the ledger or in a shown area shows by itself. Stored per browser.
 */
export interface HallFilter {
  areas: string[]
  halls: string[]
}

export const ALL_HALLS: HallFilter = { areas: [], halls: [] }

/** What is valid of a stored filter. */
export const cleanHallFilter = (stored: unknown): HallFilter => {
  const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [])
  const { areas, halls } = (stored ?? {}) as Partial<Record<keyof HallFilter, unknown>>
  return { areas: list(areas), halls: list(halls) }
}

/** The halls of an area that are shown. */
const shownOf = (node: AreaNode, filter: HallFilter): string[] => {
  if (filter.areas.some((name) => lower(name) === lower(node.name))) return []
  const off = new Set(filter.halls.map(lower))
  return node.halls.filter((hall) => !off.has(lower(hall)))
}

/** The halls that are shown, by area in the order of the tree. */
export const shownHalls = (tree: AreaNode[], filter: HallFilter): string[] => tree.flatMap((node) => shownOf(node, filter))

/** How much of an area is shown. */
export const areaShown = (node: AreaNode, filter: HallFilter): 'all' | 'some' | 'none' => {
  const shown = shownOf(node, filter).length
  return shown === 0 ? 'none' : shown === node.halls.length ? 'all' : 'some'
}

/** The filter with these halls of the area shown and the rest of them not. An area with none shown is unticked as a whole. */
const withShown = (filter: HallFilter, node: AreaNode, shown: Set<string>): HallFilter => {
  const own = new Set(node.halls.map(lower))
  const areas = filter.areas.filter((name) => lower(name) !== lower(node.name))
  const halls = filter.halls.filter((hall) => !own.has(lower(hall)))
  return shown.size ? { areas, halls: [...halls, ...node.halls.filter((hall) => !shown.has(hall))] } : { areas: [...areas, node.name], halls }
}

/** The filter with a whole area ticked or unticked. */
export const withAreaShown = (filter: HallFilter, node: AreaNode, show: boolean): HallFilter => withShown(filter, node, new Set(show ? node.halls : []))

/** The filter with one hall ticked or unticked. */
export const withHallShown = (tree: AreaNode[], filter: HallFilter, hall: string, show: boolean): HallFilter => {
  const node = tree.find((other) => other.halls.includes(hall))
  if (!node) return filter
  const shown = new Set(shownOf(node, filter))
  if (show) shown.add(hall)
  else shown.delete(hall)
  return withShown(filter, node, shown)
}

/**
 * The projects that are out of sight with the halls shown: those with hall bookings, none of them in a shown hall.
 * A project without a booking has no hall to be left out by. `hallsOf` gives the halls each project has booked.
 */
export const projectsOutside = (hallsOf: Map<string, Iterable<string>>, shown: string[]): Set<string> => {
  const seen = new Set(shown)
  const outside = new Set<string>()
  for (const [project, halls] of hallsOf) {
    const booked = [...halls]
    if (booked.length && !booked.some((hall) => seen.has(hall))) outside.add(project)
  }
  return outside
}

/** The areas with one under another name. The same list where the name is empty or another area has it. */
export const withAreaRenamed = (areas: Area[], index: number, to: string): Area[] => {
  const name = to.trim()
  if (!name || areas.some((area, at) => at !== index && lower(area.name) === lower(name))) return areas
  return areas.map((area, at) => (at === index ? { ...area, name } : area))
}
