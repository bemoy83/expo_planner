import { useEffect, useMemo, useState } from 'react'
import { Check, Minus, X } from 'lucide-react'
import { formatFte } from '../../domain/calc'
import { competenceStyles } from '../../domain/competences'
import { EMPTY_KPI } from '../../domain/kpi'
import { decimalText } from '../../domain/numbers'
import { competenceKey } from '../../domain/types'
import { NO_PRODUCT_TYPE, orphanedDecisions } from '../../domain/visma'
import { countOf, missingText, type LineFilter, type LineStatus, type ProjectReview, type ReviewedLine } from '../../domain/vismaReview'
import { useWorkspace } from '../../store/workspaceStore'
import { DataTable } from '../DataTable'
import { useTable, type Column } from '../useTable'
import { Segmented, TriCheckbox, type Message } from '../common'
import { count, isTyping } from '../dom'
import { NumberField, TextField } from '../fields'
import { ProjectRail } from './ProjectRail'
import { usePlacing } from './usePlacing'

const hours = (value: number) => formatFte(value, 1)

/** The most lines listed at once. */
const LIST_LIMIT = 400

const STATUS_TEXT: Record<LineStatus, string> = { need: 'Trenger avklaring', counted: 'Med', excluded: 'Utelatt' }

interface Props {
  projectNo: string
  onProjectChange: (projectNo: string) => void
  onOpenSetup: () => void
  review: Map<string, ProjectReview>
  /** The name of each project, by number. */
  names: Map<string, string>
  onMessage: (message: Message) => void
}

/**
 * Going through the Visma lines: a line that gives hours and has a hall counts by itself. What is marked is the exception:
 * the lines that lack something, and those the planner has left out.
 */
export function VismaView({ projectNo, onProjectChange, onOpenSetup, review, names, onMessage }: Props) {
  const { workspace, setLineOverride, setLineOverrides, removeLineOverride } = useWorkspace()
  const ws = workspace!
  const kpi = ws.kpi ?? EMPTY_KPI
  const { locationCell } = usePlacing()
  const totals = useMemo(() => {
    const sum = (filter: LineFilter) => [...review.values()].reduce((n, project) => n + countOf(project, filter), 0)
    return { all: sum('all'), need: sum('need'), counted: sum('counted'), excluded: sum('excluded') }
  }, [review])
  const [filter, setFilter] = useState<LineFilter>(() => (totals.need ? 'need' : 'all'))
  // The first export read in opens on what needs the planner, as the page does when it opens with lines.
  const [hadLines, setHadLines] = useState(totals.all > 0)
  if (!hadLines && totals.all > 0) {
    setHadLines(true)
    if (totals.need) setFilter('need')
  }
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const styles = useMemo(() => new Map(competenceStyles(ws).map((style) => [style.key, style])), [ws])

  const projects = useMemo(() => [...review.keys()].sort((a, b) => (names.get(a) ?? a).localeCompare(names.get(b) ?? b, 'nb')), [review, names])
  const project = projectNo ? review.get(projectNo) : undefined
  // With no project chosen, the lines of every project are in scope, in the order of the rail.
  const scope = useMemo(() => (projectNo ? (review.get(projectNo)?.lines ?? []) : projects.flatMap((no) => review.get(no)!.lines)), [projectNo, review, projects])
  const scopeCount = (status: LineFilter) => (project ? countOf(project, status) : totals[status])
  const scopeHours = project ? project.countedHours : [...review.values()].reduce((sum, p) => sum + p.countedHours, 0)
  const q = search.trim().toLowerCase()
  const matched = useMemo(
    () =>
      scope.filter(
        (line) =>
          (filter === 'all' || line.status === filter) &&
          (!q || [names.get(line.projectNo) ?? line.eventName, line.competence, line.workType, line.hall, line.place, line.avdeling, line.unit, line.comment].some((text) => text.toLowerCase().includes(q))),
      ),
    [scope, filter, q, names],
  )

  const withRef = (line: ReviewedLine, patch: Parameters<typeof setLineOverride>[2]) => ({ ...patch, ref: { avdeling: line.avdeling, workType: line.sourceWorkType, hall: line.hall } })
  const override = (line: ReviewedLine, patch: Parameters<typeof setLineOverride>[2]) => setLineOverride(line.projectNo, line.key, withRef(line, patch))
  /** Leaves the lines out, or takes them with again, in one go, so each project is recalculated once. */
  const setExcluded = (lines: ReviewedLine[], excluded: boolean) => {
    const changed = lines.filter((line) => line.excluded !== excluded)
    if (!changed.length) return
    setLineOverrides([...new Set(changed.map((line) => line.projectNo))], changed.map((line) => ({ key: line.key, patch: withRef(line, { excluded }) })))
    onMessage({ kind: 'ok', text: `${excluded ? 'Utelot' : 'Tok med'} ${count(changed.length, 'linje', 'linjer')}. Kan angres med Ctrl/Cmd+Z.` })
  }

  const columns: Column<ReviewedLine>[] = [
    {
      key: 'pick',
      className: 'pick',
      head: (
        <TriCheckbox
          label="Velg alle som vises"
          checked={matched.length > 0 && matched.every((line) => selected.has(line.key))}
          partial={matched.some((line) => selected.has(line.key)) && !matched.every((line) => selected.has(line.key))}
          onChange={(on) => setSelected(on ? new Set(matched.map((line) => line.key)) : new Set())}
        />
      ),
      cell: (line) => (
        <input
          type="checkbox"
          checked={selected.has(line.key)}
          aria-label="Velg linjen"
          onChange={(e) =>
            setSelected((s) => {
              const next = new Set(s)
              if (e.target.checked) next.add(line.key)
              else next.delete(line.key)
              return next
            })
          }
        />
      ),
    },
    {
      key: 'status',
      className: 'status',
      title: 'Status: trenger avklaring, med eller utelatt',
      text: (line) => STATUS_TEXT[line.status],
      cell: (line) =>
        line.status === 'need' ? (
          <span className="need-dot" role="img" aria-label={missingText(line.missing)} title={missingText(line.missing)} />
        ) : (
          <button
            className={`exclude ${line.excluded ? 'on' : ''}`}
            aria-pressed={line.excluded}
            title={line.excluded ? 'Utelatt. Klikk for å ta linjen med igjen.' : 'Utelat linjen: timene teller ikke'}
            onClick={() => setExcluded([line], !line.excluded)}
          >
            <Minus size={12} aria-hidden />
          </button>
        ),
    },
    ...(projectNo
      ? []
      : [
          {
            key: 'project',
            head: 'Prosjekt',
            text: (line) => names.get(line.projectNo) ?? line.eventName,
            cell: (line) => (
              <button className="link" title={`Åpne ${names.get(line.projectNo) ?? line.eventName} ${line.projectNo}`} onClick={() => onProjectChange(line.projectNo)}>
                {names.get(line.projectNo) ?? line.eventName}
              </button>
            ),
          } satisfies Column<ReviewedLine>,
        ]),
    {
      key: 'competence',
      head: 'Kompetanse',
      text: (line) => line.competence,
      cell: (line) => {
        const style = styles.get(competenceKey(line.competence))
        return line.issue ? (
          <span className="muted">–</span>
        ) : (
          <span className="competence">
            {style && <i className="competence-dot" style={{ background: `var(--${style.color})` }} aria-hidden />}
            {line.competence}
          </span>
        )
      },
    },
    {
      key: 'workType',
      head: 'Arbeidstype',
      text: (line) => (line.issue === 'no-product-type' ? 'Mangler arbeidstype' : line.workType),
      cell: (line) => (
        <span className="cell-line">
          {line.sourceWorkType === NO_PRODUCT_TYPE ? (
            <select className={line.issue ? 'unresolved' : ''} value={line.workType === NO_PRODUCT_TYPE ? '' : line.workType} onChange={(e) => override(line, { workType: e.target.value || undefined })}>
              <option value="">Velg type …</option>
              {kpi.workTypes.map((t) => (
                <option key={t.productType} value={t.productType}>
                  {t.productType} ({t.unit})
                </option>
              ))}
            </select>
          ) : (
            <span className="ellipsis">{line.workType}</span>
          )}
          {line.issue === 'no-rate' && (
            <button className="alert-chip" title="Produkttypen mangler sats for denne enheten. Åpne KPI." onClick={onOpenSetup}>
              uten sats
            </button>
          )}
          {line.issue === 'unknown-work-type' && (
            <button className="alert-chip" title="Produkttypen finnes ikke i KPI-oppsettet. Åpne KPI." onClick={onOpenSetup}>
              ikke på KPI
            </button>
          )}
          {line.missingRate && <span className="faint">{line.missingRate === 'assembly' ? 'ingen sats for montering' : 'ingen sats for demontering'}</span>}
        </span>
      ),
    },
    {
      key: 'place',
      head: 'Plassering',
      title: 'Hallen linjen teller under i Kalender, med Hall/sted fra Visma etter',
      text: (line) => line.place,
      cell: (line) => (
        <span className="cell-line">
          {locationCell(line)}
          <span className="faint ellipsis" title="Hall/sted i Visma">
            «{line.hall.trim() || 'tom'}»
          </span>
        </span>
      ),
    },
    { key: 'avdeling', head: 'Avd.', className: 'num', text: (line) => line.avdeling, cell: (line) => line.avdeling },
    {
      key: 'quantity',
      head: 'Antall',
      className: 'num',
      text: (line) => formatFte(line.quantity, 1),
      sort: (line) => line.quantity,
      cell: (line) => (
        <>
          {formatFte(line.quantity, 1)} <span className="unit">{line.unit}</span>
        </>
      ),
      cellProps: (line) => ({ title: count(line.rowCount, 'ordrelinje', 'ordrelinjer') }),
    },
    {
      key: 'assembly',
      head: 'Mont.',
      className: 'num',
      title: 'Montering, timer',
      text: (line) => hours(line.assemblyHours),
      sort: (line) => line.assemblyHours,
      cell: (line) => (line.assemblyHours ? hours(line.assemblyHours) : ''),
      cellProps: (line) => ({ title: line.rateAssembly ? `${formatFte(line.quantity, 1)} ÷ ${formatFte(line.rateAssembly, 2)}` : '' }),
    },
    {
      key: 'dismantle',
      head: 'Dem.',
      className: 'num',
      title: 'Demontering, timer',
      text: (line) => hours(line.dismantleHours),
      sort: (line) => line.dismantleHours,
      cell: (line) => (line.dismantleHours ? hours(line.dismantleHours) : ''),
      cellProps: (line) => ({ title: line.rateDismantle ? `${formatFte(line.quantity, 1)} ÷ ${formatFte(line.rateDismantle, 2)}` : '' }),
    },
    {
      key: 'effekt',
      head: 'Effekt',
      title: 'Andel av timene som trekkes fra: 1 fjerner alt, 0,9 beholder 10 %, negativt tall legger til',
      className: 'num',
      text: (line) => (line.effekt ? decimalText(line.effekt) : ''),
      sort: (line) => line.effekt,
      cell: (line) => <NumberField value={line.effekt} onCommit={(effekt) => override(line, { effekt })} />,
    },
    { key: 'comment', head: 'Kommentar', text: (line) => line.comment, cell: (line) => <TextField value={line.comment} onCommit={(comment) => override(line, { comment })} /> },
  ]
  const table = useTable(matched, columns)
  const picked = scope.filter((line) => selected.has(line.key))
  // Esc lets go of what is selected, unless a field or a menu has the key.
  const anyPicked = picked.length > 0
  useEffect(() => {
    if (!anyPicked) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !isTyping(e.target) && setSelected(new Set())
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anyPicked])
  const orphans = projectNo && project ? orphanedDecisions(projectNo, project.lines, ws.overrides ?? {}) : []

  const railAside = (p: { need: number }) =>
    p.need ? (
      <span className="count-chip alert" title={`${count(p.need, 'linje', 'linjer')} trenger avklaring`}>
        {p.need}
      </span>
    ) : (
      <Check size={14} className="rail-done" aria-label="Ingenting å avklare" />
    )

  return (
    <div className="behov-split">
      <ProjectRail
        all={{ label: 'Alle prosjekter', aside: railAside(totals) }}
        heading="Visma-utskrifter"
        projectNo={projectNo}
        onPick={(no) => (setSelected(new Set()), onProjectChange(no))}
        items={projects.map((no) => {
          const p = review.get(no)!
          return {
            projectNo: no,
            name: names.get(no) ?? no,
            aside: railAside(p),
            sub: [`${p.counted} med`, p.excluded ? `${p.excluded} utelatt` : ''].filter(Boolean).join(' · '),
            done: p.lines.length ? p.counted / p.lines.length : 0,
          }
        })}
      />
      <div className="behov-main">
        <div className="behov-intro">
          <h2>
            {projectNo ? (names.get(projectNo) ?? projectNo) : 'Alle prosjekter'} {projectNo && <span className="project-no">{projectNo}</span>}
          </h2>
          <p className="muted">Linjer med arbeidstype, sats og hall er med av seg selv. Avklar resten, eller utelat det som ikke skal med.</p>
        </div>
        {totals.all === 0 ? (
          <p className="muted behov-empty">Ingen Visma-utskrift er lest inn. Bruk «Importer Visma-utskrift» øverst.</p>
        ) : (
          <>
            <div className="behov-tools">
              <Segmented
                label="Vis linjene"
                value={filter}
                onChange={(next) => (setFilter(next), setSelected(new Set()))}
                options={[
                  {
                    value: 'need',
                    label: (
                      <>
                        Trenger avklaring {scopeCount('need') > 0 && <span className="count-chip alert">{scopeCount('need')}</span>}
                      </>
                    ),
                    title: 'Linjer som mangler arbeidstype, sats eller hall, og som derfor ikke teller',
                  },
                  { value: 'counted', label: <>Med <span className="count">{scopeCount('counted')}</span></>, title: 'Linjer som teller i behovet det planlegges med' },
                  { value: 'excluded', label: <>Utelatt <span className="count">{scopeCount('excluded')}</span></>, title: 'Linjer du har utelatt' },
                  { value: 'all', label: <>Alle <span className="count">{scopeCount('all')}</span></> },
                ]}
              />
              <input className="search" type="search" placeholder="Søk i linjene" aria-label="Søk i linjene" value={search} onChange={(e) => setSearch(e.target.value)} />
              {table.filtered > 0 && (
                <button className="ghost" onClick={table.clearFilters} title="Fjerner filtrene i kolonnene">
                  Nullstill ({table.filtered})
                </button>
              )}
              <span className="toolbar-gap" />
              <span className="tools-sum" title="Timene til linjene som er med, montering og demontering">
                {hours(scopeHours)} t med
              </span>
            </div>
            {orphans.length > 0 && (
              <div className="orphans" role="alert">
                <strong>{orphans.length === 1 ? '1 linje du har endret finnes' : `${orphans.length} linjer du har endret finnes`} ikke lenger i Visma-utskriften.</strong> Valgene er tatt vare på og gjelder igjen hvis
                linjen kommer tilbake. Timene deres teller ikke med nå.
                <ul>
                  {orphans.map((o) => (
                    <li key={o.key}>
                      <span>
                        {o.workType} · {o.hall} · avd. {o.avdeling}
                      </span>
                      <span className="muted">
                        {[o.override.excluded && 'utelatt', o.override.effekt ? `Effekt ${decimalText(o.override.effekt)}` : '', o.override.workType && `arbeidstype ${o.override.workType}`, o.override.comment && `«${o.override.comment}»`]
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
            <div className="behov-table">
              {filter === 'need' && matched.length === 0 && !q ? (
                <p className="all-clear">
                  <Check size={16} aria-hidden /> Ingenting å avklare{projectNo ? ' i prosjektet' : ''}.
                </p>
              ) : (
                <DataTable
                  table={table}
                  className="visma-lines"
                  limit={LIST_LIMIT}
                  rowKey={(line) => line.key}
                  rowProps={(line) => ({ className: [line.excluded ? 'excluded' : '', selected.has(line.key) ? 'selected' : ''].filter(Boolean).join(' ') || undefined })}
                  empty={q ? 'Ingen linjer passer søket.' : 'Ingen linjer passer filteret.'}
                />
              )}
              {table.rows.length > LIST_LIMIT && <p className="muted">Viser de første {LIST_LIMIT} av {table.rows.length} linjer. Bruk filteret eller velg et prosjekt for å se resten.</p>}
            </div>
            {picked.length > 0 && (
              <div className="bulk-bar" role="toolbar" aria-label="Valgte linjer">
                <span>
                  <b>{picked.length}</b> valgt · {hours(picked.reduce((sum, line) => sum + line.assemblyHours + line.dismantleHours, 0))} t
                </span>
                <span className="bulk-sep" />
                <button className="ghost" onClick={() => (setExcluded(picked, true), setSelected(new Set()))}>
                  Utelat
                </button>
                <button className="ghost" onClick={() => (setExcluded(picked, false), setSelected(new Set()))}>
                  Ta med
                </button>
                <button className="ghost icon-button" aria-label="Fjern valget" title="Fjern valget (Esc)" onClick={() => setSelected(new Set())}>
                  <X size={14} aria-hidden />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
