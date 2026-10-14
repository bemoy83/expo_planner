import { useMemo, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { formatFte } from '../../domain/calc'
import { PLANNED_BASIS, type DemandLine } from '../../domain/types'
import { isVismaLine } from '../../domain/visma'
import { useWorkspace } from '../../store/workspaceStore'
import { DataTable } from '../DataTable'
import { useTable, type Column } from '../useTable'
import { count } from '../dom'
import { DemandLineDialog } from './DemandLineDialog'
import { ProjectRail } from './ProjectRail'
import { usePlacing } from './usePlacing'

const hours = (value: number) => formatFte(value, 1)

interface Props {
  projectNo: string
  onProjectChange: (projectNo: string) => void
  /** The projects that have demand or planning rows, by name, as [number, name]. */
  projects: [string, string][]
}

/** The planner's own demand lines: work that is not sold through Visma, per project. */
export function EgenView({ projectNo, onProjectChange, projects }: Props) {
  const { workspace, removeDemandLine } = useWorkspace()
  const ws = workspace!
  const [dialog, setDialog] = useState<{ line?: DemandLine } | null>(null)
  const { placeOfLine, ruleOf, locationCell } = usePlacing()
  const own = useMemo(() => ws.demand.filter((line) => !isVismaLine(line)), [ws.demand])
  const ownLines = useMemo(
    () =>
      own
        .filter((line) => !projectNo || line.projectNo === projectNo)
        .sort((a, b) => a.projectName.localeCompare(b.projectName, 'nb') || a.basis.localeCompare(b.basis, 'nb') || a.competence.localeCompare(b.competence, 'nb')),
    [own, projectNo],
  )
  const projectName = projects.find(([no]) => no === projectNo)?.[1] ?? ''

  /** Hours per competence and basis, which is what the Kalender rows pick from. */
  const summary = useMemo(() => {
    const bases = new Set<string>()
    const byCompetence = new Map<string, Map<string, [number, number]>>()
    for (const line of ws.demand) {
      if (line.projectNo !== projectNo || (!line.assemblyHours && !line.dismantleHours)) continue
      bases.add(line.basis)
      const row = byCompetence.get(line.competence) ?? new Map<string, [number, number]>()
      const cell = row.get(line.basis) ?? [0, 0]
      row.set(line.basis, [cell[0] + line.assemblyHours, cell[1] + line.dismantleHours])
      byCompetence.set(line.competence, row)
    }
    const order = [...bases].sort((a, b) => (a === PLANNED_BASIS ? -1 : b === PLANNED_BASIS ? 1 : a.localeCompare(b, 'nb')))
    return { bases: order, rows: [...byCompetence].sort((a, b) => a[0].localeCompare(b[0], 'nb')) }
  }, [ws.demand, projectNo])

  const columns: Column<DemandLine>[] = [
    ...(projectNo ? [] : [{ key: 'project', head: 'Prosjekt', text: (line) => line.projectName, cell: (line) => line.projectName } satisfies Column<DemandLine>]),
    { key: 'basis', head: 'Grunnlag', text: (line) => line.basis, cell: (line) => line.basis },
    { key: 'competence', head: 'Kompetanse', text: (line) => line.competence, cell: (line) => line.competence },
    { key: 'workType', head: 'Arbeidstype', text: (line) => line.workType, cell: (line) => line.workType },
    { key: 'hall', head: 'Hall / sted', text: (line) => line.hall, cell: (line) => line.hall },
    { key: 'place', head: 'Plassering', title: 'Hallen linjen teller under i Kalender', text: (line) => placeOfLine(line).hall, cell: (line) => locationCell(line) },
    { key: 'rule', head: 'Regel', className: 'muted', text: ruleOf, cell: ruleOf },
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
  const table = useTable(ownLines, columns)
  const ownCount = (no: string) => own.filter((line) => line.projectNo === no).length

  return (
    <div className="behov-split">
      <ProjectRail
        all={{ label: 'Alle prosjekter', aside: <span className="count">{own.length}</span> }}
        projectNo={projectNo}
        onPick={onProjectChange}
        items={projects.map(([no, name]) => ({ projectNo: no, name, aside: ownCount(no) ? <span className="count">{ownCount(no)}</span> : undefined }))}
      />
      <div className="behov-main">
        <div className="behov-intro">
          <h2>
            {projectNo ? projectName || projectNo : 'Alle prosjekter'} {projectNo && <span className="project-no">{projectNo}</span>}
          </h2>
          <p className="muted">Arbeid som ikke er solgt gjennom Visma, men følger opp- og nedbyggingen. {count(ownLines.length, 'linje', 'linjer')}.</p>
          <span className="toolbar-gap" />
          <button disabled={!projectNo} title={projectNo ? undefined : 'Velg et prosjekt først'} onClick={() => setDialog({})}>
            + Ny linje
          </button>
        </div>
        <div className="behov-table">
          {ownLines.length ? (
            <DataTable table={table} rowKey={(line) => line.id} rowProps={(line) => ({ className: line.basis === PLANNED_BASIS ? 'in-plan' : undefined })} />
          ) : (
            <p className="muted">Ingen egne linjer. Bruk «Ny linje» for egen opptelling eller timer som ikke ligger i Visma.</p>
          )}
          {projectNo && summary.rows.length > 0 && (
            <section>
              <h3>Timer per kompetanse og grunnlag</h3>
              <p className="hint">Radene i Kalender henter behov herfra. «{PLANNED_BASIS}» er tallene du planlegger med.</p>
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
                          <td key={`${b}m`} className={`num ${b === PLANNED_BASIS ? 'planned' : ''}`}>
                            {cell ? hours(cell[0]) : ''}
                          </td>,
                          <td key={`${b}d`} className={`num ${b === PLANNED_BASIS ? 'planned' : ''}`}>
                            {cell ? hours(cell[1]) : ''}
                          </td>,
                        ]
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </div>
      {dialog && (dialog.line || projectNo) && (
        <DemandLineDialog line={dialog.line} projectNo={dialog.line?.projectNo ?? projectNo} projectName={dialog.line?.projectName ?? projectName} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}
