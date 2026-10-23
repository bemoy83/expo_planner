import { describe, expect, it } from 'vitest'
import { pushTo } from './collections'

describe('pushTo', () => {
  it('starts a list for a new key and adds to it after, in order', () => {
    const map = new Map<string, number[]>()
    pushTo(map, 'a', 1)
    pushTo(map, 'b', 2)
    pushTo(map, 'a', 3)
    expect([...map]).toEqual([['a', [1, 3]], ['b', [2]]])
  })
})
