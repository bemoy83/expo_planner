import type { AllocationRow, DemandLine } from './types'

/**
 * The Hall/Sted of a demand line is free text: «Hall C» from a stand number, or whatever was typed in Visma.
 * Only text that names a hall in the hall ledger (Haller), or that the planner has given a hall, counts as
 * that hall. Everything else is gathered
 * under one unresolved location, so odd names and misspellings do not each become a place in the Kalender,
 * while their hours still count.
 *
 * A hall letter with several halls in the ledger, as «B» with «B1» to «B4», is a place of its own: the shared
 * place «B», which stands for all of them. The planner's rule for the letter can send it to one of the halls
 * instead: «D» to «D1». The rules and the planner's choices for single texts are all in `hallAliases`, and
 * `placeOf` says which of them placed a text, so none of it is hidden.
 */

export const UNRESOLVED_HALL = 'Uavklart'

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

/** The shared places of the ledger. A letter that is a hall itself, or has one numbered hall, is none. */
export const sharedPlaces = (halls: string[]): SharedPlace[] => {
  const letters = [...new Set(halls.filter((hall) => /\d$/.test(hall.trim())).map((hall) => hall.trim().replace(/\d+$/, '')))]
  return letters
    .map((name) => ({ name, halls: numberedHalls(lower(name), halls).sort((a, b) => a.localeCompare(b, 'nb', { numeric: true })) }))
    .filter((place) => place.halls.length > 1 && !halls.some((hall) => lower(hall) === lower(place.name)))
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'))
}

/** Every place a line can count under: the halls of the ledger and its shared places. */
export const placeNames = (halls: string[]): string[] => [...halls, ...sharedPlaces(halls).map((place) => place.name)].sort((a, b) => a.localeCompare(b, 'nb', { numeric: true }))

/** The shared place a hall belongs to, in lower case, or nothing: «b» for «B2». What the Kalender gives the place its days by. */
export const sharedPlaceOf = (hall: string): string | undefined => (/\d$/.test(hall.trim()) ? lower(hall).replace(/\d+$/, '') : undefined)

/** The key of the planner's rule for a hall letter: the letter as a text of its own. */
export const ruleKey = (letter: string): string => lower(letter)

/** The place a choice stands for, the unresolved location, or nothing where the place is no longer in the ledger. */
const chosenPlace = (alias: string | undefined, halls: string[]): string | undefined => {
  const wanted = alias?.trim().toLowerCase()
  if (!wanted) return undefined
  return wanted === UNRESOLVED_HALL.toLowerCase() ? UNRESOLVED_HALL : placeNames(halls).find((place) => lower(place) === wanted)
}

/** How a text was read as a hall: it is the hall's name, or it is a hall letter, sent to a place by the planner's rule or to the letter's shared place. */
export interface Reading {
  hall: string
  by: 'text' | 'rule' | 'shared'
}

/**
 * The place in the ledger that the text names, and how it was found, or null. «Hall C» and «c» name the hall «C».
 * A hall letter names its numbered hall when there is only one, «Hall A» names «A1». With several, it names the
 * place the planner's rule for the letter gives, «D1» for «Hall D», else the shared place of the letter, «B».
 */
export const readHall = (text: string, halls: string[], aliases: Aliases = {}): Reading | null => {
  const wanted = clean(text)
  if (!wanted) return null
  const exact = halls.find((hall) => lower(hall) === wanted)
  if (exact) return { hall: exact, by: 'text' }
  const numbered = numberedHalls(wanted, halls)
  if (numbered.length === 1) return { hall: numbered[0], by: 'text' }
  if (!numbered.length) return null
  const ruled = chosenPlace(aliases[ruleKey(wanted)], halls)
  return ruled ? { hall: ruled, by: 'rule' } : { hall: sharedPlaces(halls).find((place) => lower(place.name) === wanted)?.name ?? numbered[0].trim().replace(/\d+$/, ''), by: 'shared' }
}

/** The place the text names, or null. See `readHall`. */
export const resolveHall = (text: string, halls: string[], aliases: Aliases = {}): string | null => readHall(text, halls, aliases)?.hall ?? null

/** A hall that is offered for a text. `own` says the offer rests on what the project has booked, and so holds for that project alone. */
export interface HallOffer {
  hall: string
  own: boolean
}

/**
 * A hall to offer for a text that is not placed by itself. First the one place named among its words, as «D1» in
 * «cafe hall D» and «E» in «Møterom hall E1». Else what the project has booked decides (`booked`): of several
 * places the text names, the first the project has booked; and for a text that names no hall at all, the hall of
 * a project that has booked one hall only. A hall that is not in the ledger, as «Hall F», is offered nothing.
 */
export const suggestHall = (text: string, halls: string[], aliases: Aliases = {}, booked: string[] = []): HallOffer | null => {
  if (!text.trim() || resolveHall(text, halls, aliases)) return null
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const named = new Set<string>()
  let hallWords = 0
  words.forEach((word, index) => {
    const afterHall = /^hall(en)?$/i.test(words[index - 1] ?? '')
    // A single letter is a hall where it is written as one: after «hall», or as a capital.
    if (word.length === 1 && !afterHall && word !== word.toUpperCase()) return
    // «E1» is a room in hall «E» where the ledger has no «E1».
    const found = resolveHall(word, halls, aliases) ?? (/\d$/.test(word) ? resolveHall(word.replace(/\d+$/, ''), halls, aliases) : null)
    if (found) named.add(found)
    if (found || afterHall) hallWords += 1
  })
  if (named.size === 1) return { hall: [...named][0], own: false }
  const shared = sharedPlaces(halls)
  const isBooked = (place: string) => booked.includes(place) || !!shared.find((s) => s.name === place)?.halls.some((hall) => booked.includes(hall))
  const own = [...named].filter(isBooked).sort((a, b) => a.localeCompare(b, 'nb'))
  if (own.length) return { hall: own[0], own: true }
  return !hallWords && booked.length === 1 && halls.includes(booked[0]) ? { hall: booked[0], own: true } : null
}

/** A Hall/Sted text as the key of the planner's choice for it: for every project, or for one. */
export const aliasKey = (text: string, projectNo?: string): string => (projectNo ? `${projectNo.trim().toLowerCase()}\t${text.trim().toLowerCase()}` : text.trim().toLowerCase())

/**
 * What placed a text: the planner's choice for the text in this project (`own`) or in every project (`choice`),
 * the text itself (`text`), the rule for its hall letter (`rule`), the letter's shared place (`shared`), or nothing (`none`).
 */
export type PlacedBy = 'own' | 'choice' | Reading['by'] | 'none'

export interface Place {
  hall: string
  by: PlacedBy
  /** Chosen by the planner for this text, and not read from it. */
  chosen: boolean
  /** The choice is for this project alone. */
  own: boolean
}

/**
 * Where a Hall/Sted text counts for a project: the place the planner chose for the text in that project, else the
 * place chosen for the text in every project, else the place the text names, else unresolved. A chosen place that
 * is no longer in the ledger does not count as chosen.
 */
export const placeOf = (text: string, halls: string[], aliases: Aliases = {}, projectNo?: string): Place => {
  const own = projectNo ? chosenPlace(aliases[aliasKey(text, projectNo)], halls) : undefined
  if (own) return { hall: own, by: 'own', chosen: true, own: true }
  // The choice for a letter by itself is its rule, and is told as one.
  const chosen = clean(text) === aliasKey(text) && numberedHalls(clean(text), halls).length > 1 ? undefined : chosenPlace(aliases[aliasKey(text)], halls)
  if (chosen) return { hall: chosen, by: 'choice', chosen: true, own: false }
  const read = readHall(text, halls, aliases)
  return { hall: read?.hall ?? UNRESOLVED_HALL, by: read?.by ?? 'none', chosen: false, own: false }
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
  const letters = new Set(sharedPlaces(halls).map((place) => ruleKey(place.name)))
  return Object.entries(aliases)
    .filter(([key]) => !letters.has(key))
    .map(([key, hall]): HallChoice => {
      const [first, second] = key.split('\t')
      return second === undefined ? { key, text: first, hall } : { key, text: second, projectNo: first, hall }
    })
    .sort((a, b) => a.text.localeCompare(b.text, 'nb') || (a.projectNo ?? '').localeCompare(b.projectNo ?? '', 'nb'))
}

/** The demand with each line placed in a hall from the ledger, or in the unresolved location. The lines themselves keep their text. */
export const locateDemand = (demand: DemandLine[], halls: string[], aliases: Aliases = {}): DemandLine[] => {
  const found = new Map<string, string>()
  return demand.map((line) => {
    const key = aliasKey(line.hall, line.projectNo || ' ')
    let hall = found.get(key)
    if (hall === undefined) {
      hall = placeOf(line.hall, halls, aliases, line.projectNo).hall
      found.set(key, hall)
    }
    return hall === line.hall ? line : { ...line, hall }
  })
}

/**
 * Planning rows placed the same way, so a row follows its demand when the hall it was made for is read
 * differently later. Rows for all halls are left as they are.
 */
export const locateRows = (rows: AllocationRow[], halls: string[], aliases: Aliases = {}): AllocationRow[] =>
  rows.map((row) => {
    if (row.hall === undefined) return row
    const { hall } = placeOf(row.hall, halls, aliases, row.projectNo)
    return hall === row.hall ? row : { ...row, hall }
  })
