import { TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { areaTree, cleanHallFilter, ALL_HALLS, shownHalls, venueStatuses, type HallFilter } from '../../domain/areas'
import { todayIso } from '../../domain/dates'
import { numberKey, venueEvents } from '../../domain/projects'
import { diffBudgets, followUpCount, followUps, mergeBudgets, replaceBudgets, seasonBalance, seasonRows, seasonStaffing, seasonStatus, seasonSummary, withBudget, type BudgetEntry, type SeasonRow, type SeasonStatus } from '../../domain/result'
import { hallNames } from '../../domain/venue'
import { visibleVenue } from '../../domain/venueImport'
import { readBudsjettWorkbook, writeBudsjettWorkbook } from '../../import/budsjettFile'
import { usePref } from '../../store/prefs'
import { useWorkspace } from '../../store/workspaceStore'
import { MergeReplaceDialog, MessageBanner, Segmented, UndoRedoButtons, type Message } from '../common'
import { count, isTyping } from '../dom'
import { download, XLSX_TYPE } from '../files'
import { AreaMenu } from '../kalender/AreaMenu'
import { TableFileMenu } from '../TableFile'
import { describeDiff, useTableFile } from '../useTableFile'
import { hours, percentText } from '../format'
import { FollowUp } from './FollowUp'
import { ProjectResult } from './ProjectResult'
import { ResultFigures } from './ResultFigures'
import { ResultMatrix } from './ResultMatrix'

interface Props {
  /** Opens the settings, where the overhead is set. */
  onOpenSettings: () => void
  onOpenBehov: (projectNo: string) => void
  onOpenProjects: () => void
}

type View = 'all' | SeasonStatus

const VIEWS: { value: View; label: string; title: string }[] = [
  { value: 'all', label: 'Alle', title: 'Alle prosjektene i sesongen' },
  { value: 'next', label: 'Kommende', title: 'Prosjekter som ikke har startet: første dag i hallkalenderen er etter i dag' },
  { value: 'live', label: 'Pågår', title: 'Prosjekter som har startet og ikke er ferdige' },
  { value: 'done', label: 'Avsluttet', title: 'Prosjekter der siste dag i hallkalenderen er før i dag' },
]

const cleanView = (stored: unknown): View => VIEWS.find((view) => view.value === stored)?.value ?? 'all'

/**
 * Resultat: the season as a dashboard, a row per project, with the budget of work hours the planner typed against the
 * hours the Kalender plans, with overhead added; its halls and phase days; and its hours per day against the permanent
 * staff. A click on a project slides in its figures; «Følg opp» slides in what needs the planner.
 */
export function Resultat({ onOpenSettings, onOpenBehov, onOpenProjects }: Props) {
  const { workspace, setBudgets } = useWorkspace()
  const ws = workspace!
  const today = todayIso()
  const [message, setMessage] = useState<Message | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [following, setFollowing] = useState(false)
  const [view, setView] = usePref<View>('resultatView', 'all', cleanView)
  // The halls with a column of their own are those ticked under «Steder» in the Kalender, and changed there or here.
  const [hallFilter, setHallFilter] = usePref<HallFilter>('hallFilter', ALL_HALLS, cleanHallFilter)
  const rows = useMemo(() => seasonRows(ws), [ws.venue, ws.hiddenVenue, ws.projects, ws.allocations, ws.budgets, ws.settings, ws.persons, ws.unavailability]) // eslint-disable-line react-hooks/exhaustive-deps
  const budgets = ws.budgets ?? {}
  // The staffing of the season, from Bemanning and the confirmed orders of Innleid, shared out on the projects.
  const season = useMemo(() => seasonBalance(ws), [ws.allocations, ws.assignments, ws.persons, ws.unavailability, ws.hireOrders, ws.demandAdjustments, ws.settings]) // eslint-disable-line react-hooks/exhaustive-deps
  const staffing = useMemo(() => seasonStaffing(season), [season])
  const staffedOf = (row: SeasonRow) => {
    const total = staffing.projects.get(numberKey(row.projectNo))
    return (total?.tagged ?? 0) + (total?.shared ?? 0)
  }
  // Events of the hall calendar without a project number have no row: the plan and the budget are kept by number.
  const unnumbered = useMemo(() => venueEvents(visibleVenue(ws.venue, ws.hiddenVenue), ws.projects).filter((event) => !event.projectNo).length, [ws.venue, ws.hiddenVenue, ws.projects])
  const hallTree = useMemo(() => areaTree(hallNames(ws.venue), ws.hallRules), [ws.venue, ws.hallRules])
  const statuses = useMemo(() => venueStatuses(ws.venue), [ws.venue])

  const counts = useMemo(() => {
    const by: Record<View, number> = { all: rows.length, next: 0, live: 0, done: 0 }
    for (const row of rows) by[seasonStatus(row, today)]++
    return by
  }, [rows, today])
  const shown = useMemo(() => (view === 'all' ? rows : rows.filter((row) => seasonStatus(row, today) === view)), [rows, view, today])
  const halls = useMemo(() => {
    const booked = new Set(shown.flatMap((row) => row.halls))
    return shownHalls(hallTree, hallFilter).filter((hall) => booked.has(hall))
  }, [shown, hallTree, hallFilter])
  const summary = useMemo(() => seasonSummary(shown), [shown])
  const follow = useMemo(() => followUps(shown, today, staffedOf), [shown, today, staffing]) // eslint-disable-line react-hooks/exhaustive-deps
  const actuals = rows.some((row) => row.actual !== null)
  const opened = open ? rows.find((row) => row.projectNo === open) : undefined
  const overhead = ws.settings.overhead

  useEffect(() => {
    if (!opened && !following) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !isTyping(e.target) && (setOpen(null), setFollowing(false))
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [opened, following])

  // Opening a project closes «Følg opp», and the other way round.
  const openProject = (projectNo: string | null) => (setOpen(projectNo), setFollowing(false))

  const { pending, onFile, done } = useTableFile<BudgetEntry[]>({
    read: readBudsjettWorkbook,
    empty: !Object.keys(budgets).length,
    takeIn: (incoming, file) => {
      setBudgets(replaceBudgets(incoming))
      setMessage({ kind: 'ok', text: `${file} lest inn: ${count(incoming.length, 'budsjett', 'budsjetter')}. Kan angres med Ctrl/Cmd+Z.` })
    },
    onError: (text) => setMessage({ kind: 'error', text }),
  })
  const apply = (mode: 'merge' | 'replace') => {
    if (!pending) return
    setBudgets(mode === 'merge' ? mergeBudgets(budgets, pending.incoming) : replaceBudgets(pending.incoming))
    setMessage({ kind: 'ok', text: `${pending.file} ${mode === 'merge' ? 'slått sammen med budsjettene' : 'har erstattet budsjettene'}. Kan angres med Ctrl/Cmd+Z.` })
    done()
  }
  const exportBudgets = () => {
    const names = new Map(rows.map((row) => [row.projectNo.toLowerCase(), row.name]))
    const entries = Object.entries(budgets).map(([projectNo, hours]) => ({ projectNo, hours, name: names.get(projectNo.toLowerCase()) ?? '' }))
    download(`expo-planner-budsjett-${todayIso()}.xlsx`, writeBudsjettWorkbook(entries), XLSX_TYPE)
  }

  return (
    <div className="resultat-page">
      <div className="page-head mode-band">
        <h2>Resultat</h2>
        <Segmented
          label="Utvalg"
          value={view}
          onChange={setView}
          options={VIEWS.map(({ value, label, title }) => ({ value, title, label: <>{label} <span className="count">{counts[value]}</span></> }))}
        />
        <span className="res-lead">
          FTE × {hours(ws.settings.hoursPerDay)} t +{' '}
          <button className="link" onClick={onOpenSettings} title="Endre overhead under Innstillinger">
            {percentText(overhead)} overhead
          </button>
        </span>
        <span className="toolbar-gap" />
        <button className={`ghost ${following ? 'active' : ''}`} aria-pressed={following} title="Prosjekter i utvalget som trenger noe av deg: over budsjett, snart i gang uten nok folk, uten plan eller uten budsjett" onClick={() => (setFollowing(!following), setOpen(null))}>
          <TriangleAlert size={14} aria-hidden /> Følg opp {followUpCount(follow) > 0 && <span className="count-chip alert">{followUpCount(follow)}</span>}
        </button>
        <AreaMenu tree={hallTree} statuses={statuses} filter={hallFilter} onChange={setHallFilter} />
        <UndoRedoButtons />
        <TableFileMenu
          exportTitle="Last ned budsjettene som en Excel-fil: en rad per prosjekt med budsjetterte arbeidstimer."
          importTitle="Les inn en budsjettfil: en som er eksportert herfra, eller budsjettarbeidsboken med kolonnene Prosjektnr. og Budsjett arbeidstimer totalt."
          canExport={Object.keys(budgets).length > 0}
          onExport={exportBudgets}
          onFile={onFile}
        />
      </div>
      <MessageBanner message={message} onClose={() => setMessage(null)} />
      <div className="res-stage">
        {rows.length ? (
          <div className="res-page">
            <ResultFigures rows={shown} summary={summary} overhead={overhead} staffedOf={staffedOf} />
            <ResultMatrix rows={shown} summary={summary} halls={halls} today={today} overhead={overhead} actuals={actuals} open={open} onOpen={openProject} />
          </div>
        ) : (
          <p className="res-empty muted">Ingen prosjekter ennå. Les inn hallbookingene fra Venyou og gi prosjektene nummer på Prosjekter, eller les inn budsjettene under «Fil».</p>
        )}
        {opened && (
          <ProjectResult
            key={opened.projectNo}
            row={opened}
            season={season}
            today={today}
            overhead={overhead}
            staffed={staffedOf(opened)}
            onBudget={(value) => setBudgets(withBudget(budgets, opened.projectNo, value))}
            onClose={() => setOpen(null)}
            onOpenBehov={() => onOpenBehov(opened.projectNo)}
          />
        )}
        {following && (
          <FollowUp
            follow={follow}
            staffedOf={staffedOf}
            unnumbered={unnumbered}
            unshared={staffing.unshared}
            noProject={staffing.noProject.tagged + staffing.noProject.shared}
            onOpen={(projectNo) => openProject(projectNo)}
            onOpenProjects={onOpenProjects}
            onClose={() => setFollowing(false)}
          />
        )}
      </div>
      {pending && (
        <MergeReplaceDialog
          title="Les inn budsjetter"
          source={pending.file}
          results={[describeDiff('Budsjetter', diffBudgets(budgets, pending.incoming))]}
          replaceText="budsjettene i appen byttes ut med dem i filen, og prosjekter som ikke er i filen står uten budsjett"
          onCancel={done}
          onApply={apply}
        />
      )}
    </div>
  )
}
