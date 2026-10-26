import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildDayPlan } from '../../domain/dayPlan'
import { TWO_PROJECTS, withTwoProjects } from '../../test/staffingFixture'
import { DEFAULT_SETTINGS, DEFAULT_WORKDAY, workTag, type Assignment, type Workspace } from '../../domain/types'
import { DayPlanSheet } from './DayPlanSheet'

const MON = '2026-10-12'
const { first: FIRST, second: SECOND } = TWO_PROJECTS
const wd = DEFAULT_WORKDAY
const base = withTwoProjects({ settings: DEFAULT_SETTINGS, venue: [], projects: [], demand: [], allocations: [], persons: [] })
const block = (n: number, projectNo: string | undefined, hall: string | undefined, extra: Partial<Assignment> = {}): Assignment => ({ id: `b-${n}-${extra.start ?? 0}`, personId: `two-${n}`, date: MON, competence: 'vegger', start: wd.dayStart, end: wd.dayEnd, source: 'manual', ...workTag({ projectNo, hall }), ...extra })
export const sheetWorkspace = (): Workspace => ({
  ...base,
  allocations: [{ ...base.allocations[0], hall: 'B', fte: { [MON]: 2 }, notes: { [MON]: 'Veggene mot B2 først' } }, { ...base.allocations[1], hall: 'Ufordelt' }],
  projects: [
    { name: 'Hagemessen', projectNo: SECOND },
    { name: 'Byggemessen', projectNo: FIRST },
  ],
  assignments: [block(1, FIRST, 'B', { end: 660, id: 'am' }), block(1, SECOND, undefined, { start: 720, end: 900, id: 'pm' }), block(2, FIRST, 'B')],
  hireOrders: [{ id: 'o', supplierId: 's1', shift: 'dag', competence: 'vegger', date: MON, fte: 3, start: wd.dayStart, end: wd.dayEnd, conf: null, projectNo: FIRST }],
  suppliers: [{ id: 's1', name: 'Messehjelp AS', order: 0, competences: ['vegger'], shifts: ['dag'] } as never],
})

describe('the day plan sheet', () => {
  it('names the projects, the place and competence of each block, and what waits', () => {
    const ws = sheetWorkspace()
    const html = renderToStaticMarkup(<DayPlanSheet plan={buildDayPlan(ws, MON)} ws={ws} printedAt="12.10.2026 08:00" unsetCount={0} />)
    expect(html).toContain('Mandag 12. oktober 2026')
    expect(html).toContain('Byggemessen')
    expect(html).toContain('Veggene mot B2 først')
    expect(html).toContain('Messehjelp AS')
    expect(html).toContain('venter, teller ikke før svar')
    expect(html).toContain('Skrevet ut 12.10.2026 08:00')
    // A fitter who changes project in the day stands in both places: the later part marked, the rest of the day in outline.
    expect(html.match(/<b>Kari<\/b>/g)).toHaveLength(2)
    expect(html).toContain('dp-later')
    expect(html).toContain('dp-blk ghost')
    expect(html).toContain('1,5 pers + 3 venter')
  })
})
