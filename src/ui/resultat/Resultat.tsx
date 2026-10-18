import { useEffect, useMemo, useState } from 'react'
import { todayIso } from '../../domain/dates'
import { venueEvents } from '../../domain/projects'
import { budgetOf, diffBudgets, mergeBudgets, replaceBudgets, seasonRows, seasonTotals, withBudget, type BudgetEntry, type SeasonRow } from '../../domain/result'
import { readBudsjettWorkbook, writeBudsjettWorkbook } from '../../import/budsjettFile'
import { visibleVenue } from '../../domain/venueImport'
import { useWorkspace } from '../../store/workspaceStore'
import { hours } from '../behov/format'
import { MergeReplaceDialog, MessageBanner, UndoRedoButtons, type Message } from '../common'
import { DataTable } from '../DataTable'
import { count, isTyping } from '../dom'
import { NumberField } from '../fields'
import { download, XLSX_TYPE } from '../files'
import { TableFileMenu } from '../TableFile'
import { describeDiff, useTableFile } from '../useTableFile'
import { useTable, type Column } from '../useTable'
import { deviationText, percentText, shareText } from './format'
import { ProjectResult } from './ProjectResult'

interface Props {
  /** Opens the settings, where the overhead is set. */
  onOpenSettings: () => void
  onOpenBehov: (projectNo: string) => void
  onOpenProjects: () => void
}

/** A deviation below the budget by more than this is shown as over: less is rounding. */
const NOISE = 0.05

const overClass = (deviation: number | null) => (deviation !== null && deviation < -NOISE ? 'num res-over' : 'num')

/**
 * Resultat: the season, a row per project, with the budget of work hours the planner typed against the hours the
 * Kalender plans, with overhead added. A click on a project slides in its hours per competence and phase.
 */
export function Resultat({ onOpenSettings, onOpenBehov, onOpenProjects }: Props) {
  const { workspace, setBudgets } = useWorkspace()
  const ws = workspace!
  const [message, setMessage] = useState<Message | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const rows = useMemo(() => seasonRows(ws), [ws.venue, ws.hiddenVenue, ws.projects, ws.allocations, ws.budgets, ws.settings]) // eslint-disable-line react-hooks/exhaustive-deps
  const budgets = ws.budgets ?? {}
  // Events of the hall calendar without a project number have no row: the plan and the budget are kept by number.
  const unnumbered = useMemo(() => venueEvents(visibleVenue(ws.venue, ws.hiddenVenue), ws.projects).filter((event) => !event.projectNo).length, [ws.venue, ws.hiddenVenue, ws.projects])
  const overhead = percentText(ws.settings.overhead)
  const opened = open ? rows.find((row) => row.projectNo === open) : undefined

  useEffect(() => {
    if (!opened) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !isTyping(e.target) && setOpen(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [opened])

  const setBudget = (projectNo: string, value: number) => setBudgets(withBudget(budgets, projectNo, value))

  const columns = useMemo<Column<SeasonRow>[]>(() => {
    const sumOf = (list: SeasonRow[], of: (row: SeasonRow) => number) => list.reduce((sum, row) => sum + of(row), 0)
    return [
      { key: 'year', head: 'År', title: 'Året prosjektet holdes, etter den første bookingen', text: (row) => row.year, cell: (row) => row.year, foot: () => 'Sum' },
      {
        key: 'project',
        head: 'Prosjekt',
        text: (row) => `${row.name} ${row.projectNo}`,
        sort: (row) => row.name.toLowerCase(),
        cell: (row) => (
          <button className="link res-project" title="Vis timene til prosjektet per kompetanse og fase" onClick={() => setOpen(open === row.projectNo ? null : row.projectNo)}>
            <span className="ellipsis">{row.name || 'Uten navn'}</span> <span className="project-no">{row.projectNo}</span>
          </button>
        ),
        foot: (list) => count(list.length, 'prosjekt', 'prosjekter'),
      },
      { key: 'start', head: 'Opp', title: 'Første monteringsdag, ellers første dag i hallkalenderen', className: 'date', sort: (row) => row.start || '9999', cell: (row) => (row.start ? `${Number(row.start.slice(8, 10))}.${Number(row.start.slice(5, 7))}.` : '') },
      { key: 'assembly', head: 'Mont.', title: 'Monteringsdager i hallkalenderen, talt én gang over prosjektets haller', className: 'num', sort: (row) => row.days.assembly, cell: (row) => row.days.assembly || '' },
      { key: 'event', head: 'Arr.', title: 'Arrangementsdager i hallkalenderen', className: 'num', sort: (row) => row.days.event, cell: (row) => row.days.event || '' },
      { key: 'dismantle', head: 'Dem.', title: 'Demonteringsdager i hallkalenderen, talt én gang over prosjektets haller', className: 'num', sort: (row) => row.days.dismantle, cell: (row) => row.days.dismantle || '' },
      { key: 'halls', head: 'Haller', text: (row) => (row.halls.length ? row.halls : ['(ingen)']), cell: (row) => <span className="ellipsis res-halls" title={row.halls.join(', ')}>{row.halls.join(', ')}</span> },
      {
        key: 'budget',
        head: 'Budsjett',
        title: 'Budsjetterte arbeidstimer for prosjektet, med overhead. Skriv inn, eller les inn under «Fil». Tomt eller 0 er uten budsjett.',
        className: 'num res-budget',
        text: (row) => (row.budget === null ? 'Uten budsjett' : 'Med budsjett'),
        sort: (row) => row.budget ?? -1,
        cell: (row) => <NumberField value={row.budget ?? 0} placeholder="–" ariaLabel={`Budsjett for ${row.name || row.projectNo}`} onCommit={(value) => setBudget(row.projectNo, value)} />,
        foot: (list) => (list.some((row) => row.budget !== null) ? hours(sumOf(list, (row) => row.budget ?? 0)) : ''),
      },
      { key: 'planned', head: 'Planlagt', title: 'Planlagt i Kalender: FTE × normaltid, uten overhead', className: 'num', sort: (row) => row.plannedTotal, cell: (row) => (row.plannedTotal ? hours(row.plannedTotal) : ''), foot: (list) => hours(sumOf(list, (row) => row.plannedTotal)) },
      {
        key: 'overhead',
        head: `Inkl. ${overhead} overhead`,
        title: 'Planlagt med overhead lagt til, som budsjettet har det. Prosenten settes under Innstillinger.',
        className: 'num',
        sort: (row) => row.withOverhead,
        cell: (row) => (row.withOverhead ? hours(row.withOverhead) : ''),
        foot: (list) => hours(sumOf(list, (row) => row.withOverhead)),
      },
      {
        key: 'deviation',
        head: 'Avvik',
        title: 'Budsjett minus planlagt inkl. overhead: det som er igjen av budsjettet, negativt der planen går over. Summen gjelder prosjektene med budsjett.',
        className: 'num',
        sort: (row) => row.deviation ?? Number.POSITIVE_INFINITY,
        cell: (row) => deviationText(row.deviation),
        cellProps: (row) => ({ className: overClass(row.deviation) }),
        foot: (list) => <span className={overClass(seasonTotals(list).deviation)}>{deviationText(seasonTotals(list).deviation)}</span>,
      },
      {
        key: 'share',
        head: 'Avvik %',
        title: 'Avviket som andel av budsjettet',
        className: 'num',
        sort: (row) => row.deviationShare ?? Number.POSITIVE_INFINITY,
        cell: (row) => shareText(row.deviationShare),
        cellProps: (row) => ({ className: overClass(row.deviation) }),
        foot: (list) => <span className={overClass(seasonTotals(list).deviation)}>{shareText(seasonTotals(list).deviationShare)}</span>,
      },
      { key: 'up', head: 'Plan. mont.', title: 'Planlagte timer til montering, uten overhead', className: 'num', sort: (row) => row.planned.Montering, cell: (row) => (row.planned.Montering ? hours(row.planned.Montering) : ''), foot: (list) => hours(sumOf(list, (row) => row.planned.Montering)) },
      { key: 'down', head: 'Plan. dem.', title: 'Planlagte timer til demontering, uten overhead', className: 'num', sort: (row) => row.planned.Demontering, cell: (row) => (row.planned.Demontering ? hours(row.planned.Demontering) : ''), foot: (list) => hours(sumOf(list, (row) => row.planned.Demontering)) },
    ]
  }, [overhead, open, budgets]) // eslint-disable-line react-hooks/exhaustive-deps
  const table = useTable(rows, columns)

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
        <span className="res-lead">
          Budsjett mot planlagt i Kalender, FTE × {hours(ws.settings.hoursPerDay)} t med{' '}
          <button className="link" onClick={onOpenSettings} title="Endre overhead under Innstillinger">
            {overhead} overhead
          </button>
        </span>
        <span className="toolbar-gap" />
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
        <div className="res-scroll">
          {rows.length ? (
            <DataTable table={table} className="res-table" rowKey={(row) => row.projectNo.toLowerCase()} rowProps={(row) => ({ className: row.projectNo === open ? 'res-open' : undefined })} />
          ) : (
            <p className="res-empty muted">Ingen prosjekter ennå. Les inn hallbookingene fra Venyou og gi prosjektene nummer på Prosjekter, eller les inn budsjettene under «Fil».</p>
          )}
          {unnumbered > 0 && (
            <p className="res-note muted">
              {count(unnumbered, 'arrangement', 'arrangementer')} i hallkalenderen har ikke prosjektnummer og er ikke med.{' '}
              <button className="link" onClick={onOpenProjects}>
                Gi dem nummer på Prosjekter
              </button>
            </p>
          )}
        </div>
        {opened && <ProjectResult row={opened} budget={budgetOf(budgets, opened.projectNo)} overhead={overhead} onClose={() => setOpen(null)} onOpenBehov={() => onOpenBehov(opened.projectNo)} />}
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
