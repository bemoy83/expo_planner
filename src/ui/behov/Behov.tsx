import { useMemo, useRef, useState } from 'react'
import { formatFte } from '../../domain/calc'
import { EMPTY_KPI } from '../../domain/kpi'
import { decimalText } from '../../domain/numbers'
import { PLANNED_BASIS, type DemandLine } from '../../domain/types'
import { isVismaLine, NO_PRODUCT_TYPE, orphanedDecisions, productTypeLabel, productTypeName, type VismaLine } from '../../domain/visma'
import { countOf, matchesFilter, reviewVisma, type LineFilter, type ProjectReview } from '../../domain/vismaReview'
import { readVismaExport } from '../../import/vismaExport'
import { useWorkspace } from '../../store/workspaceStore'
import { placeNames, placeOf, PROJECT_HALLS, resolveHall, sharedPlaces, suggestHall, UNRESOLVED_HALL } from '../../domain/locations'
import { hallsOfProjects } from '../../domain/projects'
import { hallNames } from '../../domain/venue'
import { DataTable } from '../DataTable'
import { useTable, type Column } from '../useTable'
import { MessageBanner, Segmented, UndoRedoButtons, type Message } from '../common'
import { errorText, takeFiles } from '../files'
import { NumberField, TextField } from '../fields'
import { DemandLineDialog } from './DemandLineDialog'
import { Pencil, X } from 'lucide-react'

const hours = (value: number) => formatFte(value, 1)

const ISSUE_TEXT: Record<NonNullable<VismaLine['issue']>, string> = {
  'no-product-type': 'Mangler produkttype – velg arbeidstype',
  'unknown-work-type': 'Produkttypen finnes ikke i KPI-oppsettet',
  'no-rate': 'Mangler sats for denne enheten',
}

/** The most lines listed at once. */
const LIST_LIMIT = 400

const NO_REVIEW: ProjectReview = { projectNo: '', lines: [], open: 0, ready: 0, unresolved: 0, issues: 0 }

const MISSING_RATE_TEXT: Record<NonNullable<VismaLine['missingRate']>, string> = {
  assembly: 'Ingen sats for montering',
  dismantle: 'Ingen sats for demontering',
}

interface Props {
  projectNo: string
  onProjectChange: (projectNo: string) => void
  onOpenSetup: () => void
  /** Opens the page of the rules that place Hall/Sted in a hall. */
  onOpenRules: () => void
}

/** The demand ledger for one project: Visma lines, the planner's own lines and earlier years, side by side. */
export function Behov({ projectNo, onProjectChange, onOpenSetup, onOpenRules }: Props) {
  const { workspace, importVisma, setLineOverride, setLineOverrides, removeLineOverride, removeDemandLine, setHallAlias } = useWorkspace()
  const ws = workspace!
  const [message, setMessage] = useState<Message | null>(null)
  const [dialog, setDialog] = useState<{ line?: DemandLine } | null>(null)
  const [filter, setFilter] = useState<LineFilter>('all')
  const vismaInput = useRef<HTMLInputElement>(null)

  const projects = useMemo(() => {
    const names = new Map<string, string>()
    for (const p of ws.projects) if (!names.has(p.projectNo)) names.set(p.projectNo, p.name)
    for (const r of ws.allocations) if (r.projectNo) names.set(r.projectNo, r.projectName)
    for (const v of ws.visma ?? []) if (!names.has(v.projectNo)) names.set(v.projectNo, v.eventName)
    const withData = new Set([...ws.demand.map((l) => l.projectNo), ...ws.allocations.map((r) => r.projectNo)])
    return [...names].filter(([no]) => withData.has(no)).sort((a, b) => a[1].localeCompare(b[1], 'nb'))
  }, [ws.projects, ws.allocations, ws.visma, ws.demand])

  const projectNames = useMemo(() => new Map(projects), [projects])
  const kpi = ws.kpi ?? EMPTY_KPI
  // The Kalender places demand in the halls of the hall ledger; show where each line's Hall/Sted ends up.
  const halls = useMemo(() => hallNames(ws.venue), [ws.venue])
  const booked = useMemo(() => hallsOfProjects(ws.venue, ws.projects), [ws.venue, ws.projects])
  const rules = ws.hallRules
  const places = useMemo(() => placeNames(halls, rules), [halls, rules])
  const shared = useMemo(() => new Map(sharedPlaces(halls, rules).map((place) => [place.name, place.halls])), [halls, rules])
  const placeOfLine = (line: { hall: string; projectNo: string }) => placeOf(line.hall, halls, ws.hallAliases, line.projectNo, rules)
  const offerFor = (line: { hall: string; projectNo: string }) => (placeOfLine(line).by === 'none' ? suggestHall(line.hall, halls, ws.hallAliases, booked.get(line.projectNo), rules) : null)
  /** Why the line counts where it does: the rule that placed it, in a few words. */
  const ruleOf = (line: { hall: string; projectNo: string }): string => {
    const place = placeOfLine(line)
    if (!line.hall.trim()) return 'Ingen Hall/sted'
    if (place.by === 'own') return 'Valgt for prosjektet'
    if (place.by === 'choice') return 'Valgt for teksten'
    if (place.by === 'text') return 'Lest fra teksten'
    if (place.by === 'rule') return `Regel: ${line.hall.trim().replace(/^hall\s+/i, '').toUpperCase()} er ${place.hall}`
    if (place.by === 'phrase') return `Regel: inneholder «${place.phrase}»`
    if (place.by === 'shared') return `Felles for ${shared.get(place.hall)?.join(', ') ?? place.hall}`
    return 'Ingen regel'
  }
  /**
   * The hall a line counts under in the Kalender. The planner's choice is for the Hall/Sted text in every project,
   * unless the text has a choice for this project alone: then that is the one the list changes.
   */
  const locationCell = (line: { hall: string; projectNo: string }) => {
    const text = line.hall
    const place = placeOfLine(line)
    const auto = resolveHall(text, halls, ws.hallAliases, rules) ?? UNRESOLVED_HALL
    if (!text.trim()) return <span className="muted">{UNRESOLVED_HALL}</span>
    const offered = offerFor(line)
    const scope = place.own ? `Valget gjelder linjene med «${text.trim()}» i dette prosjektet.` : `Valget gjelder alle linjer med «${text.trim()}», i alle prosjekter.`
    return (
      <>
        <select
          className={`location ${place.hall === UNRESOLVED_HALL ? 'unresolved' : ''} ${place.chosen ? 'chosen' : ''}`}
          value={place.chosen ? place.hall : ''}
          aria-label={`Plassering for ${text}`}
          title={`${place.by === 'none' ? 'Hall/sted finnes ikke blant hallene på VenYou-fanen. Behovet teller med under «Uavklart» til du velger en hall. ' : ''}${scope}`}
          onChange={(e) => setHallAlias(text, e.target.value || undefined, place.own ? line.projectNo : undefined)}
        >
          <option value="">{auto} (auto)</option>
          {places.map((hall) => (
            <option key={hall} value={hall}>
              {hall === PROJECT_HALLS ? `${hall} (hallene samlet)` : hall}
            </option>
          ))}
          <option value={UNRESOLVED_HALL}>{UNRESOLVED_HALL}</option>
        </select>
        {offered && (
          <button
            className="link"
            title={
              offered.own
                ? `Prosjektet har booket ${offered.hall}. Plasserer linjene med «${text.trim()}» i dette prosjektet i ${offered.hall}.`
                : offered.hall === PROJECT_HALLS
                  ? `«${text.trim()}» nevner flere haller. ${PROJECT_HALLS} er hallene til prosjektet samlet: behovet teller som ett sted i Kalender, med dagene til alle hallene.`
                  : `«${text.trim()}» nevner ${offered.hall}. Plasserer alle linjer med denne teksten i ${offered.hall}.`
            }
            onClick={() => setHallAlias(text, offered.hall, offered.own ? line.projectNo : undefined)}
          >
            Bruk {offered.hall}
          </button>
        )}
      </>
    )
  }
  /** The Hall/Sted texts that are not placed, with the hall each is offered: for every project, or for the project of the line. */
  const offers = useMemo(() => {
    const found = new Map<string, { text: string; hall: string; projectNo?: string }>()
    for (const line of ws.demand) {
      const offered = offerFor(line)
      if (!offered) continue
      const projectNo = offered.own ? line.projectNo : undefined
      found.set(`${projectNo ?? ''}|${line.hall.trim().toLowerCase()}`, { text: line.hall, hall: offered.hall, projectNo })
    }
    return [...found.values()]
  }, [ws.demand, halls, ws.hallAliases, booked, rules]) // eslint-disable-line react-hooks/exhaustive-deps
  const takeOffers = () => {
    // One step to undo: the choices are made in the same go.
    for (const { text, hall, projectNo } of offers) setHallAlias(text, hall, projectNo)
    setMessage({ kind: 'ok', text: `${offers.length === 1 ? '1 Hall/sted-tekst' : `${offers.length} Hall/sted-tekster`} er plassert etter forslaget. Kan angres med Ctrl/Cmd+Z.` })
  }
  const vismaImport = ws.visma?.find((v) => v.projectNo === projectNo)
  // Every project's Visma lines, with what still needs the planner: the filter and the actions for all projects read from this.
  const review = useMemo(() => reviewVisma(ws.visma ?? [], kpi, ws.overrides ?? {}, halls, ws.hallAliases, rules), [ws.visma, kpi, ws.overrides, halls, ws.hallAliases, rules])
  const vismaLines = useMemo(() => review.get(projectNo)?.lines ?? [], [review, projectNo])
  // With no project chosen, the lines of every project are in scope, in the order of the project list.
  const scopeLines = useMemo(() => (projectNo ? vismaLines : projects.flatMap(([no]) => review.get(no)?.lines ?? [])), [projectNo, vismaLines, projects, review])
  const matchedLines = useMemo(() => scopeLines.filter((line) => matchesFilter(line, filter, halls, ws.hallAliases, rules)), [scopeLines, filter, halls, ws.hallAliases, rules])
  const totals = useMemo(() => {
    const sum = (filter: LineFilter) => [...review.values()].reduce((n, project) => n + countOf(project, filter), 0)
    return { all: sum('all'), open: sum('open'), unresolved: sum('unresolved'), issue: sum('issue'), ready: [...review.values()].reduce((n, project) => n + project.ready, 0) }
  }, [review])
  const orphans = useMemo(() => (vismaImport ? orphanedDecisions(projectNo, vismaLines, ws.overrides ?? {}) : []), [vismaImport, projectNo, vismaLines, ws.overrides])
  const projectLines = useMemo(() => ws.demand.filter((l) => l.projectNo === projectNo), [ws.demand, projectNo])
  const ownLines = useMemo(
    () => projectLines.filter((l) => !isVismaLine(l)).sort((a, b) => a.basis.localeCompare(b.basis, 'nb') || a.competence.localeCompare(b.competence, 'nb')),
    [projectLines],
  )

  /** Hours per competence and basis, which is what the Kalender rows pick from. */
  const summary = useMemo(() => {
    const bases = new Set<string>()
    const byCompetence = new Map<string, Map<string, [number, number]>>()
    for (const line of projectLines) {
      if (!line.assemblyHours && !line.dismantleHours) continue
      bases.add(line.basis)
      const row = byCompetence.get(line.competence) ?? new Map<string, [number, number]>()
      const cell = row.get(line.basis) ?? [0, 0]
      row.set(line.basis, [cell[0] + line.assemblyHours, cell[1] + line.dismantleHours])
      byCompetence.set(line.competence, row)
    }
    const order = [...bases].sort((a, b) => (a === PLANNED_BASIS ? -1 : b === PLANNED_BASIS ? 1 : a.localeCompare(b, 'nb')))
    return { bases: order, rows: [...byCompetence].sort((a, b) => a[0].localeCompare(b[0], 'nb')) }
  }, [projectLines])

  const readFiles = async (files: File[], handle: (bytes: Uint8Array, name: string) => string) => {
    if (!files.length) return
    try {
      const done: string[] = []
      for (const file of files) done.push(handle(new Uint8Array(await file.arrayBuffer()), file.name))
      setMessage({ kind: 'ok', text: done.join(' ') })
    } catch (e) {
      setMessage({ kind: 'error', text: errorText(e) })
    }
  }

  const onVismaFiles = (files: File[]) =>
    readFiles(files, (bytes, name) => {
      const imported = importVisma(readVismaExport(bytes), name)
      // One project is opened; an export with several lands on the list of them all.
      if (imported.length) onProjectChange(imported.length === 1 ? imported[0] : '')
      return `Visma-linjene for ${imported.join(', ')} er erstattet med ${name}. Kan angres med Ctrl/Cmd+Z.`
    })

  const withIssue = vismaLines.filter((line) => line.issue && line.issue !== 'no-product-type').length
  const withRef = (line: VismaLine, patch: Parameters<typeof setLineOverride>[2]) => ({ ...patch, ref: { avdeling: line.avdeling, workType: line.sourceWorkType, hall: line.hall } })
  const override = (line: VismaLine, patch: Parameters<typeof setLineOverride>[2]) => setLineOverride(line.projectNo, line.key, withRef(line, patch))
  /** Takes the given lines in or out of the plan in one go, so the project is recalculated once. */
  const setInPlan = (lines: VismaLine[], inPlan: boolean) => setLineOverrides([...new Set(lines.map((line) => line.projectNo))], lines.map((line) => ({ key: line.key, patch: withRef(line, { inPlan }) })))
  // The Visma lines as a table, with filters on its columns on top of the filter above. Across all projects each line also names its project.
  const lineColumns: Column<VismaLine>[] = [
    {
      key: 'inPlan',
      head: 'I plan',
      title: 'Linjen teller med i «Planlagt»',
      className: 'center',
      text: (line) => (line.inPlan ? 'Ja' : 'Nei'),
      cell: (line) => <input type="checkbox" checked={line.inPlan} onChange={(e) => override(line, { inPlan: e.target.checked })} aria-label="I plan" />,
    },
    ...(projectNo
      ? []
      : [
          {
            key: 'project',
            head: 'Prosjekt',
            text: (line) => projectNames.get(line.projectNo) ?? line.projectNo,
            cell: (line) => (
              <button className="link" title="Åpne prosjektet" onClick={() => onProjectChange(line.projectNo)}>
                {projectNames.get(line.projectNo) ?? line.eventName} <span className="muted">{line.projectNo}</span>
              </button>
            ),
          } satisfies Column<VismaLine>,
        ]),
    { key: 'competence', head: 'Kompetanse', text: (line) => line.competence, cell: (line) => line.competence },
    {
      key: 'workType',
      head: 'Arbeidstype',
      text: (line) => productTypeLabel(line.workType),
      cell: (line) => (
        <>
          {line.sourceWorkType === NO_PRODUCT_TYPE ? (
            <select value={line.workType === NO_PRODUCT_TYPE ? '' : line.workType} onChange={(e) => override(line, { workType: e.target.value || undefined })}>
              <option value="">Uten produkttype …</option>
              {kpi.workTypes.map((t) => (
                <option key={t.productType} value={productTypeName(t.productType)}>
                  {productTypeLabel(t.productType)} ({t.unit})
                </option>
              ))}
            </select>
          ) : (
            productTypeLabel(line.workType)
          )}
          {line.issue && line.issue !== 'no-product-type' && <span className="issue"> {ISSUE_TEXT[line.issue]}</span>}
          {line.missingRate && <span className="hint"> {MISSING_RATE_TEXT[line.missingRate]}</span>}
        </>
      ),
    },
    { key: 'hall', head: 'Hall / sted', text: (line) => line.hall, cell: (line) => line.hall },
    { key: 'place', head: 'Plassering', title: 'Hallen linjen teller under i Kalender', text: (line) => placeOfLine(line).hall, cell: (line) => locationCell(line) },
    { key: 'rule', head: 'Regel', title: 'Hvorfor linjen teller der den gjør: teksten er hallens navn, en regel for hallbokstaven, felles plass for hallene med samme bokstav, en regel for ord i teksten, eller ditt eget valg. Reglene står under «Hallregler».', className: 'muted', text: ruleOf, cell: ruleOf },
    { key: 'avdeling', head: 'Avd.', text: (line) => line.avdeling, cell: (line) => line.avdeling },
    { key: 'quantity', head: 'Antall', className: 'num', text: (line) => formatFte(line.quantity, 1), sort: (line) => line.quantity, cell: (line) => formatFte(line.quantity, 1), cellProps: (line) => ({ title: `${line.rowCount} ordrelinjer` }) },
    { key: 'unit', head: 'Enhet', text: (line) => line.unit, cell: (line) => line.unit },
    {
      key: 'effekt',
      head: 'Effekt',
      title: 'Andel av timene som trekkes fra: 1 fjerner alt, 0,9 beholder 10 %, negativt tall legger til',
      className: 'num',
      text: (line) => (line.effekt ? decimalText(line.effekt) : ''),
      sort: (line) => line.effekt,
      cell: (line) => <NumberField value={line.effekt} onCommit={(effekt) => override(line, { effekt })} />,
    },
    {
      key: 'assembly',
      head: 'Mont. t',
      className: 'num',
      text: (line) => hours(line.assemblyHours),
      sort: (line) => line.assemblyHours,
      cell: (line) => hours(line.assemblyHours),
      cellProps: (line) => ({ title: line.rateAssembly ? `${formatFte(line.quantity, 1)} ÷ ${formatFte(line.rateAssembly, 2)}` : '' }),
    },
    {
      key: 'dismantle',
      head: 'Demont. t',
      className: 'num',
      text: (line) => hours(line.dismantleHours),
      sort: (line) => line.dismantleHours,
      cell: (line) => hours(line.dismantleHours),
      cellProps: (line) => ({ title: line.rateDismantle ? `${formatFte(line.quantity, 1)} ÷ ${formatFte(line.rateDismantle, 2)}` : '' }),
    },
    { key: 'comment', head: 'Kommentar', text: (line) => line.comment, cell: (line) => <TextField value={line.comment} onCommit={(comment) => override(line, { comment })} /> },
  ]
  const lineTable = useTable(matchedLines, lineColumns)
  const shownLines = lineTable.rows
  const columnFilters = lineTable.filtered
  const narrowed = filter !== 'all' || columnFilters > 0
  // A long list is cut: every line holds fields and a list of halls, and thousands of them make the page slow.
  const vismaTable = (
    <DataTable
      table={lineTable}
      limit={LIST_LIMIT}
      rowKey={(line) => line.key}
      rowProps={(line) => ({ className: `${line.inPlan ? 'in-plan' : ''} ${line.issue ? 'has-issue' : ''}` })}
      empty={projectNo ? 'Ingen linjer i dette prosjektet passer filteret.' : 'Ingen linjer passer filteret.'}
    />
  )

  const ownColumns: Column<DemandLine>[] = [
    { key: 'basis', head: 'Grunnlag', text: (line) => line.basis, cell: (line) => line.basis },
    { key: 'competence', head: 'Kompetanse', text: (line) => line.competence, cell: (line) => line.competence },
    { key: 'workType', head: 'Arbeidstype', text: (line) => productTypeLabel(line.workType), cell: (line) => productTypeLabel(line.workType) },
    { key: 'hall', head: 'Hall / sted', text: (line) => line.hall, cell: (line) => line.hall },
    { key: 'place', head: 'Plassering', title: 'Hallen linjen teller under i Kalender', text: (line) => placeOfLine(line).hall, cell: (line) => locationCell(line) },
    { key: 'rule', head: 'Regel', title: 'Hvorfor linjen teller der den gjør: teksten er hallens navn, en regel for hallbokstaven, felles plass for hallene med samme bokstav, eller ditt eget valg. Reglene står under «Hallregler».', className: 'muted', text: ruleOf, cell: ruleOf },
    { key: 'source', head: 'Kilde', text: (line) => line.source, cell: (line) => line.source },
    { key: 'quantity', head: 'Antall', className: 'num', text: (line) => (line.quantity === null ? '' : formatFte(line.quantity, 1)), sort: (line) => line.quantity ?? NaN, cell: (line) => (line.quantity === null ? '' : formatFte(line.quantity, 1)) },
    { key: 'unit', head: 'Enhet', text: (line) => line.unit, cell: (line) => line.unit },
    { key: 'assembly', head: 'Mont. t', className: 'num', text: (line) => hours(line.assemblyHours), sort: (line) => line.assemblyHours, cell: (line) => hours(line.assemblyHours) },
    { key: 'dismantle', head: 'Demont. t', className: 'num', text: (line) => hours(line.dismantleHours), sort: (line) => line.dismantleHours, cell: (line) => hours(line.dismantleHours) },
    { key: 'comment', head: 'Kommentar', text: (line) => line.comment, cell: (line) => line.comment },
    {
      key: 'actions',
      className: 'actions',
      cell: (line) => (
        <>
          <button className="row-action" title="Endre" onClick={() => setDialog({ line })}>
            <Pencil size={13} aria-hidden />
          </button>
          <button className="row-action" title="Slett" onClick={() => confirm(`Slette linjen ${line.competence} · ${line.workType}?`) && removeDemandLine(line.id)}>
            <X size={13} aria-hidden />
          </button>
        </>
      ),
    },
  ]
  const ownTable = useTable(ownLines, ownColumns)

  const lineCount = (n: number) => `${n} ${n === 1 ? 'linje' : 'linjer'}`
  const skippedText = (skipped: number) => (skipped ? ` ${lineCount(skipped)} gir ingen timer og ble stående: de mangler produkttype eller sats.` : '')
  /** Takes the lines that are shown into the plan, in one project or in all of them. It leaves the lines that give no hours, and says how many. */
  const takeShownIn = () => {
    const open = shownLines.filter((l) => !l.inPlan)
    const taken = open.filter((l) => !l.issue)
    setInPlan(taken, true)
    const inProjects = new Set(taken.map((l) => l.projectNo)).size
    setMessage({ kind: 'ok', text: `Tok ${lineCount(taken.length)}${inProjects > 1 ? ` i ${inProjects} prosjekter` : ''} inn i plan.${skippedText(open.length - taken.length)}${taken.length ? ' Kan angres med Ctrl/Cmd+Z.' : ''}` })
  }
  // With a filter on, the list holds the projects that have such lines, and the one that is open.
  const listed = filter === 'all' ? projects : projects.filter(([no]) => no === projectNo || countOf(review.get(no) ?? NO_REVIEW, filter) > 0)
  const attention = (no: string) => {
    const project = review.get(no)
    return project ? [project.unresolved ? `${project.unresolved} uavklart` : '', project.issues ? `${project.issues} uten timer` : ''].filter(Boolean).map((text) => ` · ${text}`).join('') : ''
  }
  const plannedCount = vismaLines.filter((l) => l.inPlan).length
  const projectName = projects.find(([no]) => no === projectNo)?.[1] ?? ''

  // «Ta alle inn i plan» and «Ta alle ut» act on the lines the filter lets through, in the project or in all of them.
  const bulkButtons = (
    <>
      <button onClick={takeShownIn}>{narrowed ? 'Ta de viste inn i plan' : 'Ta alle inn i plan'}</button>
      <button onClick={() => setInPlan(shownLines.filter((l) => l.inPlan), false)}>{narrowed ? 'Ta de viste ut' : 'Ta alle ut'}</button>
      {columnFilters > 0 && (
        <button className="ghost" onClick={lineTable.clearFilters} title="Fjerner filtrene i kolonnene">
          Nullstill kolonnefilter ({columnFilters})
        </button>
      )}
    </>
  )

  return (
    <div className="behov">
      <div className="toolbar">
        <label>
          Prosjekt
          <select value={projectNo} onChange={(e) => onProjectChange(e.target.value)}>
            <option value="">Alle prosjekter</option>
            {listed.map(([no, name]) => (
              <option key={no} value={no}>
                {name} ({no}){attention(no)}
              </option>
            ))}
          </select>
        </label>
        {totals.all > 0 && (
          <Segmented
            label="Vis Visma-linjer"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Alle', title: 'Alle prosjekter og alle Visma-linjer' },
              { value: 'open', label: `Ikke i plan ${totals.open}`, title: 'Linjer som ikke er tatt inn i plan, og prosjektene som har slike' },
              { value: 'unresolved', label: `Uavklart ${totals.unresolved}`, title: 'Linjer der Hall/sted ikke er en hall på VenYou-fanen, og prosjektene som har slike' },
              { value: 'issue', label: `Uten timer ${totals.issue}`, title: 'Linjer som ikke gir timer fordi produkttype eller sats mangler, og prosjektene som har slike' },
            ]}
          />
        )}
        <span className="toolbar-gap" />
        <UndoRedoButtons />
        <button onClick={onOpenRules} title="Reglene som plasserer Hall/sted i en hall: steder som står for flere haller, ord som betyr en hall, og valgene du har gjort for enkelte tekster.">
          Hallregler
        </button>
        <button className="primary" onClick={() => vismaInput.current?.click()}>
          Importer Visma-utskrift
        </button>
        <input ref={vismaInput} type="file" accept=".xlsx" hidden onChange={(e) => takeFiles(e, onVismaFiles)} />
      </div>

      <MessageBanner message={message} onClose={() => setMessage(null)} />

      <div className="behov-body">
        {offers.length > 0 && (
          <p className="notice">
            {offers.length === 1 ? '1 Hall/sted-tekst' : `${offers.length} Hall/sted-tekster`} som står som «Uavklart» har et forslag i kolonnen Plassering, fra hallen teksten nevner eller hallene prosjektet har booket.{' '}
            <button className="link" title={offers.map(({ text, hall }) => `${text}: ${hall}`).join('\n')} onClick={takeOffers}>
              Bruk forslagene
            </button>
          </p>
        )}
        {withIssue > 0 && (
          <p className="notice">
            {withIssue === 1 ? '1 Visma-linje' : `${withIssue} Visma-linjer`} gir ingen timer ennå fordi produkttypen mangler enhet, kompetanse eller sats.{' '}
            <button className="link" onClick={onOpenSetup}>
              Åpne KPI
            </button>
          </p>
        )}
        {!projectNo && totals.all === 0 && <p className="muted">Velg et prosjekt, eller importer en Visma-utskrift.</p>}
        {!projectNo && totals.all > 0 && (
          <section>
            <div className="section-title">
              <h3>Visma-linjer i alle prosjekter</h3>
              <span className="muted small">
                {review.size} {review.size === 1 ? 'prosjekt' : 'prosjekter'} · {totals.all - totals.open} av {totals.all} linjer i plan
                {narrowed && ` · viser ${shownLines.length}`}
              </span>
              <span className="toolbar-gap" />
              {bulkButtons}
            </div>
            <p className="hint">Velg et prosjekt i listen eller klikk på navnet for timer per kompetanse, egne linjer og historikk.</p>
            {vismaTable}
            {shownLines.length > LIST_LIMIT && (
              <p className="muted">
                Viser de første {LIST_LIMIT} av {shownLines.length} linjer. Handlingene over gjelder alle {shownLines.length}; bruk filteret eller velg et prosjekt for å se resten.
              </p>
            )}
          </section>
        )}

        {projectNo && (
          <>
            <h2>
              {projectName} <span className="muted">{projectNo}</span>
            </h2>

            <section>
              <h3>Timer per kompetanse og grunnlag</h3>
              <p className="hint">Radene i Kalender henter behov herfra. «{PLANNED_BASIS}» er tallene du planlegger med.</p>
              {summary.rows.length ? (
                <table className="ledger summary">
                  <thead>
                    <tr>
                      <th>Kompetanse</th>
                      {summary.bases.map((b) => (
                        <th key={b} colSpan={2} className={b === PLANNED_BASIS ? 'planned' : ''}>
                          {b || '(uten grunnlag)'}
                        </th>
                      ))}
                    </tr>
                    <tr className="sub">
                      <th />
                      {summary.bases.flatMap((b) => [<th key={`${b}m`}>Mont.</th>, <th key={`${b}d`}>Demont.</th>])}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map(([competence, cells]) => (
                      <tr key={competence}>
                        <td>{competence || '(uten kompetanse)'}</td>
                        {summary.bases.flatMap((b) => {
                          const cell = cells.get(b)
                          return [
                            <td key={`${b}m`} className={`num ${b === PLANNED_BASIS ? 'planned' : ''}`}>{cell ? hours(cell[0]) : ''}</td>,
                            <td key={`${b}d`} className={`num ${b === PLANNED_BASIS ? 'planned' : ''}`}>{cell ? hours(cell[1]) : ''}</td>,
                          ]
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">Ingen behov registrert for prosjektet.</p>
              )}
            </section>

            <section>
              <div className="section-title">
                <h3>Visma-linjer</h3>
                {vismaImport && (
                  <span className="muted small">
                    {vismaImport.fileName}, lest inn {new Date(vismaImport.importedAt).toLocaleString('nb-NO')} · {vismaImport.rows.length} ordrelinjer · {plannedCount} av{' '}
                    {vismaLines.length} linjer i plan{narrowed && ` · viser ${shownLines.length}`}
                  </span>
                )}
                <span className="toolbar-gap" />
                {vismaLines.length > 0 && bulkButtons}
              </div>
              {orphans.length > 0 && (
                <div className="orphans" role="alert">
                  <strong>
                    {orphans.length === 1 ? '1 linje du har endret finnes' : `${orphans.length} linjer du har endret finnes`} ikke lenger i Visma-utskriften.
                  </strong>{' '}
                  Valgene er tatt vare på og gjelder igjen hvis linjen kommer tilbake. Timene deres teller ikke med nå.
                  <ul>
                    {orphans.map((o) => (
                      <li key={o.key}>
                        <span>
                          {o.workType} · {o.hall} · avd. {o.avdeling}
                        </span>
                        <span className="muted">
                          {[
                            o.override.inPlan && 'i plan',
                            o.override.effekt ? `Effekt ${decimalText(o.override.effekt)}` : '',
                            o.override.workType && `arbeidstype ${o.override.workType}`,
                            o.override.comment && `«${o.override.comment}»`,
                          ]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                        <button className="link" onClick={() => removeLineOverride(projectNo, o.key)}>
                          Glem valgene
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {vismaImport ? (
                vismaTable
              ) : (
                <p className="muted">Ingen Visma-utskrift er lest inn for prosjektet.</p>
              )}
            </section>

            <section>
              <div className="section-title">
                <h3>Egne linjer og historikk</h3>
                <span className="toolbar-gap" />
                <button onClick={() => setDialog({})}>+ Ny linje</button>
              </div>
              {ownLines.length ? (
                <DataTable table={ownTable} rowKey={(line) => line.id} rowProps={(line) => ({ className: line.basis === PLANNED_BASIS ? 'in-plan' : undefined })} />
              ) : (
                <p className="muted">Ingen egne linjer. Bruk «Ny linje» for egen opptelling eller timer som ikke ligger i Visma.</p>
              )}
            </section>
          </>
        )}
      </div>

      {dialog && projectNo && <DemandLineDialog line={dialog.line} projectNo={projectNo} projectName={projectName} onClose={() => setDialog(null)} />}
    </div>
  )
}
