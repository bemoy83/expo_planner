import { withSettingsDefaults, type Workspace } from '../domain/types'

const FORMAT = 'expo-planner-backup'
const VERSION = 1

export interface Backup {
  format: typeof FORMAT
  version: number
  exportedAt: string
  workspace: Workspace
}

export const toBackup = (workspace: Workspace): Backup => ({
  format: FORMAT,
  version: VERSION,
  exportedAt: new Date().toISOString(),
  workspace,
})

const isArray = (value: unknown): value is unknown[] => Array.isArray(value)

/** Checks the overall shape before a restore replaces local data. */
export const parseBackup = (json: string): Workspace => {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('Filen er ikke gyldig JSON.')
  }
  const backup = data as Partial<Backup>
  if (backup?.format !== FORMAT) throw new Error('Filen er ikke en Expo Planner-sikkerhetskopi.')
  if (backup.version !== VERSION) throw new Error(`Ukjent versjon av sikkerhetskopien (${backup.version}).`)
  const { capacity, importedFrom, ...ws } = (backup.workspace ?? {}) as Partial<Workspace> & { capacity?: unknown; importedFrom?: unknown }
  if (!ws.settings || !isArray(ws.venue) || !isArray(ws.projects) || !isArray(ws.demand) || !isArray(ws.allocations)) {
    throw new Error('Sikkerhetskopien mangler data.')
  }
  // The app no longer reads the planner workbook, and does not take in what came from it: staffing lines typed in by hand and demand lines without an origin.
  if (importedFrom || (isArray(capacity) && capacity.length) || ws.demand.some((line) => !line.origin)) {
    throw new Error('Sikkerhetskopien er laget fra planleggingsarbeidsboken og kan ikke gjenopprettes. Start på nytt og les inn kildene fra Venyou og Visma.')
  }
  // A backup made before a setting existed gets its default.
  return { ...(ws as Workspace), settings: withSettingsDefaults(ws.settings) }
}
