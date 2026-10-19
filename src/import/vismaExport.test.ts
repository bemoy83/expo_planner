import { describe, expect, it } from 'vitest'
import { vismaHall, vismaProductType } from './vismaExport'

describe('a product type as Visma writes it', () => {
  it('is read as its name: the text in the brackets, without brackets of its own', () => {
    expect(vismaProductType('14 [FOGA-vegger]')).toBe('FOGA-vegger')
    expect(vismaProductType('1 [5999 [Diverse]]')).toBe('5999 Diverse')
    expect(vismaProductType('2 [6999 [Diverse]]')).not.toBe(vismaProductType('1 [5999 [Diverse]]'))
  })

  it('is none where the text has no brackets', () => {
    expect(vismaProductType('0')).toBe('')
    expect(vismaProductType('')).toBe('')
  })
})

describe('the Hall/Sted of a booking line', () => {
  it('is the hall of its stand, or its free text where it has no stand', () => {
    expect(vismaHall('C04-44', '')).toBe('Hall C')
    expect(vismaHall('', 'Hall C og D')).toBe('Hall C og D')
  })
})
