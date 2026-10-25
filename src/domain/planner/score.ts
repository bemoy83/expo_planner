import { competenceStyles } from '../competences'
import { pushTo } from '../collections'
import { addDays, daysBetween, type ISODate } from '../dates'
import { hireHours, isWaiting } from '../hire'
import { stageOfType } from '../kpi'
import { dayType } from '../holidays'
import { numberKey } from '../projects'
import { buildProjectBalance, NO_PROJECT } from '../staffing/projectBalance'
import { overtimeHours } from '../staffing/intervals'
import { okAssignments } from '../staffing/time'
import { competenceKey, type AllocationRow, type Assignment, type CompetenceKey, type CompetenceStyle, type KpiConfig, type Settings, type Stage, type WorkPhase, type Workspace } from '../types'

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
   * A hired person who was not there the working day before. More than a switch of hall, since the same person going on
   * to the next hall is better than a new one; less than a day paid for without work, since a hire is let go over quiet
   * days and a new one taken later; and less than a day's overtime is worth, since a whole day short is hired (the
   * planner, 2026-10-25).
   */
  hireStart: 1,
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
  /** For uncovered hours: demand not put on any day of the plan, rather than days nobody covers. */
  unplanned?: boolean
  /** The person it is about: a switch, overtime. */
  personId?: string
  /** For hire: the people who were not there the working day before. */
  started?: number
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

/** The stages that come in an order, as a stand is built by default. Running and extra work have no place in it. */
export const ORDERED_STAGES: Stage[] = ['oppmerking', 'gulv', 'standbygging', 'tilvalg', 'losore']

/** The order of the stages in a build-up as the planner has set it: every ordered stage once, the default order for any he has not placed. */
export const stageOrderOf = (settings: Pick<Settings, 'engine'>): Stage[] => {
  const set = (settings.engine?.stageOrder ?? []).filter((stage, i, all) => ORDERED_STAGES.includes(stage) && all.indexOf(stage) === i)
  return [...set, ...ORDERED_STAGES.filter((stage) => !set.includes(stage))]
}

/** The weights of the score: the defaults, with the planner's own where he has set one. */
export const weightsOf = (settings: Pick<Settings, 'engine'>): Weights => {
  const own = settings.engine?.weights ?? {}
  return Object.fromEntries(Object.entries(WEIGHTS).map(([name, value]) => [name, Number.isFinite(own[name]) && own[name] >= 0 ? own[name] : value])) as Weights
}

/** The stages in the order they come in a phase: a tear-down takes the stand down the other way round (R9). */
export const stagesOf = (phase: WorkPhase | '', order: Stage[] = ORDERED_STAGES): Stage[] => (phase === 'Demontering' ? [...order].reverse() : order)

/** A hall or place as it is compared: trimmed and in lower case, none being empty. */
export const hallKey = (hall: string | undefined): string => (hall ?? '').trim().toLowerCase()

/** A project's hall and phase, whose stages keep their order. */
export const stagePlace = (row: Pick<AllocationRow, 'projectNo' | 'hall' | 'phase'>): string => `${numberKey(row.projectNo)}|${hallKey(row.hall)}|${row.phase}`

/** The workspace with the orders that wait for an answer counted as ordered: they are the plan's, not yet the supplier's. */
export const waitingAsOrdered = (ws: Workspace): Workspace => ({ ...ws, hireOrders: (ws.hireOrders ?? []).map((order) => (isWaiting(order) ? { ...order, conf: order.fte } : order)) })

/** A score of the findings given, the costliest first. */
const scoreOf = (findings: Finding[]): Score => {
  const byKind = Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<CostKind, number>
  for (const finding of findings) byKind[finding.kind] += finding.cost
  return { total: findings.reduce((sum, finding) => sum + finding.cost, 0), byKind, findings }
}

/**
 * What an hired hour of each competence costs: from `hireEasiest` for the last of the planner's order to `hireHardest`
 * for the first, the hardest to replace (R7).
 */
export const hireCost = (styles: CompetenceStyle[], weights: Weights = WEIGHTS): ((competence: CompetenceKey) => number) => {
  const last = styles.length - 1
  const cost = new Map(styles.map((style, i) => [style.key, last > 0 ? weights.hireHardest - ((weights.hireHardest - weights.hireEasiest) * i) / last : weights.hireEasiest]))
  return (competence) => cost.get(competence) ?? weights.hireEasiest
}

/** Two blocks of a person this near in time are one stretch of work, whose changes count; a gap of longer is a new start. */
const STRETCH_DAYS = 3

/** What changes from one block of a person to the next: the competence, unless along its chain; else the hall; else the project. */
const switchOf = (a: Assignment, b: Assignment, next: Map<CompetenceKey, CompetenceKey | undefined>): Finding['switched'] | null => {
  if (a.competence !== b.competence) return next.get(a.competence) === b.competence ? null : 'competence'
  if (a.hall && b.hall && hallKey(a.hall) !== hallKey(b.hall)) return 'hall'
  if (numberKey(a.projectNo ?? '') !== numberKey(b.projectNo ?? '')) return 'project'
  return null
}

/** The rows of the plan with what each needs in all, so that demand put on no day counts too. */
export interface Unplanned {
  rows: AllocationRow[]
  /** The FTE-days a row needs in all. */
  required: (row: AllocationRow) => number
  /** A row's required hours by product type, so its stage is that of its product types (`hoursByWorkType`). */
  hoursByWork?: (row: AllocationRow) => Map<string, number>
}

/**
 * The stage of a row's work: that of its product types, else its competence's. A row whose work spans several stages, as
 * carpentry with built-up floor and walls, has none, as its days cannot be told apart by stage.
 */
export const rowStage = (kpi: KpiConfig | undefined, competenceStage: Stage | undefined, hours: Map<string, number> | undefined): Stage | undefined | null => {
  if (!hours?.size) return competenceStage
  const stages = new Set([...hours.keys()].map((workType) => stageOfType(kpi, workType, competenceStage)))
  return stages.size === 1 ? [...stages][0] : null
}

/**
 * The score of the plan and its staffing over the dates. `windowOf` gives a planning row the days the hall calendar
 * gives its project in its hall, as the Kalender does; a row with none is not held against a window. Orders that wait
 * for an answer count as cover: they are the plan's, not yet the supplier's. With `unplanned`, the demand of a row
 * that is on no day of the plan counts as uncovered too, on the first day of its window.
 */
export const scorePlan = (ws: Workspace, dates: ISODate[], windowOf: (row: AllocationRow) => Set<ISODate> | undefined, weights: Weights = weightsOf(ws.settings), unplanned?: Unplanned): Score => {
  const wanted = new Set(dates)
  const wd = ws.settings.workday
  const styles = competenceStyles(ws)
  const styleOf = new Map(styles.map((style) => [style.key, style]))
  const next = new Map(styles.map((style) => [style.key, style.next]))
  const findings: Finding[] = []
  const add = (finding: Finding) => finding.cost > 1e-9 && findings.push(finding)

  // Uncovered: what each project lacks of a competence on a day after its blocks and its orders.
  const balance = buildProjectBalance(waitingAsOrdered(ws), dates, true)
  for (const competence of balance.competences)
    for (const date of dates)
      for (const p of balance.get(competence, date).projects.values())
        if (p.remaining > 0.01) add({ kind: 'uncovered', cost: p.remaining * weights.uncovered, date, competence, hours: p.remaining, ...(p.projectNo !== NO_PROJECT ? { projectNo: p.projectNo } : {}) })

  for (const row of unplanned?.rows ?? []) {
    const missing = unplanned!.required(row) - Object.values(row.fte).reduce((sum, fte) => sum + fte, 0)
    if (missing <= 0.05) continue
    const hours = missing * ws.settings.hoursPerDay
    const date = [...(windowOf(row) ?? [])].sort()[0] ?? dates[0]
    add({ kind: 'uncovered', cost: hours * weights.uncovered, date, competence: competenceKey(row.competence), hours, unplanned: true, ...(row.projectNo ? { projectNo: row.projectNo } : {}), ...(row.hall ? { hall: row.hall } : {}) })
  }

  // Hire: every person of an order is paid for a call-out at least, at the cost of the competence.
  const costOfHire = hireCost(styles, weights)
  for (const order of ws.hireOrders ?? []) {
    if (!wanted.has(order.date)) continue
    const hours = order.fte * Math.max(weights.minCallOut, hireHours(order, wd))
    add({ kind: 'hire', cost: hours * costOfHire(order.competence), date: order.date, competence: order.competence, hours, ...(order.projectNo ? { projectNo: order.projectNo } : {}) })
  }

  // Starts: per supplier and competence, the people more than the working day before. A weekend or a holiday between
  // breaks no run.
  const hiredBy = new Map<string, Map<ISODate, { count: number; byProject: Map<string, number> }>>()
  for (const order of ws.hireOrders ?? []) {
    if (!wanted.has(order.date)) continue
    const key = `${order.supplierId}|${order.competence}`
    if (!hiredBy.has(key)) hiredBy.set(key, new Map())
    const day = hiredBy.get(key)!.get(order.date) ?? { count: 0, byProject: new Map() }
    day.count += order.fte
    day.byProject.set(order.projectNo ?? '', (day.byProject.get(order.projectNo ?? '') ?? 0) + order.fte)
    hiredBy.get(key)!.set(order.date, day)
  }
  for (const [key, days] of hiredBy) {
    const competence = key.slice(key.indexOf('|') + 1)
    for (const [date, day] of days) {
      let before = addDays(date, -1)
      for (let i = 0; i < 14 && dayType(before) !== 'arbeidsdag'; i++) before = addDays(before, -1)
      const started = Math.ceil(day.count - 1e-6) - Math.ceil((days.get(before)?.count ?? 0) - 1e-6)
      if (started <= 0) continue
      const projectNo = [...day.byProject].sort(([, a], [, b]) => b - a)[0][0]
      add({ kind: 'hire', cost: started * weights.hireStart, date, competence, started, ...(projectNo ? { projectNo } : {}) })
    }
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
        const key = `${numberKey(row.projectNo)}|${hallKey(row.hall)}|${date}`
        if (!outside.has(key)) outside.set(key, { kind: 'outside', cost: weights.outsideWindow, date, projectNo: row.projectNo, ...(row.hall ? { hall: row.hall } : {}) })
      }
  }
  outside.forEach(add)

  // Stages: in a project's hall and phase, each stage's days against those of the stages before and after it.
  const runs = new Map<string, { row: AllocationRow; stages: Map<Stage, { first: ISODate; last: ISODate }> }>()
  for (const row of ws.allocations) {
    const stage = rowStage(ws.kpi, styleOf.get(competenceKey(row.competence))?.stage, unplanned?.hoursByWork?.(row))
    if (!stage || !ORDERED_STAGES.includes(stage) || !row.phase) continue
    const days = Object.keys(row.fte).filter((date) => row.fte[date] && wanted.has(date)).sort()
    if (!days.length) continue
    const key = stagePlace(row)
    if (!runs.has(key)) runs.set(key, { row, stages: new Map() })
    const { stages } = runs.get(key)!
    const run = stages.get(stage)
    stages.set(stage, { first: run && run.first < days[0] ? run.first : days[0], last: run && run.last > days.at(-1)! ? run.last : days.at(-1)! })
  }
  for (const { row, stages } of runs.values()) {
    const present = stagesOf(row.phase, stageOrderOf(ws.settings)).filter((stage) => stages.has(stage))
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
    const key = `${a.competence}|${numberKey(a.projectNo)}|${hallKey(a.hall)}|${a.date}`
    const at = people.get(key) ?? { a, persons: new Set() }
    at.persons.add(a.personId)
    people.set(key, at)
  }
  for (const { a, persons } of people.values()) {
    const short = styleOf.get(a.competence)!.minPerHall! - persons.size
    if (short > 0) add({ kind: 'minimum', cost: short * weights.belowMinimum, date: a.date, competence: a.competence, projectNo: a.projectNo, ...(a.hall ? { hall: a.hall } : {}) })
  }

  findings.sort((a, b) => b.cost - a.cost || a.date.localeCompare(b.date))
  return scoreOf(findings)
}

/** The part of a score that is one project's: its findings, and their sums. */
export const projectScore = (score: Score, projectNo: string): Score =>
  scoreOf(score.findings.filter((finding) => finding.projectNo !== undefined && numberKey(finding.projectNo) === numberKey(projectNo)))
