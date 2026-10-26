import { useEffect } from 'react'
import { isTyping } from '../dom'
import { useStableActions } from '../kalender/useStableActions'
import { toolOfKey } from '../toolKeys'
import type { Tool } from './tools'

/**
 * What the keys of Bemanning do, and what they ask of it, the same in Faste and in Innleid (2026-10-26): each part hands
 * the hook its own answers, and leaves out what it does not have. Read anew on every key, see `useStableActions`.
 */
interface Keys {
  /** The keys are at rest while the part is not shown. */
  active: boolean
  holdShift: (down: boolean) => void
  /** Something is selected or copied, to copy or paste with the keys. */
  canCopy?: boolean
  canPaste?: boolean
  copy?: () => void
  paste?: () => void
  /** What Escape puts away, in order: the menu or popover that is open takes it itself, then the stroke, the block, the selection, the brush, the panel and the open hours. */
  popoverOpen: boolean
  stroking: boolean
  cancelStroke: () => void
  selectedBlock?: boolean
  dropBlock?: () => void
  selection: boolean
  dropSelection: () => void
  brushOrTool: boolean
  clearBrush: () => void
  panel: boolean
  closePanel: () => void
  fold: () => void
  pickTool: (tool: Tool) => void
  /** What the brush can be, in order: the keys 1 to 9 pick them (the competences people have in Faste, the suppliers in Innleid). */
  brushKeys: string[]
  pickBrush: (key: string) => void
  /** «E» opens the hours of the person selected, or folds those that are open. */
  toggleHours?: () => void
  /** The arrows step the open hours, else the lines under the competence in focus. */
  hoursOpen?: boolean
  stepHours?: (delta: number) => void
  canStepLines: boolean
  stepLines: (delta: number) => void
  /** Delete and Backspace remove what is selected. */
  remove: (() => void) | null
  /** «?» shows or hides the help. */
  help?: () => void
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
        if (key === 'c' && k.canCopy && k.copy) {
          e.preventDefault()
          k.copy()
        } else if (key === 'v' && k.canPaste && k.paste) {
          e.preventDefault()
          k.paste()
        }
        return
      }
      if (key === 'escape') {
        // A menu or a popover that is open takes the key first, and closes itself.
        if (k.popoverOpen) return
        if (k.stroking) k.cancelStroke()
        else if (k.selectedBlock && k.dropBlock) k.dropBlock()
        else if (k.selection) k.dropSelection()
        else if (k.brushOrTool) k.clearBrush()
        else if (k.panel) k.closePanel()
        else k.fold()
      } else if (toolOfKey(key) && !e.altKey) k.pickTool(toolOfKey(key)!)
      else if (/^[1-9]$/.test(key) && k.brushKeys[Number(key) - 1]) k.pickBrush(k.brushKeys[Number(key) - 1])
      else if (key === 'e' && !e.altKey && k.toggleHours) k.toggleHours()
      else if (key === '?' && k.help) k.help()
      else if ((key === 'arrowup' || key === 'arrowdown') && k.hoursOpen && k.stepHours) {
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
