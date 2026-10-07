import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadStaffingFixture, withStaffingFixture } from './staffingFixture'
import { readPlannerWorkbook } from '../import/plannerWorkbook'
import { dailyNeed } from './calc'
import {
  absenceSpans,
  addAbsence,
  clearSick,
  isSick,
  openUnresolved,
  markSick,
  removeCarried,
  assignmentStatus,
  buildBalance,
  carry,
  clearDays,
  clickBlock,
  dayBalance,
  defaultBrush,
  drawBlock,
  editableWindows,
  freeCapacity,
  freeEligibleHours,
  freeIntervals,
  invariantBreaches,
  mergeAdjacent,
  moveBlock,
  normalWindows,
  overtimeHours,
  paidHours,
  paintBlock,
  paintConflicts,
  paintDays,
  personWeek,
  recolourBlock,
  removeUnresolved,
  resizeBlock,
  splitBlock,
  uncoverable,
  unresolvedAssignments,
  weekTotals,
} from './staffing'
import { competenceKey, DEFAULT_SETTINGS, DEFAULT_WORKDAY as wd, type Assignment, type Unavailability, type Workspace } from './types'

/** `hh:mm` as minutes after midnight. */
const t = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3))
const iv = (from: string, to: string) => ({ start: t(from), end: t(to) })

const MON = '2026-10-12'
const TUE = '2026-10-13'
const WED = '2026-10-14'
const THU = '2026-10-15'
const FRI = '2026-10-16'
const SAT = '2026-10-17'
const SUN = '2026-10-18'
const WEEK = [MON, TUE, WED, THU, FRI, SAT, SUN]

const ANDERS = 'p1'
const GEIR = 'p7'
const HANNE = 'p8'
const MONA = 'p13'
const PER = 'p16'

const empty: Workspace = { settings: DEFAULT_SETTINGS, venue: [], projects: [], demand: [], allocations: [], capacity: [] }
/** The fixture week: 20 people, six competences, week 42 of 2026. */
let ws: Workspace
beforeAll(async () => {
  ws = withStaffingFixture(empty, await loadStaffingFixture())
})

let counter = 0
const id = () => `new-${counter++}`
const of = (list: Assignment[], personId: string, date: string) =>
  list
    .filter((a) => a.personId === personId && a.date === date)
    .sort((a, b) => a.start - b.start)
    .map((a) => ({ competence: a.competence, start: a.start, end: a.end }))
const withAssignments = (assignments: Assignment[]): Workspace => ({ ...ws, assignments })
const withAssignmentsOf = (base: Workspace, assignments: Assignment[]): Workspace => ({ ...base, assignments })
const sick = (personId: string, dates: string[]): Unavailability[] => dates.map((date) => ({ id: `sick-${personId}-${date}`, personId, date, kind: 'syk' }))

describe('hours and overtime', () => {
  it('D1 leaves the lunch break out of the paid hours', () => {
    expect(paidHours(iv('07:00', '15:00'), wd)).toBe(7.5)
    expect(paidHours(iv('07:00', '11:00'), wd)).toBe(4)
    expect(paidHours(iv('11:30', '15:00'), wd)).toBe(3.5)
    expect(paidHours(iv('10:00', '12:00'), wd)).toBe(1.5)
    expect(paidHours(iv('15:00', '18:00'), wd)).toBe(3)
  })

  it('D2 counts the hours outside the normal day, and all of a weekend, as overtime', () => {
    expect(overtimeHours(iv('13:00', '17:00'), 'arbeidsdag', wd)).toBe(2)
    expect(overtimeHours(iv('06:00', '08:00'), 'arbeidsdag', wd)).toBe(1)
    expect(overtimeHours(iv('08:00', '14:00'), 'arbeidsdag', wd)).toBe(0)
    // The lunch break is unpaid on a Saturday too, as in the mockup: 08:00–12:00 is 3,5 hours, where RULES.md's example says 4.
    expect(overtimeHours(iv('08:00', '12:00'), 'helg', wd)).toBe(3.5)
    expect(overtimeHours(iv('07:00', '11:00'), 'helg', wd)).toBe(4)
    expect(overtimeHours(iv('07:00', '11:00'), 'helligdag', wd)).toBe(4)
  })

  it('D3 has a default normal day of as many paid hours as an FTE-day', () => {
    expect(paidHours({ start: wd.dayStart, end: wd.dayEnd }, wd)).toBe(DEFAULT_SETTINGS.hoursPerDay)
  })
})

describe('availability', () => {
  it('D4 gives no time on a day of holiday', () => {
    for (const date of [WED, THU, FRI]) {
      expect(normalWindows(HANNE, date, ws.unavailability!, wd)).toEqual([])
      expect(editableWindows(HANNE, date, ws.unavailability!, wd)).toEqual([])
    }
    expect(normalWindows(HANNE, MON, ws.unavailability!, wd)).toEqual([iv('07:00', '15:00')])
  })

  it('D5 cuts the day of someone who leaves early, with no overtime around it', () => {
    expect(normalWindows(MONA, FRI, ws.unavailability!, wd)).toEqual([iv('07:00', '12:00')])
    expect(editableWindows(MONA, FRI, ws.unavailability!, wd)).toEqual([iv('07:00', '12:00')])
  })

  it('D6 has no normal time on a Saturday, but the whole day open for overtime', () => {
    expect(normalWindows(ANDERS, SAT, ws.unavailability!, wd)).toEqual([])
    expect(editableWindows(ANDERS, SAT, ws.unavailability!, wd)).toEqual([iv('06:00', '21:00')])
  })

  it('has no normal time on a holiday', () => {
    expect(normalWindows(ANDERS, '2026-12-25', [], wd)).toEqual([])
    expect(editableWindows(ANDERS, '2026-12-25', [], wd)).toEqual([iv('06:00', '21:00')])
  })

  it('finds the free stretches between assignments and drops slivers', () => {
    expect(freeIntervals([iv('07:00', '15:00')], [iv('08:00', '10:00'), iv('10:10', '12:00')], wd.snap)).toEqual([iv('07:00', '08:00'), iv('12:00', '15:00')])
  })
})

describe('painting', () => {
  const full = { span: 'full', mode: 'fill' } as const
  const half = { span: 'half', mode: 'fill' } as const

  it('D7 does nothing for a person without the competence', () => {
    expect(paintDays(ws, [{ personId: GEIR, date: MON }], 'teppefliser', full, id)).toBe(ws.assignments)
    expect(paintBlock(ws, { personId: GEIR, date: MON }, 'teppefliser')).toBe('ineligible')
  })

  it('D8 fills an empty day with one block, which counts 7,5 hours', () => {
    const before = dayBalance(ws, 'teppefliser', WED).assigned
    const painted = paintDays(ws, [{ personId: ANDERS, date: WED }], 'teppefliser', full, id)
    expect(of(painted, ANDERS, WED)).toEqual([{ competence: 'teppefliser', ...iv('07:00', '15:00') }])
    expect(dayBalance(withAssignments(painted), 'teppefliser', WED).assigned).toBe(before + 7.5)
  })

  it('D9 fills nothing on a day that is full, and replaces it when asked to', () => {
    const cell = { personId: PER, date: TUE }
    expect(of(ws.assignments!, PER, TUE)).toEqual([
      { competence: 'teppefliser', ...iv('07:00', '11:00') },
      { competence: 'foga', ...iv('11:30', '15:00') },
    ])
    expect(paintConflicts(ws, [cell], 'innredning')).toEqual([cell])
    expect(paintDays(ws, [cell], 'innredning', full, id)).toBe(ws.assignments)
    const replaced = paintDays(ws, [cell], 'innredning', { span: 'full', mode: 'replace' }, id)
    expect(of(replaced, PER, TUE)).toEqual([{ competence: 'innredning', ...iv('07:00', '15:00') }])
  })

  it('D10 paints the morning, then the afternoon, then nothing', () => {
    const cell = { personId: HANNE, date: MON }
    const first = paintDays(ws, [cell], 'teppefliser', half, id)
    expect(of(first, HANNE, MON)).toEqual([{ competence: 'teppefliser', ...iv('07:00', '11:00') }])
    const second = paintDays(withAssignments(first), [cell], 'teppefliser', half, id)
    expect(of(second, HANNE, MON)).toEqual([
      { competence: 'teppefliser', ...iv('07:00', '11:00') },
      { competence: 'teppefliser', ...iv('11:30', '15:00') },
    ])
    expect(paintDays(withAssignments(second), [cell], 'teppefliser', half, id)).toBe(second)
  })

  it('D11 never makes overtime: a Saturday is left alone', () => {
    expect(paintDays(ws, [{ personId: ANDERS, date: SAT }], 'teppefliser', full, id)).toBe(ws.assignments)
    expect(paintBlock(ws, { personId: ANDERS, date: SAT }, 'teppefliser')).toBe('unavailable')
  })

  it('D12 paints only the cells of a rectangle that can be painted', () => {
    // Anders has Teppefliser, Geir has not, Hanne is on holiday from Wednesday.
    const cells = [ANDERS, GEIR, HANNE].flatMap((personId) => [WED, THU, FRI, SAT].map((date) => ({ personId, date })))
    const painted = paintDays(ws, cells, 'teppefliser', full, id)
    const added = painted.filter((a) => !ws.assignments!.includes(a))
    expect(added.map((a) => `${a.personId} ${a.date}`).sort()).toEqual([`${ANDERS} ${WED}`, `${ANDERS} ${THU}`, `${ANDERS} ${FRI}`])
    expect(added.every((a) => a.start === t('07:00') && a.end === t('15:00'))).toBe(true)
    expect(painted.length).toBe(ws.assignments!.length + 3)
  })

  it('fills the rest of a day that already holds the same competence, without a question', () => {
    const cell = { personId: HANNE, date: MON }
    const morning = paintDays(ws, [cell], 'teppefliser', half, id)
    const base = withAssignments(morning)
    expect(paintConflicts(base, [cell], 'teppefliser')).toEqual([])
    expect(of(paintDays(base, [cell], 'teppefliser', full, id), HANNE, MON)).toEqual([{ competence: 'teppefliser', ...iv('07:00', '15:00') }])
  })

  it('paints only the time a person is there', () => {
    // Mona leaves at 12:00 on Friday.
    expect(of(paintDays(ws, [{ personId: MONA, date: FRI }], 'banner', full, id), MONA, FRI)).toEqual([{ competence: 'banner', ...iv('07:00', '12:00') }])
  })

  it('clears the days the eraser is drawn over', () => {
    const cleared = clearDays(ws.assignments!, [{ personId: PER, date: TUE }, { personId: PER, date: WED }])
    expect(cleared.filter((a) => a.personId === PER)).toEqual([])
    expect(clearDays(ws.assignments!, [{ personId: GEIR, date: MON }])).toBe(ws.assignments)
  })

  it('D14 joins two blocks of the same competence that touch, keeping the first id', () => {
    const blocks: Assignment[] = [
      { id: 'b', personId: ANDERS, date: THU, competence: 'teppefliser', ...iv('11:00', '13:00'), source: 'manual' },
      { id: 'a', personId: ANDERS, date: THU, competence: 'teppefliser', ...iv('07:00', '11:00'), source: 'manual' },
      { id: 'c', personId: ANDERS, date: THU, competence: 'foga', ...iv('13:00', '15:00'), source: 'manual' },
    ]
    expect(mergeAdjacent(blocks)).toEqual([
      { id: 'a', personId: ANDERS, date: THU, competence: 'teppefliser', ...iv('07:00', '13:00'), source: 'manual' },
      blocks[2],
    ])
    expect(mergeAdjacent([blocks[1], blocks[2]])).toHaveLength(2)
  })
})

describe('editing blocks', () => {
  const block = (list: Assignment[], personId: string, date: string, index = 0) => list.filter((a) => a.personId === personId && a.date === date).sort((a, b) => a.start - b.start)[index]

  it('resizes past 15:00 into overtime and stops at the next block', () => {
    const tep = block(ws.assignments!, ANDERS, MON)
    const longer = resizeBlock(ws, tep.id, 'end', t('17:00'))
    expect(of(longer, ANDERS, MON)).toEqual([{ competence: 'teppefliser', ...iv('07:00', '17:00') }])
    // Per on Tuesday: Teppefliser 07–11 cannot grow into FOGA at 11:30.
    const first = block(ws.assignments!, PER, TUE)
    expect(of(resizeBlock(ws, first.id, 'end', t('13:00')), PER, TUE)[0]).toEqual({ competence: 'teppefliser', ...iv('07:00', '11:30') })
  })

  it('keeps a block at least a quarter of an hour long and on the grid', () => {
    const tep = block(ws.assignments!, ANDERS, MON)
    expect(of(resizeBlock(ws, tep.id, 'end', t('06:00')), ANDERS, MON)).toEqual([{ competence: 'teppefliser', ...iv('07:00', '07:15') }])
    expect(of(resizeBlock(ws, tep.id, 'end', t('13:07')), ANDERS, MON)).toEqual([{ competence: 'teppefliser', ...iv('07:00', '13:00') }])
  })

  it('lets an edge near 07:00 or 15:00 land on it in the week editor', () => {
    const tep = block(ws.assignments!, ANDERS, MON)
    const longer = withAssignments(resizeBlock(ws, tep.id, 'end', t('17:00')))
    expect(of(resizeBlock(longer, tep.id, 'end', t('15:08'), { pullToDay: true }), ANDERS, MON)).toEqual([{ competence: 'teppefliser', ...iv('07:00', '15:00') }])
    expect(of(resizeBlock(longer, tep.id, 'end', t('15:08')), ANDERS, MON)).toEqual([{ competence: 'teppefliser', ...iv('07:00', '15:15') }])
  })

  it('moves a block with its length, between its neighbours and inside the day', () => {
    const morning = block(ws.assignments!, PER, WED)
    // Innredning 07–10 before Teppefliser 10–15: it can go earlier, not later.
    expect(of(moveBlock(ws, morning.id, t('12:00')), PER, WED)[0]).toEqual({ competence: 'innredning', ...iv('07:00', '10:00') })
    expect(of(moveBlock(ws, morning.id, t('05:00')), PER, WED)[0]).toEqual({ competence: 'innredning', ...iv('06:00', '09:00') })
    // In the row timeline a block stays inside the normal day.
    expect(moveBlock(ws, morning.id, t('05:00'), { bounds: iv('07:00', '15:00') })).toBe(ws.assignments)
  })

  it('splits a block only when both parts get half an hour, and leaves the parts apart', () => {
    const tep = block(ws.assignments!, ANDERS, MON)
    const parts = splitBlock(ws, tep.id, t('10:00'), id)
    expect(of(parts, ANDERS, MON)).toEqual([
      { competence: 'teppefliser', ...iv('07:00', '10:00') },
      { competence: 'teppefliser', ...iv('10:00', '15:00') },
    ])
    expect(splitBlock(ws, tep.id, t('07:15'), id)).toBe(ws.assignments)
    expect(splitBlock(ws, tep.id, t('14:45'), id)).toBe(ws.assignments)
    // Another edit of the day joins parts that still match.
    const second = block(parts, ANDERS, MON, 1)
    expect(of(resizeBlock(withAssignments(parts), second.id, 'end', t('14:00')), ANDERS, MON)).toEqual([{ competence: 'teppefliser', ...iv('07:00', '14:00') }])
  })

  it('recolours a block only to a competence its person has', () => {
    const tep = block(ws.assignments!, ANDERS, MON)
    expect(of(recolourBlock(ws, tep.id, 'foga'), ANDERS, MON)).toEqual([{ competence: 'foga', ...iv('07:00', '15:00') }])
    expect(recolourBlock(ws, tep.id, 'banner')).toBe(ws.assignments)
  })

  it('draws a dragged block inside the free stretch it started in', () => {
    // Per on Tuesday is free before 07:00, over lunch and after 15:00.
    const cell = { personId: PER, date: TUE }
    expect(of(drawBlock(ws, cell, 'foga', t('15:30'), t('22:00'), {}, id), PER, TUE)).toEqual([
      { competence: 'teppefliser', ...iv('07:00', '11:00') },
      { competence: 'foga', ...iv('11:30', '15:00') },
      { competence: 'foga', ...iv('15:30', '21:00') },
    ])
    // Drawn from 15:00 it joins the block before it.
    expect(of(drawBlock(ws, cell, 'foga', t('15:00'), t('16:00'), {}, id), PER, TUE)[1]).toEqual({ competence: 'foga', ...iv('11:30', '16:00') })
    expect(drawBlock(ws, cell, 'foga', t('08:00'), t('09:00'), {}, id)).toBe(ws.assignments)
    expect(drawBlock(ws, cell, 'banner', t('16:00'), t('18:00'), {}, id)).toBe(ws.assignments)
  })

  it('fills the free normal time on a click, and makes an hour of overtime outside it', () => {
    const cell = { personId: ANDERS, date: WED }
    expect(of(clickBlock(ws, cell, 'teppefliser', t('09:20'), {}, id), ANDERS, WED)).toEqual([{ competence: 'teppefliser', ...iv('07:00', '15:00') }])
    expect(of(clickBlock(ws, cell, 'teppefliser', t('17:40'), {}, id), ANDERS, WED)).toEqual([{ competence: 'teppefliser', ...iv('17:00', '18:00') }])
    expect(of(clickBlock(ws, { personId: ANDERS, date: SAT }, 'teppefliser', t('09:20'), {}, id), ANDERS, SAT)).toEqual([{ competence: 'teppefliser', ...iv('09:00', '10:00') }])
    // Hanne is on holiday on Wednesday.
    expect(clickBlock(ws, { personId: HANNE, date: WED }, 'teppefliser', t('09:00'), {}, id)).toBe(ws.assignments)
  })

  it('D13 leaves no overlapping, off-grid or too short blocks after any edit', () => {
    const cells = ws.persons!.flatMap((p) => WEEK.map((date) => ({ personId: p.id, date })))
    let state = ws
    const step = (assignments: Assignment[]) => {
      state = withAssignments(assignments)
      expect(invariantBreaches(state.assignments!, wd)).toEqual([])
    }
    step(paintDays(state, cells, 'extra', { span: 'half', mode: 'fill' }, id))
    step(paintDays(state, cells, 'foga', { span: 'full', mode: 'fill' }, id))
    step(paintDays(state, cells.slice(0, 40), 'innredning', { span: 'full', mode: 'replace' }, id))
    for (const a of state.assignments!.slice(0, 30)) {
      step(resizeBlock(state, a.id, 'end', a.end + 97, { pullToDay: true }))
      step(moveBlock(state, a.id, a.start - 133))
      step(splitBlock(state, a.id, a.start + 52, id))
      step(resizeBlock(state, a.id, 'start', a.start + 41))
    }
    for (const cell of cells.slice(0, 20)) {
      step(drawBlock(state, cell, 'extra', t('16:10'), t('19:50'), {}, id))
      step(clickBlock(state, cell, 'extra', t('06:20'), {}, id))
    }
    expect(invariantBreaches([{ id: 'x', personId: ANDERS, date: MON, competence: 'foga', start: 421, end: 425, source: 'manual' }], wd)).toHaveLength(2)
  })
})

describe('balance', () => {
  it('reads the demand from the Kalender: FTE × hours per day, per competence', () => {
    const row = (competence: string, fte: Record<string, number>) => ({ id: competence + Object.keys(fte)[0], order: 0, projectName: 'VVS 2026', projectNo: '26970', refYear: '2026', competence, phase: 'Montering' as const, basis: 'Planlagt', importedHours: null, fte, notes: {} })
    const small: Workspace = { ...empty, allocations: [row('FOGA', { [MON]: 2, [TUE]: 1 }), row(' foga', { [MON]: 0.5 }), row('Teppefliser', { [MON]: 3 }), row('', { [MON]: 9 })] }
    const balance = buildBalance(small, [MON, TUE])
    expect(balance.get('foga', MON).demand).toBe(18.75)
    expect(balance.get('foga', TUE).demand).toBe(7.5)
    expect(balance.get('teppefliser', MON).demand).toBe(22.5)
    expect(balance.get('teppefliser', TUE).demand).toBe(0)
    expect(balance.competences).toEqual(['foga', 'teppefliser'])
  })

  it('D15 has 7,5 hours of Teppefliser left on Monday', () => {
    expect(dayBalance(ws, 'teppefliser', MON)).toMatchObject({ demand: 37.5, assigned: 30, remaining: 7.5, covered: 30 })
  })

  it('D16 shows a surplus as negative remaining, and blocks nothing', () => {
    const cells = [HANNE, PER].map((personId) => ({ personId, date: MON }))
    const painted = paintDays(ws, cells, 'teppefliser', { span: 'full', mode: 'fill' }, id)
    expect(dayBalance(withAssignments(painted), 'teppefliser', MON)).toMatchObject({ assigned: 45, remaining: -7.5, covered: 37.5 })
  })

  it('D17 counts a block from 13:00 to 17:00 as four hours, two of them overtime', () => {
    const block: Assignment = { id: 'ot', personId: 'p5', date: TUE, competence: 'teppefliser', ...iv('13:00', '17:00'), source: 'manual' }
    const before = dayBalance(ws, 'teppefliser', TUE)
    const after = dayBalance(withAssignments([...ws.assignments!, block]), 'teppefliser', TUE)
    expect(after.assigned - before.assigned).toBe(4)
    expect(after.assignedOT - before.assignedOT).toBe(2)
  })

  it('D18 marks hours as uncoverable only when the people with the competence have too little free time', () => {
    // Monday: 7,5 left, and Hanne and Per are free.
    expect(freeEligibleHours(ws, 'teppefliser', MON)).toBe(15)
    expect(uncoverable(ws, 'teppefliser', MON)).toBe(0)
    // Tuesday: 26 left, and only Eirik and Hanne are free.
    expect(dayBalance(ws, 'teppefliser', TUE).remaining).toBe(26)
    expect(freeEligibleHours(ws, 'teppefliser', TUE)).toBe(15)
    expect(uncoverable(ws, 'teppefliser', TUE)).toBe(11)
    expect(uncoverable(ws, 'innredning', SAT)).toBe(0)
  })

  it('sums the free normal time, for all or for those with one competence', () => {
    expect(freeCapacity(ws, MON)).toEqual({ hours: 72, people: 10 })
    expect(freeCapacity(ws, TUE)).toEqual({ hours: 112.5, people: 15 })
    expect(freeCapacity(ws, MON, 'teppefliser')).toEqual({ hours: 15, people: 2 })
    expect(freeCapacity(ws, SAT)).toEqual({ hours: 0, people: 0 })
  })

  it('totals the week as the page header shows it', () => {
    const totals = weekTotals(ws, WEEK)
    expect(Math.round(totals.coveredShare! * 100)).toBe(19)
    expect(totals).toMatchObject({ remaining: 495, overtime: 0, weekendOpen: 37.5 })
    expect(weekTotals(empty, WEEK).coveredShare).toBeNull()
  })

  it('totals a person: normal hours against their normal time, and overtime', () => {
    expect(personWeek(ws, PER, WEEK)).toEqual({ normal: 15, capacity: 37.5, overtime: 0 })
    expect(personWeek(ws, HANNE, WEEK)).toEqual({ normal: 0, capacity: 15, overtime: 0 })
    const tep = ws.assignments!.find((a) => a.personId === ANDERS && a.date === MON)!
    expect(personWeek(withAssignments(resizeBlock(ws, tep.id, 'end', t('17:00'))), ANDERS, WEEK)).toEqual({ normal: 15, capacity: 37.5, overtime: 2 })
  })

  it('starts the brush on the competence with the most hours left that day', () => {
    // Tuesday: FOGA has 26,5 hours left, Teppefliser 26.
    expect(defaultBrush(ws, TUE)).toBe('foga')
    expect(defaultBrush(ws, MON)).toBe('extra')
    expect(defaultBrush(ws, SUN)).toBe('extra')
    expect(defaultBrush(empty, MON)).toBeNull()
  })
})

describe('sickness', () => {
  it('D19 gives the hours of a sick person back to the demand, with the blocks kept', () => {
    const ill: Workspace = { ...ws, unavailability: [...ws.unavailability!, ...sick(ANDERS, [MON, TUE, WED, THU, FRI])] }
    expect(unresolvedAssignments(ill).map((a) => `${a.personId} ${a.date}`)).toEqual([`${ANDERS} ${MON}`, `${ANDERS} ${TUE}`])
    expect(ill.assignments).toBe(ws.assignments)
    for (const date of [MON, TUE]) expect(dayBalance(ill, 'teppefliser', date).remaining).toBe(dayBalance(ws, 'teppefliser', date).remaining + 7.5)
  })

  it('D20 makes a block count again when the sickness is taken back', () => {
    const ill: Workspace = { ...ws, unavailability: [...ws.unavailability!, ...sick(ANDERS, [MON, TUE])] }
    const tuesday = ill.assignments!.find((a) => a.personId === ANDERS && a.date === TUE)!
    expect(assignmentStatus(tuesday, ill)).toBe('unresolved')
    const better: Workspace = { ...ill, unavailability: ill.unavailability!.filter((u) => !(u.personId === ANDERS && u.date === TUE)) }
    expect(assignmentStatus(tuesday, better)).toBe('ok')
    expect(better.assignments).toBe(ill.assignments)
  })

  it('D21 removes exactly the unresolved blocks', () => {
    const ill: Workspace = { ...ws, unavailability: [...ws.unavailability!, ...sick(ANDERS, [MON, TUE])] }
    const left = removeUnresolved(ill)
    expect(left).toHaveLength(ws.assignments!.length - 2)
    expect(left.some((a) => a.personId === ANDERS)).toBe(false)
    expect(removeUnresolved(ws)).toBe(ws.assignments)
  })

  it('keeps a block open only while hours of its competence remain that day', () => {
    // Anders sick on Monday: 15 hours of Teppefliser remain, so his block is open.
    const ill: Workspace = { ...ws, unavailability: [...ws.unavailability!, ...sick(ANDERS, [MON])] }
    expect(openUnresolved(ill).map((a) => a.personId)).toEqual([ANDERS])
    // Hanne covers half of it: still open.
    const half = withAssignmentsOf(ill, paintDays(ill, [{ personId: HANNE, date: MON }], 'teppefliser', { span: 'full', mode: 'fill' }, id))
    expect(dayBalance(half, 'teppefliser', MON).remaining).toBe(7.5)
    expect(openUnresolved(half)).toHaveLength(1)
    // Per covers the rest: the demand is met, so nothing is left to solve, though the block still does not count.
    const covered = withAssignmentsOf(half, paintDays(half, [{ personId: PER, date: MON }], 'teppefliser', { span: 'full', mode: 'fill' }, id))
    expect(dayBalance(covered, 'teppefliser', MON).remaining).toBe(0)
    expect(openUnresolved(covered)).toEqual([])
    expect(unresolvedAssignments(covered)).toHaveLength(1)
    expect(openUnresolved(ws)).toEqual([])
  })

  it('marks a block unresolved when it runs into a part of the day the person is away', () => {
    // Mona leaves at 12:00 on Friday.
    const late: Assignment = { id: 'late', personId: MONA, date: FRI, competence: 'banner', ...iv('11:30', '13:00'), source: 'manual' }
    const early: Assignment = { ...late, id: 'early', ...iv('07:00', '11:00') }
    const state = withAssignments([late, early])
    expect(assignmentStatus(late, state)).toBe('unresolved')
    expect(assignmentStatus(early, state)).toBe('ok')
  })

  it('marks the blocks of a person who lost the competence, or was made inactive, unresolved', () => {
    const tep = ws.assignments!.find((a) => a.personId === ANDERS && a.date === MON)!
    const without: Workspace = { ...ws, persons: ws.persons!.map((p) => (p.id === ANDERS ? { ...p, competences: ['foga'] } : p)) }
    const inactive: Workspace = { ...ws, persons: ws.persons!.map((p) => (p.id === ANDERS ? { ...p, active: false } : p)) }
    expect(assignmentStatus(tep, without)).toBe('unresolved')
    expect(assignmentStatus(tep, inactive)).toBe('unresolved')
  })
})

describe('absence', () => {
  it('marks a person sick on the workdays that are free of other absence, and takes it back', () => {
    // Hanne is on holiday from Wednesday; Saturday is no workday.
    const ill = markSick(ws.unavailability!, HANNE, [MON, TUE, WED, SAT], id)
    expect(ill.filter((u) => u.personId === HANNE && u.kind === 'syk').map((u) => u.date)).toEqual([MON, TUE])
    expect(isSick(ill, HANNE, MON)).toBe(true)
    expect(isSick(ill, HANNE, WED)).toBe(false)
    const better = clearSick(ill, HANNE, [TUE])
    expect(isSick(better, HANNE, TUE)).toBe(false)
    expect(isSick(better, HANNE, MON)).toBe(true)
    expect(clearSick(ws.unavailability!, HANNE, [MON])).toBe(ws.unavailability)
  })

  it('adds absence over a stretch of days, replacing what was there', () => {
    const away = addAbsence(ws.unavailability!, { personId: HANNE, from: TUE, to: THU, kind: 'kurs', note: 'Truck' }, id)
    const hers = away.filter((u) => u.personId === HANNE).sort((a, b) => a.date.localeCompare(b.date))
    expect(hers.map((u) => [u.date, u.kind])).toEqual([[TUE, 'kurs'], [WED, 'kurs'], [THU, 'kurs'], [FRI, 'ferie']])
    expect(away.filter((u) => u.personId !== HANNE)).toEqual(ws.unavailability!.filter((u) => u.personId !== HANNE))
    expect(addAbsence(ws.unavailability!, { personId: HANNE, from: THU, to: TUE, kind: 'kurs' }, id)).toBe(ws.unavailability)
  })

  it('adds a part of a day, which leaves the rest of the day open', () => {
    const away = addAbsence([], { personId: ANDERS, from: MON, to: MON, kind: 'annet', start: t('12:00'), end: t('15:00') }, id)
    expect(normalWindows(ANDERS, MON, away, wd)).toEqual([iv('07:00', '12:00')])
  })

  it('lists a person\'s absence as stretches of like days', () => {
    expect(absenceSpans(ws.unavailability!, HANNE)).toMatchObject([{ from: WED, to: FRI, kind: 'ferie', ids: ['u2', 'u3', 'u4'] }])
    const mixed = markSick(ws.unavailability!, HANNE, [MON], id)
    expect(absenceSpans(mixed, HANNE).map((s) => [s.from, s.to, s.kind])).toEqual([[MON, MON, 'syk'], [WED, FRI, 'ferie']])
  })
})

describe('carry', () => {
  it('takes carried hours back', () => {
    const moved = carry(ws, 'teppefliser', TUE, 3, id)
    expect(removeCarried(moved, 'teppefliser', WED)).toEqual([])
    expect(removeCarried(moved, 'foga', WED)).toBe(moved)
  })

  it('D22 adds the hours to the next day and leaves the day they came from', () => {
    const moved: Workspace = { ...ws, demandAdjustments: carry(ws, 'teppefliser', TUE, 3, id) }
    expect(moved.demandAdjustments).toMatchObject([{ competence: 'teppefliser', date: WED, hours: 3, reason: 'carry', fromDate: TUE }])
    expect(dayBalance(moved, 'teppefliser', WED)).toMatchObject({ demand: 25.5, carried: 3 })
    expect(dayBalance(moved, 'teppefliser', TUE).demand).toBe(52.5)
    expect(carry(ws, 'teppefliser', TUE, 0, id)).toBe(ws.demandAdjustments)
  })

  it('D23 puts hours carried from a Friday on the Saturday, as open weekend hours', () => {
    const moved: Workspace = { ...ws, demandAdjustments: carry(ws, 'foga', FRI, 4, id) }
    expect(dayBalance(moved, 'foga', SAT).demand).toBe(4)
    expect(weekTotals(moved, WEEK).weekendOpen).toBe(weekTotals(ws, WEEK).weekendOpen + 4)
  })
})

const WORKBOOK = 'example_data/Bemanning_Behov_24 måneder.xlsx'
const available = existsSync(WORKBOOK)

describe.skipIf(!available)('demand from the Kalender (local data)', () => {
  it('adds up, over the competences, to the planned daily need in hours', () => {
    const workspace = readPlannerWorkbook(new Uint8Array(readFileSync(WORKBOOK)), 'Bemanning_Behov_24 måneder.xlsx')
    const need = dailyNeed(workspace.allocations.filter((row) => competenceKey(row.competence)))
    const dates = [...need.keys()]
    const balance = buildBalance(workspace, dates)
    expect(dates.length).toBeGreaterThan(100)
    expect(balance.competences.length).toBeGreaterThan(1)
    for (const date of dates) {
      const hours = balance.competences.reduce((sum, competence) => sum + balance.get(competence, date).demand, 0)
      expect(hours).toBeCloseTo(need.get(date)! * workspace.settings.hoursPerDay, 6)
    }
  })
})
