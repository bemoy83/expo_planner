import { useEffect, useRef, useState } from 'react'
import { todayIso } from './domain/dates'
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
import { Bemanning } from './ui/bemanning/Bemanning'
import { Personell } from './ui/personell/Personell'
import { Kalender } from './ui/kalender/Kalender'
import { Menu, Segmented } from './ui/common'
import { isTyping } from './ui/dom'
import { errorText, takeFile } from './ui/files'
import { SettingsDialog } from './ui/SettingsDialog'
import { Tooltips } from './ui/Tooltips'
import { RefreshCw, Settings } from 'lucide-react'

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
  ['bemanning', 'Bemanning'],
  ['haller', 'Haller'],
  ['produkttyper', 'Produkttyper'],
  ['kpi', 'KPI'],
  ['personell', 'Personell'],
] as const
type View = (typeof TABS)[number][0]

/** Its own component, so that saving an edit does not render the tabs again. */
function SaveIndicator() {
  const saveState = useSaveState()
  return (
    <span className={`save-state ${saveState}`} title={saveState === 'saved' ? 'Lagret i nettleseren' : undefined}>
      <i />
      {saveState === 'saving' ? 'Lagrer …' : saveState === 'error' ? 'Lagring feilet' : 'Lagret'}
    </span>
  )
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
  const { status, workspace, replaceWorkspace, resetWorkspace, importVenue, updateStaffing, undo, redo } = useWorkspace()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [venueResult, setVenueResult] = useState<ReturnType<typeof importVenue> | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Whether hovering shows help texts. A choice for this browser, like the other view preferences.
  const [tooltips, setTooltips] = usePref('tooltips', true)
  // Whether the Avvik line of the Kalender is drawn as a heat map.
  const [heat, setHeat] = usePref('heat', true)
  // Light or dark, also a choice for this browser. main.tsx sets it before the first paint.
  const [theme, setTheme] = usePref<'light' | 'dark'>('theme', 'light')
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
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
      if (isTyping(e.target)) return
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
    a.download = `expo-planner-${todayIso()}.json`
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
        <span className="toolbar-gap" />
        {busy && <span className="busy">{busy}</span>}
        {status === 'ready' && <SaveIndicator />}
        {workspace && (
          <button
            className="ghost"
            onClick={() => venyouInput.current?.click()}
            title={
              workspace.venueImport
                ? `Oppdater hallkalenderen fra Venyou (location_format). Sist: ${workspace.venueImport.fileName}, ${new Date(workspace.venueImport.importedAt).toLocaleString('nb-NO')}`
                : 'Les inn location_format fra Venyou'
            }
          >
            <RefreshCw size={14} aria-hidden /> {workspace.venueImport ? `Haller · ${new Date(workspace.venueImport.importedAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}` : 'Les inn haller'}
          </button>
        )}
        <Menu
          label={<Settings size={16} aria-hidden />}
          ariaLabel="Innstillinger"
          title="Innstillinger"
          className="ghost icon-button"
          align="right"
        >
          {(close) => (
            <>
              <span className="menu-setting">
                Utseende
                <Segmented
                  label="Utseende"
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: 'light', label: 'Lys' },
                    { value: 'dark', label: 'Mørk' },
                  ]}
                />
              </span>
              <button role="menuitem" aria-pressed={tooltips} onClick={() => setTooltips(!tooltips)}>
                Hjelpetekster {tooltips ? 'på' : 'av'}
              </button>
              <button role="menuitem" aria-pressed={heat} title="Vis avviket mellom tilgjengelig og planlagt bemanning som fargede felt: rødt for underdekning, gult for stramt, grønt for ledig." onClick={() => setHeat(!heat)}>
                Varmekart for avvik {heat ? 'på' : 'av'}
              </button>
              {workspace && (
                <button
                  role="menuitem"
                  onClick={() => {
                    close()
                    setSettingsOpen(true)
                  }}
                >
                  Bemanning og normaltid …
                </button>
              )}
              <span className="menu-group">Data</span>
              <button
                role="menuitem"
                title={workspace?.importedFrom ? `Sist: ${workspace.importedFrom.fileName}, ${new Date(workspace.importedFrom.importedAt).toLocaleString('nb-NO')}` : undefined}
                onClick={() => {
                  close()
                  workbookInput.current?.click()
                }}
              >
                Importer arbeidsbok …
              </button>
              {workspace && (
                <button
                  role="menuitem"
                  onClick={() => {
                    close()
                    exportBackup()
                  }}
                >
                  Last ned sikkerhetskopi
                </button>
              )}
              <button
                role="menuitem"
                onClick={() => {
                  close()
                  backupInput.current?.click()
                }}
              >
                Gjenopprett …
              </button>
              {workspace && import.meta.env.DEV && (
                <button
                  role="menuitem"
                  title="Bare i utviklingsmodus: legger inn 20 oppdiktede faste, kompetanser, tildelinger, fravær og behov for uke 42 2026. Kan angres."
                  onClick={async () => {
                    close()
                    const { loadStaffingFixture, withStaffingFixture } = await import('./dev/staffingFixture')
                    const fixture = await loadStaffingFixture()
                    updateStaffing((ws) => withStaffingFixture(ws, fixture))
                  }}
                >
                  Testdata for Bemanning (utvikling)
                </button>
              )}
              {workspace && (
                <button
                  role="menuitem"
                  className="danger"
                  title="Sletter alt som er lagret i nettleseren: haller, prosjekter, behov, KPI og planlegging. Last ned en sikkerhetskopi først hvis du vil kunne gå tilbake."
                  onClick={async () => {
                    close()
                    if (!confirm('Slette alt som er lagret i Expo Planner i denne nettleseren? Dette kan ikke angres.')) return
                    await resetWorkspace()
                  }}
                >
                  Slett alt og start på nytt …
                </button>
              )}
            </>
          )}
        </Menu>
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
      {status === 'ready' && workspace && view === 'kalender' && <Kalender key={workspace.importedFrom?.importedAt ?? 'ws'} hints={tooltips} heat={heat} />}
      {status === 'ready' && workspace && view === 'haller' && <Haller />}
      {status === 'ready' && workspace && view === 'produkttyper' && <Produkttyper onOpenKpi={() => setView('kpi')} />}
      {status === 'ready' && workspace && view === 'kpi' && <Kpi onOpenProductTypes={() => setView('produkttyper')} />}
      {status === 'ready' && workspace && view === 'bemanning' && <Bemanning onOpenPersonell={() => setView('personell')} />}
      {status === 'ready' && workspace && view === 'personell' && <Personell />}
      {status === 'ready' && workspace && view === 'behov' && <Behov projectNo={behovProject} onProjectChange={setBehovProject} onOpenSetup={setView} />}
      {settingsOpen && workspace && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
