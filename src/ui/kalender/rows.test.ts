import { describe, expect, it } from 'vitest'
import { buildDemandIndex } from '../../domain/calc'
import { DEFAULT_SETTINGS, type AllocationRow } from '../../domain/types'
import { buildItems, EMPTY_FILTER } from './rows'

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

const rows = [
  row('a', { fte: { '2026-10-05': 2 } }),
  row('b', { projectName: 'vvs 2026', competence: 'Banner', fte: { '2026-10-06': 1 } }),
  row('c', { projectName: 'Hage 2026', projectNo: '26100', fte: { '2026-04-01': 3 } }),
  row('d', { projectName: 'Ny messe', projectNo: '' }),
]
const index = buildDemandIndex([])

describe('grid rows', () => {
  it('groups by project number, ordered by first planned day', () => {
    const items = buildItems(rows, index, DEFAULT_SETTINGS, EMPTY_FILTER, new Set())
    const groups = items.flatMap((i) => (i.kind === 'group' ? [i.group] : []))
    expect(groups.map((g) => g.key)).toEqual(['26100', '26970', 'navn:ny messe'])
    expect(groups[1].rows).toHaveLength(2)
    expect(groups[1].daily.get('2026-10-05')).toBe(2)
  })

  it('hides rows of collapsed groups', () => {
    const items = buildItems(rows, index, DEFAULT_SETTINGS, EMPTY_FILTER, new Set(['26970']))
    expect(items.filter((i) => i.kind === 'row').map((i) => (i.kind === 'row' ? i.row.id : ''))).toEqual(['c', 'd'])
  })

  it('keeps only projects with planned days in the visible window', () => {
    const items = buildItems(rows, index, DEFAULT_SETTINGS, EMPTY_FILTER, new Set(), { from: '2026-10-01', to: '2026-10-31' })
    expect(items.filter((i) => i.kind === 'group')).toHaveLength(1)
  })

  it('filters by competence and search text', () => {
    const items = buildItems(rows, index, DEFAULT_SETTINGS, { ...EMPTY_FILTER, competence: 'banner' }, new Set())
    expect(items.filter((i) => i.kind === 'row').map((i) => (i.kind === 'row' ? i.row.id : ''))).toEqual(['b'])
    const search = buildItems(rows, index, DEFAULT_SETTINGS, { ...EMPTY_FILTER, search: 'hage' }, new Set())
    expect(search.filter((i) => i.kind === 'row')).toHaveLength(1)
  })
})
