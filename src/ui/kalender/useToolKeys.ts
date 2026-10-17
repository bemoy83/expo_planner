import { useEffect, useRef, useState } from 'react'
import { isTyping } from '../dom'
import { TOOL_KEYS, type Tool } from './selection'

interface Options {
  /** A dialog is open: the keys are its own. */
  blocked: boolean
  onTool: (tool: Tool) => void
  onEscape: () => void
}

/**
 * V, B and T pick a tool, as in Bemanning, and Escape steps back, anywhere on the page but in a field.
 * Returns the eraser while Alt is held, which it is for one stroke.
 */
export function useToolKeys(options: Options): Exclude<Tool, 'select'> | null {
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })
  const [modifier, setModifier] = useState<Exclude<Tool, 'select'> | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { blocked, onTool, onEscape } = latest.current
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || isTyping(e.target) || blocked) return
      if (e.key === 'Escape') return onEscape()
      const picked = TOOL_KEYS[e.key.toLowerCase()]
      if (picked) onTool(picked)
    }
    // While Alt is held the planning cells show what a drag would do.
    const onModifier = (e: KeyboardEvent) => setModifier(e.altKey ? 'eraser' : null)
    const onBlur = () => setModifier(null)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keydown', onModifier)
    window.addEventListener('keyup', onModifier)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keydown', onModifier)
      window.removeEventListener('keyup', onModifier)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
  return modifier
}
