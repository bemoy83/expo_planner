import { addDays, isWeekend, type ISODate } from './dates'

/** Gregorian Easter Sunday (Meeus/Jones/Butcher). */
export const easterSunday = (year: number): ISODate => {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Days off as listed in the planner workbook: public holidays plus Christmas Eve. */
export const holidaysForYear = (year: number): Map<ISODate, string> => {
  const easter = easterSunday(year)
  const entries: [ISODate, string][] = [
    [`${year}-01-01`, '1. nyttårsdag'],
    [addDays(easter, -7), 'Palmesøndag'],
    [addDays(easter, -3), 'Skjærtorsdag'],
    [addDays(easter, -2), 'Langfredag'],
    [addDays(easter, -1), 'Påskeaften'],
    [easter, '1. påskedag'],
    [addDays(easter, 1), '2. påskedag'],
    [`${year}-05-01`, 'Arbeidernes dag'],
    [`${year}-05-17`, 'Grunnlovsdag'],
    [addDays(easter, 39), 'Kristi himmelfartsdag'],
    [addDays(easter, 49), '1. pinsedag'],
    [addDays(easter, 50), '2. pinsedag'],
    [`${year}-12-24`, 'Julaften'],
    [`${year}-12-25`, '1. juledag'],
    [`${year}-12-26`, '2. juledag'],
  ]
  const map = new Map<ISODate, string>()
  for (const [date, name] of entries) map.set(date, map.has(date) ? `${map.get(date)} / ${name}` : name)
  return map
}

export type DayType = 'arbeidsdag' | 'helg' | 'helligdag'

const cache = new Map<number, Map<ISODate, string>>()
export const holidayName = (date: ISODate): string | undefined => {
  const year = Number(date.slice(0, 4))
  if (!cache.has(year)) cache.set(year, holidaysForYear(year))
  return cache.get(year)!.get(date)
}

export const dayType = (date: ISODate): DayType =>
  holidayName(date) ? 'helligdag' : isWeekend(date) ? 'helg' : 'arbeidsdag'
