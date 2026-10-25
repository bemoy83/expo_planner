import { useMemo, useState } from 'react'
import type { ISODate } from '../../domain/dates'
import { projectScore, scorePlan, type Score } from '../../domain/planner/score'
import { solve } from '../../domain/planner/solve'
import { numberKey } from '../../domain/projects'
import type { AllocationRow, Workspace } from '../../domain/types'
import { Segmented } from '../common'
import { DataTable } from '../DataTable'
import { count } from '../dom'
import { hours } from '../format'
import { useTable, type Column } from '../useTable'

interface Props {
  ws: Workspace
  /** Every row of the plan, stored and suggested, of every project in the period. */
  rows: AllocationRow[]
  required: (row: AllocationRow) => number
  windowOf: (row: AllocationRow) => Set<ISODate> | undefined
  dates: ISODate[]
  /** Takes the plan for the projects picked, as one undo step. */
  onApply: (solution: Workspace, projectNos: string[]) => void
  onClose: () => void
}

/** One project of the engine's plan, against what it has now. */
interface Line {
  projectNo: string
  name: string
  before: Score
  after: Score
  days: number
  people: number
  uncovered: number
}

/**
 * «Foreslå plan»: the planning engine's plan for every project of the period at once (`domain/planner/solve.ts`), shown
 * per project with its score before and after, to be taken for the projects the planner picks. Nothing is written
 * until he does; then it is one undo step.
 */
export function EngineDialog({ ws, rows, required, windowOf, dates, onApply, onClose }: Props) {
  const [keepTyped, setKeepTyped] = useState(true)
  const solution = useMemo(() => solve({ ws, rows, required, windowOf, keepTyped }), [ws, rows, required, windowOf, keepTyped])
  const lines = useMemo((): Line[] => {
    const before = scorePlan(ws, dates, windowOf)
    const after = scorePlan(solution.workspace, dates, windowOf)
    return solution.projects
      .map((projectNo) => {
        const mine = (r: AllocationRow) => numberKey(r.projectNo) === numberKey(projectNo)
        const planned = solution.workspace.allocations.filter(mine)
        const blocks = (solution.workspace.assignments ?? []).filter((a) => a.source === 'suggested' && numberKey(a.projectNo ?? '') === numberKey(projectNo))
        const projectAfter = projectScore(after, projectNo)
        return {
          projectNo,
          name: planned[0]?.projectName ?? projectNo,
          before: projectScore(before, projectNo),
          after: projectAfter,
          days: new Set(planned.flatMap((r) => Object.keys(r.fte).filter((d) => r.fte[d]))).size,
          people: new Set(blocks.map((a) => a.personId)).size,
          uncovered: projectAfter.findings.filter((f) => f.kind === 'uncovered').reduce((sum, f) => sum + (f.hours ?? 0), 0),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'nb'))
  }, [ws, solution, dates, windowOf])
  // A project is picked to start with where the engine's plan is better than what it has.
  const [skipped, setSkipped] = useState<Set<string> | null>(null)
  const picked = (line: Line) => (skipped ? !skipped.has(line.projectNo) : line.after.total < line.before.total - 1e-6)
  const toggle = (line: Line) => {
    const next = new Set(skipped ?? lines.filter((l) => !picked(l)).map((l) => l.projectNo))
    if (next.has(line.projectNo)) next.delete(line.projectNo)
    else next.add(line.projectNo)
    setSkipped(next)
  }
  const chosen = lines.filter(picked)

  const columns: Column<Line>[] = [
    { key: 'pick', head: '', cell: (line) => <input type="checkbox" aria-label={`Bruk planen for ${line.name}`} checked={picked(line)} onChange={() => toggle(line)} /> },
    { key: 'name', head: 'Prosjekt', text: (line) => line.name, cell: (line) => line.name },
    { key: 'days', head: 'Dager', className: 'num', sort: (line) => line.days, cell: (line) => line.days },
    { key: 'people', head: 'Faste', title: 'Faste motoren setter på prosjektet', className: 'num', sort: (line) => line.people, cell: (line) => line.people || '–' },
    { key: 'uncovered', head: 'Udekket t', title: 'Timer ingen faste kan ta, som må leies inn eller dekkes på annen måte', className: 'num', sort: (line) => line.uncovered, cell: (line) => (line.uncovered ? hours(line.uncovered) : '–') },
    {
      key: 'score',
      head: 'Poengsum',
      title: 'Hva planen og bemanningen koster, i timer: nå → med motorens plan',
      className: 'num',
      sort: (line) => line.after.total - line.before.total,
      cell: (line) => `${hours(line.before.total)} → ${hours(line.after.total)}`,
    },
  ]
  const table = useTable(lines, columns)

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog wide engine-dialog" role="dialog" aria-label="Foreslå plan" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2>Foreslå plan</h2>
        <p className="hint">
          Motoren planlegger dagene og de faste for alle prosjektene i perioden samtidig, etter trinnene og rangeringen på Kompetanser. Det ingen faste kan ta, står igjen som udekket. Velg hvilke prosjekter som skal få planen.
        </p>
        <div className="engine-choice">
          <span>FTE du har skrevet selv</span>
          <Segmented
            label="FTE du har skrevet selv"
            value={keepTyped ? 'keep' : 'move'}
            onChange={(value) => (setKeepTyped(value === 'keep'), setSkipped(null))}
            options={[
              { value: 'keep', label: 'Blir stående', title: 'Dagene du har skrevet FTE på selv er faste; motoren bemanner dem og planlegger resten' },
              { value: 'move', label: 'Kan flyttes', title: 'Motoren planlegger hele behovet på nytt' },
            ]}
          />
          <span className="muted small">Blokker du har malt i Bemanning, blir alltid stående.</span>
        </div>
        <div className="engine-scroll">
          <DataTable table={table} rowKey={(line) => line.projectNo} empty="Ingen prosjekter har behov med monterings- eller demonteringsdager i perioden." />
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Avbryt
          </button>
          <button type="button" className="primary" disabled={!chosen.length} onClick={() => onApply(solution.workspace, chosen.map((line) => line.projectNo))}>
            {chosen.length ? `Bruk for ${count(chosen.length, 'prosjekt', 'prosjekter')}` : 'Bruk'}
          </button>
        </div>
      </div>
    </div>
  )
}
