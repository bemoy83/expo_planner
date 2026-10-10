import { useEffect, useRef, useState } from 'react'
import { todayIso } from './domain/dates'
import { DEFAULT_SETTINGS, type Workspace } from './domain/types'
import { readVenyouExport } from './import/venyouExport'
import { parseBackup, toBackup } from './store/backup'
import { usePref } from './store/prefs'
import { useSaveState, useWorkspace, WorkspaceProvider } from './store/workspaceStore'
import { Behov } from './ui/behov/Behov'
import { Haller } from './ui/haller/Haller'
import { Kpi } from './ui/kpi/Kpi'
import { Kompetanser } from './ui/personell/Kompetanser'
import { Personell } from './ui/personell/Personell'
import { Prosjekter } from './ui/prosjekter/Prosjekter'
import { HallRules } from './ui/behov/HallRules'
import { Kalender } from './ui/kalender/Kalender'
import { cleanBlockNames, type BlockNames } from './ui/bemanning/dayCell'
import { Menu, Segmented } from './ui/common'
import { isTyping } from './ui/dom'
import { download, errorText, takeFile } from './ui/files'
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
  ['haller', 'VenYou'],
  ['prosjekter', 'Prosjekter'],
  ['hallregler', 'Hallregler'],
  ['kpi', 'KPI'],
  ['personell', 'Personell'],
  ['kompetanser', 'Kompetanser'],
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
  overrides: {},
  hiddenVenue: {},
  visma: [],
})

function Shell() {
  const { status, workspace, replaceWorkspace, resetWorkspace, importVenue, undo, redo } = useWorkspace()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [venueResult, setVenueResult] = useState<ReturnType<typeof importVenue> | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Whether hovering shows help texts. A choice for this browser, like the other view preferences.
  const [tooltips, setTooltips] = usePref('tooltips', true)
  // Whether the Avvik line of the Kalender is drawn as a heat map.
  const [heat, setHeat] = usePref('heat', true)
  // Bemanning: what a block says, how what is picked is shown, and the overtime per week that is flagged.
  const [blockNames, setBlockNames] = usePref<BlockNames>('blockLabel', 'full', cleanBlockNames)
  const [overtimeLimit, setOvertimeLimit] = usePref('overtimeLimitPerWeek', 10)
  // Light or dark, also a choice for this browser. main.tsx sets it before the first paint.
  const [theme, setTheme] = usePref<'light' | 'dark'>('theme', 'light')
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  const [view, setView] = useState<View>('kalender')
  const [behovProject, setBehovProject] = useState('')
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
    download(`expo-planner-${todayIso()}.json`, JSON.stringify(toBackup(workspace)), 'application/json')
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
            <RefreshCw size={14} aria-hidden /> {workspace.venueImport ? `VenYou · ${new Date(workspace.venueImport.importedAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}` : 'Les inn VenYou'}
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
              <span className="menu-group">Bemanning</span>
              <span className="menu-setting">
                Navn på blokker
                <Segmented
                  label="Navn på blokker"
                  value={blockNames}
                  onChange={setBlockNames}
                  options={[
                    { value: 'full', label: 'Fullt', title: 'Hele navnet på kompetansen der det får plass, ellers kortnavnet' },
                    { value: 'auto', label: 'Auto', title: 'Som Fullt, med timene der det er plass til dem' },
                    { value: 'short', label: 'Kort', title: 'Alltid kortnavnet' },
                  ]}
                />
              </span>
              <label className="menu-setting" title="En person med mer overtid enn dette i en uke merkes i Bemanning. Grensen stopper ingenting.">
                Overtid per uke, grense
                <span className="menu-number">
                  <input type="number" min={0} step={0.5} value={overtimeLimit} onChange={(e) => e.target.value !== '' && Number(e.target.value) >= 0 && setOvertimeLimit(Number(e.target.value))} /> t
                </span>
              </label>
              <span className="menu-group">Data</span>
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
          <p className="muted">Filer leses bare i nettleseren og sendes ingen steder.</p>
          <div className="empty-actions">
            <button className="primary" onClick={() => run('Oppretter …', () => replaceWorkspace(emptyWorkspace()))} disabled={!!busy}>
              Start
            </button>
            <button onClick={() => backupInput.current?.click()} disabled={!!busy}>
              Gjenopprett sikkerhetskopi …
            </button>
          </div>
        </div>
      )}
      {status === 'ready' && workspace && view === 'kalender' && <Kalender hints={tooltips} heat={heat} blockNames={blockNames} overtimeLimit={Number.isFinite(overtimeLimit) ? overtimeLimit : 10} onOpenPersonell={() => setView('personell')} />}
      {status === 'ready' && workspace && view === 'haller' && <Haller onOpenProjects={() => setView('prosjekter')} />}
      {status === 'ready' && workspace && view === 'prosjekter' && <Prosjekter onOpenBehov={(projectNo) => (setBehovProject(projectNo), setView('behov'))} />}
      {status === 'ready' && workspace && view === 'kpi' && <Kpi />}
      {status === 'ready' && workspace && view === 'personell' && <Personell onOpenCompetences={() => setView('kompetanser')} />}
      {status === 'ready' && workspace && view === 'kompetanser' && <Kompetanser onOpenPersonell={() => setView('personell')} />}
      {status === 'ready' && workspace && view === 'behov' && <Behov projectNo={behovProject} onProjectChange={setBehovProject} onOpenSetup={() => setView('kpi')} onOpenRules={() => setView('hallregler')} />}
      {status === 'ready' && workspace && view === 'hallregler' && <HallRules onOpenBehov={() => setView('behov')} />}
      {settingsOpen && workspace && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
