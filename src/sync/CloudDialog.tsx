import { useState } from 'react'
import { useCloud } from './CloudProvider'
import { Members } from './Members'
import { syncText } from './syncText'

/** Signing in to the shared workspace, and out of it: from ⚙ › Data › Skyen. */
export function CloudDialog({ onClose }: { onClose: () => void }) {
  const cloud = useCloud()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const act = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /** Says how many writes would be lost, and asks, where some are not sent yet. */
  const losing = async (what: string) => {
    const n = await cloud.waiting()
    return n === 0 || confirm(`${n} endringer er ikke sendt til skyen ennå og går tapt hvis du ${what}. Fortsette?`)
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2>Skyen</h2>
        {!cloud.email ? (
          sent ? (
            <p className="hint">Sjekk e-posten til {email}: lenken der logger deg inn i denne nettleseren.</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (email.includes('@')) act(() => cloud.signIn(email.trim()).then(() => setSent(true)))
              }}
            >
              <p className="hint">Logg inn for å arbeide i det delte arbeidsområdet, det samme på alle maskiner. Du får en lenke på e-post. Uten innlogging arbeider du i nettleserens egne data, som før.</p>
              <label>
                E-post
                <input type="email" value={email} autoFocus onChange={(e) => setEmail(e.target.value)} />
              </label>
              <div className="dialog-actions">
                <button type="button" onClick={onClose}>
                  Avbryt
                </button>
                <button type="submit" className="primary" disabled={busy || !email.includes('@')}>
                  Send lenke
                </button>
              </div>
            </form>
          )
        ) : (
          <>
            <p className="hint">
              Logget inn som <b>{cloud.email}</b>
              {cloud.shared ? (
                <>
                  , i <b>{cloud.shared.name}</b>. {cloud.state ? syncText(cloud.state) : ''}
                </>
              ) : (
                '.'
              )}
            </p>
            {cloud.noMembership && <p className="hint">Du er ikke lagt til i et arbeidsområde ennå. Til da arbeider du i nettleserens egne data.</p>}
            {cloud.shared && <Members workspaceId={cloud.shared.id} me={cloud.userId} />}
            {cloud.shared && (
              <p className="hint">
                Endringene lagres i nettleseren først og sendes til skyen så snart det er nett. Nettleserens egne data fra før innlogging ligger urørt og kommer tilbake når du logger ut.
              </p>
            )}
            <div className="dialog-actions wrap">
              {cloud.shared && (
                <button type="button" disabled={busy} title="Sletter kopien i denne nettleseren og henter alt fra skyen igjen" onClick={async () => (await losing('henter på nytt')) && act(cloud.readAgain)}>
                  Hent alt på nytt
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => act(() => cloud.signOut(false).then(onClose))}>
                Logg ut
              </button>
              {cloud.shared && (
                <button type="button" className="danger" disabled={busy} title="For en maskin som ikke er din egen" onClick={async () => (await losing('logger ut')) && act(() => cloud.signOut(true).then(onClose))}>
                  Logg ut og fjern data fra denne nettleseren
                </button>
              )}
              <button type="button" onClick={onClose}>
                Lukk
              </button>
            </div>
          </>
        )}
        {error && <p className="issue">{error}</p>}
      </div>
    </div>
  )
}
