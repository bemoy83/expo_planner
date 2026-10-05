import { beforeEach, describe, expect, it } from 'vitest'
import { clearPrefs, loadPref, savePref } from './prefs'

describe('view preferences', () => {
  beforeEach(() => localStorage.clear())

  it('returns the fallback until something is saved', () => {
    expect(loadPref('zoom', 'normal')).toBe('normal')
    savePref('zoom', 'wide')
    expect(loadPref('zoom', 'normal')).toBe('wide')
  })

  it('keeps false and empty lists apart from nothing saved', () => {
    savePref('tooltips', false)
    savePref('collapsedLevels', [])
    expect(loadPref('tooltips', true)).toBe(false)
    expect(loadPref('collapsedLevels', ['a'])).toEqual([])
  })

  it('falls back when the stored text cannot be read', () => {
    localStorage.setItem('expo-planner:filter', '{not json')
    expect(loadPref('filter', { search: '' })).toEqual({ search: '' })
  })

  it('clears its own keys and leaves others alone', () => {
    savePref('zoom', 'wide')
    localStorage.setItem('other-app', 'x')
    clearPrefs()
    expect(loadPref('zoom', 'normal')).toBe('normal')
    expect(localStorage.getItem('other-app')).toBe('x')
  })
})
