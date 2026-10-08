import type { ReactNode } from 'react'
import { Maximize2 } from 'lucide-react'
import { UndoRedoButtons } from '../common'
import { ModeSwitch } from '../kalender/KalenderBar'
import { PlanBar } from '../kalender/PlanBar'
import type { PlanMode } from '../kalender/zoom'

interface Props {
  /** The width of the grid as it is seen. */
  width: number
  mode: PlanMode
  onMode: (mode: PlanMode) => void
  /** Every project, as key and name, and the one chosen in the filter. */
  projects: [key: string, name: string][]
  project: string
  onProject: (key: string) => void
  onToday: () => void
  /** Sizes the days so the chosen project fills the grid. */
  onFit: () => void
  /** Changes whenever what the tools show may have changed width. */
  fitKey: string
  /** The tools of Bemanning, between undo and the project. */
  children?: ReactNode
}

/** The planning bar in Bemanning: the mode, undo, the tools, the project, and where in the period. */
export function BemanningBar({ width, mode, onMode, projects, project, onProject, onToday, onFit, fitKey, children }: Props) {
  return (
    <PlanBar width={width} fitKey={`${project}|${fitKey}`}>
      <div className="bar-zone">
        <ModeSwitch mode={mode} onChange={onMode} />
        <UndoRedoButtons />
        {children}
      </div>
      <div className="bar-view">
        <div className="bar-zone bar-zone-end">
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
        </div>
      </div>
    </PlanBar>
  )
}
