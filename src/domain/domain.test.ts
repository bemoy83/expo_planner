import { describe, expect, it } from 'vitest'
import { buildDemandIndex, capacityForDate, dailyNeed, planningSettings, referenceProjectNo, requiredHours, rowTotals } from './calc'
import { addDays, dateRange, dayOfMonth, excelSerialToDate, isoWeek, localIso, monthShort, normalizeDate, weekdayIndex } from './dates'
import { dayType, easterSunday, holidayName } from './holidays'
import { DEFAULT_SETTINGS, type AllocationRow, type CapacityLine, type DemandLine } from './types'

describe('dates', () => {
  it('takes today from the planner\'s own clock, also just after midnight', () => {
    expect(localIso(new Date(2026, 9, 7, 0, 30))).toBe('2026-10-07')
    expect(localIso(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01')
  })

  it('writes a day as «5. okt»', () => {
    expect(`${dayOfMonth('2026-10-05')}. ${monthShort('2026-10-05')}`).toBe('5. okt')
  })

  it('converts Excel serials', () => {
    expect(excelSerialToDate(46023)).toBe('2026-01-01')
    expect(excelSerialToDate(46747)).toBe('2027-12-26')
  })

  it('normalizes the date forms found in source files', () => {
    expect(normalizeDate(46028)).toBe('2026-01-06')
    expect(normalizeDate('2026-11-17')).toBe('2026-11-17')
    expect(normalizeDate('6.1.2026')).toBe('2026-01-06')
    expect(normalizeDate(new Date(Date.UTC(2026, 0, 6)))).toBe('2026-01-06')
    expect(normalizeDate('')).toBeNull()
  })

  it('does calendar arithmetic across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(dateRange('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])
    expect(weekdayIndex('2026-01-01')).toBe(3) // Thursday
    expect(isoWeek('2026-01-01')).toBe(1)
    expect(isoWeek('2027-01-01')).toBe(53)
  })
})

describe('holidays', () => {
  it('computes Easter', () => {
    expect(easterSunday(2026)).toBe('2026-04-05')
    expect(easterSunday(2027)).toBe('2027-03-28')
  })

  it('matches the workbook holiday list', () => {
    expect(holidayName('2026-04-02')).toBe('Skjærtorsdag')
    expect(holidayName('2026-05-14')).toBe('Kristi himmelfartsdag')
    expect(holidayName('2026-12-24')).toBe('Julaften')
    expect(holidayName('2027-05-17')).toBe('Grunnlovsdag / 2. pinsedag')
    expect(dayType('2026-01-01')).toBe('helligdag')
    expect(dayType('2026-01-03')).toBe('helg')
    expect(dayType('2026-01-05')).toBe('arbeidsdag')
  })
})

const demandLine = (overrides: Partial<DemandLine>): DemandLine => ({
  id: 'd',
  origin: 'manual',
  projectNo: '24970',
  projectName: '',
  source: '',
  workType: '',
  quantity: null,
  unit: '',
  stand: '',
  hall: '',
  competence: 'FOGA',
  basis: 'Historikk Antall',
  assemblyHours: 0,
  dismantleHours: 0,
  comment: '',
  ...overrides,
})

const row = (overrides: Partial<AllocationRow>): AllocationRow => ({
  id: 'r',
  order: 0,
  projectName: 'VVS 2026',
  projectNo: '26970',
  refYear: '2024',
  competence: 'FOGA',
  phase: 'Montering',
  basis: 'Historikk Antall',
  fte: {},
  notes: {},
  ...overrides,
})

describe('required hours', () => {
  const index = buildDemandIndex([
    demandLine({ assemblyHours: 10, dismantleHours: 4 }),
    demandLine({ assemblyHours: 5, dismantleHours: 1, competence: 'foga ' }),
    demandLine({ assemblyHours: 99, basis: 'Planlagt' }),
    demandLine({ projectNo: '26970', assemblyHours: 7 }),
  ])

  it('builds the reference project number from year and series', () => {
    expect(referenceProjectNo('26970', '2024')).toBe('24970')
    expect(referenceProjectNo('27045', '2025')).toBe('25045')
    expect(referenceProjectNo('', '2025')).toBe('')
  })

  it('sums the matching phase like SUMIFS, ignoring case', () => {
    expect(requiredHours(index, row({}))).toBe(15)
    expect(requiredHours(index, row({ phase: 'Demontering' }))).toBe(5)
    expect(requiredHours(index, row({ refYear: '2026' }))).toBe(7)
    expect(requiredHours(index, row({ basis: 'Ukjent' }))).toBe(0)
    expect(requiredHours(index, row({ phase: '' }))).toBeNull()
  })

  it('counts only the hall and department a row is for', () => {
    const split = buildDemandIndex([
      demandLine({ assemblyHours: 10, hall: 'Hall C', avdeling: '64' }),
      demandLine({ assemblyHours: 20, hall: 'Hall C', avdeling: '65' }),
      demandLine({ assemblyHours: 40, hall: 'Hall D', avdeling: '64' }),
      demandLine({ assemblyHours: 80, hall: '' }),
    ])
    expect(requiredHours(split, row({}))).toBe(150)
    expect(requiredHours(split, row({ hall: 'hall c' }))).toBe(30)
    expect(requiredHours(split, row({ avdeling: '64' }))).toBe(50)
    expect(requiredHours(split, row({ hall: 'Hall C', avdeling: '64' }))).toBe(10)
    expect(requiredHours(split, row({ hall: '', avdeling: '' }))).toBe(80)
    expect(requiredHours(split, row({ hall: 'Hall E' }))).toBe(0)
  })

  it('totals planned FTE against the requirement', () => {
    const totals = rowTotals(index, row({ fte: { '2026-10-01': 1, '2026-09-28': 1 } }), DEFAULT_SETTINGS)
    expect(totals.requiredFte).toBe(2)
    expect(totals.plannedFte).toBe(2)
    expect(totals.deltaFte).toBe(0)
    expect(totals.firstDate).toBe('2026-09-28')
    expect(totals.lastDate).toBe('2026-10-01')
  })
})

describe('capacity', () => {
  const lines: CapacityLine[] = [
    { id: 'a', label: 'Innleid (FTE)', group: 'added', values: { '2026-01-05': 3, '2026-01-03': 2 } },
    { id: 'o', label: 'Overtid faste', group: 'overtime', values: { '2026-01-05': 4 }, hours: { '2026-01-05': 3.75 } },
    { id: 'u', label: 'Admin (FTE)', group: 'unavailable', values: { '2026-01-05': 1.5 } },
  ]

  it('adds the base crew only on workdays', () => {
    expect(capacityForDate('2026-01-05', lines, DEFAULT_SETTINGS)).toEqual({ base: 21, added: 3, overtime: 2, unavailable: 1.5, available: 24.5 })
    expect(capacityForDate('2026-01-03', lines, DEFAULT_SETTINGS).available).toBe(2)
  })

  it('counts the active people on Personell as the base crew, once any are entered', () => {
    const person = (id: string, active: boolean) => ({ id, name: id, order: 0, active, competences: [] })
    expect(planningSettings({ settings: DEFAULT_SETTINGS })).toBe(DEFAULT_SETTINGS)
    expect(planningSettings({ settings: DEFAULT_SETTINGS, persons: [] }).baseCrew).toBe(21)
    const crew = planningSettings({ settings: DEFAULT_SETTINGS, persons: [person('a', true), person('b', true), person('c', false)] })
    expect(crew).toEqual({ ...DEFAULT_SETTINGS, baseCrew: 2 })
    expect(capacityForDate('2026-01-05', [], crew).available).toBe(2)
    expect(planningSettings({ settings: DEFAULT_SETTINGS, persons: [person('c', false)] }).baseCrew).toBe(0)
  })

  it('sums daily need across rows', () => {
    const need = dailyNeed([row({ fte: { '2026-01-05': 2 } }), row({ fte: { '2026-01-05': 1.5, '2026-01-06': 1 } })])
    expect(need.get('2026-01-05')).toBe(3.5)
    expect(need.get('2026-01-06')).toBe(1)
  })
})
