import { normalizeDate } from '../domain/dates'
import type { DateSpan, ProjectRef, VenueBooking, VenuePhase } from '../domain/types'
import { VENYOU_ID_PREFIX } from '../domain/venueImport'
import { cellAt, readXlsx, text, type Sheet } from './xlsx'

export class VenyouFormatError extends Error {}

const PHASE_COLUMNS: [VenuePhase, string][] = [
  ['assembly', 'assembly'],
  ['movingIn', 'moving in'],
  ['event', 'event'],
  ['movingOut', 'moving out'],
  ['dismantle', 'dismantle'],
]

/** Reads hall bookings in the Venyou layout: one row per hall and event, with start and end dates for each phase. */
const readBookings = (sheet: Sheet, headerRow: number): VenueBooking[] => {
  const columns = new Map<string, number>()
  for (const [col, value] of sheet.rows.get(headerRow) ?? []) {
    const name = text(value).toLowerCase()
    if (name && !columns.has(name)) columns.set(name, col)
  }
  const get = (row: number, header: string) => {
    const col = columns.get(header)
    return col === undefined ? null : cellAt(sheet, row, col)
  }
  const bookings: VenueBooking[] = []
  for (const row of [...sheet.rows.keys()].filter((r) => r > headerRow).sort((a, b) => a - b)) {
    const hall = text(get(row, 'locations'))
    const eventName = text(get(row, 'event name'))
    if (!hall || !eventName) continue
    const phases: Partial<Record<VenuePhase, DateSpan>> = {}
    for (const [phase, label] of PHASE_COLUMNS) {
      const start = normalizeDate(get(row, `${label} start date`))
      const end = normalizeDate(get(row, `${label} end date`))
      if (start && end) phases[phase] = start <= end ? { start, end } : { start: end, end: start }
    }
    bookings.push({ id: `${VENYOU_ID_PREFIX}${bookings.length}-${hall}-${eventName}`, hall, eventName, status: text(get(row, 'status')), phases })
  }
  return bookings
}

/** Reads a Venyou location export (`location_format_from-…_to-….xlsx`). */
export const readVenyouExport = (bytes: Uint8Array): VenueBooking[] => {
  for (const sheet of readXlsx(bytes).values()) {
    const rows = [...sheet.rows.keys()].sort((a, b) => a - b).slice(0, 10)
    const headerRow = rows.find((row) => {
      const headers = new Set([...sheet.rows.get(row)!.values()].map((value) => text(value).toLowerCase()))
      return headers.has('locations') && headers.has('event name') && headers.has('event start date')
    })
    if (headerRow === undefined) continue
    const bookings = readBookings(sheet, headerRow)
    if (bookings.length) return bookings
  }
  throw new VenyouFormatError('Fant ingen hallbookinger. Filen må ha kolonnene «Locations», «Event name» og «Event start date».')
}

/** Reads the project list (`Prosjekt.xlsx`): the columns «Navn» and «Prosjektnr.». */
export const readProjectList = (bytes: Uint8Array): ProjectRef[] => {
  for (const sheet of readXlsx(bytes).values()) {
    const rows = [...sheet.rows.keys()].sort((a, b) => a - b)
    for (const headerRow of rows.slice(0, 10)) {
      const columns = new Map([...sheet.rows.get(headerRow)!].map(([col, value]) => [text(value).toLowerCase(), col]))
      const nameCol = columns.get('navn')
      const noCol = columns.get('prosjektnr.') ?? columns.get('prosjektnr')
      if (nameCol === undefined || noCol === undefined) continue
      const projects = rows
        .filter((row) => row > headerRow)
        .map((row) => ({ name: text(sheet.rows.get(row)!.get(nameCol) ?? null), projectNo: text(sheet.rows.get(row)!.get(noCol) ?? null) }))
        .filter((project) => project.name && project.projectNo)
      if (projects.length) return projects
    }
  }
  throw new VenyouFormatError('Fant ingen prosjektliste. Filen må ha kolonnene «Navn» og «Prosjektnr.».')
}
