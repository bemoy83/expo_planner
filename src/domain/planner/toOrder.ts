import { competenceStyles } from '../competences'
import type { ISODate } from '../dates'
import { numberKey } from '../projects'
import { normalDayHours } from '../staffing/intervals'
import { buildProjectBalance, NO_PROJECT } from '../staffing/projectBalance'
import type { CompetenceKey, Workspace } from '../types'
import { waitingAsOrdered, weightsOf } from './score'

/**
 * What is left to hire in once the permanent staff are on the plan (step 5 of the Claude Doc «Planleggingsmotor:
 * byggeplan»): per competence and day, the hours no permanent person and no order covers yet, the people that is,
 * and the suppliers who offer the competence. The engine orders nothing: the planner orders with the brush in
 * Innleid, as before, where the same hours are what remains. Orders that wait for an answer count as ordered.
 */

export interface OrderDay {
  date: ISODate
  hours: number
  /** The people the hours take: a normal day each, and at least a call-out. */
  people: number
}

export interface OrderNeed {
  competence: CompetenceKey
  label: string
  hours: number
  days: OrderDay[]
  /** The suppliers who offer the competence, in the planner's order; none means it cannot be hired in. */
  suppliers: string[]
}

export const toOrder = (ws: Workspace, dates: ISODate[], projectNos?: string[]): OrderNeed[] => {
  const wanted = projectNos && new Set(projectNos.map(numberKey))
  const day = normalDayHours(ws.settings.workday)
  const balance = buildProjectBalance(waitingAsOrdered(ws), dates, true)
  const styles = competenceStyles(ws)
  const needs: OrderNeed[] = []
  for (const style of styles) {
    const days: OrderDay[] = []
    for (const date of dates) {
      let hours = 0
      for (const p of balance.get(style.key, date).projects.values()) {
        if (wanted && (p.projectNo === NO_PROJECT || !wanted.has(numberKey(p.projectNo)))) continue
        if (p.remaining > 0.01) hours += p.remaining
      }
      if (hours > 0.01) days.push({ date, hours, people: Math.max(1, Math.ceil(hours / Math.max(day, weightsOf(ws.settings).minCallOut) - 1e-9)) })
    }
    if (!days.length) continue
    const suppliers = [...(ws.suppliers ?? [])].sort((a, b) => a.order - b.order).filter((s) => s.competences.includes(style.key)).map((s) => s.name)
    needs.push({ competence: style.key, label: style.label, hours: days.reduce((sum, d) => sum + d.hours, 0), days, suppliers })
  }
  return needs.sort((a, b) => b.hours - a.hours)
}
