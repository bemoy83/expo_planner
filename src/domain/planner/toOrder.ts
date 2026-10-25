import { competenceStyles } from '../competences'
import type { ISODate } from '../dates'
import { numberKey } from '../projects'
import { normalDayHours } from '../staffing/intervals'
import { buildProjectBalance, NO_PROJECT } from '../staffing/projectBalance'
import type { CompetenceKey, Workspace } from '../types'
import { waitingAsOrdered, weightsOf } from './score'
import type { HiredRun } from './solve'

/**
 * «Til innleie» (the Claude Doc «Innleie i planleggingsmotoren», step 3): the people the engine hires in, per
 * competence and supplier, as runs of days with the number of people on each, for the projects picked. The engine
 * orders nothing: the planner orders with the brush in Innleid, as before.
 */

/** People hired in for the same days. */
export interface HireSpan {
  from: ISODate
  to: ISODate
  people: number
  /** The projects they work for, by their number as written. */
  projectNos: string[]
}

export interface HireNeed {
  competence: CompetenceKey
  label: string
  supplier: string
  /** The days of work of all of them together. */
  personDays: number
  spans: HireSpan[]
}

export const toHire = (ws: Workspace, hired: HiredRun[], projectNos: string[]): HireNeed[] => {
  const wanted = new Set(projectNos.map(numberKey))
  const labels = new Map(competenceStyles(ws).map((style) => [style.key, style.label]))
  const order = new Map(competenceStyles(ws).map((style, i) => [style.key, i]))
  const names = new Map((ws.suppliers ?? []).map((s) => [s.id, s.name]))
  const needs = new Map<string, HireNeed>()
  for (const run of hired) {
    if (!run.projectNos.some((p) => wanted.has(numberKey(p)))) continue
    const competence = run.competences[0]
    const key = `${competence}|${run.supplierId}`
    const need = needs.get(key) ?? { competence, label: labels.get(competence) ?? competence, supplier: names.get(run.supplierId) ?? run.supplierId, personDays: 0, spans: [] }
    needs.set(key, need)
    need.personDays += run.dates.length
    const [from, to] = [run.dates[0], run.dates.at(-1)!]
    const span = need.spans.find((s) => s.from === from && s.to === to)
    if (span) {
      span.people++
      for (const p of run.projectNos) if (!span.projectNos.some((q) => numberKey(q) === numberKey(p))) span.projectNos.push(p)
    } else need.spans.push({ from, to, people: 1, projectNos: [...run.projectNos] })
  }
  for (const need of needs.values()) need.spans.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
  return [...needs.values()].sort((a, b) => (order.get(a.competence) ?? 99) - (order.get(b.competence) ?? 99) || a.supplier.localeCompare(b.supplier, 'nb'))
}

/**
 * What is left uncovered once the permanent staff and the people hired in are on the plan: per competence and day,
 * the hours nobody covers, the people that is, and the suppliers who offer the competence; where none does, it
 * cannot be hired in. Orders that wait for an answer count as ordered.
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
