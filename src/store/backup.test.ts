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

  it('holds people, absence, assignments, moved hours and competence styles', () => {
    const staffed: Workspace = {
      ...workspace,
      persons: [{ id: 'p1', name: 'Anna', order: 0, active: true, competences: ['foga'] }],
      unavailability: [{ id: 'u1', personId: 'p1', date: '2026-10-13', kind: 'ferie' }],
      assignments: [{ id: 's1', personId: 'p1', date: '2026-10-12', competence: 'foga', start: 420, end: 900, source: 'manual' }],
      demandAdjustments: [{ id: 'd1', competence: 'foga', date: '2026-10-13', hours: 3, reason: 'carry', fromDate: '2026-10-12', createdAt: '2026-10-12T15:00:00Z' }],
      competenceStyles: { foga: { key: 'foga', label: 'FOGA', shortLabel: 'FOGA', color: 'line-teal', order: 0 } },
    }
    expect(parseBackup(JSON.stringify(toBackup(staffed)))).toEqual(staffed)
  })

  it('gives a backup from before the workday setting its default', () => {
    const { workday: _workday, ...old } = DEFAULT_SETTINGS
    const restored = parseBackup(JSON.stringify(toBackup({ ...workspace, settings: old as Workspace['settings'] })))
    expect(restored.settings.workday).toEqual(DEFAULT_SETTINGS.workday)
  })

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow('ikke gyldig JSON')
    expect(() => parseBackup('{"format":"other"}')).toThrow('ikke en Expo Planner')
    expect(() => parseBackup(JSON.stringify({ ...toBackup(workspace), version: 99 }))).toThrow('Ukjent versjon')
    expect(() => parseBackup(JSON.stringify({ ...toBackup(workspace), workspace: { settings: DEFAULT_SETTINGS } }))).toThrow('mangler data')
  })
})
