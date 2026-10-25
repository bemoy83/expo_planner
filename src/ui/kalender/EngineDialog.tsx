import { useMemo, useState } from 'react'
import { dayText, type ISODate } from '../../domain/dates'
import { projectScore, scorePlan, type Score } from '../../domain/planner/score'
import { solve, type OutsideDay } from '../../domain/planner/solve'
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
  /** The working days next to a row's window that its halls stand free, for an earlier start. */
  nearby: (row: AllocationRow) => ISODate[]
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
  /** The days the plan works in a hall outside the project's window. */
  outside: OutsideDay[]
}

/** The days outside the windows as a text for Venyou: a line per hall and project, with its days. */
const venyouText = (days: OutsideDay[]): string[] => {
  const lines = new Map<string, { head: string; dates: ISODate[] }>()
  for (const day of days) {
    const key = `${day.hall}|${day.projectNo}`
    if (!lines.has(key)) lines.set(key, { head: `${day.hall || 'Alle hallene'} · ${day.projectName}`, dates: [] })
    lines.get(key)!.dates.push(day.date)
  }
  return [...lines.values()].map(({ head, dates }) => `${head}: ${dates.sort().map(dayText).join(', ')}`)
}

/**
 * «Foreslå plan»: the planning engine's plan for every project of the period at once (`domain/planner/solve.ts`), shown
 * per project with its score before and after, to be taken for the projects the planner picks. Nothing is written
 * until he does; then it is one undo step.
 */
export function EngineDialog({ ws, rows, required, windowOf, nearby, dates, onApply, onClose }: Props) {
  const [keepTyped, setKeepTyped] = useState(true)
  const solution = useMemo(() => solve({ ws, rows, required, windowOf, nearby, keepTyped }), [ws, rows, required, windowOf, nearby, keepTyped])
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
          outside: solution.outside.filter((day) => numberKey(day.projectNo) === numberKey(projectNo)),
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
  const toVenyou = venyouText(chosen.flatMap((line) => line.outside))
  const [copied, setCopied] = useState(false)

  const columns: Column<Line>[] = [
    { key: 'pick', head: '', cell: (line) => <input type="checkbox" aria-label={`Bruk planen for ${line.name}`} checked={picked(line)} onChange={() => toggle(line)} /> },
    { key: 'name', head: 'Prosjekt', text: (line) => line.name, cell: (line) => line.name },
    { key: 'days', head: 'Dager', className: 'num', sort: (line) => line.days, cell: (line) => line.days },
    { key: 'people', head: 'Faste', title: 'Faste motoren setter på prosjektet', className: 'num', sort: (line) => line.people, cell: (line) => line.people || '–' },
    {
      key: 'outside',
      head: 'Tidligere',
      title: 'Dager motoren starter før monteringen eller slutter etter demonteringen, der hallen står ledig i Venyou',
      className: 'num',
      sort: (line) => line.outside.length,
      cell: (line) => (line.outside.length ? <span className="engine-outside">
            <i className="op-attention" aria-hidden />
            {count(new Set(line.outside.map((d) => d.date)).size, 'dag', 'dager')}
          </span> : '–'),
    },
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
        {toVenyou.length > 0 && (
          <div className="engine-venyou">
            <div className="engine-venyou-head">
              <strong>Til Venyou</strong>
              <span className="muted small">Planen bruker hallene utover eventfasene. Meld fra, så hallene blir blokkert.</span>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(toVenyou.join('\n'))
                  setCopied(true)
                }}
              >
                {copied ? 'Kopiert' : 'Kopier'}
              </button>
            </div>
            <ul>
              {toVenyou.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
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
