import type { CompetenceStyle } from '../../domain/types'
import { Segmented, UndoRedoButtons } from '../common'
import { Eraser, MousePointer2, Paintbrush, X } from 'lucide-react'
import type { Tool } from './tools'

interface Props {
  tool: Tool
  onTool: (tool: Tool) => void
  /** The competence in focus, which is also what the brush paints. */
  brush: CompetenceStyle | undefined
  onClearBrush: () => void
  /** How many competences can be picked with a number key. */
  keyCount: number
}

/** The bar above the grid: undo, the tools, and what the brush paints. */
export function BemanningTools({ tool, onTool, brush, onClearBrush, keyCount }: Props) {
  return (
    <div className="toolbar bm-tools">
      <UndoRedoButtons />
      <span className="tool-switch">
        <Segmented
          label="Verktøy"
          value={tool}
          onChange={onTool}
          options={[
            { value: 'select', label: (<><MousePointer2 size={14} aria-hidden /> Velg <kbd>V</kbd></>), title: 'Velg en dag (V).' },
            { value: 'paint', label: (<><Paintbrush size={14} aria-hidden /> Pensel <kbd>B</kbd></>), title: 'Mal dager med en kompetanse: klikk for hel dag, Shift for halv dag, dra over flere (B).' },
            { value: 'erase', label: (<><Eraser size={14} aria-hidden /> Tøm <kbd>T</kbd></>), title: 'Klikk eller dra over dager for å tømme dem (T, eller hold Alt).' },
          ]}
        />
      </span>
      {brush ? (
        <>
          <span className="bm-brush" style={{ '--cc': `var(--${brush.color})` } as React.CSSProperties}>
            <i className="swatch" />
            {brush.label}
            <button className="row-action" aria-label="Slå av fokus og pensel" title="Slå av fokus og pensel (Esc)" onClick={onClearBrush}>
              <X size={13} aria-hidden />
            </button>
          </span>
          <span className="bm-hints">
            <span><b>Klikk</b> hel dag</span>
            <span><b>Shift</b> halv dag</span>
            <span><b>Dra</b> flere</span>
            <span><b>Alt</b> tøm</span>
          </span>
        </>
      ) : (
        <span className="bm-hints">Velg en kompetanse i behovet{keyCount ? ` (1–${keyCount})` : ''} for å fokusere og male</span>
      )}
    </div>
  )
}
