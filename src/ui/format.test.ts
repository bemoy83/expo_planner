import { describe, expect, it } from 'vitest'
import { formatFte, wholeHours } from './format'

describe('formatFte', () => {
  it('writes a figure as toLocaleString does, with the formatter made once', () => {
    for (const value of [0, 1, -2, 0.25, 2.75, 1234.5, -0.04, 12345.678])
      for (const digits of [0, 1, 2]) expect(formatFte(value, digits)).toBe(value.toLocaleString('nb-NO', { maximumFractionDigits: digits, minimumFractionDigits: 0 }))
    expect(formatFte(undefined)).toBe('')
    expect(formatFte(Number.NaN)).toBe('')
    expect(wholeHours(1249.6)).toBe((1250).toLocaleString('nb-NO'))
  })
})
