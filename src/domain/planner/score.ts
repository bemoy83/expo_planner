import { competenceStyles } from '../competences'
import { pushTo } from '../collections'
import { daysBetween, type ISODate } from '../dates'
import { hireHours, isWaiting } from '../hire'
import { dayType } from '../holidays'
import { numberKey } from '../projects'
import { buildProjectBalance, NO_PROJECT } from '../staffing/projectBalance'
import { overtimeHours } from '../staffing/intervals'
import { okAssignments } from '../staffing/time'
import { competenceKey, type AllocationRow, type Assignment, type CompetenceKey, type CompetenceStyle, type Stage, type Workspace } from '../types'

/**
 * The score of a plan with its staffing: what it costs, counted in hours, never in kroner (the planner, 2026-10-25).
 * A permanent hour costs nothing, since the permanent staff are there anyway; everything else is weighed against it.
 * It is the one place that says what a good plan is: the planning engine is to make it as low as it can, and the
 * planner reads it for a plan of his own. The weights were found with pairs of plans he ranked (the Claude Doc
 * «Planleggingsmotor: byggeplan», step 2), kept as tests in `score.test.ts`.
 */

export const WEIGHTS = {
  /** An hour of demand nobody covers. */
  uncovered: 10,
  /** An hired hour of the competence that is easiest to replace; the hardest costs `hireHardest` (R7). */
  hireEasiest: 1,
  hireHardest: 1.5,
  /** A hired person comes for this many hours at least, however little there is to do. */
  minCallOut: 3,
  /**
   * Overtime: a person who works any that day, an hour of the first `overtimeShort` hours a person works over in a day, and an
   * hour past them. A little overtime beats a call-out; a day's worth does not, since overtime is to be avoided (the planner, 2026-10-25).
   */
  overtimePerson: 0.5,
  overtimeShort: 1.5,
  overtimeHour: 0.8,
  overtimeLongHour: 2,
  /** A person going from one competence, hall or project to another (R5). A team going on along its chain does not count. */
  competenceSwitch: 1,
  hallSwitch: 0.5,
  projectSwitch: 0.1,
  /** A day of work in a hall outside the build-up or tear-down the hall calendar gives the project (R6). */
  outsideWindow: 3,
  /** A day a stage starts before the stage it comes after, or ends after the stage that comes after it (R2). */
  stageDay: 1,
  /** A person short of the fewest a competence is done by in a hall (R4). */
  belowMinimum: 2,
}

export type Weights = typeof WEIGHTS

export type CostKind = 'uncovered' | 'hire' | 'overtime' | 'switch' | 'outside' | 'stage' | 'minimum'

/** One thing that costs, where it is: a project, a competence, a day. */
export interface Finding {
  kind: CostKind
  cost: number
  date: ISODate
  /** The project's number as written; none for what is on no project. */
  projectNo?: string
  competence?: CompetenceKey
  /** The hours it is about: uncovered, hired, overtime. */
  hours?: number
  /** The person it is about: a switch, overtime. */
  personId?: string
  /** For a switch: what changed. */
  switched?: 'competence' | 'hall' | 'project'
  /** For a stage out of place, the stage; for outside the window and too few in a hall, the hall. */
  stage?: Stage
  hall?: string
}

export interface Score {
  total: number
  byKind: Record<CostKind, number>
  /** Every finding, the costliest first. */
  findings: Finding[]
}

const KINDS: CostKind[] = ['uncovered', 'hire', 'overtime', 'switch', 'outside', 'stage', 'minimum']

/** The stages in the order a stand is built. Running and extra work have no place in it. */
const ORDERED: Stage[] = ['oppmerking', 'gulv', 'standbygging', 'tilvalg', 'losore']

/**
 * What an hired hour of each competence costs: from `hireEasiest` for the last of the planner's order to `hireHardest`
 * for the first, the hardest to replace (R7).
 */
export const hireCost = (styles: CompetenceStyle[], weights: Weights = WEIGHTS): ((competence: CompetenceKey) => number) => {
  const last = styles.length - 1
  const cost = new Map(styles.map((style, i) => [style.key, last > 0 ? weights.hireHardest - ((weights.hireHardest - weights.hireEasiest) * i) / last : weights.hireEasiest]))
  return (competence) => cost.get(competence) ?? weights.hireEasiest
}

const sameText = (a: string | undefined, b: string | undefined) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()

/** Two blocks of a person this near in time are one stretch of work, whose changes count; a gap of longer is a new start. */
const STRETCH_DAYS = 3

/** What changes from one block of a person to the next: the competence, unless along its chain; else the hall; else the project. */
const switchOf = (a: Assignment, b: Assignment, next: Map<CompetenceKey, CompetenceKey | undefined>): Finding['switched'] | null => {
  if (a.competence !== b.competence) return next.get(a.competence) === b.competence ? null : 'competence'
  if (a.hall && b.hall && !sameText(a.hall, b.hall)) return 'hall'
  if (!sameText(a.projectNo, b.projectNo)) return 'project'
  return null
}

/**
 * The score of the plan and its staffing over the dates. `windowOf` gives a planning row the days the hall calendar
 * gives its project in its hall, as the Kalender does; a row with none is not held against a window. Orders that wait
 * for an answer count as cover: they are the plan's, not yet the supplier's.
 */
export const scorePlan = (ws: Workspace, dates: ISODate[], windowOf: (row: AllocationRow) => Set<ISODate> | undefined, weights: Weights = WEIGHTS): Score => {
  const wanted = new Set(dates)
  const wd = ws.settings.workday
  const styles = competenceStyles(ws)
  const styleOf = new Map(styles.map((style) => [style.key, style]))
  const next = new Map(styles.map((style) => [style.key, style.next]))
  const findings: Finding[] = []
  const add = (finding: Finding) => finding.cost > 1e-9 && findings.push(finding)

  // Uncovered: what each project lacks of a competence on a day after its blocks and its orders.
  const asOrdered = { ...ws, hireOrders: (ws.hireOrders ?? []).map((order) => (isWaiting(order) ? { ...order, conf: order.fte } : order)) }
  const balance = buildProjectBalance(asOrdered, dates, true)
  for (const competence of balance.competences)
    for (const date of dates)
      for (const p of balance.get(competence, date).projects.values())
        if (p.remaining > 0.01) add({ kind: 'uncovered', cost: p.remaining * weights.uncovered, date, competence, hours: p.remaining, ...(p.projectNo !== NO_PROJECT ? { projectNo: p.projectNo } : {}) })

  // Hire: every person of an order is paid for a call-out at least, at the cost of the competence.
  const costOfHire = hireCost(styles, weights)
  for (const order of ws.hireOrders ?? []) {
    if (!wanted.has(order.date)) continue
    const hours = order.fte * Math.max(weights.minCallOut, hireHours(order, wd))
    add({ kind: 'hire', cost: hours * costOfHire(order.competence), date: order.date, competence: order.competence, hours, ...(order.projectNo ? { projectNo: order.projectNo } : {}) })
  }

  // Overtime and switches, person by person, block after block.
  const byPerson = new Map<string, Assignment[]>()
  for (const a of okAssignments(ws)) if (wanted.has(a.date)) pushTo(byPerson, a.personId, a)
  for (const [personId, blocks] of byPerson) {
    blocks.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
    const overtime = new Map<ISODate, { hours: number; projectNo?: string }>()
    for (const a of blocks) {
      const hours = overtimeHours(a, dayType(a.date), wd)
      if (hours <= 0) continue
      const day = overtime.get(a.date) ?? { hours: 0, projectNo: a.projectNo }
      day.hours += hours
      overtime.set(a.date, day)
    }
    for (const [date, day] of overtime) {
      const cost = weights.overtimePerson + Math.min(day.hours, weights.overtimeShort) * weights.overtimeHour + Math.max(0, day.hours - weights.overtimeShort) * weights.overtimeLongHour
      add({ kind: 'overtime', cost, date, personId, hours: day.hours, ...(day.projectNo ? { projectNo: day.projectNo } : {}) })
    }
    for (let i = 1; i < blocks.length; i++) {
      const [a, b] = [blocks[i - 1], blocks[i]]
      if (daysBetween(a.date, b.date) > STRETCH_DAYS) continue
      const switched = switchOf(a, b, next)
      if (!switched) continue
      const cost = switched === 'competence' ? weights.competenceSwitch : switched === 'hall' ? weights.hallSwitch : weights.projectSwitch
      add({ kind: 'switch', cost, date: b.date, personId, switched, competence: b.competence, ...(b.projectNo ? { projectNo: b.projectNo } : {}), ...(b.hall ? { hall: b.hall } : {}) })
    }
  }

  // Outside the window: a day a project works in a hall that the hall calendar does not give it.
  const outside = new Map<string, Finding>()
  for (const row of ws.allocations) {
    const window = windowOf(row)
    if (!window?.size) continue
    for (const date in row.fte)
      if (row.fte[date] && wanted.has(date) && !window.has(date)) {
        const key = `${numberKey(row.projectNo)}|${(row.hall ?? '').trim().toLowerCase()}|${date}`
        if (!outside.has(key)) outside.set(key, { kind: 'outside', cost: weights.outsideWindow, date, projectNo: row.projectNo, ...(row.hall ? { hall: row.hall } : {}) })
      }
  }
  outside.forEach(add)

  // Stages: in a project's hall and phase, each stage's days against those of the stages before and after it.
  const runs = new Map<string, { row: AllocationRow; stages: Map<Stage, { first: ISODate; last: ISODate }> }>()
  for (const row of ws.allocations) {
    const stage = styleOf.get(competenceKey(row.competence))?.stage
    if (!stage || !ORDERED.includes(stage) || !row.phase) continue
    const days = Object.keys(row.fte).filter((date) => row.fte[date] && wanted.has(date)).sort()
    if (!days.length) continue
    const key = `${numberKey(row.projectNo)}|${(row.hall ?? '').trim().toLowerCase()}|${row.phase}`
    if (!runs.has(key)) runs.set(key, { row, stages: new Map() })
    const { stages } = runs.get(key)!
    const run = stages.get(stage)
    stages.set(stage, { first: run && run.first < days[0] ? run.first : days[0], last: run && run.last > days.at(-1)! ? run.last : days.at(-1)! })
  }
  for (const { row, stages } of runs.values()) {
    // A tear-down takes the stand down in the opposite order (R9).
    const order = row.phase === 'Demontering' ? [...ORDERED].reverse() : ORDERED
    const present = order.filter((stage) => stages.has(stage))
    for (let i = 1; i < present.length; i++) {
      const before = stages.get(present[i - 1])!
      const after = stages.get(present[i])!
      const early = Math.max(0, daysBetween(after.first, before.first))
      const late = Math.max(0, daysBetween(after.last, before.last))
      if (early) add({ kind: 'stage', cost: early * weights.stageDay, date: after.first, projectNo: row.projectNo, stage: present[i], ...(row.hall ? { hall: row.hall } : {}) })
      if (late) add({ kind: 'stage', cost: late * weights.stageDay, date: before.last, projectNo: row.projectNo, stage: present[i - 1], ...(row.hall ? { hall: row.hall } : {}) })
    }
  }

  // Too few: the people of a competence in a project's hall on a day, against the fewest it is done by.
  const people = new Map<string, { a: Assignment; persons: Set<string> }>()
  for (const a of okAssignments(ws)) {
    if (!wanted.has(a.date) || !styleOf.get(a.competence)?.minPerHall || !a.projectNo) continue
    const key = `${a.competence}|${numberKey(a.projectNo)}|${(a.hall ?? '').trim().toLowerCase()}|${a.date}`
    const at = people.get(key) ?? { a, persons: new Set() }
    at.persons.add(a.personId)
    people.set(key, at)
  }
  for (const { a, persons } of people.values()) {
    const short = styleOf.get(a.competence)!.minPerHall! - persons.size
    if (short > 0) add({ kind: 'minimum', cost: short * weights.belowMinimum, date: a.date, competence: a.competence, projectNo: a.projectNo, ...(a.hall ? { hall: a.hall } : {}) })
  }

  findings.sort((a, b) => b.cost - a.cost || a.date.localeCompare(b.date))
  const byKind = Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<CostKind, number>
  for (const finding of findings) byKind[finding.kind] += finding.cost
  return { total: findings.reduce((sum, finding) => sum + finding.cost, 0), byKind, findings }
}

/** The part of a score that is one project's: its findings, and their sums. */
export const projectScore = (score: Score, projectNo: string): Score => {
  const findings = score.findings.filter((finding) => finding.projectNo !== undefined && numberKey(finding.projectNo) === numberKey(projectNo))
  const byKind = Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<CostKind, number>
  for (const finding of findings) byKind[finding.kind] += finding.cost
  return { total: findings.reduce((sum, finding) => sum + finding.cost, 0), byKind, findings }
}
