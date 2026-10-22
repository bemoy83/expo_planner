import { addDays, type ISODate } from './dates'
import { projectPhaseSpans, phaseAt } from './dayPlan'
import { isWaiting } from './hire'
import { numberKey, venueEvents } from './projects'
import { NO_PROJECT, PROJECT_PLACE, buildProjectBalance, placeKey } from './staffing'
import type { CompetenceKey, VenuePhase, Workspace } from './types'
import { visibleVenue } from './venueImport'
import { bookedPlaces, dealPlaces } from './workPlace'

/**
 * The shared week plan (`design_docs/ukeplan/`): the whole picture of a week by project and place, with no hours and
 * no names. A project has its phase over the days and a bar for each work in each place, from the first to the last
 * day it is planned, and what needs action on a bar: crew that is missing or an order that waits. Worked out from the
 * planning rows and Bemanning; nothing is stored.
 */

/** A stretch of days in a phase. */
export interface WeekPhase {
  phase: VenuePhase
  /** The days of the week, as indexes 0 to 6. */
  from: number
  to: number
  /** The day of the phase's own days where the stretch starts, and how many days it has in all. */
  day: number
  of: number
}

/** What needs action on a bar, on which days of the week (indexes 0 to 6). */
export interface WeekFlag {
  state: 'short' | 'wait'
  days: number[]
}

export interface WeekBar {
  competence: CompetenceKey
  /** The Visma department the planning rows are for; empty where they cover them all. */
  avdeling: string
  /** The place as the rows name it; empty for rows of all the project's halls. */
  hall: string
  from: number
  to: number
  flags: WeekFlag[]
}

export interface WeekProject {
  projectNo: string
  name: string
  phases: WeekPhase[]
  /** The places the project has booked in the week; the sheet names a place only where there are two or more. */
  places: string[]
  bars: WeekBar[]
}

export interface WeekAttention {
  state: 'short' | 'wait'
  projectNo: string
  projectName: string
  competence: CompetenceKey
  hall: string
  days: number[]
}

export interface WeekPlan {
  monday: ISODate
  dates: ISODate[]
  projects: WeekProject[]
  /** Work with no project: planning rows without a number, and blocks that no project lacks the hours of. */
  without: WeekBar[]
  attention: WeekAttention[]
}

const EPS = 0.01

const sortBars = (bars: WeekBar[], order: (c: CompetenceKey) => number) =>
  bars.sort((a, b) => a.from - b.from || order(a.competence) - order(b.competence) || a.hall.localeCompare(b.hall, 'nb', { numeric: true }) || a.avdeling.localeCompare(b.avdeling, 'nb'))

/** The week plan of the week that holds `date`, Monday to Sunday. */
export const buildWeekPlan = (ws: Workspace, monday: ISODate, competenceOrder: (c: CompetenceKey) => number = () => 0): WeekPlan => {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const balance = buildProjectBalance(ws, dates, true)
  const dealt = dealPlaces(ws, dates)
  const names = new Map<string, string>()
  const nameOf = (projectNo: string) => names.get(numberKey(projectNo)) ?? ws.projects.find((ref) => numberKey(ref.projectNo) === numberKey(projectNo))?.name ?? ws.allocations.find((row) => numberKey(row.projectNo) === numberKey(projectNo))?.projectName ?? projectNo

  // The projects of the week: planned, staffed or ordered in it, or booked in the halls.
  const numbers = new Map<string, string>()
  const note = (projectNo: string | undefined) => {
    if (projectNo?.trim()) numbers.set(numberKey(projectNo), projectNo.trim())
  }
  for (const row of ws.allocations) if (dates.some((d) => row.fte[d])) note(row.projectNo)
  for (const a of ws.assignments ?? []) if (dates.includes(a.date)) note(a.projectNo)
  for (const o of ws.hireOrders ?? []) if (dates.includes(o.date)) note(o.projectNo)
  for (const event of venueEvents(visibleVenue(ws.venue, ws.hiddenVenue), ws.projects)) if (event.projectNo && event.start <= dates[6] && event.end >= dates[0]) note(event.projectNo)

  // A bar per project, place, competence and department, from the first to the last planned day.
  type Key = string
  const barsOf = (rows: Workspace['allocations']): Map<Key, WeekBar> => {
    const bars = new Map<Key, WeekBar>()
    for (const row of rows) {
      const days = dates.flatMap((d, i) => (row.fte[d] ? [i] : []))
      if (!days.length) continue
      const competence = row.competence.trim().toLowerCase()
      const hall = row.hall?.trim() && placeKey(row.hall) !== PROJECT_PLACE ? row.hall.trim() : ''
      const avdeling = row.avdeling?.trim() ?? ''
      const key = [competence, hall.toLowerCase(), avdeling.toLowerCase()].join('|')
      const held = bars.get(key)
      bars.set(key, held ? { ...held, from: Math.min(held.from, days[0]), to: Math.max(held.to, days[days.length - 1]) } : { competence, avdeling, hall, from: days[0], to: days[days.length - 1], flags: [] })
    }
    return bars
  }

  const waiting = (projectNo: string, competence: CompetenceKey, date: ISODate) => (ws.hireOrders ?? []).some((o) => o.date === date && isWaiting(o) && o.competence === competence && numberKey(o.projectNo ?? NO_PROJECT) === numberKey(projectNo))
  const flagsOf = (projectNo: string, bar: Omit<WeekBar, 'flags'>): WeekFlag[] => {
    const short: number[] = []
    const wait: number[] = []
    for (let i = bar.from; i <= bar.to; i++) {
      const day = balance.of(bar.competence, dates[i], projectNo)
      const place = bar.hall ? day.places.get(placeKey(bar.hall)) : undefined
      const remaining = place ? place.remaining : day.remaining
      if (remaining > EPS) (waiting(projectNo, bar.competence, dates[i]) ? wait : short).push(i)
    }
    return [...(short.length ? [{ state: 'short' as const, days: short }] : []), ...(wait.length ? [{ state: 'wait' as const, days: wait }] : [])]
  }

  const projects: WeekProject[] = []
  const attention: WeekAttention[] = []
  for (const projectNo of numbers.values()) {
    const spans = projectPhaseSpans(ws, projectNo)
    const phases: WeekPhase[] = []
    let open: WeekPhase | undefined
    dates.forEach((date, i) => {
      const phase = phaseAt(spans, date)
      if (!phase) return void (open = undefined)
      if (open && open.phase === phase && open.to === i - 1) open.to = i
      else {
        const span = spans.get(phase)!
        const length = (a: ISODate, b: ISODate) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1
        open = { phase, from: i, to: i, day: length(span.start, date), of: length(span.start, span.end) }
        phases.push(open)
      }
    })
    const rows = ws.allocations.filter((row) => numberKey(row.projectNo) === numberKey(projectNo))
    const bars = sortBars(
      [...barsOf(rows).values()].map((bar) => ({ ...bar, flags: flagsOf(projectNo, bar) })),
      competenceOrder,
    )
    for (const bar of bars) for (const flag of bar.flags) attention.push({ state: flag.state, projectNo, projectName: nameOf(projectNo), competence: bar.competence, hall: bar.hall, days: flag.days })
    const places = [...new Set(dates.flatMap((d) => bookedPlaces(ws, projectNo, d)))].sort((a, b) => a.localeCompare(b, 'nb', { numeric: true }))
    projects.push({ projectNo, name: nameOf(projectNo), phases, places, bars })
  }
  projects.sort((a, b) => (a.phases[0]?.from ?? 7) - (b.phases[0]?.from ?? 7) || a.name.localeCompare(b.name, 'nb'))

  // Work for no project: rows without a number, and blocks that went nowhere or to the demand without a number.
  const withoutRows = barsOf(ws.allocations.filter((row) => !row.projectNo.trim()))
  const blocks = new Map<CompetenceKey, number[]>()
  for (const a of ws.assignments ?? []) {
    const i = dates.indexOf(a.date)
    if (i < 0) continue
    const at = dealt.get(a.id)
    if (at === undefined || (at !== null && at.projectNo)) continue
    blocks.set(a.competence, [...(blocks.get(a.competence) ?? []), i])
  }
  for (const [competence, days] of blocks) {
    const key = `${competence}||`
    const held = withoutRows.get(key)
    const from = Math.min(...days)
    const to = Math.max(...days)
    withoutRows.set(key, held ? { ...held, from: Math.min(held.from, from), to: Math.max(held.to, to) } : { competence, avdeling: '', hall: '', from, to, flags: [] })
  }
  const without = sortBars([...withoutRows.values()], competenceOrder)

  attention.sort((a, b) => Number(a.state === 'wait') - Number(b.state === 'wait') || a.days[0] - b.days[0])
  return { monday, dates, projects, without, attention }
}
