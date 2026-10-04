import { useMemo, useRef, useState } from 'react'
import { formatFte } from '../../domain/calc'
import { PLANNED_BASIS, type DemandLine } from '../../domain/types'
import { buildVismaLines, isVismaLine, NO_PRODUCT_TYPE, type VismaLine } from '../../domain/visma'
import { readKpiWorkbook, readVismaExport } from '../../import/vismaExport'
import { useWorkspace } from '../../store/workspaceStore'
import { DemandLineDialog } from './DemandLineDialog'

const hours = (value: number) => formatFte(value, 1)

const ISSUE_TEXT: Record<NonNullable<VismaLine['issue']>, string> = {
  'no-product-type': 'Mangler produkttype – velg arbeidstype',
  'unknown-work-type': 'Produkttypen finnes ikke i KPI-oppsettet',
  'no-rate': 'Mangler sats for denne enheten',
}

/** Copies the chosen files before clearing the input; the input's own list empties when it is reset. */
const takeFiles = (e: React.ChangeEvent<HTMLInputElement>, handle: (files: File[]) => unknown) => {
  const files = [...(e.target.files ?? [])]
  e.target.value = ''
  handle(files)
}

interface Props {
  projectNo: string
  onProjectChange: (projectNo: string) => void
}

/** The demand ledger for one project: Visma lines, the planner's own lines and earlier years, side by side. */
export function Behov({ projectNo, onProjectChange }: Props) {
  const { workspace, setKpi, importVisma, setLineOverride, removeDemandLine } = useWorkspace()
  const ws = workspace!
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [dialog, setDialog] = useState<{ line?: DemandLine } | null>(null)
  const vismaInput = useRef<HTMLInputElement>(null)
  const kpiInput = useRef<HTMLInputElement>(null)

  const projects = useMemo(() => {
    const names = new Map<string, string>()
    for (const p of ws.projects) if (!names.has(p.projectNo)) names.set(p.projectNo, p.name)
    for (const r of ws.allocations) if (r.projectNo) names.set(r.projectNo, r.projectName)
    for (const v of ws.visma ?? []) if (!names.has(v.projectNo)) names.set(v.projectNo, v.eventName)
    const withData = new Set([...ws.demand.map((l) => l.projectNo), ...ws.allocations.map((r) => r.projectNo)])
    return [...names].filter(([no]) => withData.has(no)).sort((a, b) => a[1].localeCompare(b[1], 'nb'))
  }, [ws.projects, ws.allocations, ws.visma, ws.demand])

  const vismaImport = ws.visma?.find((v) => v.projectNo === projectNo)
  const vismaLines = useMemo(
    () =>
      vismaImport && ws.kpi
        ? buildVismaLines(vismaImport.rows, ws.kpi, ws.overrides ?? {}).sort(
            (a, b) => a.competence.localeCompare(b.competence, 'nb') || a.workType.localeCompare(b.workType, 'nb') || a.hall.localeCompare(b.hall, 'nb'),
          )
        : [],
    [vismaImport, ws.kpi, ws.overrides],
  )
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
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
    }
  }

  const onVismaFiles = (files: File[]) =>
    readFiles(files, (bytes, name) => {
      const imported = importVisma(readVismaExport(bytes), name)
      if (imported.length) onProjectChange(imported[0])
      return `Visma-linjene for ${imported.join(', ')} er erstattet med ${name}.`
    })

  const onKpiFiles = (files: File[]) =>
    readFiles(files, (bytes, name) => {
      const kpi = readKpiWorkbook(bytes)
      setKpi(kpi)
      return `${name}: ${[kpi.workTypes && `${kpi.workTypes.length} produkttyper`, kpi.rates && `${kpi.rates.length} satser`].filter(Boolean).join(' og ')} lest inn.`
    })

  const kpiReady = !!ws.kpi?.workTypes.length && !!ws.kpi.rates.length
  const override = (line: VismaLine, patch: Parameters<typeof setLineOverride>[2]) => setLineOverride(line.projectNo, line.key, patch)
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
        <span className={`muted small ${kpiReady ? '' : 'warn'}`}>
          {kpiReady ? `KPI: ${ws.kpi!.workTypes.length} produkttyper, ${ws.kpi!.rates.length} satser` : 'KPI-oppsett mangler'}
        </span>
        <button onClick={() => kpiInput.current?.click()}>Importer KPI-filer</button>
        <button className="primary" onClick={() => vismaInput.current?.click()} disabled={!kpiReady} title={kpiReady ? '' : 'Importer KPI-filene først'}>
          Importer Visma-utskrift
        </button>
        <input ref={kpiInput} type="file" accept=".xlsx" multiple hidden onChange={(e) => takeFiles(e, onKpiFiles)} />
        <input ref={vismaInput} type="file" accept=".xlsx" hidden onChange={(e) => takeFiles(e, onVismaFiles)} />
      </div>

      {message && (
        <div className={message.kind === 'ok' ? 'info-banner' : 'error-banner'} role="status">
          {message.text}{' '}
          <button className="link" onClick={() => setMessage(null)}>
            Lukk
          </button>
        </div>
      )}

      <div className="behov-body">
        {!kpiReady && (
          <p className="notice">
            For å regne om Visma-linjer til timer trengs to filer: produkttypene med enhet og nøkkelområde (<code>Nøkkeltall Visma</code>) og satsene (
            <code>Kpier.xlsx</code>). Velg begge med «Importer KPI-filer».
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
                    <button onClick={() => vismaLines.forEach((l) => !l.inPlan && !l.issue && override(l, { inPlan: true }))}>Ta alle inn i plan</button>
                    <button onClick={() => vismaLines.forEach((l) => l.inPlan && override(l, { inPlan: false }))}>Ta alle ut</button>
                  </>
                )}
              </div>
              {vismaImport ? (
                <table className="ledger">
                  <thead>
                    <tr>
                      <th title="Linjen teller med i «Planlagt»">I plan</th>
                      <th>Kompetanse</th>
                      <th>Arbeidstype</th>
                      <th>Hall / sted</th>
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
                              {ws.kpi!.workTypes.map((t) => (
                                <option key={t.name} value={t.name}>
                                  {t.name} ({t.unit})
                                </option>
                              ))}
                            </select>
                          ) : (
                            line.workType
                          )}
                          {line.issue && line.issue !== 'no-product-type' && <span className="issue"> {ISSUE_TEXT[line.issue]}</span>}
                        </td>
                        <td>{line.hall}</td>
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
                        <td>{line.source}</td>
                        <td className="num">{line.quantity === null ? '' : formatFte(line.quantity, 1)}</td>
                        <td>{line.unit}</td>
                        <td className="num">{hours(line.assemblyHours)}</td>
                        <td className="num">{hours(line.dismantleHours)}</td>
                        <td>{line.comment}</td>
                        <td className="actions">
                          <button className="row-action" title="Endre" onClick={() => setDialog({ line })}>
                            ✎
                          </button>
                          <button className="row-action" title="Slett" onClick={() => confirm(`Slette linjen ${line.competence} · ${line.workType}?`) && removeDemandLine(line.id)}>
                            ×
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

function NumberField({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const shown = value ? String(value).replace('.', ',') : ''
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className="inline num"
      inputMode="decimal"
      value={draft ?? shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === null) return
        const n = draft.trim() === '' ? 0 : Number(draft.replace(',', '.'))
        if (Number.isFinite(n) && n !== value) onCommit(n)
        setDraft(null)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function TextField({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className="inline"
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft.trim() !== value) onCommit(draft.trim())
        setDraft(null)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}
