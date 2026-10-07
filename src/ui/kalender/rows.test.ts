import { describe, expect, it } from 'vitest'
import { buildDemandIndex } from '../../domain/calc'
import type { VenueEvent } from '../../domain/projects'
import { DEFAULT_SETTINGS, type AllocationRow } from '../../domain/types'
import { buildItems, cleanGrouping, EMPTY_FILTER, filterGroups, filterSummary, groupItems, inWindow, pathKeys, workPhaseOn, type Dimension, type GridItem } from './rows'

const row = (id: string, overrides: Partial<AllocationRow>): AllocationRow => ({
  id,
  order: 0,
  projectName: 'VVS 2026',
  projectNo: '26970',
  refYear: '2026',
  competence: 'FOGA',
  phase: 'Montering',
  basis: 'Planlagt',
  importedHours: null,
  fte: {},
  notes: {},
  ...overrides,
})

const event = (name: string, projectNo: string, start: string, end: string): VenueEvent => ({
  key: `${name.toLowerCase()}|${start.slice(0, 4)}`,
  name,
  projectNo,
  linkSource: projectNo ? 'list' : 'none',
  ambiguous: false,
  start,
  end,
  halls: ['C'],
})

const rows = [
  row('a', { fte: { '2026-10-05': 2 } }),
  row('b', { projectName: 'vvs 2026', competence: 'Banner', fte: { '2026-10-06': 1 } }),
  row('c', { projectName: 'Hage 2026', projectNo: '26100', fte: { '2026-04-01': 3 } }),
  row('d', { projectName: 'Ny messe', projectNo: '' }),
]
const index = buildDemandIndex([])
const build = (events: VenueEvent[], filter = EMPTY_FILTER, collapsed = new Set<string>(), window?: { from: string; to: string }) =>
  buildItems(rows, events, index, DEFAULT_SETTINGS, filter, collapsed, window)
const groupsOf = (items: GridItem[]) => items.flatMap((i) => (i.kind === 'group' ? [i.node.project!] : []))
const rowIds = (items: GridItem[]) => items.flatMap((i) => (i.kind === 'row' ? [i.row.id] : []))

describe('grid rows without Venyou events', () => {
  it('groups by project number, undated projects first, then by first planned day', () => {
    const groups = groupsOf(build([]))
    expect(groups.map((g) => g.key)).toEqual(['navn:ny messe', '26100', '26970'])
    expect(groups[2].rows).toHaveLength(2)
    expect(groups[2].daily.get('2026-10-05')).toBe(2)
  })

  it('hides rows of collapsed groups', () => {
    expect(rowIds(build([], EMPTY_FILTER, new Set(['project:26970'])))).toEqual(['d', 'c'])
  })

  it('filters by competence and search text', () => {
    expect(rowIds(build([], { ...EMPTY_FILTER, competence: 'banner' }))).toEqual(['b'])
    expect(rowIds(build([], { ...EMPTY_FILTER, search: 'hage' }))).toEqual(['c'])
  })
})

describe('projects from the Venyou calendar', () => {
  const events = [
    event('VVS DAGENE 2026', '26970', '2026-09-28', '2026-10-21'),
    event('OSLO MOTOR SHOW 2026', '', '2026-10-20', '2026-11-02'),
    event('Ny messe', '', '2027-02-01', '2027-02-05'),
  ]

  it('lists every event as a project, with or without rows, in calendar order', () => {
    const groups = groupsOf(build(events))
    expect(groups.map((g) => `${g.projectName}:${g.rows.length}`)).toEqual(['Hage 2026:1', 'VVS DAGENE 2026:2', 'OSLO MOTOR SHOW 2026:0', 'Ny messe:1'])
    expect(groups[1]).toMatchObject({ key: '26970', projectNo: '26970', venue: { start: '2026-09-28', end: '2026-10-21' } })
    expect(groups[2].key).toBe('navn:oslo motor show 2026')
  })

  it('shows projects that take place in the visible dates even when nothing is planned', () => {
    const groups = groupsOf(build(events, EMPTY_FILTER, new Set(), { from: '2026-10-25', to: '2026-11-10' }))
    expect(groups.map((g) => g.projectName)).toEqual(['OSLO MOTOR SHOW 2026'])
  })

  it('can leave out projects without rows', () => {
    const groups = groupsOf(build(events, { ...EMPTY_FILTER, onlyWithRows: true }))
    expect(groups.map((g) => g.projectName)).not.toContain('OSLO MOTOR SHOW 2026')
  })

  it('finds a project by name even when it has no rows', () => {
    expect(groupsOf(build(events, { ...EMPTY_FILTER, search: 'motor' })).map((g) => g.projectName)).toEqual(['OSLO MOTOR SHOW 2026'])
    expect(groupsOf(build(events, { ...EMPTY_FILTER, competence: 'FOGA' })).map((g) => g.projectName)).toEqual(['Hage 2026', 'VVS DAGENE 2026', 'Ny messe'])
  })
})

describe('rows as a hierarchy', () => {
  const demand = buildDemandIndex(
    [
      ['Hall C', '64', 15],
      ['Hall C', '65', 30],
      ['Hall D', '64', 45],
    ].map(([hall, avdeling, hours], i) => ({
      id: `d${i}`,
      projectNo: '26970',
      projectName: 'VVS 2026',
      eventYear: '2026',
      source: '',
      workType: 'FOGA-vegger',
      quantity: null,
      unit: '',
      stand: '',
      hall: hall as string,
      competence: 'FOGA',
      basis: 'Planlagt',
      assemblyHours: hours as number,
      dismantleHours: 0,
      comment: '',
      avdeling: avdeling as string,
    })),
  )
  const fine = [
    row('c64', { hall: 'Hall C', avdeling: '64', fte: { '2026-10-05': 1 } }),
    row('c65', { hall: 'Hall C', avdeling: '65', fte: { '2026-10-05': 2 } }),
    row('d64', { hall: 'Hall D', avdeling: '64', fte: { '2026-10-06': 3 } }),
    row('dem', { hall: 'Hall D', avdeling: '64', phase: 'Demontering' }),
    row('hage', { projectName: 'Hage 2026', projectNo: '26100', competence: 'Banner', fte: { '2026-04-01': 1 } }),
  ]
  const tree = (grouping: Dimension[], collapsed = new Set<string>()) => buildItems(fine, [], demand, DEFAULT_SETTINGS, EMPTY_FILTER, collapsed, undefined, grouping)
  const outline = (items: GridItem[]) => items.map((i) => (i.kind === 'group' ? `${'  '.repeat(i.node.depth)}${i.node.label}` : `${'  '.repeat(i.depth)}#${i.row.id}${i.lead ? ` ${i.lead}` : ''}`))

  it('nests the levels in the chosen order', () => {
    expect(outline(tree(['project', 'phase', 'hall']))).toEqual([
      'Hage 2026',
      '  Montering',
      '    #hage Alle haller',
      'VVS 2026',
      '  Montering',
      '    Hall C',
      '      #c64',
      '      #c65',
      '    #d64 Hall D',
      '  Demontering',
      '    #dem Hall D',
    ])
  })

  it('lets a row that is alone on the lowest level stand in for that level', () => {
    expect(outline(tree(['hall', 'avdeling']))).toEqual(['Hall C', '  #c64 Avd. 64', '  #c65 Avd. 65', 'Hall D', '  Avd. 64', '    #d64', '    #dem', 'Alle haller', '  #hage Alle avd.'])
    // A project keeps its own line: that is where rows are added to it.
    expect(outline(tree(['project']))).toEqual(['Hage 2026', '  #hage', 'VVS 2026', '  #c64', '  #c65', '  #d64', '  #dem'])
  })

  it('lists the rows flat when nothing is grouped', () => {
    expect(outline(tree([]))).toEqual(['#hage', '#c64', '#c65', '#d64', '#dem'])
  })

  it('sums required days, planned days and FTE per day on every level', () => {
    const nodes = tree(['competence', 'hall']).flatMap((i) => (i.kind === 'group' ? [i.node] : []))
    const foga = nodes.find((n) => n.label === 'FOGA')!
    expect(foga.totals).toEqual({ requiredFte: 12, plannedFte: 6 })
    expect(foga.daily.get('2026-10-05')).toBe(3)
    const hallC = nodes.find((n) => n.label === 'Hall C')!
    expect(hallC.totals).toEqual({ requiredFte: 6, plannedFte: 3 })
    expect(hallC.key).toBe('competence:foga/hall:hall c')
  })

  it('collapses one branch without touching the same value elsewhere', () => {
    const items = tree(['phase', 'hall'], new Set(['phase:montering/hall:hall c']))
    expect(outline(items)).toEqual(['Montering', '  Hall C', '  #d64 Hall D', '  #hage Alle haller', 'Demontering', '  #dem Hall D'])
  })

  it('folds a level that takes FTE itself, and leaves a level without rows alone', () => {
    const items = buildItems(fine, [], demand, DEFAULT_SETTINGS, EMPTY_FILTER, new Set(), undefined, ['phase', 'hall'], new Set(['phase:montering/hall:hall c', 'phase:demontering']))
    expect(outline(items)).toEqual(['Montering', '  Hall C', '  #d64 Hall D', '  #hage Alle haller', 'Demontering'])
    expect(items.flatMap((i) => (i.kind === 'group' && i.entry ? [i.node.label] : []))).toEqual(['Hall C', 'Demontering'])
  })

  it('can leave out rows whose plan covers their demand', () => {
    // c64 needs 2 days and has 1; c65 needs 4 and has 2; d64 needs 6 and has 3; dem and hage have no demand.
    const covered = [...fine.slice(0, 2), row('d64', { hall: 'Hall D', avdeling: '64', fte: { '2026-10-06': 3, '2026-10-07': 3 } }), ...fine.slice(3)]
    const items = buildItems(covered, [], demand, DEFAULT_SETTINGS, { ...EMPTY_FILTER, onlyUncovered: true }, new Set(), undefined, ['project'])
    expect(outline(items)).toEqual(['VVS 2026', '  #c64', '  #c65'])
  })

  it('can show only the rows that have no demand behind them', () => {
    // dem and hage have no demand; the others do.
    const items = buildItems(fine, [], demand, DEFAULT_SETTINGS, { ...EMPTY_FILTER, onlyWithoutDemand: true }, new Set(), undefined, ['project'])
    expect(items.flatMap((item) => (item.kind === 'row' ? [item.row.id] : [])).sort()).toEqual(['dem', 'hage'])
    expect(filterSummary({ ...EMPTY_FILTER, onlyWithoutDemand: true }, [])).toMatchObject({ others: 1, active: 1 })
  })

  it('gives the levels above a row, for opening the way to it', () => {
    expect(pathKeys(fine[2], '26970', ['project', 'hall'])).toEqual(['project:26970', 'project:26970/hall:hall d'])
  })

  it('keeps only known properties from a stored grouping', () => {
    expect(cleanGrouping(['hall', 'nope', 'hall', 'project'])).toEqual(['hall', 'project'])
    expect(cleanGrouping('x')).toEqual(['project', 'phase', 'competence'])
  })
})

describe('filterGroups, inWindow and groupItems', () => {
  const events = [event('VVS 2026', '26970', '2026-10-01', '2026-10-10'), event('Hage 2026', '26100', '2026-03-28', '2026-04-05')]
  const grouping: Dimension[] = ['project', 'phase']

  it('give the same lines in steps as buildItems does in one go', () => {
    const window = { from: '2026-10-01', to: '2026-10-31' }
    const groups = filterGroups(rows, events, index, DEFAULT_SETTINGS, EMPTY_FILTER, grouping)
    const inSteps = groupItems(groups.filter((group) => inWindow(group, window)), index, DEFAULT_SETTINGS, new Set(), grouping)
    expect(inSteps).toEqual(buildItems(rows, events, index, DEFAULT_SETTINGS, EMPTY_FILTER, new Set(), window, grouping))
  })

  it('mark every level from a project down with it, where the project is in the hall calendar', () => {
    const groups = filterGroups(rows, events, index, DEFAULT_SETTINGS, EMPTY_FILTER, grouping)
    const marks = (g: Dimension[]) => groupItems(groups, index, DEFAULT_SETTINGS, new Set(), g).flatMap((i) => (i.kind === 'group' ? [`${i.node.dimension} ${i.node.projectKey ?? '-'}`] : []))
    const below = marks(grouping)
    expect(below).toContain('project 26970')
    expect(below).toContain('phase 26970')
    // A project without an event has no bars to light, and a level above the projects holds several.
    expect(below.filter((m) => m.startsWith('project')).some((m) => m.endsWith(' -'))).toBe(true)
    expect(marks(['phase', 'project']).filter((m) => m.startsWith('phase'))).toEqual(expect.arrayContaining(['phase -']))
    expect(marks(['phase', 'project']).filter((m) => m.startsWith('phase')).every((m) => m === 'phase -')).toBe(true)
  })

  it('keep a project in view by its event or by a planned day', () => {
    const groups = filterGroups(rows, events, index, DEFAULT_SETTINGS, EMPTY_FILTER, grouping)
    const inView = (from: string, to: string) => groups.filter((group) => inWindow(group, { from, to })).map((group) => group.projectName)
    expect(inView('2026-04-01', '2026-04-01')).toContain('Hage 2026')
    expect(inView('2026-04-01', '2026-04-01')).not.toContain('VVS 2026')
    // A project with rows but no dates at all is always listed, or it would never be seen.
    expect(inView('2027-01-01', '2027-01-31')).toEqual(['Ny messe'])
  })
})

describe('work phase of a day', () => {
  const rows = [
    row('a', { fte: { '2026-10-05': 2, '2026-10-06': 1, '2026-10-07': 1 } }),
    row('b', { phase: 'Demontering', fte: { '2026-10-06': 3, '2026-10-07': 1 } }),
  ]

  it('is the phase with most FTE that day', () => {
    expect(workPhaseOn(rows, '2026-10-05')).toBe('Montering')
    expect(workPhaseOn(rows, '2026-10-06')).toBe('Demontering')
  })

  it('is montering on a tie and nothing on an empty day', () => {
    expect(workPhaseOn(rows, '2026-10-07')).toBe('Montering')
    expect(workPhaseOn(rows, '2026-10-08')).toBeNull()
  })
})

describe('filterSummary', () => {
  const projects: [string, string][] = [['26970', 'VVS 2026'], ['27100', 'Hage 2026']]

  it('names the project shown and counts what else narrows the list', () => {
    expect(filterSummary(EMPTY_FILTER, projects)).toEqual({ label: 'Alle prosjekter', others: 0, active: 0 })
    expect(filterSummary({ ...EMPTY_FILTER, project: '27100' }, projects)).toEqual({ label: 'Hage 2026', others: 0, active: 1 })
    expect(filterSummary({ project: '26970', competence: 'FOGA', search: 'hall', onlyUncovered: true }, projects)).toEqual({ label: 'VVS 2026', others: 3, active: 4 })
  })

  it('falls back to all projects when the chosen project is gone', () => {
    expect(filterSummary({ ...EMPTY_FILTER, project: 'x' }, projects).label).toBe('Alle prosjekter')
  })
})
