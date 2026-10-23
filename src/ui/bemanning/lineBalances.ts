import type { ISODate } from '../../domain/dates'
import { numberKey } from '../../domain/projects'
import { type Balance } from '../../domain/staffing/balance'
import { placeKey, PROJECT_PLACE, type ProjectBalance } from '../../domain/staffing/projectBalance'
import { placeName } from '../../domain/workPlace'
import { EPSILON } from './week'
import { clamp } from '../../domain/numbers'

/** A project's line under the competence in focus: its number and name. */
export interface ProjectLine {
  projectNo: string
  name: string
}

/** A place's line under the project in focus: the place as the rows name it (`PROJECT_PLACE` for the project's halls), and the hours it lacks in the days in view. */
export interface PlaceLine {
  hall: string
  name: string
  remaining: number
}

const NO_DAY = { demand: 0, carried: 0, assigned: 0, assignedOT: 0, remaining: 0, covered: 0 }

/** A place's part of a project's competence as the lines of the demand show a day, as `projectDays` shows the project's. */
export const placeDays = (projects: ProjectBalance, projectNo: string, hall: string): Balance => ({
  get: (competence, date) => {
    const p = projects.of(competence, date, projectNo)
    const at = p.places.get(placeKey(hall))
    if (!at) return NO_DAY
    const assigned = at.tagged + at.shared
    const carried = placeKey(hall) === PROJECT_PLACE ? p.carried : 0
    return { demand: at.demand, carried, assigned, assignedOT: 0, remaining: at.remaining, covered: Math.min(at.demand, assigned) }
  },
  competences: projects.competences,
})

/** A project's part of a competence as the lines of the demand show a day: what is tagged with it and its share of the rest are what it is assigned. */
export const projectDays = (projects: ProjectBalance, projectNo: string): Balance => ({
  get: (competence, date) => {
    const p = projects.of(competence, date, projectNo)
    const assigned = p.tagged + p.shared
    return { demand: p.demand, carried: p.carried, assigned, assignedOT: 0, remaining: p.remaining, covered: Math.min(p.demand, assigned) }
  },
  competences: projects.competences,
})

/** The hours of a competence that remain in the days. A day that is over does not make up for one that is short. */
export const leftIn = (balance: Balance, competence: string, days: ISODate[]): number => days.reduce((sum, date) => sum + Math.max(0, balance.get(competence, date).remaining), 0)

/** Per competence: the hours that remain in the days. */
export const remainingIn = (balance: Balance, days: ISODate[]): Map<string, number> => new Map(balance.competences.map((competence) => [competence, leftIn(balance, competence, days)]))

/**
 * The lines under the project in focus: a place of its rows with hours of the competence, or with blocks painted on it, in the days.
 * Only where there are two or more: a project in one place has no doubt about where its work is. In the order the places start in.
 */
export const placeLinesOf = (projects: ProjectBalance, competence: string, projectNo: string, days: ISODate[]): PlaceLine[] => {
  const lines = new Map<string, PlaceLine & { first: ISODate }>()
  for (const date of days) {
    for (const [key, at] of projects.of(competence, date, projectNo).places) {
      if (at.demand < EPSILON && at.tagged < EPSILON) continue
      const line = lines.get(key) ?? { hall: at.hall, name: placeName(at.hall), remaining: 0, first: date }
      line.remaining += Math.max(0, at.remaining)
      lines.set(key, line)
    }
  }
  if (lines.size < 2) return []
  return [...lines.values()].sort((a, b) => a.first.localeCompare(b.first) || a.name.localeCompare(b.name, 'nb', { numeric: true })).map(({ first: _first, ...line }) => line)
}

/** A line under the competence in focus that the brush can be: the sum line (no project), a project's line, or a place's line under it. */
export interface BrushLine {
  projectNo: string | null
  hall: string | null
}

/**
 * The line `delta` steps above or below the one the brush is on, under the competence in focus: the sum line first, then the projects,
 * with the places of the one in focus under it. It stops at the first and the last.
 */
export const brushStep = (projectLines: ProjectLine[], placeLines: PlaceLine[], at: BrushLine, delta: number): BrushLine => {
  const steps: BrushLine[] = [{ projectNo: null, hall: null }]
  for (const line of projectLines) {
    steps.push({ projectNo: line.projectNo, hall: null })
    if (at.projectNo && numberKey(line.projectNo) === numberKey(at.projectNo)) for (const place of placeLines) steps.push({ projectNo: line.projectNo, hall: place.hall })
  }
  const index = Math.max(0, steps.findIndex((step) => numberKey(step.projectNo ?? '') === numberKey(at.projectNo ?? '') && (step.hall === null ? at.hall === null : at.hall !== null && placeKey(step.hall) === placeKey(at.hall))))
  return steps[clamp(index + delta, 0, steps.length - 1)]
}
