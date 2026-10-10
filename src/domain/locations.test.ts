import { describe, expect, it } from 'vitest'
import { collectedIn, examplePlaces, hallChoices, hallRulesOf, locateDemand, locateRows, placeNames, placeOf, PROJECT_HALLS, readHall, resolveHall, sharedPlaces, suggestHall, UNRESOLVED_HALL, withAlias, withPlaceRenamed } from './locations'
import type { AllocationRow, DemandLine, HallRules } from './types'
import { buildWindows, windowFor } from './windows'

const halls = ['A1', 'B1', 'B2', 'B3', 'C', 'D1', 'D2', 'E', 'MEZ']
/** The planner has no places and no rules of his own. */
const none: HallRules = { places: [], phrases: [], seeded: true }
/** The planner's own: «B» stands for the B halls, and «Hall D» is D1. */
const own: HallRules = { places: [{ name: 'B', halls: ['B1', 'B2', 'B3'] }], phrases: [], seeded: true }
const choices = withAlias({}, 'D', 'D1')

describe('placing demand in the halls of the hall ledger', () => {
  it('matches a hall by name, with or without «Hall» in front, ignoring case', () => {
    expect(resolveHall('Hall C', halls)).toBe('C')
    expect(resolveHall(' hall c ', halls)).toBe('C')
    expect(resolveHall('mez', halls)).toBe('MEZ')
    expect(resolveHall('B2', halls, none)).toBe('B2')
    expect(readHall('Hall D2', halls, own)).toEqual({ hall: 'D2', by: 'text' })
  })

  it('reads a name however it is spelled: spaces, hyphens and signs do not tell names apart', () => {
    const studios = ['STUDIO3', 'STUDIO-N', 'B1', 'C']
    const nova: HallRules = { places: [{ name: 'NOVA STUDIOS', halls: ['STUDIO3', 'STUDIO-N'], collects: false }], phrases: [], seeded: true }
    expect(readHall('Studio 3', studios, nova)).toEqual({ hall: 'STUDIO3', by: 'text' })
    expect(resolveHall('studio-3', studios, nova)).toBe('STUDIO3')
    expect(resolveHall('Studio N', studios, nova)).toBe('STUDIO-N')
    expect(resolveHall('Hall B 1', studios, nova)).toBe('B1')
    expect(resolveHall('Nova-studios', studios, nova)).toBe('NOVA STUDIOS')
    // The whole text is the name: a part of it, or a number beside it, is not read.
    for (const text of ['Studio 3 og 4', 'Kafé ved Studio 3', 'Studio 34']) expect(resolveHall(text, studios, nova)).toBeNull()
    // Two halls spelled alike are not told apart, so neither is taken.
    expect(resolveHall('Studio N', ['STUDIO-N', 'STUDION'], nova)).toBeNull()
    expect(resolveHall('STUDIO-N', ['STUDIO-N', 'STUDION'], nova)).toBe('STUDIO-N')
    expect(placeOf('Studio 3', studios, withAlias({}, 'Studio 3', 'C'), undefined, nova).hall).toBe('C')
  })

  it('counts what lands in a hall under the place that collects it', () => {
    expect(collectedIn('B2', halls, own)).toBe('B')
    expect(collectedIn('C', halls, own)).toBe('C')
    expect(readHall('Hall B2', halls, own)).toEqual({ hall: 'B', by: 'text', via: 'B2' })
    expect(placeOf('b 2', halls, {}, '26100', own)).toEqual({ hall: 'B', by: 'text', chosen: false, own: false, via: 'B2' })
    // A choice of the hall, made before the place collected it, and a word rule to it, are for the place.
    expect(placeOf('Bakrom', halls, withAlias({}, 'Bakrom', 'B3'), undefined, own).hall).toBe('B')
    expect(placeOf('Lager bak', halls, {}, undefined, { ...own, phrases: [{ text: 'lager', hall: 'B1' }] }).hall).toBe('B')
    // A place that does not collect leaves its halls to count by themselves.
    const loose: HallRules = { places: [{ name: 'B', halls: ['B1', 'B2', 'B3'], collects: false }], phrases: [], seeded: true }
    expect(resolveHall('Hall B2', halls, loose)).toBe('B2')
    expect(placeNames(halls, loose)).toContain('B2')
    const line = (hall: string) => ({ id: hall, hall, projectNo: '26100' }) as DemandLine
    expect(locateDemand([line('B1'), line('Hall B3'), line('Hall B'), line('C')], halls, {}, own).map((l) => l.hall)).toEqual(['B', 'B', 'B', 'C'])
  })

  it('offers a name written in several words somewhere in the text', () => {
    const studios = ['STUDIO3', 'STUDIO4', 'STUDIO-N', 'C']
    const loose: HallRules = { places: [{ name: 'NOVA STUDIOS', halls: ['STUDIO3', 'STUDIO4', 'STUDIO-N'], collects: false }], phrases: [], seeded: true }
    expect(suggestHall('Kafé ved Studio 3', studios, [], loose)).toEqual({ hall: 'STUDIO3', own: false })
    expect(suggestHall('Rigg studio-N, bak', studios, [], loose)).toEqual({ hall: 'STUDIO-N', own: false })
    expect(suggestHall('Scene i Nova Studios', studios, [], loose)).toEqual({ hall: 'NOVA STUDIOS', own: false })
    expect(suggestHall('Studio 3 og Studio 4', studios, [], loose)).toEqual({ hall: PROJECT_HALLS, own: false })
    expect(suggestHall('Kafé ved Studio 34', studios, [], loose)).toBeNull()
    // Where the place collects its halls, the offer is the place.
    expect(suggestHall('Kafé ved Studio 3', studios, [], { ...loose, places: [{ ...loose.places[0], collects: true }] })).toEqual({ hall: 'NOVA STUDIOS', own: false })
  })

  it('takes a hall letter for its numbered hall when there is one such hall', () => {
    expect(readHall('Hall A', halls, none)).toEqual({ hall: 'A1', by: 'text' })
  })

  it('starts with the letters several halls share as places, as examples, until the planner has rules of his own', () => {
    expect(examplePlaces(halls)).toEqual([{ name: 'B', halls: ['B1', 'B2', 'B3'] }, { name: 'D', halls: ['D1', 'D2'] }])
    expect(hallRulesOf(halls, undefined).places).toEqual(examplePlaces(halls))
    // Rules from before the examples were his to change get them once, beside his own.
    expect(hallRulesOf(halls, { places: [{ name: 'B', halls: ['B1'] }], phrases: [] })).toEqual({ places: [{ name: 'D', halls: ['D1', 'D2'] }, { name: 'B', halls: ['B1'] }], phrases: [], seeded: true })
    expect(readHall('Hall D', halls)).toEqual({ hall: 'D', by: 'text' })
    // His own rules are all there is: no place «D» among them, so «Hall D» names none.
    expect(sharedPlaces(halls, own)).toEqual([{ name: 'B', halls: ['B1', 'B2', 'B3'], collects: true }])
    // The halls of a place that collects them are no places of their own.
    expect(placeNames(halls, own)).toEqual(['A1', 'B', 'C', 'D1', 'D2', 'E', 'MEZ', PROJECT_HALLS])
    expect(readHall('Hall B', halls, own)).toEqual({ hall: 'B', by: 'text' })
    expect(readHall('Hall D', halls, own)).toBeNull()
    expect(readHall('Hall B', halls, none)).toBeNull()
  })

  it('lets a choice for a text hold for it with «Hall» in front', () => {
    expect(placeOf('Hall D', halls, choices, '26100', own)).toEqual({ hall: 'D1', by: 'choice', chosen: true, own: false })
    expect(placeOf('D', halls, choices, undefined, own).hall).toBe('D1')
    expect(placeOf('Hall D', halls, withAlias({}, 'D', 'D9'), undefined, own).hall).toBe(UNRESOLVED_HALL)
  })

  it('leaves odd names, combinations and blanks unresolved', () => {
    for (const text of ['Hall F', 'Hall C og D', 'sceneomr hall C', 'Inng øst', 'Hal C', '']) expect(resolveHall(text, halls, own)).toBeNull()
  })

  it('offers the one place a text names among other words, for every project', () => {
    expect(suggestHall('cafe hall B', halls, [], own)).toEqual({ hall: 'B', own: false })
    expect(suggestHall('Sceneomr hall C', halls)?.hall).toBe('C')
    expect(suggestHall('Møterom hall E1', halls)?.hall).toBe('E')
    expect(suggestHall('Lager ved MEZ', halls)?.hall).toBe('MEZ')
  })

  it('offers nothing for a hall that is not in the ledger, a place the text is read as already, or a text without a hall where the bookings do not say', () => {
    for (const text of ['Inng øst', 'Gulvfolie', 'Hall F', 'Hall C', 'Hall B', 'en c-profil', '']) expect(suggestHall(text, halls, ['C', 'D1'], own)).toBeNull()
    expect(suggestHall('Hall F', halls, ['C'], own)).toBeNull()
  })

  it('offers the halls of the project together for a text that names several places', () => {
    expect(suggestHall('Hall C og B', halls, [], own)).toEqual({ hall: PROJECT_HALLS, own: false })
    expect(suggestHall('Hall C, B, E', halls, ['C'], own)).toEqual({ hall: PROJECT_HALLS, own: false })
  })

  it('takes the halls of the project together as a place the planner or a rule gives, with the days of all its halls', () => {
    const aliases = withAlias({}, 'Hall C, D, E', PROJECT_HALLS)
    expect(placeOf('hall c, d, e', halls, aliases)).toEqual({ hall: PROJECT_HALLS, by: 'choice', chosen: true, own: false })
    expect(placeOf('Gangtepper alle haller', halls, {}, undefined, { places: [], phrases: [{ text: 'alle haller', hall: PROJECT_HALLS }], seeded: true as const })).toMatchObject({ hall: PROJECT_HALLS, by: 'phrase' })
    // A choice stored while the unresolved location was called «Uavklart» is a choice of it, as is one of «Felles» of this place.
    expect(placeOf('Hall C', halls, withAlias({}, 'Hall C', 'Uavklart'))).toMatchObject({ hall: UNRESOLVED_HALL, by: 'choice' })
    expect(placeOf('Gangtepper', halls, withAlias({}, 'Gangtepper', 'Felles')).hall).toBe(PROJECT_HALLS)
    // Nothing falls to it by itself.
    expect(placeOf('Hall C, D, E', halls).hall).toBe(UNRESOLVED_HALL)
    const booking = (hall: string, day: string) => ({ id: hall, hall, eventName: 'Hage', status: '', phases: { assembly: { start: day, end: day } } })
    const windows = buildWindows([booking('C', '2026-04-01'), booking('E', '2026-04-03')], () => 'hage', sharedPlaces(halls))
    expect([...windowFor(windows, 'hage', PROJECT_HALLS, 'Montering')!]).toEqual(['2026-04-01', '2026-04-03'])
  })

  it('offers the hall of a project with one hall for a text that names none', () => {
    expect(suggestHall('Inng øst', halls, ['C'], own)).toEqual({ hall: 'C', own: true })
  })

  it('gathers unmatched lines in one location and keeps their hours', () => {
    const line = (hall: string, assemblyHours: number) => ({ id: hall, hall, assemblyHours }) as DemandLine
    const located = locateDemand([line('Hall C', 1), line('cafe hall D', 2), line('Hall F', 4), line('', 8), line('Hall B', 16)], halls, {}, own)
    expect(located.map((l) => l.hall)).toEqual(['C', UNRESOLVED_HALL, UNRESOLVED_HALL, UNRESOLVED_HALL, 'B'])
    expect(located.reduce((sum, l) => sum + l.assemblyHours, 0)).toBe(31)
  })

  it('lets the planner give a text a place, which places every line with that text', () => {
    const aliases = withAlias(withAlias(withAlias({}, ' Sceneomr hall C', 'C'), 'Hall C', UNRESOLVED_HALL), 'Bakrom', 'B')
    expect(placeOf('sceneomr hall c', halls, aliases)).toEqual({ hall: 'C', by: 'choice', chosen: true, own: false })
    expect(placeOf('Hall C', halls, aliases)).toEqual({ hall: UNRESOLVED_HALL, by: 'choice', chosen: true, own: false })
    expect(placeOf('Hall A', halls, aliases)).toEqual({ hall: 'A1', by: 'text', chosen: false, own: false })
    expect(placeOf('bakrom', halls, aliases, undefined, own).hall).toBe('B')
    const line = (id: string, hall: string) => ({ id, hall }) as DemandLine
    expect(locateDemand([line('a', 'sceneomr hall C'), line('b', 'Sceneomr hall C'), line('c', 'cafe hall D')], halls, aliases).map((l) => l.hall)).toEqual(['C', 'C', UNRESOLVED_HALL])
  })

  it('keeps a choice for one project apart from the choice for every project', () => {
    const aliases = withAlias(withAlias({}, 'Inng øst', 'E'), 'Inng øst', 'C', '26100')
    expect(placeOf('Inng øst', halls, aliases, '26100')).toEqual({ hall: 'C', by: 'own', chosen: true, own: true })
    expect(placeOf('Inng øst', halls, aliases, '26200')).toEqual({ hall: 'E', by: 'choice', chosen: true, own: false })
    expect(placeOf('Inng øst', halls, withAlias(aliases, 'Inng øst', undefined, '26100'), '26100').hall).toBe('E')
    const line = (projectNo: string) => ({ id: projectNo, hall: 'Inng øst', projectNo }) as DemandLine
    expect(locateDemand([line('26100'), line('26200')], halls, aliases).map((l) => l.hall)).toEqual(['C', 'E'])
  })

  it('lists the choices for texts, those for every project before those for one', () => {
    const aliases = withAlias(withAlias(withAlias(choices, 'Inng øst', 'E'), 'Inng øst', 'C', '26100'), 'cafe hall D', 'D1')
    expect(hallChoices(aliases).map((c) => [c.text, c.projectNo, c.hall])).toEqual([['cafe hall d', undefined, 'D1'], ['d', undefined, 'D1'], ['inng øst', undefined, 'E'], ['inng øst', '26100', 'C']])
  })

  it('goes back to reading the text when the choice is removed or its hall is gone', () => {
    expect(withAlias({ 'hall c': 'E' }, 'Hall C', undefined)).toEqual({})
    expect(placeOf('Hall C', halls, { 'hall c': 'F' })).toEqual({ hall: 'C', by: 'text', chosen: false, own: false })
  })

  it('places planning rows the same way, and leaves rows for all halls alone', () => {
    const row = (hall?: string) => ({ id: 'r', hall }) as AllocationRow
    expect(locateRows([row('Hall D'), row('cafe hall D'), row('C'), row(undefined)], halls, choices, own).map((r) => r.hall)).toEqual(['D1', UNRESOLVED_HALL, 'C', undefined])
  })

  it('counts a text under the place of the first of the planner\'s rules whose words it holds', () => {
    const words: HallRules = { places: [], phrases: [{ text: 'Scene', hall: 'C' }, { text: 'øst', hall: 'E' }, { text: 'kafé', hall: 'F' }], seeded: true }
    expect(placeOf('Sceneomr øst', halls, {}, undefined, words)).toEqual({ hall: 'C', by: 'phrase', chosen: false, own: false, phrase: 'Scene' })
    expect(placeOf('Inng øst', halls, {}, undefined, words).hall).toBe('E')
    // A rule to a place that is not in the ledger places nothing, and a text that names a hall is read as that hall.
    expect(placeOf('Kafé', halls, {}, undefined, words).hall).toBe(UNRESOLVED_HALL)
    expect(placeOf('Hall C', halls, {}, undefined, { places: [], phrases: [{ text: 'hall', hall: 'E' }], seeded: true }).hall).toBe('C')
    expect(placeOf('Inng øst', halls, withAlias({}, 'Inng øst', 'MEZ'), undefined, words).hall).toBe('MEZ')
    expect(suggestHall('Inng øst', halls, ['C'], words)).toBeNull()
  })

  it('takes the planner\'s own places as places: by name, as a choice, and with the days of their halls', () => {
    const wing: HallRules = { places: [{ name: 'Nordfløy', halls: ['b1', 'C', 'X9'] }, { name: 'C', halls: ['E'] }], phrases: [{ text: 'nord', hall: 'Nordfløy' }], seeded: true }
    expect(sharedPlaces(halls, wing)).toEqual([{ name: 'Nordfløy', halls: ['B1', 'C'], collects: true }])
    expect(placeOf('nordfløy', halls, {}, undefined, wing)).toMatchObject({ hall: 'Nordfløy', by: 'text' })
    expect(placeOf('Lager nord', halls, {}, undefined, wing)).toMatchObject({ hall: 'Nordfløy', by: 'phrase' })
    expect(placeOf('Bakrom', halls, withAlias({}, 'Bakrom', 'Nordfløy'), undefined, wing).hall).toBe('Nordfløy')
    expect(placeOf('Bakrom', halls, withAlias({}, 'Bakrom', 'Nordfløy'), undefined, own).hall).toBe(UNRESOLVED_HALL)
    const booking = (hall: string, day: string) => ({ id: hall, hall, eventName: 'Hage', status: '', phases: { assembly: { start: day, end: day } } })
    const windows = buildWindows([booking('B1', '2026-04-01'), booking('C', '2026-04-03'), booking('E', '2026-04-05')], () => 'hage', sharedPlaces(halls, wing))
    expect([...windowFor(windows, 'hage', 'Nordfløy', 'Montering')!]).toEqual(['2026-04-01', '2026-04-03'])
  })

  it('gives a place another name, and the word rules and choices that point at it follow', () => {
    const wing: HallRules = { places: [{ name: 'Nordfløy', halls: ['B1', 'C'] }], phrases: [{ text: 'nord', hall: 'Nordfløy' }, { text: 'scene', hall: 'C' }], seeded: true }
    const aliases = withAlias(withAlias({}, 'Bakrom', 'Nordfløy'), 'Kafé', 'E')
    const renamed = withPlaceRenamed(halls, wing, aliases, 'Nordfløy', ' Nord ')
    expect(renamed.rules).toEqual({ places: [{ name: 'Nord', halls: ['B1', 'C'] }], phrases: [{ text: 'nord', hall: 'Nord' }, { text: 'scene', hall: 'C' }], seeded: true })
    expect(renamed.aliases).toEqual({ bakrom: 'Nord', kafé: 'E' })
    // A name that is a hall, another place or empty is not taken.
    for (const name of ['C', 'ufordelt', '', 'Mangler hall']) expect(withPlaceRenamed(halls, wing, aliases, 'Nordfløy', name).rules).toBe(wing)
  })

  it('gives a shared place the days of its halls that the project has booked', () => {
    const booking = (hall: string, start: string, end: string) => ({ id: hall, hall, eventName: 'Hage', status: '', phases: { assembly: { start, end } } })
    const windows = buildWindows([booking('B1', '2026-04-01', '2026-04-02'), booking('B3', '2026-04-02', '2026-04-03'), booking('C', '2026-04-06', '2026-04-06')], () => 'hage', sharedPlaces(halls, own))
    expect([...windowFor(windows, 'hage', 'B', 'Montering')!]).toEqual(['2026-04-01', '2026-04-02', '2026-04-03'])
    expect([...windowFor(windows, 'hage', 'B1', 'Montering')!]).toEqual(['2026-04-01', '2026-04-02'])
  })
})
