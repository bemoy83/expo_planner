import { describe, expect, it } from 'vitest'
import { ALL_HALLS, areaShown, areaTree, cleanHallFilter, NO_AREA, ofShownStatus, projectsOutside, shownHalls, statusShown, venueStatuses, withAllHalls, withAreaRenamed, withAreaShown, withHallShown, withStatusShown } from './areas'

const halls = ['A1', 'B1', 'B2', 'BACK', 'FRONT', 'STUDIO2', 'STUDIO3']
const areas = [
  { name: 'NV HALLS', halls: ['b2', 'A1', 'B1', 'Z9'] },
  { name: 'NOVA STUDIOS', halls: ['STUDIO3', 'STUDIO2', 'B1'] },
  { name: 'Tomt', halls: ['Z9'] },
]
const tree = areaTree(halls, { areas })
const [nv, studios, rest] = tree

describe('the areas of the halls', () => {
  it('lists the areas in the planner\'s order with their halls of the ledger, and the halls of no area last', () => {
    expect(tree).toEqual([
      { name: 'NV HALLS', halls: ['A1', 'B1', 'B2'] },
      { name: 'NOVA STUDIOS', halls: ['STUDIO2', 'STUDIO3'] },
      { name: NO_AREA, halls: ['BACK', 'FRONT'] },
    ])
  })

  it('is the halls of no area alone until an area is made', () => {
    expect(areaTree(['B', 'A'])).toEqual([{ name: NO_AREA, halls: ['A', 'B'] }])
    expect(areaTree([], { areas })).toEqual([])
  })

  it('shows every hall until something is unticked', () => {
    expect(shownHalls(tree, ALL_HALLS)).toEqual(['A1', 'B1', 'B2', 'STUDIO2', 'STUDIO3', 'BACK', 'FRONT'])
  })

  it('unticks a whole area, and ticks it again with all its halls', () => {
    const off = withAreaShown(withHallShown(tree, ALL_HALLS, 'B1', false), nv, false)
    expect(off).toEqual({ ...ALL_HALLS, areas: ['NV HALLS'] })
    expect(shownHalls(tree, off)).toEqual(['STUDIO2', 'STUDIO3', 'BACK', 'FRONT'])
    expect(areaShown(nv, off)).toBe('none')
    expect(withAreaShown(off, nv, true)).toEqual(ALL_HALLS)
  })

  it('unticks single halls, and the area as a whole with the last of them', () => {
    const one = withHallShown(tree, ALL_HALLS, 'STUDIO2', false)
    expect(one).toEqual({ ...ALL_HALLS, halls: ['STUDIO2'] })
    expect(areaShown(studios, one)).toBe('some')
    expect(areaShown(nv, one)).toBe('all')
    expect(withHallShown(tree, one, 'STUDIO3', false)).toEqual({ ...ALL_HALLS, areas: ['NOVA STUDIOS'] })
  })

  it('ticks one hall of an area that was unticked, and leaves the others out', () => {
    const only = withHallShown(tree, withAreaShown(ALL_HALLS, rest, false), 'FRONT', true)
    expect(only).toEqual({ ...ALL_HALLS, halls: ['BACK'] })
    expect(shownHalls(tree, only)).toEqual(['A1', 'B1', 'B2', 'STUDIO2', 'STUDIO3', 'FRONT'])
  })

  it('shows a hall that is new in a shown area, and not one that is new in an unticked area', () => {
    const filter = withAreaShown(withHallShown(tree, ALL_HALLS, 'B1', false), studios, false)
    const grown = areaTree([...halls, 'C', 'STUDIO4'], { areas: [{ name: 'NV HALLS', halls: ['A1', 'B1', 'B2', 'C'] }, { name: 'NOVA STUDIOS', halls: ['STUDIO2', 'STUDIO3', 'STUDIO4'] }] })
    expect(shownHalls(grown, filter)).toEqual(['A1', 'B2', 'C', 'BACK', 'FRONT'])
  })

  it('keeps what is valid of a stored filter', () => {
    expect(cleanHallFilter(null)).toEqual(ALL_HALLS)
    expect(cleanHallFilter({ areas: ['X', 3], halls: 'A' })).toEqual({ areas: ['X'], halls: [], statuses: [] })
  })

  it('leaves out the projects with bookings in no shown hall, and those whose bookings all have a status that is left out', () => {
    const hallsOf = new Map<string, string[]>([['26100', ['A1', 'STUDIO2']], ['26200', ['STUDIO2', 'STUDIO3']], ['26300', []]])
    expect([...projectsOutside(hallsOf, shownHalls(tree, withAreaShown(ALL_HALLS, studios, false)))]).toEqual(['26200', '26300'])
    expect([...projectsOutside(hallsOf, shownHalls(tree, ALL_HALLS))]).toEqual(['26300'])
  })

  it('lists the statuses of the bookings, and leaves out the bookings of an unticked status', () => {
    const bookings = [{ status: 'Bekreftet' }, { status: '' }, { status: 'Opsjon' }, { status: 'bekreftet ' }]
    expect(venueStatuses(bookings)).toEqual(['Bekreftet', 'Opsjon', ''])
    expect(ofShownStatus(bookings, ALL_HALLS)).toBe(bookings)
    const off = withStatusShown(withStatusShown(ALL_HALLS, 'OPSJON', false), '', false)
    expect(statusShown(off, 'Opsjon')).toBe(false)
    expect(ofShownStatus(bookings, off)).toEqual([{ status: 'Bekreftet' }, { status: 'bekreftet ' }])
    expect(withStatusShown(withStatusShown(off, 'opsjon', true), '', true)).toEqual(ALL_HALLS)
  })

  it('keeps the unticked statuses when halls are ticked and unticked', () => {
    const off = withStatusShown(ALL_HALLS, 'Opsjon', false)
    expect(withHallShown(tree, off, 'B1', false).statuses).toEqual(['Opsjon'])
    expect(withAreaShown(off, nv, false).statuses).toEqual(['Opsjon'])
    expect(withAllHalls(tree, withAreaShown(off, nv, false), true)).toEqual(off)
    expect(shownHalls(tree, withAllHalls(tree, off, false))).toEqual([])
  })

  it('renames an area, but not to nothing or to the name of another', () => {
    expect(withAreaRenamed(areas, 0, ' Messehaller ')[0].name).toBe('Messehaller')
    expect(withAreaRenamed(areas, 0, 'nova studios')).toBe(areas)
    expect(withAreaRenamed(areas, 0, ' ')).toBe(areas)
  })
})
