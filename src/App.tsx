import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SETTINGS, type Workspace } from './domain/types'
import { withVenueImport } from './domain/venueImport'
import { withVismaImports } from './domain/visma'
import { readVenyouExport } from './import/venyouExport'
import { importWorkbookFile } from './import/importWorkbook'
import { parseBackup, toBackup } from './store/backup'
import { useWorkspace, WorkspaceProvider } from './store/workspaceStore'
import { Behov } from './ui/behov/Behov'
import { Haller } from './ui/haller/Haller'
import { Kpi } from './ui/kpi/Kpi'
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

const emptyWorkspace = (): Workspace => ({
  settings: DEFAULT_SETTINGS,
  venue: [],
  projects: [],
  demand: [],
  allocations: [],
  capacity: [],
  overrides: {},
  hiddenVenue: {},
  visma: [],
})

function Shell() {
  const { status, workspace, saveState, replaceWorkspace, importVenue, undo, redo } = useWorkspace()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [venueResult, setVenueResult] = useState<ReturnType<typeof importVenue> | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [view, setView] = useState<'kalender' | 'behov' | 'haller' | 'kpi'>('kalender')
  const [behovProject, setBehovProject] = useState('')
  const workbookInput = useRef<HTMLInputElement>(null)
  const backupInput = useRef<HTMLInputElement>(null)
  const venyouInput = useRef<HTMLInputElement>(null)

  // Undo and redo work anywhere on the page, except while typing in a field (which has its own undo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      e.preventDefault()
      if (key === 'y' || e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

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
      // Visma and Venyou exports, KPI data and decisions made in the app outlive a new workbook import.
      // Which hall bookings to show is decided in the app once a workbook has been read; the workbook's «Exclude» column only seeds it.
      await replaceWorkspace(workspace ? { ...withVenueImport(withVismaImports(imported, workspace), workspace), hiddenVenue: Object.keys(workspace.hiddenVenue ?? {}).length ? workspace.hiddenVenue : imported.hiddenVenue } : imported)
    })

  const importVenyou = (file: File) =>
    run('Leser Venyou-filen …', async () => {
      setVenueResult(importVenue(readVenyouExport(new Uint8Array(await file.arrayBuffer())), file.name))
      setView('kalender')
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
            <button className={view === 'haller' ? 'active' : ''} onClick={() => setView('haller')}>
              Haller
            </button>
            <button className={view === 'kpi' ? 'active' : ''} onClick={() => setView('kpi')}>
              KPI
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
        {workspace && (
          <button onClick={() => venyouInput.current?.click()} title={workspace.venueImport ? `Sist: ${workspace.venueImport.fileName}, ${new Date(workspace.venueImport.importedAt).toLocaleString('nb-NO')}` : 'Les inn location_format fra Venyou'}>
            Oppdater haller (Venyou)
          </button>
        )}
        <button onClick={() => workbookInput.current?.click()}>Importer arbeidsbok</button>
        {workspace && <button onClick={exportBackup}>Last ned sikkerhetskopi</button>}
        <button onClick={() => backupInput.current?.click()}>Gjenopprett</button>
        {workspace && <button onClick={() => setSettingsOpen(true)}>Innstillinger</button>}
        <input ref={workbookInput} type="file" accept=".xlsx" hidden onChange={(e) => pickFile(e, importWorkbook)} />
        <input ref={venyouInput} type="file" accept=".xlsx" hidden onChange={(e) => pickFile(e, importVenyou)} />
        <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={(e) => pickFile(e, restoreBackup)} />
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Lukk</button>
        </div>
      )}

      {venueResult && (
        <div className="info-banner" role="status">
          <strong>Hallkalenderen er oppdatert</strong> for {venueResult.from} til {venueResult.to}: {venueResult.added.length} nye arrangementer, {venueResult.changed.length} endret,{' '}
          {venueResult.removed.length} borte, {venueResult.unchanged} uendret. Kan angres med Ctrl/Cmd+Z.{' '}
          <button className="link" onClick={() => setVenueResult(null)}>
            Lukk
          </button>
          {venueResult.added.length + venueResult.changed.length + venueResult.removed.length > 0 && (
            <details>
              <summary>Vis hva som er endret</summary>
              {(['added', 'changed', 'removed'] as const).map(
                (kind) =>
                  venueResult[kind].length > 0 && (
                    <p key={kind}>
                      <strong>{{ added: 'Nye', changed: 'Endret hall eller datoer', removed: 'Ikke lenger i Venyou' }[kind]}:</strong> {venueResult[kind].join(' · ')}
                    </p>
                  ),
              )}
            </details>
          )}
        </div>
      )}

      {status === 'loading' && <p className="center muted">Åpner …</p>}
      {status === 'empty' && (
        <div className="empty-state">
          <h2>Kom i gang</h2>
          <p>
            Start med blanke ark og les inn kildene hver for seg: hallbookinger fra Venyou (<code>location_format</code>), KPI-oppsettet og Visma-utskrifter. Kalenderen følger perioden i
            hallbookingene.
          </p>
          <p className="muted">
            Du kan også hente alt fra planleggingsarbeidsboken (<code>Bemanning_Behov_24 måneder.xlsx</code>) én gang. Filer leses bare i nettleseren og sendes ingen steder.
          </p>
          <div className="empty-actions">
            <button className="primary" onClick={() => run('Oppretter …', () => replaceWorkspace(emptyWorkspace()))} disabled={!!busy}>
              Start uten arbeidsbok
            </button>
            <button onClick={() => workbookInput.current?.click()} disabled={!!busy}>
              Importer arbeidsbok …
            </button>
            <button onClick={() => backupInput.current?.click()} disabled={!!busy}>
              Gjenopprett sikkerhetskopi …
            </button>
          </div>
        </div>
      )}
      {status === 'ready' && workspace && view === 'kalender' && <Kalender key={workspace.importedFrom?.importedAt ?? 'ws'} />}
      {status === 'ready' && workspace && view === 'haller' && <Haller />}
      {status === 'ready' && workspace && view === 'kpi' && <Kpi />}
      {status === 'ready' && workspace && view === 'behov' && <Behov projectNo={behovProject} onProjectChange={setBehovProject} onOpenKpi={() => setView('kpi')} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
