import { normalizeDate, type ISODate } from '../domain/dates'
import {
  DEFAULT_SETTINGS,
  type AllocationRow,
  type CapacityGroup,
  type CapacityLine,
  type DateSpan,
  type DayValues,
  type DemandLine,
  type ProjectRef,
  type Settings,
  type VenueBooking,
  type VenuePhase,
  type WorkPhase,
  type Workspace,
} from '../domain/types'
import { cellAt, num, readXlsx, splitRef, text, type CellValue, type Sheet } from './xlsx'

/** Reads the current planner workbook (`Bemanning_Behov_24 måneder.xlsx`) into a workspace. */

const SHEETS = ['Kalender', 'tabell_venyou', 'Tabell_oppgaver', 'Prosjekt', 'datavalidering', 'variabler']

export class WorkbookFormatError extends Error {}

const require = <T>(value: T | undefined | null, message: string): T => {
  if (value === undefined || value === null) throw new WorkbookFormatError(message)
  return value
}

const lower = (value: CellValue) => text(value).toLowerCase()

/** Maps header names in one row to column indexes. */
const headerColumns = (sheet: Sheet, row: number): Map<string, number> => {
  const map = new Map<string, number>()
  for (const [col, value] of sheet.rows.get(row) ?? []) {
    const name = lower(value)
    if (name && !map.has(name)) map.set(name, col)
  }
  return map
}

const findRow = (sheet: Sheet, col: number, label: string, from = 1, to = Infinity): number | undefined => {
  for (const [row, cells] of sheet.rows) if (row >= from && row <= to && lower(cells.get(col) ?? null) === label) return row
  return undefined
}

/** Finds a label anywhere in the sheet and returns the number in the cell below it. */
const valueBelowLabel = (sheet: Sheet | undefined, label: string): number | null => {
  if (!sheet) return null
  for (const [row, cells] of sheet.rows) {
    for (const [col, value] of cells) if (lower(value) === label) return num(cellAt(sheet, row + 1, col))
  }
  return null
}

const columnGetter = (sheet: Sheet, headers: Map<string, number>, sheetName: string) => {
  return (row: number, header: string, required = true): CellValue => {
    const col = headers.get(header.toLowerCase())
    if (col === undefined) {
      if (required) throw new WorkbookFormatError(`Fant ikke kolonnen «${header}» i ${sheetName}`)
      return null
    }
    return cellAt(sheet, row, col)
  }
}

const sortedRows = (sheet: Sheet, after: number) => [...sheet.rows.keys()].filter((r) => r > after).sort((a, b) => a - b)

const readVenue = (sheet: Sheet): VenueBooking[] => {
  const get = columnGetter(sheet, headerColumns(sheet, 1), 'tabell_venyou')
  const phaseColumns: [VenuePhase, string][] = [
    ['assembly', 'assembly'],
    ['movingIn', 'moving in'],
    ['event', 'event'],
    ['movingOut', 'moving out'],
    ['dismantle', 'dismantle'],
  ]
  const bookings: VenueBooking[] = []
  for (const row of sortedRows(sheet, 1)) {
    const hall = text(get(row, 'Locations'))
    const eventName = text(get(row, 'Event name'))
    if (!hall || !eventName) continue
    const phases: Partial<Record<VenuePhase, DateSpan>> = {}
    for (const [phase, label] of phaseColumns) {
      const start = normalizeDate(get(row, `${label} start date`))
      const end = normalizeDate(get(row, `${label} end date`))
      if (start && end) phases[phase] = start <= end ? { start, end } : { start: end, end: start }
    }
    bookings.push({ id: `venue-${row}`, hall, eventName, status: text(get(row, 'Status', false)), phases })
  }
  return bookings
}

const readProjects = (sheet: Sheet): ProjectRef[] => {
  const get = columnGetter(sheet, headerColumns(sheet, 1), 'Prosjekt')
  const seen = new Set<string>()
  const projects: ProjectRef[] = []
  for (const row of sortedRows(sheet, 1)) {
    const name = text(get(row, 'Navn'))
    const projectNo = text(get(row, 'Prosjektnr.'))
    const key = `${name.toLowerCase()}|${projectNo}`
    if (!name || !projectNo || seen.has(key)) continue
    seen.add(key)
    projects.push({ name, projectNo })
  }
  return projects
}

const readDemand = (sheet: Sheet): DemandLine[] => {
  const get = columnGetter(sheet, headerColumns(sheet, 1), 'Tabell_oppgaver')
  const lines: DemandLine[] = []
  for (const row of sortedRows(sheet, 1)) {
    const projectNo = text(get(row, 'PROSJEKTNR'))
    const assemblyHours = num(get(row, 'MONTERING')) ?? 0
    const dismantleHours = num(get(row, 'DEMONTERING')) ?? 0
    if (!projectNo && !assemblyHours && !dismantleHours) continue
    lines.push({
      id: `demand-${row}`,
      projectNo,
      projectName: text(get(row, 'PROSJEKT/ ARRANGEMENT')),
      eventYear: text(get(row, 'EVENTÅR')),
      source: text(get(row, 'OPPDRAGSGIVER/ KILDE')),
      workType: text(get(row, 'ARBEIDSOPPGAVER/ GJØREMÅL')),
      quantity: num(get(row, 'ANTALL')),
      unit: text(get(row, 'ENHET')),
      stand: text(get(row, 'STAND/OMRÅDE')),
      hall: text(get(row, 'HALL/ LOKASJON')),
      competence: text(get(row, 'NØKKELOMRÅDER')),
      basis: text(get(row, 'DATAGRUNNLAG')),
      assemblyHours,
      dismantleHours,
      comment: text(get(row, 'KOMMENTAR', false)),
    })
  }
  return lines
}

interface DateAxis {
  row: number
  /** Column index → date. */
  columns: Map<number, ISODate>
}

const readDateAxis = (sheet: Sheet): DateAxis => {
  const LABEL_COL = 15 // column P holds the row labels on the Kalender sheet
  const row = require(findRow(sheet, LABEL_COL, 'dato'), 'Fant ikke datoraden («Dato») i Kalender')
  const columns = new Map<number, ISODate>()
  for (const [col, value] of sheet.rows.get(row) ?? []) {
    const date = col > LABEL_COL ? normalizeDate(value) : null
    if (date) columns.set(col, date)
  }
  if (!columns.size) throw new WorkbookFormatError('Datoraden i Kalender er tom')
  return { row, columns }
}

const dayValues = (sheet: Sheet, row: number, axis: DateAxis): DayValues => {
  const values: DayValues = {}
  for (const [col, value] of sheet.rows.get(row) ?? []) {
    const date = axis.columns.get(col)
    const n = date ? num(value) : null
    if (date && n !== null && n !== 0) values[date] = n
  }
  return values
}

const notesForRow = (notes: Map<number, Map<number, string>>, row: number, axis: DateAxis): Record<ISODate, string> => {
  const out: Record<ISODate, string> = {}
  for (const [col, note] of notes.get(row) ?? []) {
    const date = axis.columns.get(col)
    if (date) out[date] = note
  }
  return out
}

const indexNotes = (sheet: Sheet): Map<number, Map<number, string>> => {
  const byRow = new Map<number, Map<number, string>>()
  for (const [ref, note] of sheet.notes) {
    const { row, col } = splitRef(ref)
    if (!byRow.has(row)) byRow.set(row, new Map())
    byRow.get(row)!.set(col, note)
  }
  return byRow
}

/** Manually entered staffing rows between «Faste (FTE)» and «Sum utilgjengelig (FTE)». */
const readCapacity = (sheet: Sheet, axis: DateAxis, notes: Map<number, Map<number, string>>): CapacityLine[] => {
  const LABEL_COL = 15
  const start = require(findRow(sheet, LABEL_COL, 'faste (fte)'), 'Fant ikke «Faste (FTE)» i Kalender')
  const end = require(findRow(sheet, LABEL_COL, 'sum utilgjengelig (fte)'), 'Fant ikke «Sum utilgjengelig (FTE)» i Kalender')
  const lines: CapacityLine[] = []
  let group: CapacityGroup = 'added'
  const rows = [...sheet.rows.keys()].filter((r) => r > start && r < end).sort((a, b) => a - b)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const label = text(cellAt(sheet, row, LABEL_COL))
    const key = label.toLowerCase()
    if (!label || key === 'varighet') continue
    if (key.startsWith('sum normaltid')) {
      group = 'overtime'
      continue
    }
    if (key.startsWith('sum overtid')) {
      group = 'unavailable'
      continue
    }
    const line: CapacityLine = {
      id: `capacity-${row}`,
      order: lines.length,
      label,
      group,
      values: dayValues(sheet, row, axis),
      notes: notesForRow(notes, row, axis),
    }
    if (group === 'overtime') {
      const hoursRow = rows[i + 1]
      line.hours = hoursRow !== undefined && lower(cellAt(sheet, hoursRow, LABEL_COL)) === 'varighet' ? dayValues(sheet, hoursRow, axis) : {}
    }
    lines.push(line)
  }
  return lines
}

const asPhase = (value: CellValue): WorkPhase | '' => {
  const v = lower(value)
  return v === 'montering' ? 'Montering' : v === 'demontering' ? 'Demontering' : ''
}

const readAllocations = (sheet: Sheet, axis: DateAxis, notes: Map<number, Map<number, string>>): AllocationRow[] => {
  const headerRow = require(findRow(sheet, 0, 'prosjekt', axis.row + 1), 'Fant ikke ressursallokeringstabellen («PROSJEKT») i Kalender')
  const get = columnGetter(sheet, headerColumns(sheet, headerRow), 'Kalender')
  const rows: AllocationRow[] = []
  for (const row of sortedRows(sheet, headerRow)) {
    const projectName = text(get(row, 'PROSJEKT'))
    const fte = dayValues(sheet, row, axis)
    if (!projectName && !Object.keys(fte).length) continue
    rows.push({
      id: `alloc-${row}`,
      order: rows.length,
      projectName,
      projectNo: text(get(row, 'PROSJEKT_NR')),
      refYear: text(get(row, 'DATA FRA')),
      competence: text(get(row, 'NØKKELOMRÅDER')),
      phase: asPhase(get(row, 'ARBEIDSFASE')),
      basis: text(get(row, 'DATAGRUNNLAG')),
      importedHours: num(get(row, 'TIMER')),
      fte,
      notes: notesForRow(notes, row, axis),
    })
  }
  return rows
}

const readSettings = (sheets: Map<string, Sheet>, axis: DateAxis): Settings => {
  const validation = sheets.get('datavalidering')
  const dates = [...axis.columns.values()].sort()
  return {
    baseCrew: valueBelowLabel(validation, 'fte fulltid') ?? DEFAULT_SETTINGS.baseCrew,
    hoursPerDay: valueBelowLabel(validation, 'normaltid') ?? DEFAULT_SETTINGS.hoursPerDay,
    absenceRate: valueBelowLabel(validation, 'fravær') ?? DEFAULT_SETTINGS.absenceRate,
    overheadRate: valueBelowLabel(sheets.get('variabler'), 'overhead') ?? DEFAULT_SETTINGS.overheadRate,
    calendarStart: dates[0],
    calendarEnd: dates.at(-1)!,
  }
}

export const readPlannerWorkbook = (bytes: Uint8Array, fileName: string): Workspace => {
  const sheets = readXlsx(bytes, SHEETS)
  const sheet = (name: string) => require(sheets.get(name), `Arbeidsboken mangler arket «${name}»`)
  const kalender = sheet('Kalender')
  const axis = readDateAxis(kalender)
  const notes = indexNotes(kalender)
  return {
    settings: readSettings(sheets, axis),
    venue: readVenue(sheet('tabell_venyou')),
    projects: readProjects(sheet('Prosjekt')),
    demand: readDemand(sheet('Tabell_oppgaver')),
    allocations: readAllocations(kalender, axis, notes),
    capacity: readCapacity(kalender, axis, notes),
    importedFrom: { fileName, importedAt: new Date().toISOString() },
  }
}
