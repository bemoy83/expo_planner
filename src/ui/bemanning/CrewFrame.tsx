import type { ReactNode } from 'react'
import { Printer } from 'lucide-react'
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

/** What is pinned above the lines: the projects in view, the Avvik of each day, and the demand per competence of the part. */
export function CrewTop({ demand }: { demand: ReactNode }) {
  const { board } = useInnleid()
  return (
    <>
      <ProjectLines />
      <AvvikSection board={board} />
      {demand}
    </>
  )
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
  /** What the part has after the tools: the brush's people, the clipboard, what needs the planner. */
  children?: ReactNode
  /** What the part has at the end before «I dag», and after it. */
  before?: ReactNode
  after?: ReactNode
}

/** The planning bar: the mode and the part, undo, the tools, what the part adds, and where in the period. */
export function CrewBar({ width, fitKey, mode, onMode, part, onPart, tool, tools, pickTool, pickKeys, onToday, children, before, after }: BarProps) {
  return (
    <PlanBar width={width} fitKey={`${part}|${fitKey}`}>
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
          <button className="ghost" onClick={onToday}>
            I dag
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
