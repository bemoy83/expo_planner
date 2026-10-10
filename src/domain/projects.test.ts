import { describe, expect, it } from 'vitest'
import { diffProjectList, eventKey, nameLikeness, nameWithin, withNumberTakingOver, mergeProjectList, projectFollowers, projectRows, suggestProjectNo, venueEvents, withEventLinksAsProjects, withProjectName, withProjectNo, withProjectYear, withoutProjectName } from './projects'
import type { AllocationRow, DemandLine, ProjectRef, VenueBooking } from './types'

const booking = (eventName: string, hall: string, phases: VenueBooking['phases']): VenueBooking => ({ id: `${eventName}-${hall}`, hall, eventName, status: 'confirmed', phases })

const bookings = [
  booking('VVS DAGENE 2026', 'C', { assembly: { start: '2026-09-28', end: '2026-10-07' }, event: { start: '2026-10-14', end: '2026-10-16' }, dismantle: { start: '2026-10-20', end: '2026-10-21' } }),
  booking('VVS DAGENE 2026', 'D1', { event: { start: '2026-10-14', end: '2026-10-16' } }),
  booking('Oslo  Motor Show', 'E', { event: { start: '2026-10-23', end: '2026-10-25' } }),
  booking('HAGE 2026', 'B1', { event: { start: '2026-04-10', end: '2026-04-12' } }),
]
const list: ProjectRef[] = [
  { name: 'VVS DAGENE 2026', projectNo: '26970' },
  { name: 'VVS 2026', projectNo: '26970' },
  { name: 'oslo motor show', projectNo: '25400' },
  { name: 'Oslo Motor Show', projectNo: '26400' },
  { name: 'Hage 2026', projectNo: '26100' },
  { name: 'HAGE 2026', projectNo: '26101' },
]
const row = (projectName: string, projectNo: string): AllocationRow => ({ id: `${projectName}-${projectNo}`, order: 0, projectName, projectNo, refYear: '', competence: 'FOGA', phase: 'Montering', basis: '', fte: {}, notes: {} }) as AllocationRow
const line = (projectNo: string, origin: DemandLine['origin']): DemandLine => ({ id: `${projectNo}-${origin}`, projectNo, projectName: 'Hage', eventYear: '2026', origin }) as DemandLine

describe('projects from Venyou events', () => {
  it('makes one project per event with its period and halls', () => {
    const events = venueEvents(bookings, [])
    expect(events.map((e) => e.name)).toEqual(['HAGE 2026', 'VVS DAGENE 2026', 'Oslo  Motor Show'])
    expect(events[1]).toMatchObject({ start: '2026-09-28', end: '2026-10-21', halls: ['C', 'D1'], projectNo: '', year: '2026' })
  })

  it('gives an event the project that carries its name in its year', () => {
    const events = venueEvents(bookings, list)
    expect(events.find((e) => e.name === 'VVS DAGENE 2026')).toMatchObject({ projectNo: '26970', ambiguous: false })
    // The name comes back every year; the number of another year is not taken.
    expect(events.find((e) => e.name.startsWith('Oslo'))).toMatchObject({ projectNo: '26400', candidates: ['26400'] })
    expect(venueEvents(bookings, list.filter((ref) => ref.projectNo !== '26400')).find((e) => e.name.startsWith('Oslo'))).toMatchObject({ projectNo: '' })
    expect(events.find((e) => e.name === 'HAGE 2026')).toMatchObject({ projectNo: '', ambiguous: true, candidates: ['26100', '26101'] })
  })

  it('matches a name in the year set on it, and in any year where the number says none', () => {
    const named = (projectNo: string, year?: string) => venueEvents(bookings, [{ name: 'Oslo Motor Show', projectNo, ...(year ? { year } : {}) }]).find((e) => e.name.startsWith('Oslo'))!.projectNo
    expect(named('25400')).toBe('')
    expect(named('25400', '2026')).toBe('25400')
    expect(named('OMS')).toBe('OMS')
  })
})

describe('the project table', () => {
  it('lets a name and a year point at one project', () => {
    const next = withProjectName(list, '26100', 'HAGE 2026', '2026')
    expect(next.filter((ref) => ref.name.toLowerCase() === 'hage 2026')).toEqual([{ name: 'HAGE 2026', projectNo: '26100' }])
    expect(venueEvents(bookings, next).find((e) => e.name === 'HAGE 2026')).toMatchObject({ projectNo: '26100', ambiguous: false })
  })

  it('keeps the year only where the number does not say it', () => {
    expect(withProjectName([], '26VAM', ' VA  messen ', '2026')).toEqual([{ name: 'VA messen', projectNo: '26VAM' }])
    expect(withProjectName([], '26VAM', 'VA messen', '2027')).toEqual([{ name: 'VA messen', projectNo: '26VAM', year: '2027' }])
    expect(withProjectYear(list, '26970', '2027').filter((ref) => ref.projectNo === '26970').map((ref) => ref.year)).toEqual(['2027', '2027'])
    expect(withProjectYear(withProjectYear(list, '26970', '2027'), '26970', '2026')).toEqual(list)
  })

  it('removes a name, and moves a project to another number or into another project', () => {
    expect(withoutProjectName(list, '26970', 'vvs 2026')).toHaveLength(5)
    expect(withProjectNo(list, '26970', '26VVS').filter((ref) => ref.projectNo === '26VVS').map((ref) => ref.name)).toEqual(['VVS DAGENE 2026', 'VVS 2026'])
    // The two numbers under one name become one project with the name once.
    expect(withProjectNo(list, '26101', '26100').filter((ref) => ref.projectNo === '26100')).toHaveLength(1)
  })

  it('offers a number of the year and three letters, and another where it is taken', () => {
    expect(suggestProjectNo('VA MESSEN 2026', '2026', [])).toBe('26VAM')
    expect(suggestProjectNo('HR Norge HR Forum 2027', '2027', [])).toBe('27HRN')
    expect(suggestProjectNo('HR Norge HR Forum 2027', '2027', ['27hrn'])).toBe('27HNH')
    expect(suggestProjectNo('Hage', '2026', ['26HAG'])).toBe('26HAE')
    expect(suggestProjectNo('Påske på Østlandet', '2026', [])).toBe('26PAS')
    expect(suggestProjectNo('X', '2026', [])).toBe('26XX1')
  })

  it('merges a file into the table: the file wins for a name and a year, the rest is kept', () => {
    const file = [{ name: 'hage 2026', projectNo: '26HAG' }, { name: 'Ny messe', projectNo: '27ELE' }, { name: '', projectNo: '1' }]
    const merged = mergeProjectList(list, file)
    expect(merged.slice(0, 2)).toEqual([{ name: 'hage 2026', projectNo: '26HAG' }, { name: 'Ny messe', projectNo: '27ELE' }])
    expect(merged).toHaveLength(6)
    expect(diffProjectList(list, file)).toEqual({ added: 1, changed: 1, unchanged: 0, onlyInApp: 4 })
  })

  it('takes numbers typed on the events into the table', () => {
    const ws = withEventLinksAsProjects({ venue: bookings, projects: list, eventLinks: { [eventKey('HAGE 2026', '2026-04-10')]: '26100', [eventKey('Oslo  Motor Show', '2026-10-23')]: '25400' } })
    expect(ws.eventLinks).toBeUndefined()
    const events = venueEvents(bookings, ws.projects)
    expect(events.find((e) => e.name === 'HAGE 2026')!.projectNo).toBe('26100')
    // Typed on the event of 2026, the number of 2025 holds for that year.
    expect(events.find((e) => e.name.startsWith('Oslo'))!.projectNo).toBe('25400')
    expect(ws.projects.find((ref) => ref.projectNo === '25400' && ref.year === '2026')!.name).toBe('Oslo Motor Show')
  })
})

describe('what follows a project', () => {
  const ws = { venue: bookings, projects: [], allocations: [row('HAGE 2026', ''), row('VVS DAGENE 2026', '26970'), row('Annet', '')], demand: [line('26HAG', 'manual'), line('26HAG', 'visma')] }

  it('moves the rows planned for an event to the number it gets', () => {
    const { allocations, demand } = projectFollowers(ws, withProjectName([], '26HAG', 'HAGE 2026', '2026'))
    expect(allocations.map((r) => [r.projectName, r.projectNo])).toEqual([['HAGE 2026', '26HAG']])
    expect(demand).toEqual([])
  })

  it('moves the rows and the own demand lines of a project that gets another number', () => {
    const before = withProjectName([], '26HAG', 'HAGE 2026', '2026')
    const planned = { ...ws, projects: before, allocations: [row('HAGE 2026', '26HAG')] }
    const { allocations, demand } = projectFollowers(planned, withProjectNo(before, '26HAG', '26100'), { from: '26HAG', to: '26100' })
    expect(allocations.map((r) => r.projectNo)).toEqual(['26100'])
    expect(demand.map((l) => [l.id, l.projectNo])).toEqual([['26HAG-manual', '26100']])
  })
})

describe('the rows of the Prosjekter tab', () => {
  it('lists events without a project first, then numbers in use that are not in the table, then the projects', () => {
    const rows = projectRows({ venue: bookings, projects: list.slice(0, 4), visma: [], demand: [line('26HAG', 'manual')], allocations: [row('VVS DAGENE 2026', '26970')] })
    expect(rows.map((r) => [r.projectNo, r.lacking, r.suggestion])).toEqual([
      ['', 'number', '26HAE'],
      ['26HAG', 'new', ''],
      ['26400', null, ''],
      ['26970', null, ''],
      ['25400', null, ''],
    ])
    expect(rows[3]).toMatchObject({ names: ['VVS DAGENE 2026', 'VVS 2026'], rows: 1, events: [{ name: 'VVS DAGENE 2026' }] })
    expect(rows[1]).toMatchObject({ names: ['Hage'], lines: 1 })
  })
})

describe('what an event without a project is offered', () => {
  const days = { event: { start: '2026-10-14', end: '2026-10-16' } }
  const venue = [booking('VVS DAGENE 2026', 'C', days), booking('VVS Dagene 2026 - Grupperom', 'M1', days), booking('VVS dagene', 'D', { event: { start: '2026-03-02', end: '2026-03-03' } }), booking('HAGEMESSEN 2026', 'B', { event: { start: '2026-04-10', end: '2026-04-12' } })]
  const rows = (projects: ProjectRef[], more: Partial<Parameters<typeof projectRows>[0]> = {}) => projectRows({ venue, projects, visma: [], demand: [], allocations: [], ...more })
  const offered = (projects: ProjectRef[]) => Object.fromEntries(rows(projects).filter((r) => !r.projectNo).map((r) => [r.names[0], r.match?.projectNo]))

  it('tells names that are alike from names that share a word', () => {
    expect(nameLikeness('VA messen', 'VA MESSEN 2026')).toBe(1)
    expect(nameLikeness('Hage messen 2026', 'HAGEMESSEN')).toBe(1)
    expect(nameLikeness('Datacenterforum', 'Datacenter Forum Nordic')).toBeGreaterThan(0.75)
    expect(nameLikeness('HR Norge HR Tech 2027', 'HR Norge HR Forum 2027')).toBeLessThan(0.75)
    expect(nameWithin('Oslo Motor Show 2026', 'OSLO MOTOR SHOW 2026 - VIP Green Room')).toBe(1)
    expect(nameWithin('VA', 'VA messen')).toBe(0)
  })

  it('offers the project of its year with a name like its own', () => {
    expect(offered([{ name: 'Hagemessen', projectNo: '26100' }, { name: 'Hagemessen', projectNo: '25100' }])['HAGEMESSEN 2026']).toBe('26100')
    expect(offered([{ name: 'Hagemessen', projectNo: '25100' }])['HAGEMESSEN 2026']).toBeUndefined()
  })

  it('offers the project a longer name holds only where it has an event on the same days', () => {
    const offers = offered([{ name: 'VVS DAGENE 2026', projectNo: '26970' }])
    expect(offers['VVS Dagene 2026 - Grupperom']).toBe('26970')
    // Alike in name, but the project's event is on other days.
    expect(offers['VVS dagene']).toBeUndefined()
  })

  it('offers the number of its year after the project it was another year, where that number is free', () => {
    const series = (projects: ProjectRef[]) => rows(projects).find((r) => r.names[0] === 'HAGEMESSEN 2026')!.series
    expect(series([{ name: 'Hagemessen 2024', projectNo: '24100' }, { name: 'Hagemessen 2025', projectNo: '25101' }])).toEqual({ projectNo: '26101', name: 'Hagemessen 2025', after: '25101' })
    // The number is another project's this year, so the one of the year before that is tried.
    expect(series([{ name: 'Hagemessen 2024', projectNo: '24100' }, { name: 'Hagemessen 2025', projectNo: '25101' }, { name: 'Oslo Motor Show', projectNo: '26101' }])).toMatchObject({ projectNo: '26100' })
    expect(series([{ name: 'Hagemessen 2025', projectNo: '25101' }, { name: 'Hagemessen', projectNo: '26555' }])).toBeUndefined()
  })

  it('lets a number from orders take over a made-up one, with what points at it', () => {
    const projects = [{ name: 'HAGEMESSEN 2026', projectNo: '26HAG' }]
    const fromOrders = rows(projects, { visma: [{ projectNo: '26100', eventName: 'Hagemessen', fileName: '', importedAt: '', rows: [] }] }).find((r) => r.projectNo === '26100')!
    expect(fromOrders).toMatchObject({ lacking: 'new', replaces: { projectNo: '26HAG', name: 'HAGEMESSEN 2026' } })
    expect(withNumberTakingOver(projects, '26100', 'Hagemessen', fromOrders.replaces!)).toEqual({
      projects: [{ name: 'HAGEMESSEN 2026', projectNo: '26100' }, { name: 'Hagemessen', projectNo: '26100' }],
      renumbered: { from: '26HAG', to: '26100' },
    })
  })

  it('moves the name alone from a project that has other names or a number of its own', () => {
    const projects = [{ name: 'VVS DAGENE 2026', projectNo: '26970' }, { name: 'VVS Dagene 2026 - Grupperom', projectNo: '26970' }]
    const taken = withNumberTakingOver(projects, '26971', 'VVS Grupperom', { projectNo: '26970', name: 'VVS Dagene 2026 - Grupperom' })
    expect(taken.renumbered).toBeUndefined()
    expect(taken.projects.map((ref) => [ref.name, ref.projectNo])).toEqual([['VVS DAGENE 2026', '26970'], ['VVS Dagene 2026 - Grupperom', '26971'], ['VVS Grupperom', '26971']])
  })
})
