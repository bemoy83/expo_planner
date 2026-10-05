import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SETTINGS, type Workspace } from './domain/types'
import { withVenueImport } from './domain/venueImport'
import { withVismaImports } from './domain/visma'
import { readVenyouExport } from './import/venyouExport'
import { importWorkbookFile } from './import/importWorkbook'
import { parseBackup, toBackup } from './store/backup'
import { usePref } from './store/prefs'
import { useSaveState, useWorkspace, WorkspaceProvider } from './store/workspaceStore'
import { Behov } from './ui/behov/Behov'
import { Haller } from './ui/haller/Haller'
import { Kpi } from './ui/kpi/Kpi'
import { Produkttyper } from './ui/kpi/Produkttyper'
import { Kalender } from './ui/kalender/Kalender'
import { errorText, takeFile } from './ui/files'
import { SettingsDialog } from './ui/SettingsDialog'
import { Tooltips } from './ui/Tooltips'

export default function App() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  )
}

const TABS = [
  ['kalender', 'Kalender'],
  ['behov', 'Behov'],
  ['haller', 'Haller'],
  ['produkttyper', 'Produkttyper'],
  ['kpi', 'KPI'],
] as const
type View = (typeof TABS)[number][0]

/** Its own component, so that saving an edit does not render the tabs again. */
function SaveIndicator() {
  const saveState = useSaveState()
  return <span className={`save-state ${saveState}`}>{saveState === 'saving' ? 'Lagrer …' : saveState === 'error' ? 'Lagring feilet' : 'Lagret i nettleseren'}</span>
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
  eventLinks: {},
  hallAliases: {},
  visma: [],
})

function Shell() {
  const { status, workspace, replaceWorkspace, importVenue, undo, redo } = useWorkspace()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [venueResult, setVenueResult] = useState<ReturnType<typeof importVenue> | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Whether hovering shows help texts. A choice for this browser, like the other view preferences.
  const [tooltips, setTooltips] = usePref('tooltips', true)
  const [view, setView] = useState<View>('kalender')
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
      setError(errorText(e))
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
      await replaceWorkspace(workspace ? { ...withVenueImport(withVismaImports(imported, workspace), workspace), hiddenVenue: Object.keys(workspace.hiddenVenue ?? {}).length ? workspace.hiddenVenue : imported.hiddenVenue, eventLinks: workspace.eventLinks, hallAliases: workspace.hallAliases } : imported)
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
            {TABS.map(([tab, label]) => (
              <button key={tab} className={view === tab ? 'active' : ''} onClick={() => setView(tab)}>
                {label}
              </button>
            ))}
          </nav>
        )}
        {workspace?.importedFrom && (
          <span className="muted small" title={`Importert ${new Date(workspace.importedFrom.importedAt).toLocaleString('nb-NO')}`}>
            fra {workspace.importedFrom.fileName}
          </span>
        )}
        <span className="toolbar-gap" />
        {busy && <span className="busy">{busy}</span>}
        {status === 'ready' && <SaveIndicator />}
        {workspace && (
          <button onClick={() => venyouInput.current?.click()} title={workspace.venueImport ? `Sist: ${workspace.venueImport.fileName}, ${new Date(workspace.venueImport.importedAt).toLocaleString('nb-NO')}` : 'Les inn location_format fra Venyou'}>
            Oppdater haller (Venyou)
          </button>
        )}
        <button onClick={() => workbookInput.current?.click()}>Importer arbeidsbok</button>
        {workspace && <button onClick={exportBackup}>Last ned sikkerhetskopi</button>}
        <button onClick={() => backupInput.current?.click()}>Gjenopprett</button>
        <button className={tooltips ? 'toggle on' : 'toggle'} aria-pressed={tooltips} onClick={() => setTooltips(!tooltips)}>
          Hjelpetekster {tooltips ? 'på' : 'av'}
        </button>
        {workspace && <button onClick={() => setSettingsOpen(true)}>Innstillinger</button>}
        <Tooltips enabled={tooltips} />
        <input ref={workbookInput} type="file" accept=".xlsx" hidden onChange={(e) => takeFile(e, importWorkbook)} />
        <input ref={venyouInput} type="file" accept=".xlsx" hidden onChange={(e) => takeFile(e, importVenyou)} />
        <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={(e) => takeFile(e, restoreBackup)} />
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
      {status === 'ready' && workspace && view === 'produkttyper' && <Produkttyper onOpenKpi={() => setView('kpi')} />}
      {status === 'ready' && workspace && view === 'kpi' && <Kpi onOpenProductTypes={() => setView('produkttyper')} />}
      {status === 'ready' && workspace && view === 'behov' && <Behov projectNo={behovProject} onProjectChange={setBehovProject} onOpenSetup={setView} />}
      {settingsOpen && workspace && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
