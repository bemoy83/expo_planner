import { ChevronLeft, ChevronRight, Printer, X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { addDays, type ISODate } from '../../domain/dates'
import { buildDayPlan } from '../../domain/dayPlan'
import { useWorkspace } from '../../store/workspaceStore'
import { withPlacesSet } from '../../domain/workPlace'
import type { Workspace } from '../../domain/types'
import { DayPlanSheet } from './DayPlanSheet'

const stamp = () => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/**
 * The day plan over the page, to read and to print: the sheet on its own is what the printer gets (`print.css`).
 * Read-only; the arrows step a day at a time, Esc closes.
 */
export function DayPlanDialog(props: { date: ISODate; onDate: (date: ISODate) => void; onClose: () => void }) {
  const { workspace, updateStaffing } = useWorkspace()
  return workspace ? <Overlay {...props} workspace={workspace} onSetPlaces={(date) => updateStaffing((ws) => withPlacesSet(ws, date))} /> : null
}

function Overlay({ date, onDate, onClose, workspace, onSetPlaces }: { date: ISODate; onDate: (date: ISODate) => void; onClose: () => void; workspace: Workspace; onSetPlaces: (date: ISODate) => void }) {
  const plan = useMemo(() => buildDayPlan(workspace, date), [workspace, date])
  const printedAt = useMemo(() => (plan ? stamp() : ''), [plan])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) onDate(addDays(date, -1))
      else if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) onDate(addDays(date, 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [date, onClose, onDate])
  return createPortal(
    <div className="dp-overlay" role="dialog" aria-modal="true" aria-label="Dagsplan" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dp-bar">
        <button className="ghost" onClick={() => onDate(addDays(date, -1))} aria-label="Forrige dag" title="Forrige dag (←)">
          <ChevronLeft size={16} aria-hidden />
        </button>
        <button className="ghost" onClick={() => onDate(addDays(date, 1))} aria-label="Neste dag" title="Neste dag (→)">
          <ChevronRight size={16} aria-hidden />
        </button>
        <span className="dp-bar-title">Dagsplan</span>
        <button className="primary" onClick={() => window.print()}>
          <Printer size={14} aria-hidden /> Skriv ut
        </button>
        <button className="ghost" onClick={onClose} aria-label="Lukk" title="Lukk (Esc)">
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="dp-page">
        <DayPlanSheet plan={plan} ws={workspace} printedAt={printedAt} unsetCount={plan.uncertain} onSetPlaces={() => onSetPlaces(date)} />
      </div>
    </div>,
    document.body,
  )
}
