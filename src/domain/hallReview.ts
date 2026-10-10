import { choiceKey, placeOf, suggestHall, type Place, type PlacedBy } from './locations'
import { PLANNED_BASIS, type DemandLine, type HallRules } from './types'

/** Going through where the demand is placed: what each step of the rules places, what each rule is used for, and the texts that are left. */

/** The order the rules are tried in: the first that places a text is the one that counts. */
export const PLACE_STEPS: PlacedBy[] = ['own', 'choice', 'text', 'phrase', 'none']

/** A place a text is offered: for every project, or for the one given, where the offer rests on what that project has booked. */
export interface TextOffer {
  hall: string
  projectNo?: string
}

/** A Hall/Sted text that no rule places, with the lines that carry it. A line without a text is one of these per project: an empty text says nothing that holds for others. */
export interface UnplacedText {
  /** The key of a choice for the text: for every project, or for the one project of a text that is empty. */
  key: string
  text: string
  projectNos: string[]
  lines: number
  /** Hours of the lines, montering and demontering together. */
  hours: number
  /** Of those, the hours that are in the plan. */
  plannedHours: number
  /** What taking the offer writes: one choice for every project, or one for each project that has an offer of its own. */
  offers: TextOffer[]
}

/** What one of the rules for words is used for. */
export interface PhraseUse {
  /** The lines it places. */
  lines: number
  /** The texts of those lines. */
  texts: string[]
  /** The lines whose text holds its words, whoever placed them: with no lines of its own, the rule is shadowed by what is tried before it. */
  matches: number
}

export interface HallReview {
  /** Lines per step of `PLACE_STEPS`. */
  steps: Record<PlacedBy, number>
  /** The texts no rule places, those with most hours first. */
  unplaced: UnplacedText[]
  /** Lines placed by each choice, by the key of the choice. A choice for «a» is used by «Hall A». */
  choices: Map<string, number>
  /** The rules for words, in their order. */
  phrases: PhraseUse[]
}

/** The demand as the rules place it. `booked` is the halls each project has booked, which an offer may rest on. */
export const reviewPlacing = (demand: Pick<DemandLine, 'hall' | 'projectNo' | 'basis' | 'assemblyHours' | 'dismantleHours'>[], halls: string[], booked: Map<string, string[]>, rules?: HallRules): HallReview => {
  const steps: Record<PlacedBy, number> = { own: 0, choice: 0, text: 0, phrase: 0, none: 0 }
  const choices = new Map<string, number>()
  const words = (rules?.phrases ?? []).map((phrase) => phrase.text.trim().toLowerCase())
  const phrases: PhraseUse[] = words.map(() => ({ lines: 0, texts: [], matches: 0 }))
  const placed = new Map<string, Place>()
  const unplaced = new Map<string, UnplacedText>()
  for (const line of demand) {
    const pair = choiceKey(line.hall, line.projectNo || ' ')
    const place = placed.get(pair) ?? placeOf(line.hall, halls, rules, line.projectNo)
    placed.set(pair, place)
    steps[place.by] += 1
    const text = line.hall.trim()
    words.forEach((word, index) => {
      if (word && text.toLowerCase().includes(word)) phrases[index].matches += 1
    })
    if (place.by === 'own' || place.by === 'choice') {
      const key = place.by === 'own' ? choiceKey(line.hall, line.projectNo) : (place.choiceFor ?? choiceKey(line.hall))
      choices.set(key, (choices.get(key) ?? 0) + 1)
    } else if (place.by === 'phrase' && place.rule !== undefined) {
      const use = phrases[place.rule]
      use.lines += 1
      if (!use.texts.includes(text)) use.texts.push(text)
    } else if (place.by === 'none') {
      const key = text ? choiceKey(text) : choiceKey('', line.projectNo)
      const found = unplaced.get(key) ?? { key, text, projectNos: [], lines: 0, hours: 0, plannedHours: 0, offers: [] }
      const hours = line.assemblyHours + line.dismantleHours
      if (!found.projectNos.includes(line.projectNo)) found.projectNos.push(line.projectNo)
      found.lines += 1
      found.hours += hours
      if (line.basis === PLANNED_BASIS) found.plannedHours += hours
      unplaced.set(key, found)
    }
  }
  for (const found of unplaced.values()) {
    const offered = found.projectNos.flatMap((projectNo) => {
      const offer = suggestHall(found.text, halls, booked.get(projectNo), rules)
      return offer ? [{ hall: offer.hall, ...(offer.own ? { projectNo } : {}) }] : []
    })
    // An offer read from the text is the same for every project, and is one choice.
    found.offers = offered.find((offer) => !offer.projectNo) ? [offered.find((offer) => !offer.projectNo)!] : offered
  }
  return { steps, unplaced: [...unplaced.values()].sort((a, b) => b.hours - a.hours || a.text.localeCompare(b.text, 'nb')), choices, phrases }
}
