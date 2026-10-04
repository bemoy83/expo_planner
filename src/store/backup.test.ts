import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Workspace } from '../domain/types'
import { parseBackup, toBackup } from './backup'

const workspace: Workspace = {
  settings: DEFAULT_SETTINGS,
  venue: [],
  projects: [{ name: 'VVS 2026', projectNo: '26970' }],
  demand: [],
  allocations: [],
  capacity: [],
}

describe('backup', () => {
  it('round-trips a workspace', () => {
    expect(parseBackup(JSON.stringify(toBackup(workspace)))).toEqual(workspace)
  })

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow('ikke gyldig JSON')
    expect(() => parseBackup('{"format":"other"}')).toThrow('ikke en Expo Planner')
    expect(() => parseBackup(JSON.stringify({ ...toBackup(workspace), version: 99 }))).toThrow('Ukjent versjon')
    expect(() => parseBackup(JSON.stringify({ ...toBackup(workspace), workspace: { settings: DEFAULT_SETTINGS } }))).toThrow('mangler data')
  })
})
