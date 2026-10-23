import { useMemo } from 'react'
import { competenceStyles, staffedCompetences } from '../../domain/competences'
import type { ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { balanceTotals, buildBalance, uncoverable as uncoverableHours, type Balance, type WeekTotals } from '../../domain/staffing/balance'
import { buildProjectBalance, type ProjectBalance } from '../../domain/staffing/projectBalance'
import type { AllocationRow, Workspace } from '../../domain/types'
import type { Columns } from '../kalender/gridTypes'
import { LEFT_W } from '../kalender/layout'
import { PANEL_W } from '../cssVars'
import { remainingIn } from './lineBalances'
import { EPSILON, weekDates } from './week'

/** The highest number a competence can be picked with on the keyboard. */
export const LAST_KEY = 9
const NO_HOURS = new Map<string, number>()

interface Options {
  /** Nothing is worked out while Bemanning is not shown. */
  active: boolean
  ws: Workspace
  dates: ISODate[]
  cols: Columns
  viewport: { left: number; width: number }
  /** The planning rows whose FTE is the demand. */
  planned: AllocationRow[]
  /** The Person panel lies over the last days. */
  panelOpen: boolean
  /** The day in focus, shared with the plan. */
  focusDate: ISODate | undefined
}

/**
 * The competences, the days in view and the balance of Bemanning: the demand of the period per competence and day against the hours
 * assigned, the same per project over the whole workspace, and what remains of it in the days the planner sees.
 */
export function useBemanningBalance({ active, ws, dates, cols, viewport, planned, panelOpen, focusDate }: Options) {
  const { colW } = cols
  const staffed = useMemo(() => (active ? staffedCompetences(ws) : []), [active, ws])
  const styles = useMemo(() => new Map((active ? competenceStyles(ws) : []).map((style) => [style.key, style])), [active, ws])
  const keyOf = useMemo(() => new Map(staffed.slice(0, LAST_KEY).map((style, index) => [style.key, index + 1])), [staffed])

  // ---- the balance of the whole period, worked out once per change ---------------------------------
  const balance = useMemo<Balance>(() => buildBalance(planned === ws.allocations ? ws : { ...ws, allocations: planned }, active ? dates : []), [active, ws, planned, dates])
  // The same per project, over the whole workspace: what is hidden in the Kalender takes its share all the same.
  const projectBalance = useMemo<ProjectBalance>(() => buildProjectBalance(ws, active ? dates : []), [active, ws, dates])

  // ---- what is in view ---------------------------------------------------------------------------------
  // The days that are seen: those the panel does not lie over.
  const room = Math.max(colW, viewport.width - LEFT_W - (panelOpen ? PANEL_W : 0))
  const viewFrom = Math.max(0, Math.floor(viewport.left / colW))
  const viewTo = Math.min(dates.length - 1, Math.floor((viewport.left + room - 1) / colW))
  // The hours that remain are those of the days in view. Summed over the whole period they would count
  // every project that is read in, and say nothing of the days the planner is staffing.
  const viewDates = useMemo(() => (active ? dates.slice(viewFrom, viewTo + 1) : []), [active, dates, viewFrom, viewTo])
  const totals = useMemo<WeekTotals>(() => balanceTotals(balance, viewDates), [balance, viewDates])
  /** Per competence: the hours that remain in the days in view. A competence with neither demand nor assigned hours in the period is not in it. */
  const remainingOf = useMemo(() => remainingIn(balance, viewDates), [balance, viewDates])
  // The demand lists the competences people have, and any other with demand or assigned hours in the period.
  const demandRows = useMemo(() => {
    const held = new Set(staffed.map((style) => style.key))
    return [...styles.values()].filter((style) => held.has(style.key) || remainingOf.has(style.key)).map((style) => ({ style, key: keyOf.get(style.key) ?? 0 }))
  }, [staffed, styles, remainingOf, keyOf])

  const firstWorkday = useMemo(() => {
    for (let col = Math.min(dates.length - 1, Math.ceil(viewport.left / colW)); col < dates.length; col++) if (dayType(dates[col]) === 'arbeidsdag') return dates[col]
    return dates[dates.length - 1]
  }, [dates, viewport.left, colW])
  // The week a person's hours are counted in: that of the day in focus while it is in view, else of the first workday in view.
  const focusInView = focusDate !== undefined && dates.length > 0 && focusDate >= dates[viewFrom] && focusDate <= dates[viewTo]
  const weekStart = active && dates.length ? weekDates(focusInView ? focusDate : firstWorkday)[0] : ''
  const week = useMemo(() => (weekStart ? weekDates(weekStart) : []), [weekStart])

  const uncoverable = useMemo(() => {
    if (!active) return NO_HOURS
    const hours = new Map<string, number>()
    for (const { style } of demandRows) {
      for (const date of cols.dates) {
        if (balance.get(style.key, date).remaining < EPSILON) continue
        const short = uncoverableHours(ws, style.key, date, balance)
        if (short > EPSILON) hours.set(`${style.key}|${date}`, short)
      }
    }
    return hours
  }, [active, ws, balance, demandRows, cols.dates])

  return { staffed, styles, keyOf, balance, projectBalance, room, viewFrom, viewTo, viewDates, totals, remainingOf, demandRows, firstWorkday, weekStart, week, uncoverable }
}
