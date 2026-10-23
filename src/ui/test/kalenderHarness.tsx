import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { expect, vi } from 'vitest'
import type { ISODate } from '../../domain/dates'
import { DEFAULT_SETTINGS, type AllocationRow, type Person, type Workspace } from '../../domain/types'
import { clearAll, saveWorkspace } from '../../store/db'
import { useWorkspace, WorkspaceProvider } from '../../store/workspaceStore'
import { Kalender } from '../kalender/Kalender'

/**
 * A small invented workspace for the component tests of the Kalender: one project, VVS 2026, in hall A1, with
 * build-up on 5 to 7 October 2026, the fair on 8 to 10 and tear-down on 11 to 12, one planning row of FOGA for
 * the build-up, and two of the permanent staff, whose competences are keys (`competenceKey`).
 */
export const TODAY: ISODate = '2026-10-05'
export const ROW: AllocationRow = {
  id: 'row-a',
  order: 0,
  projectName: 'VVS 2026',
  projectNo: '26970',
  refYear: '2026',
  competence: 'FOGA',
  phase: 'Montering',
  basis: 'Planlagt',
  hall: 'A1',
  fte: { '2026-10-06': 2 },
  notes: {},
}
export const PEOPLE: Person[] = [
  { id: 'p1', name: 'Kari Nordmann', order: 0, competences: ['foga'] },
  { id: 'p2', name: 'Ola Nordmann', order: 1, competences: ['foga', 'elektro'] },
]
export const workspaceOf = (patch: Partial<Workspace> = {}): Workspace => ({
  settings: DEFAULT_SETTINGS,
  venue: [{ id: 'v1', hall: 'A1', eventName: 'VVS 2026', status: 'Bekreftet', phases: { assembly: { start: '2026-10-05', end: '2026-10-07' }, event: { start: '2026-10-08', end: '2026-10-10' }, dismantle: { start: '2026-10-11', end: '2026-10-12' } } }],
  projects: [{ name: 'VVS 2026', projectNo: '26970' }],
  demand: [],
  allocations: [ROW],
  hallRules: { places: [], phrases: [], choices: {}, areas: [] },
  persons: PEOPLE,
  competenceStyles: {
    foga: { key: 'foga', label: 'FOGA', shortLabel: 'FOGA', color: 'line-blue', order: 0 },
    elektro: { key: 'elektro', label: 'Elektro', shortLabel: 'EL', color: 'line-amber', order: 1 },
  },
  ...patch,
})

// jsdom lays nothing out, so nothing is ever resized.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// Nor does it give an element a size: the grid is given the size of a window on a laptop.
Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1400 })
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 900 })
// Every element lies at the top left of that window, so a point is measured from there.
HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1400, bottom: 900, width: 1400, height: 900, x: 0, y: 0, toJSON: () => ({}) })

/** The store as it is after the last render, for the test to read the workspace and undo from. */
export let store: ReturnType<typeof useWorkspace>

// eslint-disable-next-line react-refresh/only-export-components
function Spy() {
  const current = useWorkspace()
  useEffect(() => {
    store = current
  })
  return current.workspace ? <Kalender onOpenPersonell={() => {}} onOpenSuppliers={() => {}} /> : null
}

/** Starts the Kalender on the workspace, in the mode given, with today fixed. */
export async function renderKalender(workspace: Workspace = workspaceOf(), prefs: Record<string, unknown> = {}) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${TODAY}T10:00:00`))
  localStorage.clear()
  for (const [key, value] of Object.entries(prefs)) localStorage.setItem(`expo-planner:${key}`, JSON.stringify(value))
  await clearAll()
  await saveWorkspace(workspace)
  const view = render(
    <WorkspaceProvider>
      <Spy />
    </WorkspaceProvider>,
  )
  await waitFor(() => expect(view.container.querySelector('.kalender')).not.toBeNull())
  return view
}

export function cleanupKalender() {
  cleanup()
  vi.useRealTimers()
}

/** The FTE of the row on a day, as stored. */
export const fteOf = (rowId: string, date: ISODate) => store.workspace?.allocations.find((row) => row.id === rowId)?.fte[date]

export { screen }
