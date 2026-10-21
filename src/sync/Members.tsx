import { useCallback, useEffect, useState } from 'react'
import { members, type Member } from './client'

/** The members of the shared workspace, in «Skyen»: who they are, and for its owner adding one by e-mail and taking one out. */
export function Members({ workspaceId, me }: { workspaceId: string; me: string | null }) {
  const [list, setList] = useState<Member[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(
    () =>
      members.list(workspaceId).then(
        // Without supabase/003_owner_and_channel.sql, no member owns the workspace.
        (rows) => (rows.length && rows[0].owner === undefined ? setMissing(true) : setList(rows)),
        (error: { code?: string; message?: string }) => {
          // The functions are not there before supabase/002_members.sql has been run.
          if (error.code === 'PGRST202' || /function/i.test(error.message ?? '')) setMissing(true)
          else setMessage(error.message ?? String(error))
        },
      ),
    [workspaceId],
  )
  useEffect(() => {
    void load()
  }, [load])

  if (missing) return <p className="hint">Medlemmer styres herfra når <code>supabase/002_members.sql</code> og <code>003_owner_and_channel.sql</code> er kjørt i Supabase.</p>
  // The owner alone adds and takes out members.
  const owner = !!list?.some((member) => member.user_id === me && member.owner)
  return (
    <section className="members">
      <h3>Medlemmer</h3>
      <ul>
        {list?.map((member) => (
          <li key={member.user_id}>
            <span>
              {member.email}
              {member.owner && <span className="muted"> · eier</span>}
            </span>
            {owner && member.user_id !== me && (
              <button
                type="button"
                className="link"
                onClick={async () => {
                  if (!confirm(`Ta ${member.email} ut av arbeidsområdet? De mister tilgangen med en gang.`)) return
                  await members.remove(workspaceId, member.user_id).catch((error: { message?: string }) => setMessage(error.message ?? String(error)))
                  await load()
                }}
              >
                Ta ut
              </button>
            )}
          </li>
        ))}
      </ul>
      {owner && (
        <form
          className="members-add"
          onSubmit={async (e) => {
            e.preventDefault()
            const result = await members.add(workspaceId, email.trim()).catch((error: { message?: string }) => {
              setMessage(error.message ?? String(error))
              return null
            })
            if (!result) return
            setMessage(
              result === 'added'
                ? `${email.trim()} er lagt til, og ser arbeidsområdet neste gang de åpner appen.`
                : result === 'already'
                  ? `${email.trim()} er allerede med.`
                  : `${email.trim()} har ingen bruker ennå. Opprett den i Supabase under Authentication › Users › «Invite user», og legg dem til her etterpå.`,
            )
            if (result === 'added') setEmail('')
            await load()
          }}
        >
          <input type="email" placeholder="E-post" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" disabled={!email.includes('@')}>
            Legg til
          </button>
        </form>
      )}
      {message && <p className="hint">{message}</p>}
    </section>
  )
}
