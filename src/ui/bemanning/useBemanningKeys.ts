import { useEffect } from 'react'
import { isTyping } from '../dom'
import { useStableActions } from '../kalender/useStableActions'
import { TOOL_KEYS, type Tool } from './tools'

/** What the keys of Bemanning do, and what they ask of it. Read anew on every key, see `useStableActions`. */
interface Keys {
  /** The keys are at rest while Bemanning is not shown, and while Innleid is shown in place of the people. */
  active: boolean
  holdShift: (down: boolean) => void
  /** Something is selected or copied, to copy or paste with the keys. */
  canCopy: boolean
  canPaste: boolean
  copy: () => void
  paste: () => void
  /** What Escape puts away, in order: the menu or popover that is open takes it itself, then the stroke, the block, the selection, the brush, the panel and the open hours. */
  popoverOpen: boolean
  stroking: boolean
  cancelStroke: () => void
  selectedBlock: boolean
  dropBlock: () => void
  selection: boolean
  dropSelection: () => void
  brushOrTool: boolean
  clearBrush: () => void
  panel: boolean
  closePanel: () => void
  fold: () => void
  pickTool: (tool: Tool) => void
  /** The competences people have, in order: the keys 1 to 9 pick them. */
  competenceKeys: string[]
  pickBrush: (competence: string) => void
  /** «E» opens the hours of the person selected, or folds those that are open. */
  toggleHours: () => void
  /** The arrows step the open hours, else the brush between the lines under the competence in focus. */
  hoursOpen: boolean
  stepHours: (delta: number) => void
  canStepLines: boolean
  stepLines: (delta: number) => void
  /** Delete and Backspace remove the block selected, else the blocks of the days selected. */
  remove: (() => void) | null
}

/** The keys of Bemanning, on the window: copy and paste, Escape, the tools, the competences, «E», the arrows and Delete. */
export function useBemanningKeys(latest: Keys) {
  const keys = useStableActions({
    down: (e: KeyboardEvent) => {
      const k = latest
      if (!k.active) return
      if (e.key === 'Shift') k.holdShift(true)
      if (isTyping(e.target)) return
      const key = e.key.toLowerCase()
      if (e.metaKey || e.ctrlKey) {
        if (key === 'c' && k.canCopy) {
          e.preventDefault()
          k.copy()
        } else if (key === 'v' && k.canPaste) {
          e.preventDefault()
          k.paste()
        }
        return
      }
      if (key === 'escape') {
        // A menu or a popover that is open takes the key first, and closes itself.
        if (k.popoverOpen) return
        if (k.stroking) k.cancelStroke()
        else if (k.selectedBlock) k.dropBlock()
        else if (k.selection) k.dropSelection()
        else if (k.brushOrTool) k.clearBrush()
        else if (k.panel) k.closePanel()
        else k.fold()
      } else if (TOOL_KEYS[key] && !e.altKey) k.pickTool(TOOL_KEYS[key])
      else if (/^[1-9]$/.test(key) && k.competenceKeys[Number(key) - 1]) k.pickBrush(k.competenceKeys[Number(key) - 1])
      else if (key === 'e' && !e.altKey) k.toggleHours()
      else if ((key === 'arrowup' || key === 'arrowdown') && k.hoursOpen) {
        e.preventDefault()
        k.stepHours(key === 'arrowup' ? -1 : 1)
      } else if ((key === 'arrowup' || key === 'arrowdown') && k.canStepLines) {
        e.preventDefault()
        k.stepLines(key === 'arrowup' ? -1 : 1)
      } else if ((key === 'delete' || key === 'backspace') && k.remove) {
        e.preventDefault()
        k.remove()
      }
    },
    up: (e: KeyboardEvent) => {
      if (e.key === 'Shift') latest.holdShift(false)
    },
    /** The window is left: no key is held any more. */
    lost: () => latest.holdShift(false),
  })
  useEffect(() => {
    // In the capture phase, so Escape is seen while a menu that closes on it is still open.
    window.addEventListener('keydown', keys.down, true)
    window.addEventListener('keyup', keys.up)
    window.addEventListener('blur', keys.lost)
    return () => {
      window.removeEventListener('keydown', keys.down, true)
      window.removeEventListener('keyup', keys.up)
      window.removeEventListener('blur', keys.lost)
    }
  }, [keys])
}
