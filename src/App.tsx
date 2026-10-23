import { Fragment, useEffect, useRef, useState } from 'react'
import { addDays, todayIso } from './domain/dates'
import { DEFAULT_SETTINGS, type Workspace } from './domain/types'
import { readVenyouExport } from './import/venyouExport'
import { parseBackup, toBackup } from './store/backup'
import { usePref } from './store/prefs'
import { useSaveState, useWorkspace, WorkspaceProvider } from './store/workspaceStore'
import { Behov } from './ui/behov/Behov'
import { HallerTab, type HallerPage } from './ui/haller/HallerTab'
import { Oppsett, type OppsettPage } from './ui/kpi/Oppsett'
import { Resultat } from './ui/resultat/Resultat'
import { Mannskap, type MannskapPage } from './ui/personell/Mannskap'
import type { RegisterPage } from './ui/RegisterHead'
import { Kalender } from './ui/kalender/Kalender'
import { cleanBlockNames, type BlockNames } from './ui/bemanning/dayCell'
import { Menu, Segmented } from './ui/common'
import { isTyping } from './ui/dom'
import { download, errorText, takeFile } from './ui/files'
import { SettingsDialog } from './ui/SettingsDialog'
import { Tooltips } from './ui/Tooltips'
import { Settings } from 'lucide-react'
import { loadLocalWorkspace } from './store/db'
import { CloudDialog } from './sync/CloudDialog'
import { CloudProvider, SharedSync, useCloud, useSyncStatus } from './sync/CloudProvider'
import { syncText } from './sync/syncText'

export default function App() {
  return (
    <CloudProvider>
      {(database) => (
        <WorkspaceProvider key={database}>
          <SharedSync />
          <Shell />
        </WorkspaceProvider>
      )}
    </CloudProvider>
  )
}

type View = 'kalender' | 'behov' | 'resultat' | 'haller' | 'prosjekter' | 'hallregler' | 'kpi' | 'tekstregler' | 'utelatte' | 'personell' | 'leverandorer' | 'kompetanser'

interface Tab {
  label: string
  /** The pages of the tab. A tab of the planner's tables shows them in a switch in its page header, which it draws itself. */
  pages: RegisterPage<View>[]
  /** One of the planner's tables, set apart after the tabs the planning is done in. */
  register?: boolean
}

const TABS: Tab[] = [
  { label: 'Kalender', pages: [{ view: 'kalender', label: 'Kalender' }] },
  { label: 'Behov', pages: [{ view: 'behov', label: 'Behov' }] },
  { label: 'Resultat', pages: [{ view: 'resultat', label: 'Resultat' }] },
  {
    label: 'Haller',
    register: true,
    pages: [
      { view: 'haller', label: 'VenYou', title: 'Hallbookingene fra Venyou, og om de vises i Kalender' },
      { view: 'prosjekter', label: 'Prosjekter', title: 'Prosjektnumrene, og navnene hvert prosjekt har i kildene' },
      { view: 'hallregler', label: 'Hallregler', title: 'Reglene som plasserer Hall/sted i en hall, og områdene' },
    ],
  },
  {
    label: 'Mannskap',
    register: true,
    pages: [
      { view: 'personell', label: 'Faste', title: 'De faste ansatte og kompetansene deres' },
      { view: 'leverandorer', label: 'Innleid', title: 'Leverandørene det leies inn fra' },
      { view: 'kompetanser', label: 'Kompetanser', title: 'Navn, farge og rekkefølge på kompetansene' },
    ],
  },
  {
    label: 'Oppsett',
    register: true,
    pages: [
      { view: 'kpi', label: 'Produkttyper', title: 'Hvordan hver produkttype leses: enhet, kompetanse og satser' },
      { view: 'tekstregler', label: 'Tekstregler', title: 'Produkttypen linjer uten en får etter artikkelteksten' },
      { view: 'utelatte', label: 'Utelatte artikler', title: 'Artikkelnumrene som ikke leses' },
    ],
  },
]

const venyouTitle = (workspace: Workspace) =>
  workspace.venueImport
    ? `Oppdater hallkalenderen fra Venyou (location_format). Sist: ${workspace.venueImport.fileName}, ${new Date(workspace.venueImport.importedAt).toLocaleString('nb-NO')}`
    : 'Les inn location_format fra Venyou'

const tabOf = (view: View) => TABS.find((tab) => tab.pages.some((page) => page.view === view))!

/** Its own component, so that saving an edit does not render the tabs again. */
function SaveIndicator() {
  const saveState = useSaveState()
  const { shared } = useCloud()
  const { state } = useSyncStatus()
  // In a shared workspace, once saved in the browser, what counts is how far the shared copy has come.
  if (shared && state && saveState === 'saved') {
    return (
      <span className={`save-state ${state === 'synced' ? 'saved' : state === 'syncing' ? 'saving' : 'error'}`} title={`Lagret i nettleseren. ${syncText(state)}: ${shared.name}`}>
        <i />
        {syncText(state)}
      </span>
    )
  }
  return (
    <span className={`save-state ${saveState}`} title={saveState === 'saved' ? 'Lagret i nettleseren' : saveState === 'error' ? 'Endringene er ikke lagret i nettleseren ennå. Appen prøver igjen av seg selv; lukk ikke fanen før det står «Lagret».' : undefined}>
      <i />
      {saveState === 'saving' ? 'Lagrer …' : saveState === 'error' ? 'Lagring feilet, prøver igjen' : 'Lagret'}
    </span>
  )
}

/** Who else has the shared workspace open now: their number, and their e-mails on hover. Nothing when one is alone in it. */
function Present() {
  const { email } = useCloud()
  const { present } = useSyncStatus()
  const others = present.filter((each) => each !== email)
  if (!others.length) return null
  return (
    <span className="present" title={`Inne nå: ${others.join(', ')}`}>
      {others.map((each) => (
        <i key={each} aria-hidden>
          {each.slice(0, 1).toUpperCase()}
        </i>
      ))}
      {others.length === 1 ? others[0].split('@')[0] : `${others.length} andre`}
    </span>
  )
}

/**
 * The start screen of a shared workspace with nothing in it: offers what this browser holds of its own, to put in
 * it. A shared workspace that has not been read yet waits for that first, so nothing is started over what it holds.
 */
function SharedStart({ onStart }: { onStart: (ws: Workspace) => void }) {
  const cloud = useCloud()
  const { state } = useSyncStatus()
  const [local, setLocal] = useState<Workspace | null>(null)
  useEffect(() => {
    loadLocalWorkspace().then(setLocal)
  }, [])
  if (!cloud.read) return <p className="center muted">{state && state !== 'syncing' ? `${syncText(state)}. Arbeidsområdet hentes når skyen svarer.` : 'Henter fra skyen …'}</p>
  if (!local) return null
  return (
    <p className="empty-actions">
      <button className="primary" onClick={() => confirm(`Legge alt nettleseren har fra før inn i «${cloud.shared!.name}», for alle som bruker det?`) && onStart(local)}>
        Last opp data fra denne nettleseren
      </button>
    </p>
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
  const [cloudOpen, setCloudOpen] = useState(false)
  // The day the planner is next reminded to download a backup: a week after the last, or a day after «Senere». The
  // backup is the copy that lasts, the free plan of the shared copy keeping none of its own.
  const [backupDue, setBackupDue] = usePref('backupDue', '')
  useEffect(() => {
    if (!backupDue) setBackupDue(addDays(todayIso(), 7))
  }, [backupDue, setBackupDue])
  const remindBackup = status === 'ready' && !!workspace && (workspace.venue.length > 0 || workspace.demand.length > 0) && !!backupDue && todayIso() >= backupDue
  const cloud = useCloud()
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
  // The page last open in each tab, which the tab opens on again.
  const lastPage = useRef<Record<string, View>>({})
  const tab = tabOf(view)
  useEffect(() => {
    lastPage.current[tab.label] = view
  }, [tab, view])
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
    setBackupDue(addDays(todayIso(), 7))
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Expo Planner</h1>
        {status === 'ready' && (
          <nav className="tabs">
            {TABS.map((each, i) => (
              <Fragment key={each.label}>
                {each.register && !TABS[i - 1].register && <span className="tabs-apart" aria-hidden />}
                <button aria-current={each === tab ? 'page' : undefined} onClick={() => setView(lastPage.current[each.label] ?? each.pages[0].view)}>
                  {each.label}
                </button>
              </Fragment>
            ))}
          </nav>
        )}
        <span className="toolbar-gap" />
        {busy && <span className="busy">{busy}</span>}
        {status === 'ready' && <Present />}
        {status === 'ready' && <SaveIndicator />}
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
              <button role="menuitem" aria-pressed={heat} title="Vis avviket mellom tilgjengelig og planlagt bemanning som fargede felt: rødt for underdekning, grønt for ok, oker for over." onClick={() => setHeat(!heat)}>
                Varmekart for mangler / over {heat ? 'på' : 'av'}
              </button>
              {workspace && (
                <button
                  role="menuitem"
                  onClick={() => {
                    close()
                    setSettingsOpen(true)
                  }}
                >
                  Bemanning, normaltid og overhead …
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
              {cloud.configured && (
                <button
                  role="menuitem"
                  onClick={() => {
                    close()
                    setCloudOpen(true)
                  }}
                >
                  {cloud.shared ? `Skyen: ${cloud.shared.name} …` : cloud.email ? 'Skyen: logget inn …' : 'Logg inn i skyen …'}
                </button>
              )}
              {workspace && (
                <button
                  role="menuitem"
                  title={venyouTitle(workspace)}
                  onClick={() => {
                    close()
                    venyouInput.current?.click()
                  }}
                >
                  {workspace.venueImport ? 'Oppdater fra VenYou …' : 'Les inn VenYou …'}
                </button>
              )}
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
                  title={
                    cloud.shared
                      ? `Sletter alt i det delte arbeidsområdet «${cloud.shared.name}», for alle: haller, prosjekter, behov, KPI og planlegging. Last ned en sikkerhetskopi først hvis du vil kunne gå tilbake.`
                      : 'Sletter alt som er lagret i nettleseren: haller, prosjekter, behov, KPI og planlegging. Last ned en sikkerhetskopi først hvis du vil kunne gå tilbake.'
                  }
                  onClick={async () => {
                    close()
                    const question = cloud.shared
                      ? `Slette alt i det delte arbeidsområdet «${cloud.shared.name}», for alle som bruker det? Dette kan ikke angres.`
                      : 'Slette alt som er lagret i Expo Planner i denne nettleseren? Dette kan ikke angres.'
                    if (!confirm(question)) return
                    await resetWorkspace()
                  }}
                >
                  {cloud.shared ? 'Tøm det delte arbeidsområdet …' : 'Slett alt og start på nytt …'}
                </button>
              )}
            </>
          )}
        </Menu>
        <Tooltips enabled={tooltips} />
        <input ref={venyouInput} type="file" accept=".xlsx" hidden onChange={(e) => takeFile(e, importVenyou)} />
        <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={(e) => takeFile(e, restoreBackup)} />
      </header>

      {remindBackup && (
        <div className="info-banner" role="status">
          Det er en uke eller mer siden du lastet ned en sikkerhetskopi. Den er kopien som varer om noe skulle gå galt i nettleseren{cloud.shared ? ' eller i skyen' : ''}.{' '}
          <button className="link" onClick={exportBackup}>
            Last ned nå
          </button>{' '}
          <button className="link" onClick={() => setBackupDue(addDays(todayIso(), 1))}>
            Senere
          </button>
        </div>
      )}

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
      {status === 'empty' && cloud.shared && !cloud.read && <SharedStart onStart={(ws) => run('Laster opp …', () => replaceWorkspace(ws))} />}
      {status === 'empty' && (!cloud.shared || cloud.read) && (
        <div className="empty-state">
          <h2>Kom i gang</h2>
          <p>
            Start med blanke ark og les inn kildene hver for seg: hallbookinger fra Venyou (<code>location_format</code>), KPI-oppsettet og Visma-utskrifter. Kalenderen følger perioden i
            hallbookingene.
          </p>
          <p className="muted">{cloud.shared ? `Du arbeider i det delte arbeidsområdet «${cloud.shared.name}». Det du leser inn, lagres i skyen for alle som bruker det.` : 'Filer leses bare i nettleseren og sendes ingen steder.'}</p>
          {cloud.shared && <SharedStart onStart={(ws) => run('Laster opp …', () => replaceWorkspace(ws))} />}
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
      {status === 'ready' && workspace && view === 'kalender' && <Kalender hints={tooltips} heat={heat} blockNames={blockNames} overtimeLimit={Number.isFinite(overtimeLimit) ? overtimeLimit : 10} onOpenPersonell={() => setView('personell')} onOpenSuppliers={() => setView('leverandorer')} />}
      {status === 'ready' && workspace && tab.label === 'Haller' && (
        <HallerTab
          page={view as HallerPage}
          pages={tab.pages as RegisterPage<HallerPage>[]}
          onPage={setView}
          onReadVenyou={() => venyouInput.current?.click()}
          venyouTitle={venyouTitle(workspace)}
          onOpenBehov={(projectNo) => (setBehovProject(projectNo), setView('behov'))}
        />
      )}
      {status === 'ready' && workspace && tab.label === 'Mannskap' && <Mannskap page={view as MannskapPage} pages={tab.pages as RegisterPage<MannskapPage>[]} onPage={setView} />}
      {status === 'ready' && workspace && tab.label === 'Oppsett' && <Oppsett page={view as OppsettPage} pages={tab.pages as RegisterPage<OppsettPage>[]} onPage={setView} onOpenBehov={() => setView('behov')} />}
      {status === 'ready' && workspace && view === 'behov' && <Behov projectNo={behovProject} onProjectChange={setBehovProject} onOpenSetup={() => setView('kpi')} onOpenRules={() => setView('hallregler')} />}
      {status === 'ready' && workspace && view === 'resultat' && <Resultat onOpenSettings={() => setSettingsOpen(true)} onOpenBehov={(projectNo) => (setBehovProject(projectNo), setView('behov'))} onOpenProjects={() => setView('prosjekter')} />}
      {settingsOpen && workspace && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {cloudOpen && <CloudDialog onClose={() => setCloudOpen(false)} />}
    </div>
  )
}
