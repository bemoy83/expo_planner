import { ChevronLeft, ChevronRight, Printer, X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { competenceStyles } from '../../domain/competences'
import { addDays, weekdayIndex, type ISODate } from '../../domain/dates'
import { buildDayPlan } from '../../domain/dayPlan'
import type { Workspace } from '../../domain/types'
import { buildWeekPlan } from '../../domain/weekPlan'
import { withPlacesSet } from '../../domain/workPlace'
import { useWorkspace } from '../../store/workspaceStore'
import { Segmented } from '../common'
import { DayPlanSheet } from './DayPlanSheet'
import { WeekPlanSheet } from './WeekPlanSheet'

type PlanView = 'day' | 'week'
export interface OpenPlan {
  view: PlanView
  date: ISODate
}

const stamp = () => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/**
 * The work plans over the page, to read and to print: the day plan and the shared week plan. The sheet on its own is what
 * the printer gets (`print.css`). Read-only, but for «Sett stedene»; the arrows step a day or a week, Esc closes.
 */
export function WorkPlanDialog(props: { open: OpenPlan; onOpen: (open: OpenPlan) => void; onClose: () => void }) {
  const { workspace, updateStaffing } = useWorkspace()
  return workspace ? <Overlay {...props} workspace={workspace} onSetPlaces={(date) => updateStaffing((ws) => withPlacesSet(ws, date))} /> : null
}

function Overlay({ open, onOpen, onClose, workspace, onSetPlaces }: { open: OpenPlan; onOpen: (open: OpenPlan) => void; onClose: () => void; workspace: Workspace; onSetPlaces: (date: ISODate) => void }) {
  const { view, date } = open
  const step = view === 'week' ? 7 : 1
  const monday = addDays(date, -weekdayIndex(date))
  const dayPlan = useMemo(() => (view === 'day' ? buildDayPlan(workspace, date) : null), [workspace, date, view])
  const weekPlan = useMemo(() => {
    if (view !== 'week') return null
    const order = new Map(competenceStyles(workspace).map((s, i) => [s.key, i]))
    return buildWeekPlan(workspace, monday, (c) => order.get(c) ?? order.size)
  }, [workspace, monday, view])
  const printedAt = useMemo(() => (dayPlan || weekPlan ? stamp() : ''), [dayPlan, weekPlan])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) onOpen({ view, date: addDays(date, -step) })
      else if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) onOpen({ view, date: addDays(date, step) })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [date, view, step, onClose, onOpen])
  return createPortal(
    <div className="dp-overlay" role="dialog" aria-modal="true" aria-label="Arbeidsplan" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dp-bar">
        <Segmented
          label="Plan"
          value={view}
          onChange={(next: PlanView) => onOpen({ view: next, date })}
          options={[
            { value: 'day', label: 'Dag', title: 'Dagsplan: hvem som jobber hvor en dag' },
            { value: 'week', label: 'Uke', title: 'Ukeplan: hva som skjer hvor i uka' },
          ]}
        />
        <button className="ghost" onClick={() => onOpen({ view, date: addDays(date, -step) })} aria-label={view === 'week' ? 'Forrige uke' : 'Forrige dag'} title="Forrige (←)">
          <ChevronLeft size={16} aria-hidden />
        </button>
        <button className="ghost" onClick={() => onOpen({ view, date: addDays(date, step) })} aria-label={view === 'week' ? 'Neste uke' : 'Neste dag'} title="Neste (→)">
          <ChevronRight size={16} aria-hidden />
        </button>
        <span className="dp-bar-title">{view === 'week' ? 'Ukeplan' : 'Dagsplan'}</span>
        <button className="primary" onClick={() => window.print()}>
          <Printer size={14} aria-hidden /> Skriv ut
        </button>
        <button className="ghost" onClick={onClose} aria-label="Lukk" title="Lukk (Esc)">
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="dp-page">
        {dayPlan && <DayPlanSheet plan={dayPlan} ws={workspace} printedAt={printedAt} unsetCount={dayPlan.uncertain} onSetPlaces={() => onSetPlaces(date)} />}
        {weekPlan && <WeekPlanSheet plan={weekPlan} ws={workspace} printedAt={printedAt} />}
      </div>
    </div>,
    document.body,
  )
}
