import { describe, expect, it } from 'vitest'
import type { ISODate } from '../../domain/dates'
import type { Balance } from '../../domain/staffing/balance'
import type { PlaceDay, ProjectBalance, ProjectDay } from '../../domain/staffing/projectBalance'
import { brushStep, hasHours, leftIn, placeDays, placeLinesOf, projectDays, remainingIn, restDays, type PlaceLine, type ProjectLine } from './lineBalances'

const place = (hall: string, demand: number, tagged = 0, shared = 0): PlaceDay => ({ hall, demand, tagged, shared, remaining: demand - tagged - shared })
const day = (places: PlaceDay[], carried = 0): ProjectDay => {
  const demand = places.reduce((sum, p) => sum + p.demand, 0)
  const tagged = places.reduce((sum, p) => sum + p.tagged, 0)
  const shared = places.reduce((sum, p) => sum + p.shared, 0)
  return { projectNo: '26970', demand, carried, tagged, shared, remaining: demand - tagged - shared, places: new Map(places.map((p) => [p.hall.toLowerCase(), p])), unplaced: 0 }
}
/** VVS 2026 with FOGA in B1 and B2 on two days, and in B1 alone on the third. */
const days: Record<ISODate, ProjectDay> = {
  '2026-10-05': day([place('B2', 7.5, 0, 7.5), place('B1', 15, 7.5)], 2),
  '2026-10-06': day([place('B1', 7.5, 0, 0), place('B2', 7.5, 7.5)]),
  '2026-10-07': day([place('B1', 7.5)]),
}
const empty: ProjectDay = { projectNo: '', demand: 0, carried: 0, tagged: 0, shared: 0, remaining: 0, places: new Map(), unplaced: 0 }
const projects: ProjectBalance = {
  get: () => ({ projects: new Map(), untagged: 0, unshared: 0 }),
  of: (competence, date, projectNo) => (competence === 'foga' && projectNo === '26970' ? (days[date] ?? empty) : empty),
  competences: ['foga'],
}

describe('the project and place lines of the demand', () => {
  it('shows a project day as a line of the demand: tagged and shared hours are what it is assigned', () => {
    expect(projectDays(projects, '26970').get('foga', '2026-10-05')).toEqual({ demand: 22.5, carried: 2, assigned: 15, assignedOT: 0, remaining: 7.5, covered: 15 })
    expect(projectDays(projects, '26970').competences).toEqual(['foga'])
  })

  it("shows a place's part of the project, with nothing on a day it has none", () => {
    expect(placeDays(projects, '26970', 'B1').get('foga', '2026-10-05')).toEqual({ demand: 15, carried: 0, assigned: 7.5, assignedOT: 0, remaining: 7.5, covered: 7.5 })
    expect(placeDays(projects, '26970', 'B2').get('foga', '2026-10-07')).toEqual({ demand: 0, carried: 0, assigned: 0, assignedOT: 0, remaining: 0, covered: 0 })
  })

  it('shows what is on none of the project lines: the sum less the lines', () => {
    const total: Balance = { get: () => ({ demand: 30, carried: 2, assigned: 20, assignedOT: 4, remaining: 10, covered: 20 }), competences: ['foga'] }
    const rest = restDays(total, [projectDays(projects, '26970')])
    // VVS has 22,5 of the demand and 15 assigned on the 5th: 7,5 and 5 are on no project.
    expect(rest.get('foga', '2026-10-05')).toEqual({ demand: 7.5, carried: 0, assigned: 5, assignedOT: 4, remaining: 2.5, covered: 5 })
    // On a day VVS has nothing, the rest is the sum.
    expect(rest.get('foga', '2026-10-09')).toEqual({ demand: 30, carried: 2, assigned: 20, assignedOT: 4, remaining: 10, covered: 20 })
    expect(hasHours(rest, 'foga', ['2026-10-05'])).toBe(true)
    // Where the lines hold all of the sum, there is no rest.
    const same = restDays(projectDays(projects, '26970'), [projectDays(projects, '26970')])
    expect(hasHours(same, 'foga', ['2026-10-05', '2026-10-06', '2026-10-07'])).toBe(false)
  })

  it('counts the hours that remain, a day over making up for none that is short', () => {
    const balance: Balance = { get: (_, date) => ({ demand: 0, carried: 0, assigned: 0, assignedOT: 0, covered: 0, remaining: date === '2026-10-05' ? 4 : -3 }), competences: ['foga', 'elektro'] }
    expect(leftIn(balance, 'foga', ['2026-10-05', '2026-10-06'])).toBe(4)
    expect(remainingIn(balance, ['2026-10-05'])).toEqual(new Map([['foga', 4], ['elektro', 4]]))
  })

  it('lists the places of the project in focus in the order they start, where it has two or more', () => {
    expect(placeLinesOf(projects, 'foga', '26970', ['2026-10-05', '2026-10-06', '2026-10-07'])).toEqual([
      { hall: 'B1', name: 'B1', remaining: 22.5 },
      { hall: 'B2', name: 'B2', remaining: 0 },
    ])
    expect(placeLinesOf(projects, 'foga', '26970', ['2026-10-07'])).toEqual([])
    expect(placeLinesOf(projects, 'elektro', '26970', ['2026-10-05'])).toEqual([])
  })
})

describe('brushStep', () => {
  const lines: ProjectLine[] = [{ projectNo: '26970', name: 'VVS 2026' }, { projectNo: '26100', name: 'Hage 2026' }]
  const places: PlaceLine[] = [{ hall: 'B1', name: 'B1', remaining: 0 }, { hall: 'B2', name: 'B2', remaining: 0 }]

  it('goes from the sum line down the projects, and stops at the ends', () => {
    expect(brushStep(lines, [], { projectNo: null, hall: null }, 1)).toEqual({ projectNo: '26970', hall: null })
    expect(brushStep(lines, [], { projectNo: '26970', hall: null }, 1)).toEqual({ projectNo: '26100', hall: null })
    expect(brushStep(lines, [], { projectNo: '26100', hall: null }, 1)).toEqual({ projectNo: '26100', hall: null })
    expect(brushStep(lines, [], { projectNo: null, hall: null }, -1)).toEqual({ projectNo: null, hall: null })
  })

  it('steps through the places of the project in focus, and on to the next project', () => {
    expect(brushStep(lines, places, { projectNo: '26970', hall: null }, 1)).toEqual({ projectNo: '26970', hall: 'B1' })
    expect(brushStep(lines, places, { projectNo: '26970', hall: 'b1' }, 1)).toEqual({ projectNo: '26970', hall: 'B2' })
    expect(brushStep(lines, places, { projectNo: '26970', hall: 'B2' }, 1)).toEqual({ projectNo: '26100', hall: null })
    expect(brushStep(lines, places, { projectNo: '26970', hall: 'B1' }, -1)).toEqual({ projectNo: '26970', hall: null })
  })

  it('starts from the sum line when the line it is on is gone', () => {
    expect(brushStep(lines, [], { projectNo: '27000', hall: null }, 1)).toEqual({ projectNo: '26970', hall: null })
  })
})
