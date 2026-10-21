import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { RemoteRow, SharedCopy } from './engine'

/**
 * The Supabase project of the shared copy. Its address and publishable key are meant to sit in the page: what a
 * signed-in planner may read and write is decided by the rules of the database (`supabase/schema.sql`), not by the key.
 * Without them the app is what it was: one browser's own.
 */
const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined

export const cloudConfigured = !!(URL && KEY)

let client: SupabaseClient | null = null

export const supabase = (): SupabaseClient => {
  client ??= createClient(URL!, KEY!, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } })
  return client
}

/** The shared copy of a workspace, through Supabase. */
export const supabaseCopy = (workspaceId: string): SharedCopy => ({
  push: async (batch, records) => {
    const { data, error } = await supabase().rpc('push_records', { p_workspace: workspaceId, p_batch: batch, p_records: records })
    if (error) throw error
    return (data as { kind: string; id: string; rev: number; overwritten_by: string | null }[]).map((row) => ({ ...row, rev: Number(row.rev) }))
  },
  pull: async (after, limit) => {
    const { data, error } = await supabase().from('records').select('kind, id, data, deleted, rev, batch_id, updated_by, updated_at').eq('workspace_id', workspaceId).gt('rev', after).order('rev').limit(limit)
    if (error) throw error
    return (data as RemoteRow[]).map((row) => ({ ...row, rev: Number(row.rev) }))
  },
})

/**
 * A word between the computers in a workspace that one of them has written: the others then read at once rather than
 * at their next look. The word carries nothing; what was written is read from the shared copy, under its rules.
 */
export const liveChannel = (workspaceId: string, me: { id: string; email: string }, onWritten: () => void, onPresent: (emails: string[]) => void) => {
  const channel = supabase().channel(`workspace:${workspaceId}`, { config: { broadcast: { self: false }, presence: { key: me.id } } })
  channel
    .on('broadcast', { event: 'written' }, onWritten)
    // Who has the workspace open now, each once however many windows they have open.
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{ email: string }>()
      onPresent([...new Set(Object.values(state).flatMap((entries) => entries.map((entry) => entry.email)))].sort())
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') void channel.track({ email: me.email })
    })
  return {
    say: () => void channel.send({ type: 'broadcast', event: 'written', payload: {} }),
    close: () => void supabase().removeChannel(channel),
  }
}

/** The members of a workspace (`supabase/002_members.sql`). */
export const members = {
  list: async (workspaceId: string): Promise<{ user_id: string; email: string }[]> => {
    const { data, error } = await supabase().rpc('list_members', { p_workspace: workspaceId })
    if (error) throw error
    return data as { user_id: string; email: string }[]
  },
  add: async (workspaceId: string, email: string): Promise<'added' | 'already' | 'not-signed-in'> => {
    const { data, error } = await supabase().rpc('add_member', { p_workspace: workspaceId, p_email: email })
    if (error) throw error
    return data as 'added' | 'already' | 'not-signed-in'
  },
  remove: async (workspaceId: string, userId: string): Promise<void> => {
    const { error } = await supabase().rpc('remove_member', { p_workspace: workspaceId, p_user: userId })
    if (error) throw error
  },
}
