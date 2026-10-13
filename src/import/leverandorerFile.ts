import { competenceStyles } from '../domain/competences'
import { SHIFT_LABELS } from '../domain/hire'
import type { FileSupplier } from '../domain/suppliers'
import { SHIFT_IDS, type ShiftId, type Workspace } from '../domain/types'
import { dataRows, findHeader, isMarked, num, readXlsx, text, writeXlsx, type CellValue } from './xlsx'

/**
 * The suppliers as a file: what «Eksporter» on Leverandører writes and «Importer fra fil» reads. A row per supplier,
 * a column per shift and a column per competence, marked where the supplier has it. Suppliers are told apart by their names.
 */

export class LeverandorerFormatError extends Error {}

const NAME = 'Navn'
const CONTACT = 'Kontakt'
const RATE = 'Kr per time'
const NOTE = 'Notat'
const MARK = 'x'

/** The suppliers as a workbook, with a column for every competence, in the planner's order. */
export const writeLeverandorerWorkbook = (ws: Workspace): Uint8Array => {
  const styles = competenceStyles(ws)
  const rows = (ws.suppliers ?? []).map((s): CellValue[] => [
    s.name,
    s.contact ?? '',
    s.rate ?? '',
    s.note ?? '',
    ...SHIFT_IDS.map((shift) => (s.shifts.includes(shift) ? MARK : '')),
    ...styles.map((style) => (s.competences.includes(style.key) ? MARK : '')),
  ])
  return writeXlsx([{ name: 'Leverandører', head: [NAME, CONTACT, RATE, NOTE, ...SHIFT_IDS.map((shift) => SHIFT_LABELS[shift]), ...styles.map((style) => style.label)], rows }])
}

/**
 * Reads a file of suppliers: a «Navn» column, and optionally «Kontakt», «Kr per time», «Notat» and a column per shift
 * («Dag», «Kveld», «Natt»). Every other column with a heading is a competence, held by the suppliers whose cell is marked.
 */
export const readLeverandorerWorkbook = (bytes: Uint8Array): FileSupplier[] => {
  for (const sheet of readXlsx(bytes).values()) {
    const header = findHeader(sheet, [NAME.toLowerCase()])
    if (!header) continue
    const column = (heading: string) => header.columns.get(heading.toLowerCase())
    const name = column(NAME)!
    const contact = column(CONTACT)
    const rate = column(RATE)
    const note = column(NOTE)
    const shifts = SHIFT_IDS.flatMap((shift): { shift: ShiftId; col: number }[] => (column(SHIFT_LABELS[shift]) === undefined ? [] : [{ shift, col: column(SHIFT_LABELS[shift])! }]))
    const own = [name, contact, rate, note, ...shifts.map(({ col }) => col)]
    // The headings as they are spelled in the file name the competences.
    const competences = [...sheet.rows.get(header.row)!].filter(([col, value]) => !own.includes(col) && text(value)).map(([col, value]) => ({ col, label: text(value) }))
    const suppliers = dataRows(sheet, header.row).flatMap((row): FileSupplier[] => {
      const get = (col: number | undefined) => (col === undefined ? null : (sheet.rows.get(row)?.get(col) ?? null))
      if (!text(get(name))) return []
      return [
        {
          name: text(get(name)),
          ...(contact === undefined ? {} : { contact: text(get(contact)) }),
          ...(rate === undefined ? {} : { rate: num(get(rate)) ?? 0 }),
          ...(note === undefined ? {} : { note: text(get(note)) }),
          shifts: Object.fromEntries(shifts.map(({ shift, col }) => [shift, isMarked(get(col))])),
          competences: Object.fromEntries(competences.map(({ col, label }) => [label, isMarked(get(col))])),
        },
      ]
    })
    if (suppliers.length) return suppliers
  }
  throw new LeverandorerFormatError('Fant ingen leverandører. Filen må ha en kolonne «Navn», og en kolonne per kompetanse.')
}
