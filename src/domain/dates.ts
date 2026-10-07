/** Calendar dates are plain `YYYY-MM-DD` strings; all arithmetic happens in UTC. */
export type ISODate = string

const DAY_MS = 86_400_000
// Excel's day 0 is 1899-12-30 once the 1900 leap-year bug is accounted for.
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)

export const toUtc = (date: ISODate): number => {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export const fromUtc = (ms: number): ISODate => new Date(ms).toISOString().slice(0, 10)

/** The calendar date of a moment where the planner sits, not in UTC: just after midnight it is already the new day. */
export const localIso = (moment: Date): ISODate => `${moment.getFullYear()}-${String(moment.getMonth() + 1).padStart(2, '0')}-${String(moment.getDate()).padStart(2, '0')}`

export const todayIso = (): ISODate => localIso(new Date())

export const addDays = (date: ISODate, days: number): ISODate => fromUtc(toUtc(date) + days * DAY_MS)

export const daysBetween = (from: ISODate, to: ISODate): number => Math.round((toUtc(to) - toUtc(from)) / DAY_MS)

export const excelSerialToDate = (serial: number): ISODate => fromUtc(EXCEL_EPOCH_MS + Math.floor(serial) * DAY_MS)

export const dateRange = (start: ISODate, end: ISODate): ISODate[] => {
  const out: ISODate[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

/** 0 = Monday … 6 = Sunday. */
export const weekdayIndex = (date: ISODate): number => (new Date(toUtc(date)).getUTCDay() + 6) % 7

export const isWeekend = (date: ISODate): boolean => weekdayIndex(date) >= 5

export const isoWeek = (date: ISODate): number => {
  const ms = toUtc(date)
  const thursday = ms + (3 - weekdayIndex(date)) * DAY_MS
  const yearStart = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1)
  return Math.floor((thursday - yearStart) / DAY_MS / 7) + 1
}

export const WEEKDAYS_NB = ['MAN', 'TIR', 'ONS', 'TOR', 'FRE', 'LØR', 'SØN']
export const MONTHS_NB = ['JAN', 'FEB', 'MAR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DES']

/** The day of the month as it is written, without a leading zero. */
export const dayOfMonth = (date: ISODate): number => Number(date.slice(8, 10))
/** The month in lower case, as in «5. okt». */
export const monthShort = (date: ISODate): string => MONTHS_NB[Number(date.slice(5, 7)) - 1].toLowerCase()

/** Accepts the forms dates arrive in from ExcelJS: Date, Excel serial, or ISO-like text. */
export const normalizeDate = (value: unknown): ISODate | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  if (typeof value === 'number' && value > 0) return excelSerialToDate(value)
  if (typeof value === 'string') {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
    const nb = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value.trim())
    if (nb) return `${nb[3]}-${nb[2].padStart(2, '0')}-${nb[1].padStart(2, '0')}`
  }
  return null
}
