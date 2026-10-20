import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { deleteDatabase, LOCAL_DB, notePlanner, onWritten, pendingOutbox, plannerNames, sharedDbName, switchDatabase } from '../store/db'
import { useWorkspace } from '../store/workspaceStore'
import { count } from '../ui/dom'
import { Toasts, useToasts } from '../ui/Toasts'
import { cloudConfigured, liveChannel, supabase, supabaseCopy } from './client'
import { startEngine, type SyncState } from './engine'

interface SharedWorkspace {
  id: string
  name: string
}

interface Cloud {
  /** The app has a Supabase project to sync with. */
  configured: boolean
  /** The e-mail of the planner signed in, and their id. */
  email: string | null
  userId: string | null
  /** The shared workspace open; none when signed out, or signed in without being a member yet. */
  shared: SharedWorkspace | null
  /** Signed in, but not yet added to a workspace. */
  noMembership: boolean
  state: SyncState | null
  /** The shared workspace has been read once since it was opened, so what it holds is known. */
  read: boolean
  signIn: (email: string) => Promise<void>
  /** Signs out; with `forget`, the shared workspace's copy in this browser is deleted too. */
  signOut: (forget: boolean) => Promise<void>
  /** Deletes this browser's copy of the shared workspace and reads it all again. */
  readAgain: () => Promise<void>
  /** Writes not yet sent. */
  waiting: () => Promise<number>
}

const Context = createContext<Cloud | null>(null)
const SyncContext = createContext<{ state: SyncState | null; read: boolean; setState: (state: SyncState) => void } | null>(null)

/**
 * The planner's sign-in and the shared workspace they open. Signed in to a workspace, the app works in its own
 * database in the browser, which is kept in step with the shared copy; signed out, in this browser's own, as before.
 * The children are drawn again from the start when that changes.
 */
export function CloudProvider({ children }: { children: (database: string) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  /** The session has been read from the browser, so it is known whether someone is signed in. */
  const [authKnown, setAuthKnown] = useState(false)
  /** The workspace found for a signed-in planner, by their id. */
  const [membership, setMembership] = useState<{ userId: string; shared: SharedWorkspace | null } | null>(null)
  /** How the sync of a database stands, by its name. */
  const [sync, setSync] = useState<{ database: string; state: SyncState | null; read: boolean }>({ database: '', state: null, read: false })

  useEffect(() => {
    if (!cloudConfigured) return
    const auth = supabase().auth
    auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthKnown(true)
    })
    const { data } = auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  // The workspace the planner is a member of: there is one in the proof of concept.
  const userId = session?.user.id
  useEffect(() => {
    if (!cloudConfigured || !userId) return
    supabase()
      .from('workspaces')
      .select('id, name')
      .limit(1)
      .then(({ data }) => setMembership({ userId, shared: (data as SharedWorkspace[] | null)?.[0] ?? null }))
  }, [userId])

  const found = userId && membership?.userId === userId ? membership : null
  const shared = found?.shared ?? null
  const noMembership = !!found && !found.shared
  // Known once there is no planner signed in, or the workspace of the one who is has been looked up.
  const ready = !cloudConfigured || (authKnown && (!session || !!found))
  const database = shared ? sharedDbName(shared.id) : LOCAL_DB
  switchDatabase(database)
  const state = sync.database === database ? sync.state : null
  const read = sync.database === database && sync.read
  const setState = useCallback((next: SyncState) => setSync((now) => ({ database, state: next, read: now.database === database && (now.read || next === 'synced') })), [database])

  const signIn = useCallback(async (email: string) => {
    const { error } = await supabase().auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href.split('#')[0].split('?')[0] } })
    if (error) throw error
  }, [])

  const signOut = useCallback(
    async (forget: boolean) => {
      const name = shared ? sharedDbName(shared.id) : null
      await supabase().auth.signOut()
      if (forget && name) {
        switchDatabase(LOCAL_DB)
        await deleteDatabase(name)
      }
    },
    [shared],
  )

  const readAgain = useCallback(async () => {
    if (!shared) return
    switchDatabase(LOCAL_DB)
    await deleteDatabase(sharedDbName(shared.id))
    window.location.reload()
  }, [shared])

  const waiting = useCallback(async () => (shared ? (await pendingOutbox()).length : 0), [shared])

  const value: Cloud = { configured: cloudConfigured, email: session?.user.email ?? null, userId: session?.user.id ?? null, shared, noMembership, state, read, signIn, signOut, readAgain, waiting }
  return (
    <Context.Provider value={value}>
      <SyncContext.Provider value={{ state, read, setState }}>{ready ? children(database) : <p className="center muted">Åpner …</p>}</SyncContext.Provider>
    </Context.Provider>
  )
}

/** The planners' e-mails for their ids, «en annen» for one this browser has not heard of. */
const namesOf = async (ids: string[]): Promise<string> => {
  const names = await plannerNames()
  const all = [...new Set(ids.map((id) => names.get(id) ?? 'en annen'))]
  return all.length > 1 ? `${all.slice(0, -1).join(', ')} og ${all[all.length - 1]}` : all[0]
}

/**
 * Keeps the open shared workspace in step with the shared copy, and tells the planner when their work met another
 * planner's: a write that replaced what someone had just changed, and an undo that left what someone changed since.
 * Inside the workspace's provider.
 */
export function SharedSync() {
  const cloud = useCloud()
  const { setState } = useContext(SyncContext)!
  const { applyRemote, setOnLeft } = useWorkspace()
  const { toasts, show, dismiss } = useToasts()
  const id = cloud.shared?.id
  const me = cloud.userId
  const email = cloud.email
  useEffect(() => {
    if (!id || !me || !email) return
    notePlanner(me, email)
    const live = liveChannel(id, () => engine.now())
    const engine = startEngine(supabaseCopy(id), {
      remote: applyRemote,
      state: setState,
      sent: live.say,
      overwritten: async (by) => show(`Du endret noe ${await namesOf(by)} nettopp hadde endret. Din endring gjelder.`),
    })
    const off = onWritten(engine.nudge)
    setOnLeft(async (left, by) => show(`${count(left, 'endring', 'endringer')} ble ikke angret: endret ${by.length ? `av ${await namesOf(by)}` : 'i et annet vindu'} etterpå.`))
    return () => {
      off()
      setOnLeft(null)
      engine.stop()
      live.close()
    }
  }, [id, me, email, applyRemote, setOnLeft, setState, show])
  return <Toasts toasts={toasts} onDismiss={dismiss} />
}

// eslint-disable-next-line react-refresh/only-export-components
export const useCloud = (): Cloud => {
  const cloud = useContext(Context)
  if (!cloud) throw new Error('useCloud must be used inside CloudProvider')
  return cloud
}
