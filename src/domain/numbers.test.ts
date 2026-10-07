import { describe, expect, it } from 'vitest'
import { decimalText, parseDecimal } from './numbers'

describe('numbers as they are typed', () => {
  it('reads a decimal comma and a point alike', () => {
    expect(parseDecimal('1,5')).toBe(1.5)
    expect(parseDecimal(' 1.5 ')).toBe(1.5)
    expect(parseDecimal('-2')).toBe(-2)
  })

  it('tells an empty field from text that is no number', () => {
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('  ')).toBeNull()
    expect(parseDecimal('abc')).toBeUndefined()
    expect(parseDecimal('1,5,5')).toBeUndefined()
    expect(parseDecimal('Infinity')).toBeUndefined()
  })

  it('writes a number back with a decimal comma', () => {
    expect(decimalText(7.5)).toBe('7,5')
    expect(decimalText(21)).toBe('21')
    expect(parseDecimal(decimalText(0.125))).toBe(0.125)
  })
})
