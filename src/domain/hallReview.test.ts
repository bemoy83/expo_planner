import { describe, expect, it } from 'vitest'
import { reviewPlacing } from './hallReview'
import { choiceKey, withChoice } from './locations'
import { PLANNED_BASIS, VISMA_BASIS, type HallRules } from './types'

const halls = ['A1', 'B1', 'B2', 'C', 'D1', 'E']
const rules: HallRules = { places: [{ name: 'B', halls: ['B1', 'B2'] }], phrases: [{ text: 'scene', hall: 'C' }, { text: 'øst', hall: 'E' }, { text: 'sceneteppe', hall: 'E' }], choices: { a: 'A1' } }
const line = (hall: string, projectNo = '26100', hours = 1, basis = VISMA_BASIS) => ({ hall, projectNo, basis, assemblyHours: hours, dismantleHours: 0 })
const booked = new Map([['26100', ['C', 'D1']], ['26200', ['E']]])

describe('going through where the demand is placed', () => {
  it('counts the lines each step of the rules places', () => {
    const chosen = withChoice(withChoice(rules, 'Lager', 'C', '26100'), 'Foajé', 'D1')
    const demand = [line('Lager'), line('Lager', '26200'), line('Foajé'), line('Hall A'), line('Hall C'), line('B2'), line('Scene øst'), line('Kantine')]
    expect(reviewPlacing(demand, halls, booked, chosen).steps).toEqual({ own: 1, choice: 2, text: 2, phrase: 1, none: 2 })
  })

  it('says which lines a choice places, also with «Hall» in front, so a choice no line uses is known', () => {
    const chosen = withChoice(withChoice(rules, 'Lager', 'C', '26100'), 'Foajé', 'D1')
    const { choices } = reviewPlacing([line('Lager'), line('lager '), line('Hall A'), line('a')], halls, booked, chosen)
    expect(choices.get(choiceKey('Lager', '26100'))).toBe(2)
    expect(choices.get('a')).toBe(2)
    expect(choices.get(choiceKey('Foajé'))).toBeUndefined()
  })

  it('says what each rule for words places, and which hold a text that an earlier rule took', () => {
    const { phrases } = reviewPlacing([line('Scene øst'), line('Sceneteppe'), line('Inng øst'), line('scene øst')], halls, booked, rules)
    expect(phrases).toEqual([
      { lines: 3, texts: ['Scene øst', 'Sceneteppe', 'scene øst'], matches: 3 },
      { lines: 1, texts: ['Inng øst'], matches: 3 },
      // Shadowed: every text with «sceneteppe» holds «scene» too.
      { lines: 0, texts: [], matches: 1 },
    ])
  })

  it('gathers the lines no rule places by their text, those with most hours first', () => {
    const demand = [line('Kantine', '26100', 2), line(' kantine', '26200', 3, PLANNED_BASIS), line('Garderobe', '26100', 8), line('Hall C')]
    expect(reviewPlacing(demand, halls, new Map(), rules).unplaced).toEqual([
      { key: 'garderobe', text: 'Garderobe', projectNos: ['26100'], lines: 1, hours: 8, plannedHours: 0, offers: [] },
      { key: 'kantine', text: 'Kantine', projectNos: ['26100', '26200'], lines: 2, hours: 5, plannedHours: 3, offers: [] },
    ])
  })

  it('leaves out a text the planner has chosen to keep without a hall', () => {
    expect(reviewPlacing([line('Kantine')], halls, booked, withChoice(rules, 'Kantine', 'Mangler hall')).unplaced).toEqual([])
  })

  it('offers a place the text names for every project, and the only hall of a project for that project alone', () => {
    const { unplaced } = reviewPlacing([line('Kafé hall D', '26100'), line('Kafé hall D', '26200'), line('Kantine', '26100'), line('Kantine', '26200')], halls, booked, rules)
    expect(unplaced.find((found) => found.text === 'Kafé hall D')?.offers).toEqual([{ hall: 'D1' }])
    expect(unplaced.find((found) => found.text === 'Kantine')?.offers).toEqual([{ hall: 'E', projectNo: '26200' }])
  })

  it('keeps the lines without a text apart per project, each with the offer of its project', () => {
    const { unplaced } = reviewPlacing([line('', '26100'), line(' ', '26200'), line('', '26200')], halls, booked, rules)
    expect(unplaced.map(({ key, projectNos, lines, offers }) => ({ key, projectNos, lines, offers }))).toEqual([
      { key: choiceKey('', '26200'), projectNos: ['26200'], lines: 2, offers: [{ hall: 'E', projectNo: '26200' }] },
      { key: choiceKey('', '26100'), projectNos: ['26100'], lines: 1, offers: [] },
    ])
  })
})
