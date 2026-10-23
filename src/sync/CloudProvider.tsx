import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { deleteDatabase, LOCAL_DB, setPlanner, notePlanner, onWritten, pendingOutbox, plannerNames, sharedDbName, switchDatabase } from '../store/db'
import { loadPref, savePref } from '../store/prefs'
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
  /** The shared workspace has been read once since it was opened, so what it holds is known. */
  read: boolean
  signIn: (email: string) => Promise<void>
  /** Signs out; with `forget`, the shared workspace's copy in this browser is deleted too. */
  signOut: (forget: boolean) => Promise<void>
  /** Deletes this browser's copy of the shared workspace and reads it all again. */
  readAgain: () => Promise<void>
  /** Writes not yet sent. */
  waiting: () => Promise<number>
  /** Starts the sync again after the shared copy has said no. */
  retry: () => void
}

/** How the sync stands. Kept apart from `Cloud`, since it changes on every look at the shared copy: only what shows it renders again. */
interface SyncStatus {
  state: SyncState | null
  /** What the shared copy said when it said no, and the sync stopped. */
  error: string | null
  /** The e-mails of the planners who have the shared workspace open now, this one among them. */
  present: string[]
}

const Context = createContext<Cloud | null>(null)
const StatusContext = createContext<SyncStatus>({ state: null, error: null, present: [] })
const SyncContext = createContext<{ setState: (state: SyncState, error?: string) => void; setPresent: (emails: string[]) => void; setRetry: (retry: (() => void) | null) => void } | null>(null)

/**
 * The workspace a planner was last found a member of, kept in this browser: a sign-in without the network, or with the
 * shared copy paused, opens it, rather than this browser's own data. It is looked up again at every start.
 */
const KNOWN = (userId: string) => `cloud:workspace:${userId}`
const knownWorkspace = (userId: string): SharedWorkspace | null | undefined => loadPref<SharedWorkspace | null | undefined>(KNOWN(userId), undefined)
const noteWorkspace = (userId: string, shared: SharedWorkspace | null) => savePref(KNOWN(userId), shared)

/** Says in Norwegian why a sign-in link was not sent, where the shared copy said it in English. */
const signInError = (error: { message?: string; code?: string }): Error =>
  new Error(error.code === 'otp_disabled' || /signups? not allowed/i.test(error.message ?? '') ? 'Denne e-posten har ingen bruker i skyen. Be eieren av arbeidsområdet opprette den.' : (error.message ?? String(error)))

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
  const [sync, setSync] = useState<{ database: string; state: SyncState | null; error: string | null; read: boolean }>({ database: '', state: null, error: null, read: false })
  const [presence, setPresence] = useState<{ database: string; emails: string[] }>({ database: '', emails: [] })
  const retryRef = useRef<(() => void) | null>(null)

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

  // The workspace the planner is a member of: there is one in the proof of concept. Where the shared copy does not
  // answer, the one last found in this browser; this browser's own data only where it answers that there is none.
  const userId = session?.user.id ?? null
  useEffect(() => {
    if (!cloudConfigured || !userId) return
    supabase()
      .from('workspaces')
      .select('id, name')
      .limit(1)
      .then(({ data, error }) => {
        if (error || !data) return setMembership({ userId, shared: knownWorkspace(userId) ?? null })
        const shared = (data as SharedWorkspace[])[0] ?? null
        noteWorkspace(userId, shared)
        setMembership({ userId, shared })
      })
  }, [userId])

  const found = userId && membership?.userId === userId ? membership : null
  const shared = found?.shared ?? null
  const noMembership = !!found && !found.shared
  // Known once there is no planner signed in, or the workspace of the one who is has been looked up.
  const ready = !cloudConfigured || (authKnown && (!session || !!found))
  const database = shared ? sharedDbName(shared.id) : LOCAL_DB
  const read = sync.database === database && sync.read

  // The database is chosen before the children are drawn, since they read it as they start.
  const tree = useMemo(() => {
    switchDatabase(database)
    setPlanner(shared ? userId : null)
    return children(database)
  }, [children, database, shared, userId])

  const setPresent = useCallback((emails: string[]) => setPresence((now) => (now.database === database && now.emails.join() === emails.join() ? now : { database, emails })), [database])
  const setState = useCallback(
    (state: SyncState, error?: string) =>
      setSync((now) => {
        const next = { database, state, error: error ?? null, read: now.database === database && (now.read || state === 'synced') }
        return now.database === next.database && now.state === next.state && now.error === next.error && now.read === next.read ? now : next
      }),
    [database],
  )
  const setRetry = useCallback((retry: (() => void) | null) => {
    retryRef.current = retry
  }, [])

  const signIn = useCallback(async (email: string) => {
    // Planners are made by the owner in the dashboard: a link is sent only to an e-mail that has a user.
    const { error } = await supabase().auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: window.location.href.split('#')[0].split('?')[0] } })
    if (error) throw signInError(error)
  }, [])

  const signOut = useCallback(
    async (forget: boolean) => {
      const name = shared ? sharedDbName(shared.id) : null
      await supabase().auth.signOut()
      if (forget && name) {
        if (userId) noteWorkspace(userId, null)
        switchDatabase(LOCAL_DB)
        await deleteDatabase(name)
      }
    },
    [shared, userId],
  )

  const readAgain = useCallback(async () => {
    if (!shared) return
    switchDatabase(LOCAL_DB)
    await deleteDatabase(sharedDbName(shared.id))
    window.location.reload()
  }, [shared])

  const waiting = useCallback(async () => (shared ? (await pendingOutbox()).length : 0), [shared])
  const retry = useCallback(() => retryRef.current?.(), [])

  const email = session?.user.email ?? null
  const value = useMemo<Cloud>(
    () => ({ configured: cloudConfigured, email, userId, shared, noMembership, read, signIn, signOut, readAgain, waiting, retry }),
    [email, userId, shared, noMembership, read, signIn, signOut, readAgain, waiting, retry],
  )
  const state = sync.database === database ? sync.state : null
  const error = sync.database === database ? sync.error : null
  const present = presence.database === database ? presence.emails : NOBODY
  const status = useMemo<SyncStatus>(() => ({ state, error, present }), [state, error, present])
  const control = useMemo(() => ({ setState, setPresent, setRetry }), [setState, setPresent, setRetry])
  return (
    <Context.Provider value={value}>
      <StatusContext.Provider value={status}>
        <SyncContext.Provider value={control}>{ready ? tree : <p className="center muted">Åpner …</p>}</SyncContext.Provider>
      </StatusContext.Provider>
    </Context.Provider>
  )
}

const NOBODY: string[] = []

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
  const { setState, setPresent, setRetry } = useContext(SyncContext)!
  const { applyRemote, setOnLeft } = useWorkspace()
  const { toasts, show, dismiss } = useToasts()
  const id = cloud.shared?.id
  const me = cloud.userId
  const email = cloud.email
  useEffect(() => {
    if (!id || !me || !email) return
    notePlanner(me, email)
    const live = liveChannel(id, { id: me, email }, () => engine.now(), setPresent)
    const engine = startEngine(supabaseCopy(id), {
      remote: applyRemote,
      state: setState,
      sent: live.say,
      overwritten: async (by) => show(`Du endret noe ${await namesOf(by)} nettopp hadde endret. Din endring gjelder.`),
    })
    const off = onWritten(engine.nudge)
    setRetry(engine.retry)
    setOnLeft(async (left, by) => show(`${count(left, 'endring', 'endringer')} ble ikke angret: endret ${by.length ? `av ${await namesOf(by)}` : 'i et annet vindu'} etterpå.`))
    return () => {
      off()
      setOnLeft(null)
      setRetry(null)
      engine.stop()
      live.close()
    }
  }, [id, me, email, applyRemote, setOnLeft, setState, setPresent, setRetry, show])
  return <Toasts toasts={toasts} onDismiss={dismiss} />
}

// eslint-disable-next-line react-refresh/only-export-components
export const useCloud = (): Cloud => {
  const cloud = useContext(Context)
  if (!cloud) throw new Error('useCloud must be used inside CloudProvider')
  return cloud
}

/** How the sync stands, and who is in the shared workspace now. */
// eslint-disable-next-line react-refresh/only-export-components
export const useSyncStatus = (): SyncStatus => useContext(StatusContext)
