import type { ReactNode } from 'react'
import { Maximize2, Printer } from 'lucide-react'
import { ToolSwitch, UndoRedoButtons, type ToolChoice } from '../common'
import { ModeSwitch, ModeTag, PartSwitch } from '../kalender/KalenderBar'
import { LEFT_W, ROW_H } from '../kalender/layout'
import { PlanBar } from '../kalender/PlanBar'
import type { CrewPart, PlanMode } from '../kalender/zoom'
import { useInnleid } from '../innleid/InnleidScope'
import { AvvikSection } from './AvvikSection'
import { ProjectLines } from './ProjectLines'
import type { Tool } from './tools'

/*
 * The frame of a page of Bemanning, the same in Faste and in Innleid, which are two sides of one thing: the header,
 * what is pinned above the lines, the planning bar and the heading over the lines. What differs is handed in.
 */

/** The page header: the mode with its part, what the part says of the period, the places, the work plans and the side panel. */
export function CrewHead({ part, meta, metaTitle, places, onDayPlan, dayPlanTitle, panel }: { part: CrewPart; meta: string[]; metaTitle: string; places: ReactNode; onDayPlan: () => void; dayPlanTitle: string; panel: ReactNode }) {
  return (
    <div className="page-head mode-band">
      <h2>Kalender</h2>
      <ModeTag mode="bemanning" part={part === 'innleid' ? 'innleid' : undefined} />
      <span className="page-meta" title={metaTitle}>
        {meta.join(' · ')}
      </span>
      {places}
      <button className="ghost" onClick={onDayPlan} title={dayPlanTitle}>
        <Printer size={14} aria-hidden /> Arbeidsplan
      </button>
      {panel}
    </div>
  )
}

/** What is pinned above the lines: the projects in view, the demand per competence of the part, and last, right over the bar as «Mangler / over» is in Plan, the Avvik of each day. */
export function CrewTop({ demand }: { demand: ReactNode }) {
  const { board } = useInnleid()
  return (
    <>
      <ProjectLines />
      {demand}
      <AvvikSection board={board} />
    </>
  )
}

/** What the Kalender hands the bar of either part. */
export interface CrewBarProps {
  width: number
  mode: PlanMode
  onMode: (mode: PlanMode) => void
  onPart: (part: CrewPart) => void
  onToday: () => void
  projects: [key: string, name: string][]
  project: string
  onProject: (key: string) => void
  onFit: () => void
}

interface BarProps {
  width: number
  fitKey: string
  mode: PlanMode
  onMode: (mode: PlanMode) => void
  part: CrewPart
  onPart: (part: CrewPart) => void
  tool: Tool
  tools: ToolChoice<Tool>[]
  pickTool: (tool: Tool) => void
  /** No competence is the brush: how many keys pick one, or `null` where none can be picked. */
  pickKeys: number | null
  onToday: () => void
  /** Every project, as key and name, and the one chosen in the filter, which dims the others and fits the days to it. */
  projects: [key: string, name: string][]
  project: string
  onProject: (key: string) => void
  /** Sizes the days so the chosen project fills the grid. */
  onFit: () => void
  /** What the part has after the tools: the brush's people, the clipboard, what needs the planner. */
  children?: ReactNode
  /** What the part has at the end before the project, and after it all. */
  before?: ReactNode
  after?: ReactNode
}

/** The planning bar: the mode and the part, undo, the tools, what the part adds, and where in the period. */
export function CrewBar({ width, fitKey, mode, onMode, part, onPart, tool, tools, pickTool, pickKeys, onToday, projects, project, onProject, onFit, children, before, after }: BarProps) {
  return (
    <PlanBar width={width} fitKey={`${part}|${project}|${fitKey}`}>
      <div className="bar-zone">
        <ModeSwitch mode={mode} onChange={onMode} />
        <PartSwitch part={part} onChange={onPart} />
        <UndoRedoButtons />
        <ToolSwitch tool={tool} tools={tools} onChange={pickTool} />
        {pickKeys !== null && <span className="bm-hints">Velg kompetanse i behovet{pickKeys ? ` (1–${pickKeys})` : ''}</span>}
        {children}
      </div>
      <div className="bar-view">
        <div className="bar-zone bar-zone-end">
          {before}
          <select className="bar-select" aria-label="Prosjekt" title="Prosjekt: dagene tilpasses prosjektet, og de andre prosjektene dempes" value={project} onChange={(e) => onProject(e.target.value)}>
            <option value="">Alle prosjekter</option>
            {projects.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
          <button className="ghost" onClick={onToday}>
            I dag
          </button>
          <button className="ghost" disabled={!project} title={project ? 'Tilpass dagene til prosjektet' : 'Velg et prosjekt for å tilpasse dagene til det'} onClick={onFit}>
            <Maximize2 size={14} aria-hidden /> Tilpass prosjekt
          </button>
          {after}
        </div>
      </div>
    </PlanBar>
  )
}

/** The heading over the lines, at the foot of the planning bar: what they are, how many can take the brush, the label column's end, and how to use them. */
export function CrewHeading({ title, note, end, legend }: { title: string; note: string; end: string; legend: string }) {
  return (
    <div className="grid-row col-head bm-people-head" style={{ height: ROW_H }}>
      <div className="grid-label">
        <span className="lbl-desc">{title}</span>
        <span className="bm-label-note">{note}</span>
        <span className="bm-label-note bm-label-end">{end}</span>
      </div>
      <span className="phase-legend" style={{ left: LEFT_W }}>
        <span>{legend}</span>
      </span>
    </div>
  )
}
