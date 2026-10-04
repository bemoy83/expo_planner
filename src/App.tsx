import { useRef, useState } from 'react'
import { withVismaImports } from './domain/visma'
import { importWorkbookFile } from './import/importWorkbook'
import { parseBackup, toBackup } from './store/backup'
import { useWorkspace, WorkspaceProvider } from './store/workspaceStore'
import { Behov } from './ui/behov/Behov'
import { Kalender } from './ui/kalender/Kalender'
import { SettingsDialog } from './ui/SettingsDialog'

export default function App() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  )
}

const pickFile = (e: React.ChangeEvent<HTMLInputElement>, handle: (file: File) => unknown) => {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (file) handle(file)
}

function Shell() {
  const { status, workspace, saveState, replaceWorkspace } = useWorkspace()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [view, setView] = useState<'kalender' | 'behov'>('kalender')
  const [behovProject, setBehovProject] = useState('')
  const workbookInput = useRef<HTMLInputElement>(null)
  const backupInput = useRef<HTMLInputElement>(null)

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try {
      await task()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const importWorkbook = (file: File) =>
    run('Leser arbeidsboken …', async () => {
      if (workspace && !confirm('Dette erstatter all planlegging i nettleseren med innholdet i arbeidsboken. Fortsette?')) return
      const imported = await importWorkbookFile(file)
      // Visma exports, KPI data and decisions made in the app outlive a new workbook import.
      await replaceWorkspace(workspace ? withVismaImports(imported, workspace) : imported)
    })

  const restoreBackup = (file: File) =>
    run('Gjenoppretter …', async () => {
      const restored = parseBackup(await file.text())
      if (workspace && !confirm('Dette erstatter all planlegging i nettleseren med sikkerhetskopien. Fortsette?')) return
      await replaceWorkspace(restored)
    })

  const exportBackup = () => {
    if (!workspace) return
    const blob = new Blob([JSON.stringify(toBackup(workspace))], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `expo-planner-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Expo Planner</h1>
        {status === 'ready' && (
          <nav className="tabs">
            <button className={view === 'kalender' ? 'active' : ''} onClick={() => setView('kalender')}>
              Kalender
            </button>
            <button className={view === 'behov' ? 'active' : ''} onClick={() => setView('behov')}>
              Behov
            </button>
          </nav>
        )}
        {workspace?.importedFrom && (
          <span className="muted small" title={`Importert ${new Date(workspace.importedFrom.importedAt).toLocaleString('nb-NO')}`}>
            fra {workspace.importedFrom.fileName}
          </span>
        )}
        <span className="toolbar-gap" />
        {busy && <span className="busy">{busy}</span>}
        {status === 'ready' && <span className={`save-state ${saveState}`}>{saveState === 'saving' ? 'Lagrer …' : saveState === 'error' ? 'Lagring feilet' : 'Lagret i nettleseren'}</span>}
        <button onClick={() => workbookInput.current?.click()}>Importer arbeidsbok</button>
        {workspace && <button onClick={exportBackup}>Last ned sikkerhetskopi</button>}
        <button onClick={() => backupInput.current?.click()}>Gjenopprett</button>
        {workspace && <button onClick={() => setSettingsOpen(true)}>Innstillinger</button>}
        <input ref={workbookInput} type="file" accept=".xlsx" hidden onChange={(e) => pickFile(e, importWorkbook)} />
        <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={(e) => pickFile(e, restoreBackup)} />
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Lukk</button>
        </div>
      )}

      {status === 'loading' && <p className="center muted">Åpner …</p>}
      {status === 'empty' && (
        <div className="empty-state">
          <h2>Kom i gang</h2>
          <p>
            Importer planleggingsarbeidsboken (<code>Bemanning_Behov_24 måneder.xlsx</code>). Haller, prosjekter, behovstabellen, bemanning og all planlegging i
            Kalender-arket hentes inn. Arbeidsboken leses bare i nettleseren og sendes ingen steder.
          </p>
          <button className="primary" onClick={() => workbookInput.current?.click()} disabled={!!busy}>
            Velg arbeidsbok …
          </button>
        </div>
      )}
      {status === 'ready' && workspace && view === 'kalender' && <Kalender key={workspace.importedFrom?.importedAt ?? 'ws'} />}
      {status === 'ready' && workspace && view === 'behov' && <Behov projectNo={behovProject} onProjectChange={setBehovProject} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
