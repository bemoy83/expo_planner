import type { VenueBooking } from '../domain/types'
import { readVenue } from './plannerWorkbook'
import { readXlsx, text } from './xlsx'

export class VenyouFormatError extends Error {}

/** Reads a Venyou location export (`location_format_from-…_to-….xlsx`). */
export const readVenyouExport = (bytes: Uint8Array): VenueBooking[] => {
  for (const sheet of readXlsx(bytes).values()) {
    const rows = [...sheet.rows.keys()].sort((a, b) => a - b).slice(0, 10)
    const headerRow = rows.find((row) => {
      const headers = new Set([...sheet.rows.get(row)!.values()].map((value) => text(value).toLowerCase()))
      return headers.has('locations') && headers.has('event name') && headers.has('event start date')
    })
    if (headerRow === undefined) continue
    const bookings = readVenue(sheet, headerRow, sheet.name).map((booking, index) => ({ ...booking, id: `venyou-${index}-${booking.hall}-${booking.eventName}` }))
    if (bookings.length) return bookings
  }
  throw new VenyouFormatError('Fant ingen hallbookinger. Filen må ha kolonnene «Locations», «Event name» og «Event start date».')
}
