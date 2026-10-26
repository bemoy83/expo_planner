import { Eraser, MousePointer2, Paintbrush } from 'lucide-react'
import type { CompetenceStyle } from '../../domain/types'
import type { ToolChoice } from '../common'
import { competenceColor } from '../dom'
import type { Tool } from './tools'

/** The tools of a part, Velg, Pensel with the competence and project it paints, and Tøm, each with the part's own title. */
export function crewTools(style: CompetenceStyle | undefined, project: string | null, titles: Record<Tool, string>): ToolChoice<Tool>[] {
  return [
    { value: 'select', icon: <MousePointer2 size={14} aria-hidden />, name: 'Velg', shortcut: 'V', title: titles.select },
    {
      value: 'paint',
      icon: <Paintbrush size={14} aria-hidden />,
      name: style ? (
        <>
          Pensel <i className="swatch" style={competenceColor(style)} /> {style.label}
          {project && <span className="bm-brush-project"> · {project}</span>}
        </>
      ) : (
        'Pensel'
      ),
      shortcut: 'B',
      title: titles.paint,
    },
    { value: 'erase', icon: <Eraser size={14} aria-hidden />, name: 'Tøm', shortcut: 'T', title: titles.erase },
  ]
}
