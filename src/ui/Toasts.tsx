import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useWorkspace } from '../store/workspaceStore'

export interface Toast {
  id: number
  text: string
  /** A thing to do about it, such as «Angre». */
  action?: { label: string; run: () => void }
}

const SHOWN_FOR_MS = 6000

/** Short messages that show in a corner and go away by themselves. Returns the messages and a function that shows one. */
// eslint-disable-next-line react-refresh/only-export-components
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  /** The timer of each toast that shows, cleared when it goes. */
  const timers = useRef(new Map<number, number>())
  useEffect(() => {
    const running = timers.current
    return () => running.forEach((timer) => clearTimeout(timer))
  }, [])
  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((list) => list.filter((toast) => toast.id !== id))
  }, [])
  const show = useCallback(
    (text: string, action?: Toast['action']) => {
      const id = nextId.current++
      // The same message again replaces the one that is showing.
      setToasts((list) => [...list.filter((toast) => toast.text !== text), { id, text, action }])
      timers.current.set(id, window.setTimeout(() => dismiss(id), SHOWN_FOR_MS))
    },
    [dismiss],
  )
  return { toasts, show, dismiss }
}

/** Says what a change did, with «Angre» to take it back. */
export type Notify = (text: string) => void

/** Toasts for the planner's tables, where every change says what it did and can be undone from the toast. */
// eslint-disable-next-line react-refresh/only-export-components
export function useUndoToasts() {
  const { undo } = useWorkspace()
  const { toasts, show, dismiss } = useToasts()
  const notify = useCallback<Notify>((text) => show(text, { label: 'Angre', run: undo }), [show, undo])
  return { toasts, show, dismiss, notify }
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null
  return (
    <div className="toasts" role="status">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              className="link"
              onClick={() => {
                toast.action!.run()
                onDismiss(toast.id)
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button className="row-action" aria-label="Lukk" title="Lukk" onClick={() => onDismiss(toast.id)}>
            <X size={13} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}
