import type { AllocationRow, DemandLine, HallRules } from './types'

/**
 * The Hall/Sted of a demand line is free text: «Hall C» from a stand number, or whatever was typed in Visma.
 * Only text that names a hall in the hall ledger (Haller), or that the planner has given a hall, counts as
 * that hall. Everything else is gathered
 * under one unresolved location, so odd names and misspellings do not each become a place in the Kalender,
 * while their hours still count.
 *
 * A hall letter with several halls in the ledger, as «B» with «B1» to «B4», is a place of its own: the shared
 * place «B», which stands for all of them. The planner's rule for the letter can send it to one of the halls
 * instead: «D» to «D1». The planner also makes places of his own, a name for several halls, and rules for words:
 * a text that holds «scene» counts under «C» (`HallRules`). `placeOf` says what placed a text, so none of it is hidden,
 * and all of it is the planner's data: a new grouping or a new word for a place needs no change of the code.
 */

export const UNRESOLVED_HALL = 'Uavklart'

/**
 * The place of demand that is for the halls of its project together, as carpet ordered for «Hall C, D, E» in one sum.
 * It is a place the planner or a rule gives a text, never what a text falls to by itself, and in the Kalender it has
 * the days of all the project's halls. Not the same as a planning row for all halls, which covers the demand of every place.
 */
export const PROJECT_HALLS = 'Felles'

type Aliases = Record<string, string>

const clean = (text: string): string => text.trim().toLowerCase().replace(/^hall\s+/, '')
const lower = (hall: string): string => hall.trim().toLowerCase()

/** The numbered halls of a letter: «B1» to «B4» for «b». */
const numberedHalls = (letter: string, halls: string[]): string[] => halls.filter((hall) => /\d$/.test(hall.trim()) && lower(hall).replace(/\d+$/, '') === letter)

/** A hall letter that several halls of the ledger share, with those halls: the shared place «B» of «B1» to «B4». */
export interface SharedPlace {
  name: string
  halls: string[]
}

/** The places the planner has made, with the halls of them that are in the ledger. One without such a hall, or named as a hall, is none. */
const ownPlaces = (halls: string[], rules?: HallRules): SharedPlace[] =>
  (rules?.places ?? [])
    .map((place) => ({ name: place.name.trim(), halls: halls.filter((hall) => place.halls.some((member) => lower(member) === lower(hall))) }))
    .filter((place) => place.name && place.halls.length > 0 && lower(place.name) !== lower(PROJECT_HALLS) && !halls.some((hall) => lower(hall) === lower(place.name)))

/**
 * The shared places: those the ledger gives by itself, a letter with several numbered halls, and those the planner
 * has made. A letter that is a hall itself, or has one numbered hall, is none. The planner's place wins over one of the same name.
 */
export const sharedPlaces = (halls: string[], rules?: HallRules): SharedPlace[] => {
  const own = ownPlaces(halls, rules)
  return [...letterPlaces(halls).filter((place) => !own.some((other) => lower(other.name) === lower(place.name))), ...own].sort((a, b) => a.name.localeCompare(b.name, 'nb'))
}

const letterPlaces = (halls: string[]): SharedPlace[] => {
  const letters = [...new Set(halls.filter((hall) => /\d$/.test(hall.trim())).map((hall) => hall.trim().replace(/\d+$/, '')))]
  return letters
    .map((name) => ({ name, halls: numberedHalls(lower(name), halls).sort((a, b) => a.localeCompare(b, 'nb', { numeric: true })) }))
    .filter((place) => place.halls.length > 1 && !halls.some((hall) => lower(hall) === lower(place.name)))
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'))
}

/** Every place a line can count under: the halls of the ledger, the shared places, and the halls of the project together. */
export const placeNames = (halls: string[], rules?: HallRules): string[] => [...[...halls, ...sharedPlaces(halls, rules).map((place) => place.name)].sort((a, b) => a.localeCompare(b, 'nb', { numeric: true })), PROJECT_HALLS]

/** The key of the planner's rule for a hall letter: the letter as a text of its own. */
export const ruleKey = (letter: string): string => lower(letter)

/** The place a choice stands for, the unresolved location, or nothing where the place is no longer in the ledger. */
const chosenPlace = (alias: string | undefined, halls: string[], rules?: HallRules): string | undefined => {
  const wanted = alias?.trim().toLowerCase()
  if (!wanted) return undefined
  return wanted === UNRESOLVED_HALL.toLowerCase() ? UNRESOLVED_HALL : placeNames(halls, rules).find((place) => lower(place) === wanted)
}

/**
 * How a text was read as a hall: it is the name of the hall or the place, or it is a hall letter, sent to a place by the
 * planner's rule or to the letter's shared place, or it holds the words of one of the planner's rules (`phrase`).
 */
export interface Reading {
  hall: string
  by: 'text' | 'rule' | 'shared' | 'phrase'
  /** The words of the rule that placed it. */
  phrase?: string
}

/**
 * The place in the ledger that the text names, and how it was found, or null. «Hall C» and «c» name the hall «C».
 * A hall letter names its numbered hall when there is only one, «Hall A» names «A1». With several, it names the
 * place the planner's rule for the letter gives, «D1» for «Hall D», else the shared place of the letter, «B».
 * A text that is none of this counts under the place of the first of the planner's rules whose words it holds.
 */
export const readHall = (text: string, halls: string[], aliases: Aliases = {}, rules?: HallRules): Reading | null => {
  const wanted = clean(text)
  if (!wanted) return null
  const exact = halls.find((hall) => lower(hall) === wanted) ?? ownPlaces(halls, rules).find((place) => lower(place.name) === wanted)?.name
  if (exact) return { hall: exact, by: 'text' }
  const numbered = numberedHalls(wanted, halls)
  if (numbered.length === 1) return { hall: numbered[0], by: 'text' }
  if (numbered.length) {
    const ruled = chosenPlace(aliases[ruleKey(wanted)], halls, rules)
    return ruled ? { hall: ruled, by: 'rule' } : { hall: letterPlaces(halls).find((place) => lower(place.name) === wanted)?.name ?? numbered[0].trim().replace(/\d+$/, ''), by: 'shared' }
  }
  const whole = text.trim().toLowerCase()
  for (const phrase of rules?.phrases ?? []) {
    const hall = phrase.text.trim() && whole.includes(phrase.text.trim().toLowerCase()) ? chosenPlace(phrase.hall, halls, rules) : undefined
    if (hall) return { hall, by: 'phrase', phrase: phrase.text.trim() }
  }
  return null
}

/** The place the text names, or null. See `readHall`. */
export const resolveHall = (text: string, halls: string[], aliases: Aliases = {}, rules?: HallRules): string | null => readHall(text, halls, aliases, rules)?.hall ?? null

/** A hall that is offered for a text. `own` says the offer rests on what the project has booked, and so holds for that project alone. */
export interface HallOffer {
  hall: string
  own: boolean
}

/**
 * A hall to offer for a text that is not placed by itself. First the one place named among its words, as «D1» in
 * «cafe hall D» and «E» in «Møterom hall E1». A text that names several places, as «Hall C, D, E», is offered the
 * halls of the project together: the demand is one sum for them. For a text that names no hall at all, what the
 * project has booked decides (`booked`): the hall of a project that has booked one hall only, and so for that project
 * alone. A hall that is not in the ledger, as «Hall F», is offered nothing.
 */
export const suggestHall = (text: string, halls: string[], aliases: Aliases = {}, booked: string[] = [], rules?: HallRules): HallOffer | null => {
  if (!text.trim() || resolveHall(text, halls, aliases, rules)) return null
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const named = new Set<string>()
  let hallWords = 0
  words.forEach((word, index) => {
    const afterHall = /^hall(en)?$/i.test(words[index - 1] ?? '')
    // A single letter is a hall where it is written as one: after «hall», or as a capital.
    if (word.length === 1 && !afterHall && word !== word.toUpperCase()) return
    // «E1» is a room in hall «E» where the ledger has no «E1».
    const found = resolveHall(word, halls, aliases, rules) ?? (/\d$/.test(word) ? resolveHall(word.replace(/\d+$/, ''), halls, aliases, rules) : null)
    if (found) named.add(found)
    if (found || afterHall) hallWords += 1
  })
  if (named.size === 1) return { hall: [...named][0], own: false }
  if (named.size > 1) return { hall: PROJECT_HALLS, own: false }
  return !hallWords && booked.length === 1 && halls.includes(booked[0]) ? { hall: booked[0], own: true } : null
}

/** A Hall/Sted text as the key of the planner's choice for it: for every project, or for one. */
export const aliasKey = (text: string, projectNo?: string): string => (projectNo ? `${projectNo.trim().toLowerCase()}\t${text.trim().toLowerCase()}` : text.trim().toLowerCase())

/**
 * What placed a text: the planner's choice for the text in this project (`own`) or in every project (`choice`),
 * the text itself (`text`), the rule for its hall letter (`rule`), the letter's shared place (`shared`), a rule for
 * words it holds (`phrase`), or nothing (`none`).
 */
export type PlacedBy = 'own' | 'choice' | Reading['by'] | 'none'

export interface Place {
  hall: string
  by: PlacedBy
  /** Chosen by the planner for this text, and not read from it. */
  chosen: boolean
  /** The choice is for this project alone. */
  own: boolean
  /** The words of the rule that placed it, where one did. */
  phrase?: string
}

/**
 * Where a Hall/Sted text counts for a project: the place the planner chose for the text in that project, else the
 * place chosen for the text in every project, else the place the text names, else unresolved. A chosen place that
 * is no longer in the ledger does not count as chosen.
 */
export const placeOf = (text: string, halls: string[], aliases: Aliases = {}, projectNo?: string, rules?: HallRules): Place => {
  const own = projectNo ? chosenPlace(aliases[aliasKey(text, projectNo)], halls, rules) : undefined
  if (own) return { hall: own, by: 'own', chosen: true, own: true }
  // The choice for a letter by itself is its rule, and is told as one.
  const chosen = clean(text) === aliasKey(text) && numberedHalls(clean(text), halls).length > 1 ? undefined : chosenPlace(aliases[aliasKey(text)], halls, rules)
  if (chosen) return { hall: chosen, by: 'choice', chosen: true, own: false }
  const read = readHall(text, halls, aliases, rules)
  return { hall: read?.hall ?? UNRESOLVED_HALL, by: read?.by ?? 'none', chosen: false, own: false, ...(read?.phrase ? { phrase: read.phrase } : {}) }
}

/** The planner's choices with one text set to a place, or back to automatic: for every project, or for the one given. */
export const withAlias = (aliases: Aliases, text: string, hall: string | undefined, projectNo?: string): Aliases => {
  const next = { ...aliases }
  if (hall) next[aliasKey(text, projectNo)] = hall
  else delete next[aliasKey(text, projectNo)]
  return next
}

/** One of the planner's choices, as the rule table lists it: a rule for a hall letter, or a choice for a text in every project or in one. */
export interface HallChoice {
  key: string
  text: string
  projectNo?: string
  hall: string
}

/** The planner's choices for texts, without the rules for hall letters: the texts in order, a choice for every project before those for one. */
export const hallChoices = (aliases: Aliases, halls: string[]): HallChoice[] => {
  const letters = new Set(letterPlaces(halls).map((place) => ruleKey(place.name)))
  return Object.entries(aliases)
    .filter(([key]) => !letters.has(key))
    .map(([key, hall]): HallChoice => {
      const [first, second] = key.split('\t')
      return second === undefined ? { key, text: first, hall } : { key, text: second, projectNo: first, hall }
    })
    .sort((a, b) => a.text.localeCompare(b.text, 'nb') || (a.projectNo ?? '').localeCompare(b.projectNo ?? '', 'nb'))
}

/** The demand with each line placed in a hall from the ledger, or in the unresolved location. The lines themselves keep their text. */
export const locateDemand = (demand: DemandLine[], halls: string[], aliases: Aliases = {}, rules?: HallRules): DemandLine[] => {
  const found = new Map<string, string>()
  return demand.map((line) => {
    const key = aliasKey(line.hall, line.projectNo || ' ')
    let hall = found.get(key)
    if (hall === undefined) {
      hall = placeOf(line.hall, halls, aliases, line.projectNo, rules).hall
      found.set(key, hall)
    }
    return hall === line.hall ? line : { ...line, hall }
  })
}

/**
 * Planning rows placed the same way, so a row follows its demand when the hall it was made for is read
 * differently later. Rows for all halls are left as they are.
 */
export const locateRows = (rows: AllocationRow[], halls: string[], aliases: Aliases = {}, rules?: HallRules): AllocationRow[] =>
  rows.map((row) => {
    if (row.hall === undefined) return row
    const { hall } = placeOf(row.hall, halls, aliases, row.projectNo, rules)
    return hall === row.hall ? row : { ...row, hall }
  })

/** The rules for names that several halls share by themselves, as the letters: what `hallChoices` leaves out. */
export const letterRules = (halls: string[]): SharedPlace[] => letterPlaces(halls)

export const NO_HALL_RULES: HallRules = { places: [], phrases: [] }
