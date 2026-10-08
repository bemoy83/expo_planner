import { describe, expect, it } from 'vitest'
import { followLanes, type LaneKey, type Selection } from './selection'

const keys = (...ids: string[]): LaneKey[] => ids.map((id) => ({ id, scope: id.startsWith('level:') ? undefined : `scope-${id}` }))
const sel = (anchor: number, focus: number): Selection => ({ anchor: { lane: anchor, col: 3 }, focus: { lane: focus, col: 5 } })

describe('followLanes', () => {
  it('is the same selection when its lines stand where they stood', () => {
    const s = sel(0, 1)
    expect(followLanes(s, keys('a', 'b', 'c'), keys('a', 'b', 'c', 'd'))).toBe(s)
  })

  it('follows its lines when they move in the list, keeping the days', () => {
    // The project of a and b moves below c when it gets its first planned day.
    expect(followLanes(sel(0, 1), keys('a', 'b', 'c'), keys('c', 'a', 'b'))).toEqual({ anchor: { lane: 1, col: 3 }, focus: { lane: 2, col: 5 } })
  })

  it('follows a suggested row that became a stored row with a new id', () => {
    const before: LaneKey[] = [{ id: 'x', scope: 'x' }, { id: 'suggested:banner', scope: 'banner' }]
    const after: LaneKey[] = [{ id: 'row-1', scope: 'banner' }, { id: 'x', scope: 'x' }]
    expect(followLanes(sel(1, 1), before, after)).toMatchObject({ anchor: { lane: 0 }, focus: { lane: 0 } })
  })

  it('goes by the id before the line of work, where two stored rows plan the same', () => {
    const before: LaneKey[] = [{ id: 'one', scope: 'same' }, { id: 'two', scope: 'same' }]
    expect(followLanes(sel(1, 1), before, [...before].reverse())).toMatchObject({ focus: { lane: 0 } })
  })

  it('follows a level in entry mode', () => {
    expect(followLanes(sel(0, 0), keys('level:p|montering', 'a'), keys('a', 'level:p|montering'))).toMatchObject({ focus: { lane: 1 } })
  })

  it('is let go of when the line in focus is gone, and gathered on it when the line it started on is gone', () => {
    expect(followLanes(sel(0, 1), keys('a', 'b'), keys('a'))).toBeNull()
    expect(followLanes(sel(0, 1), keys('a', 'b'), keys('c', 'b'))).toMatchObject({ anchor: { lane: 1, col: 3 }, focus: { lane: 1, col: 5 } })
  })
})
