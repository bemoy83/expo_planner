import { useMemo, useRef, useState } from 'react'
import { formatFte } from '../../domain/calc'
import { EMPTY_KPI } from '../../domain/kpi'
import { decimalText } from '../../domain/numbers'
import { PLANNED_BASIS, type DemandLine } from '../../domain/types'
import { buildVismaLines, isVismaLine, NO_PRODUCT_TYPE, orphanedDecisions, type VismaLine } from '../../domain/visma'
import { readVismaExport } from '../../import/vismaExport'
import { useWorkspace } from '../../store/workspaceStore'
import { placeOf, resolveHall, UNRESOLVED_HALL } from '../../domain/locations'
import { hallNames } from '../../domain/venue'
import { MessageBanner, UndoRedoButtons, type Message } from '../common'
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

const MISSING_RATE_TEXT: Record<NonNullable<VismaLine['missingRate']>, string> = {
  assembly: 'Ingen sats for montering',
  dismantle: 'Ingen sats for demontering',
}

interface Props {
  projectNo: string
  onProjectChange: (projectNo: string) => void
  onOpenSetup: (tab: 'produkttyper' | 'kpi') => void
}

/** The demand ledger for one project: Visma lines, the planner's own lines and earlier years, side by side. */
export function Behov({ projectNo, onProjectChange, onOpenSetup }: Props) {
  const { workspace, importVisma, setLineOverride, setLineOverrides, removeLineOverride, removeDemandLine, setHallAlias } = useWorkspace()
  const ws = workspace!
  const [message, setMessage] = useState<Message | null>(null)
  const [dialog, setDialog] = useState<{ line?: DemandLine } | null>(null)
  const vismaInput = useRef<HTMLInputElement>(null)

  const projects = useMemo(() => {
    const names = new Map<string, string>()
    for (const p of ws.projects) if (!names.has(p.projectNo)) names.set(p.projectNo, p.name)
    for (const r of ws.allocations) if (r.projectNo) names.set(r.projectNo, r.projectName)
    for (const v of ws.visma ?? []) if (!names.has(v.projectNo)) names.set(v.projectNo, v.eventName)
    const withData = new Set([...ws.demand.map((l) => l.projectNo), ...ws.allocations.map((r) => r.projectNo)])
    return [...names].filter(([no]) => withData.has(no)).sort((a, b) => a[1].localeCompare(b[1], 'nb'))
  }, [ws.projects, ws.allocations, ws.visma, ws.demand])

  const kpi = ws.kpi ?? EMPTY_KPI
  // The Kalender places demand in the halls of the hall ledger; show where each line's Hall/Sted ends up.
  const halls = useMemo(() => hallNames(ws.venue), [ws.venue])
  /**
   * The hall a line counts under in the Kalender. The planner's choice is for the Hall/Sted text,
   * so one choice places every line with that text, in every project.
   */
  const locationCell = (text: string) => {
    const place = placeOf(text, halls, ws.hallAliases)
    const auto = resolveHall(text, halls) ?? UNRESOLVED_HALL
    if (!text.trim()) return <span className="muted">{UNRESOLVED_HALL}</span>
    return (
      <select
        className={`location ${place.hall === UNRESOLVED_HALL ? 'unresolved' : ''} ${place.chosen ? 'chosen' : ''}`}
        value={place.chosen ? place.hall : ''}
        aria-label={`Plassering for ${text}`}
        title={`${place.chosen ? 'Valgt for hånd.' : place.hall === UNRESOLVED_HALL ? 'Hall/sted finnes ikke blant hallene på Haller-fanen. Behovet teller med under «Uavklart» til du velger en hall.' : 'Lest fra Hall/sted.'} Valget gjelder alle linjer med «${text.trim()}», i alle prosjekter.`}
        onChange={(e) => setHallAlias(text, e.target.value || undefined)}
      >
        <option value="">{auto} (auto)</option>
        {halls.map((hall) => (
          <option key={hall} value={hall}>
            {hall}
          </option>
        ))}
        <option value={UNRESOLVED_HALL}>{UNRESOLVED_HALL}</option>
      </select>
    )
  }
  const vismaImport = ws.visma?.find((v) => v.projectNo === projectNo)
  const vismaLines = useMemo(
    () =>
      vismaImport
        ? buildVismaLines(vismaImport.rows, kpi, ws.overrides ?? {}).sort(
            (a, b) => a.competence.localeCompare(b.competence, 'nb') || a.workType.localeCompare(b.workType, 'nb') || a.hall.localeCompare(b.hall, 'nb'),
          )
        : [],
    [vismaImport, kpi, ws.overrides],
  )
  const orphans = useMemo(() => (vismaImport ? orphanedDecisions(projectNo, vismaLines, ws.overrides ?? {}) : []), [vismaImport, projectNo, vismaLines, ws.overrides])
  const projectLines = useMemo(() => ws.demand.filter((l) => l.projectNo === projectNo), [ws.demand, projectNo])
  const legacyVisma = useMemo(() => (vismaImport ? [] : projectLines.filter(isVismaLine)), [projectLines, vismaImport])
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
      if (imported.length) onProjectChange(imported[0])
      return `Visma-linjene for ${imported.join(', ')} er erstattet med ${name}. Kan angres med Ctrl/Cmd+Z.`
    })

  const withIssue = vismaLines.filter((line) => line.issue && line.issue !== 'no-product-type').length
  const withRef = (line: VismaLine, patch: Parameters<typeof setLineOverride>[2]) => ({ ...patch, ref: { avdeling: line.avdeling, workType: line.sourceWorkType, hall: line.hall } })
  const override = (line: VismaLine, patch: Parameters<typeof setLineOverride>[2]) => setLineOverride(line.projectNo, line.key, withRef(line, patch))
  /** Takes the given lines in or out of the plan in one go, so the project is recalculated once. */
  const setInPlan = (lines: VismaLine[], inPlan: boolean) => setLineOverrides(projectNo, lines.map((line) => ({ key: line.key, patch: withRef(line, { inPlan }) })))
  /** «Ta alle inn i plan» leaves the lines that give no hours, and says how many. */
  const takeAllIn = () => {
    const open = vismaLines.filter((l) => !l.inPlan)
    const taken = open.filter((l) => !l.issue)
    setInPlan(taken, true)
    const skipped = open.length - taken.length
    const lines = (n: number) => `${n} ${n === 1 ? 'linje' : 'linjer'}`
    setMessage({ kind: 'ok', text: `Tok ${lines(taken.length)} inn i plan.${skipped ? ` ${lines(skipped)} gir ingen timer og ble stående: de mangler produkttype eller sats.` : ''}` })
  }
  const plannedCount = vismaLines.filter((l) => l.inPlan).length
  const projectName = projects.find(([no]) => no === projectNo)?.[1] ?? ''

  return (
    <div className="behov">
      <div className="toolbar">
        <label>
          Prosjekt
          <select value={projectNo} onChange={(e) => onProjectChange(e.target.value)}>
            <option value="">Velg prosjekt</option>
            {projects.map(([no, name]) => (
              <option key={no} value={no}>
                {name} ({no})
              </option>
            ))}
          </select>
        </label>
        <span className="toolbar-gap" />
        <UndoRedoButtons />
        <button className="primary" onClick={() => vismaInput.current?.click()}>
          Importer Visma-utskrift
        </button>
        <input ref={vismaInput} type="file" accept=".xlsx" hidden onChange={(e) => takeFiles(e, onVismaFiles)} />
      </div>

      <MessageBanner message={message} onClose={() => setMessage(null)} />

      <div className="behov-body">
        {withIssue > 0 && (
          <p className="notice">
            {withIssue === 1 ? '1 Visma-linje' : `${withIssue} Visma-linjer`} gir ingen timer ennå fordi produkttypen mangler enhet, kompetanse eller sats.{' '}
            <button className="link" onClick={() => onOpenSetup('produkttyper')}>
              Åpne Produkttyper
            </button>{' '}
            <button className="link" onClick={() => onOpenSetup('kpi')}>
              Åpne KPI
            </button>
          </p>
        )}
        {!projectNo && <p className="muted">Velg et prosjekt, eller importer en Visma-utskrift.</p>}

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
                    {vismaLines.length} linjer i plan
                  </span>
                )}
                <span className="toolbar-gap" />
                {vismaLines.length > 0 && (
                  <>
                    <button onClick={takeAllIn}>Ta alle inn i plan</button>
                    <button onClick={() => setInPlan(vismaLines.filter((l) => l.inPlan), false)}>Ta alle ut</button>
                  </>
                )}
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
                <table className="ledger">
                  <thead>
                    <tr>
                      <th title="Linjen teller med i «Planlagt»">I plan</th>
                      <th>Kompetanse</th>
                      <th>Arbeidstype</th>
                      <th>Hall / sted</th>
                      <th title="Hallen linjen teller under i Kalender">Plassering</th>
                      <th>Avd.</th>
                      <th className="num">Antall</th>
                      <th>Enhet</th>
                      <th className="num" title="Andel av timene som trekkes fra: 1 fjerner alt, 0,9 beholder 10 %, negativt tall legger til">
                        Effekt
                      </th>
                      <th className="num">Mont. t</th>
                      <th className="num">Demont. t</th>
                      <th>Kommentar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vismaLines.map((line) => (
                      <tr key={line.key} className={`${line.inPlan ? 'in-plan' : ''} ${line.issue ? 'has-issue' : ''}`}>
                        <td className="center">
                          <input type="checkbox" checked={line.inPlan} onChange={(e) => override(line, { inPlan: e.target.checked })} aria-label="I plan" />
                        </td>
                        <td>{line.competence}</td>
                        <td>
                          {line.sourceWorkType === NO_PRODUCT_TYPE ? (
                            <select value={line.workType === NO_PRODUCT_TYPE ? '' : line.workType} onChange={(e) => override(line, { workType: e.target.value || undefined })}>
                              <option value="">Uten produkttype …</option>
                              {kpi.workTypes.map((t) => (
                                <option key={t.name} value={t.name}>
                                  {t.name} ({t.unit})
                                </option>
                              ))}
                            </select>
                          ) : (
                            line.workType
                          )}
                          {line.issue && line.issue !== 'no-product-type' && <span className="issue"> {ISSUE_TEXT[line.issue]}</span>}
                          {line.missingRate && <span className="hint"> {MISSING_RATE_TEXT[line.missingRate]}</span>}
                        </td>
                        <td>{line.hall}</td>
                        <td>{locationCell(line.hall)}</td>
                        <td>{line.avdeling}</td>
                        <td className="num" title={`${line.rowCount} ordrelinjer`}>
                          {formatFte(line.quantity, 1)}
                        </td>
                        <td>{line.unit}</td>
                        <td className="num">
                          <NumberField value={line.effekt} onCommit={(effekt) => override(line, { effekt })} />
                        </td>
                        <td className="num" title={line.rateAssembly ? `${formatFte(line.quantity, 1)} ÷ ${formatFte(line.rateAssembly, 2)}` : ''}>
                          {hours(line.assemblyHours)}
                        </td>
                        <td className="num" title={line.rateDismantle ? `${formatFte(line.quantity, 1)} ÷ ${formatFte(line.rateDismantle, 2)}` : ''}>
                          {hours(line.dismantleHours)}
                        </td>
                        <td>
                          <TextField value={line.comment} onCommit={(comment) => override(line, { comment })} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">
                  {legacyVisma.length
                    ? `Prosjektet har ${legacyVisma.length} Visma-linjer fra arbeidsboken. Importer en Visma-utskrift for å erstatte dem; Effekt, kommentarer og «Planlagt» fra arbeidsboken følger med.`
                    : 'Ingen Visma-utskrift er lest inn for prosjektet.'}
                </p>
              )}
            </section>

            <section>
              <div className="section-title">
                <h3>Egne linjer og historikk</h3>
                <span className="toolbar-gap" />
                <button onClick={() => setDialog({})}>+ Ny linje</button>
              </div>
              {ownLines.length ? (
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Grunnlag</th>
                      <th>Kompetanse</th>
                      <th>Arbeidstype</th>
                      <th>Hall / sted</th>
                      <th title="Hallen linjen teller under i Kalender">Plassering</th>
                      <th>Kilde</th>
                      <th className="num">Antall</th>
                      <th>Enhet</th>
                      <th className="num">Mont. t</th>
                      <th className="num">Demont. t</th>
                      <th>Kommentar</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {ownLines.map((line) => (
                      <tr key={line.id} className={line.basis === PLANNED_BASIS ? 'in-plan' : ''}>
                        <td>{line.basis}</td>
                        <td>{line.competence}</td>
                        <td>{line.workType}</td>
                        <td>{line.hall}</td>
                        <td>{locationCell(line.hall)}</td>
                        <td>{line.source}</td>
                        <td className="num">{line.quantity === null ? '' : formatFte(line.quantity, 1)}</td>
                        <td>{line.unit}</td>
                        <td className="num">{hours(line.assemblyHours)}</td>
                        <td className="num">{hours(line.dismantleHours)}</td>
                        <td>{line.comment}</td>
                        <td className="actions">
                          <button className="row-action" title="Endre" onClick={() => setDialog({ line })}>
                            <Pencil size={13} aria-hidden />
                          </button>
                          <button className="row-action" title="Slett" onClick={() => confirm(`Slette linjen ${line.competence} · ${line.workType}?`) && removeDemandLine(line.id)}>
                            <X size={13} aria-hidden />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
