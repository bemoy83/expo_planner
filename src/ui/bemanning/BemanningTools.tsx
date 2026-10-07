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
  /** How a person opens for editing hours: as a row timeline, or as the week editor. */
  expand: ExpandMode
  onExpand: (mode: ExpandMode) => void
  /** Row mode only: whether any row is open, and the button that opens or folds them all. */
  anyOpen: boolean
  onToggleAll: () => void
  /** Blocks in the week whose hours are back in the demand, because their person is away or lacks the competence. */
  unresolved: number
  onRemoveUnresolved: () => void
}

export type ExpandMode = 'row' | 'week'

/** The bar above the grid: undo, the tools, and what the brush paints. */
export function BemanningTools({ tool, onTool, brush, onClearBrush, keyCount, expand, onExpand, anyOpen, onToggleAll, unresolved, onRemoveUnresolved }: Props) {
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
      {unresolved > 0 && (
        <span className="bm-unresolved" title="Blokker der personen er borte eller ikke lenger har kompetansen. Timene er tilbake i behovet.">
          {unresolved === 1 ? '1 uløst blokk' : `${unresolved} uløste blokker`}
          <button onClick={onRemoveUnresolved}>Fjern</button>
        </span>
      )}
      <span className="toolbar-gap" />
      <span className="bm-expand">
        Utvid
        <Segmented
          label="Utvid"
          value={expand}
          onChange={onExpand}
          options={[
            { value: 'row', label: 'Rad', title: 'Åpne flere personer samtidig, hver med en tidslinje for normaltiden.' },
            { value: 'week', label: 'Uke', title: 'Åpne én person om gangen med hele døgnet 06–21, der overtid legges inn.' },
          ]}
        />
      </span>
      {expand === 'row' && (
        <button className="ghost" onClick={onToggleAll}>
          {anyOpen ? 'Fold alle' : 'Utvid alle'}
        </button>
      )}
    </div>
  )
}
