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
    const { data, error } = await supabase().from('records').select('kind, id, data, deleted, rev, batch_id, updated_by').eq('workspace_id', workspaceId).gt('rev', after).order('rev').limit(limit)
    if (error) throw error
    return (data as RemoteRow[]).map((row) => ({ ...row, rev: Number(row.rev) }))
  },
})

/**
 * A word between the computers in a workspace that one of them has written: the others then read at once rather than
 * at their next look. The word carries nothing; what was written is read from the shared copy, under its rules.
 */
export const liveChannel = (workspaceId: string, onWritten: () => void) => {
  const channel = supabase().channel(`workspace:${workspaceId}`, { config: { broadcast: { self: false } } })
  channel.on('broadcast', { event: 'written' }, onWritten).subscribe()
  return {
    say: () => void channel.send({ type: 'broadcast', event: 'written', payload: {} }),
    close: () => void supabase().removeChannel(channel),
  }
}
