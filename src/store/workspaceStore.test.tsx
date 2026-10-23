import 'fake-indexeddb/auto'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { workspaceOf } from '../ui/test/kalenderHarness'
import * as db from './db'
import { diffWorkspace } from './records'
import { useSaveState, useWorkspace, WorkspaceProvider } from './workspaceStore'

/** The store and its save state as they are after the last render. */
let store: ReturnType<typeof useWorkspace>
let saveState: ReturnType<typeof useSaveState>

function Spy() {
  const current = useWorkspace()
  const saving = useSaveState()
  useEffect(() => {
    store = current
    saveState = saving
  })
  return null
}

async function renderStore() {
  await db.clearAll()
  await db.saveWorkspace(workspaceOf())
  render(
    <WorkspaceProvider>
      <Spy />
    </WorkspaceProvider>,
  )
  await waitFor(() => expect(store.status).toBe('ready'))
}

/** The FTE of the row on a day, as the browser database holds it. */
const storedFte = async (date: string) => (await db.loadWorkspace())?.allocations.find((row) => row.id === 'row-a')?.fte[date]
const fte = (date: string) => store.workspace?.allocations.find((row) => row.id === 'row-a')?.fte[date]
/** Lets the step of the event close, as it does when the event is over. */
const endEvent = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))

beforeEach(renderStore)
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('workspace store', () => {
  it('stores an edit, and undoes and redoes it', async () => {
    act(() => store.setAllocationFte('row-a', '2026-10-07', 3))
    await endEvent()
    expect(fte('2026-10-07')).toBe(3)
    await waitFor(async () => expect(await storedFte('2026-10-07')).toBe(3))
    expect(store.canUndo).toBe(true)

    act(() => store.undo())
    expect(fte('2026-10-07')).toBeUndefined()
    await waitFor(async () => expect(await storedFte('2026-10-07')).toBeUndefined())
    expect(store.canRedo).toBe(true)

    act(() => store.redo())
    expect(fte('2026-10-07')).toBe(3)
    await waitFor(async () => expect(await storedFte('2026-10-07')).toBe(3))
  })

  it('makes the edits of one event one undo step', async () => {
    act(() => {
      store.setAllocationFte('row-a', '2026-10-05', 1)
      store.setAllocationFte('row-a', '2026-10-07', 4)
    })
    await endEvent()
    act(() => store.undo())
    expect(fte('2026-10-05')).toBeUndefined()
    expect(fte('2026-10-07')).toBeUndefined()
    expect(store.canUndo).toBe(false)
  })

  it('a new edit after an undo clears what could be redone', async () => {
    act(() => store.setAllocationFte('row-a', '2026-10-07', 3))
    await endEvent()
    act(() => store.undo())
    act(() => store.setAllocationFte('row-a', '2026-10-05', 1))
    await endEvent()
    expect(store.canRedo).toBe(false)
  })

  it('tries a failed write again until it is stored', async () => {
    const real = db.writeRecords
    const writes = vi.spyOn(db, 'writeRecords').mockRejectedValueOnce(new Error('quota')).mockImplementation(real)
    act(() => store.setAllocationFte('row-a', '2026-10-07', 3))
    await waitFor(() => expect(saveState).toBe('error'))
    expect(await storedFte('2026-10-07')).toBeUndefined()
    await waitFor(async () => expect(await storedFte('2026-10-07')).toBe(3), { timeout: 3000 })
    await waitFor(() => expect(saveState).toBe('saved'))
    expect(writes).toHaveBeenCalledTimes(2)
  })

  it('a failed write does not overwrite a later write of the same record', async () => {
    const real = db.writeRecords
    vi.spyOn(db, 'writeRecords').mockRejectedValueOnce(new Error('quota')).mockImplementation(real)
    act(() => store.setAllocationFte('row-a', '2026-10-07', 3))
    await waitFor(() => expect(saveState).toBe('error'))
    await endEvent()
    act(() => store.setAllocationFte('row-a', '2026-10-07', 5))
    await waitFor(async () => expect(await storedFte('2026-10-07')).toBe(5))
    // The retry finds nothing left of the failed batch to write, so the later value stays.
    await act(() => new Promise((resolve) => setTimeout(resolve, 1200)))
    expect(await storedFte('2026-10-07')).toBe(5)
  })

  it('takes in a change from elsewhere without making it a step of undo', async () => {
    const ws = store.workspace!
    const deltas = diffWorkspace(ws, { ...ws, settings: { ...ws.settings, overhead: 25 } })
    act(() => store.applyRemote(deltas.map((d) => ({ ...d, by: 'other' }))))
    expect(store.workspace?.settings.overhead).toBe(25)
    expect(store.canUndo).toBe(false)
  })

  it('leaves on undo what another planner has changed since, and says so', async () => {
    const left = vi.fn()
    act(() => store.setOnLeft(left))
    act(() => store.setAllocationFte('row-a', '2026-10-07', 3))
    await endEvent()
    const ws = store.workspace!
    const theirs = { ...ws, allocations: ws.allocations.map((row) => ({ ...row, fte: { ...row.fte, '2026-10-07': 6 } })) }
    act(() => store.applyRemote(diffWorkspace(ws, theirs).map((d) => ({ ...d, by: 'other' }))))
    act(() => store.undo())
    expect(fte('2026-10-07')).toBe(6)
    expect(left).toHaveBeenCalledWith(1, ['other'])
  })

  it('holds what comes from elsewhere while the mouse is down, and takes it in when it is let go', async () => {
    const ws = store.workspace!
    const deltas = diffWorkspace(ws, { ...ws, settings: { ...ws.settings, overhead: 25 } })
    window.dispatchEvent(new Event('pointerdown'))
    act(() => store.applyRemote(deltas))
    expect(store.workspace?.settings.overhead).not.toBe(25)
    act(() => {
      window.dispatchEvent(new Event('pointerup'))
    })
    await endEvent()
    expect(store.workspace?.settings.overhead).toBe(25)
  })
})
