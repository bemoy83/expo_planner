/** Calendar dates are plain `YYYY-MM-DD` strings; all arithmetic happens in UTC. */
export type ISODate = string

const DAY_MS = 86_400_000
// Excel's day 0 is 1899-12-30 once the 1900 leap-year bug is accounted for.
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)

const toUtc = (date: ISODate): number => {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

const fromUtc = (ms: number): ISODate => new Date(ms).toISOString().slice(0, 10)

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

/** The days of the week from Monday, and the months: every name of a day or a month the app writes is made from these. */
const WEEKDAY_NAMES = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag']
const MONTH_NAMES = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember']

/** The day of the week, «mandag». */
export const weekdayName = (date: ISODate): string => WEEKDAY_NAMES[weekdayIndex(date)]
/** The day of the week in three letters, «man». */
export const weekdayShort = (date: ISODate): string => weekdayName(date).slice(0, 3)
/** The month of a date, or of a month as «2026-10»: «oktober». */
export const monthName = (date: string): string => MONTH_NAMES[Number(date.slice(5, 7)) - 1]
/** The month in three letters, as in «5. okt». */
export const monthShort = (date: string): string => monthName(date).slice(0, 3)
/** A name at the start of a line: «Mandag». */
export const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** The day of the month as it is written, without a leading zero. */
export const dayOfMonth = (date: ISODate): number => Number(date.slice(8, 10))

/** A day without its year, «man 5. okt». */
export const dayText = (date: ISODate): string => `${weekdayShort(date)} ${dayOfMonth(date)}. ${monthShort(date)}`

/** Days from one to another: «21.–23. okt», «30. sep–2. okt», or «21. okt» for one day. */
export const periodText = (from: ISODate, to: ISODate): string =>
  from === to
    ? `${dayOfMonth(from)}. ${monthShort(from)}`
    : from.slice(0, 7) === to.slice(0, 7)
      ? `${dayOfMonth(from)}.–${dayOfMonth(to)}. ${monthShort(to)}`
      : `${dayOfMonth(from)}. ${monthShort(from)}–${dayOfMonth(to)}. ${monthShort(to)}`

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
