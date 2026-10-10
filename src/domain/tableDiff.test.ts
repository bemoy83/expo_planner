import { describe, expect, it } from 'vitest'
import { diffBy } from './tableDiff'

describe('what a file would change in a table', () => {
  const key = (row: { name: string }) => row.name.toLowerCase()
  const same = (a: { unit: string }, b: { unit: string }) => a.unit === b.unit
  const app = [{ name: 'Print', unit: 'ordre' }, { name: 'Skilt', unit: 'stk' }, { name: 'Tepper', unit: 'm²' }]

  it('counts new rows, changed rows, rows that are alike, and rows only the app has', () => {
    const file = [{ name: 'print', unit: 'ordre' }, { name: 'Skilt', unit: 'lm' }, { name: 'Banner', unit: 'stk' }]
    expect(diffBy(app, file, key, same)).toEqual({ added: 1, changed: 1, unchanged: 1, onlyInApp: 1 })
  })

  it('counts a row the file has twice once, as its first', () => {
    const file = [{ name: 'Print', unit: 'ordre' }, { name: 'PRINT', unit: 'stk' }]
    expect(diffBy(app, file, key, same)).toEqual({ added: 0, changed: 0, unchanged: 1, onlyInApp: 2 })
  })

  it('counts every row as only in the app for an empty file', () => {
    expect(diffBy(app, [], key, same)).toEqual({ added: 0, changed: 0, unchanged: 0, onlyInApp: 3 })
  })
})
