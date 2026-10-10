import type { AllocationRow, DemandLine, HallRules } from './types'

/**
 * The Hall/Sted of a demand line is free text: «Hall C» from a stand number, or whatever was typed in Visma.
 * Only text that names a hall in the hall ledger (Haller), or that the planner has given a hall, counts as
 * that hall. Everything else is gathered
 * under one unresolved location, so odd names and misspellings do not each become a place in the Kalender,
 * while their hours still count.
 *
 * The planner makes places of his own, a name that stands for several halls, as «B» for «B1» to «B4», and rules for
 * words: a text that holds «scene» counts under «C» (`HallRules`). Until he has made any, the letters that several
 * numbered halls share are places, as examples for him to change. `placeOf` says what placed a text, so none of it is hidden,
 * and all of it is the planner's data: a new grouping or a new word for a place needs no change of the code.
 */

export const UNRESOLVED_HALL = 'Mangler hall'
/** What the unresolved location was called at first; a choice stored under that name is a choice of it. */
const UNRESOLVED_HALL_BEFORE = 'uavklart'

/**
 * The place of demand that is not shared out on halls: for the halls of its project together, as carpet ordered for
 * «Hall C, D, E» in one sum.
 * It is a place the planner or a rule gives a text, never what a text falls to by itself, and in the Kalender it has
 * the days of all the project's halls. Not the same as a planning row for all halls, which covers the demand of every place.
 */
export const PROJECT_HALLS = 'Ufordelt'
/** What the place was called at first; a choice stored under that name is a choice of the place. */
const PROJECT_HALLS_BEFORE = 'felles'

type Aliases = Record<string, string>

const clean = (text: string): string => text.trim().toLowerCase().replace(/^hall\s+/, '')
const lower = (hall: string): string => hall.trim().toLowerCase()

/**
 * A name as it is compared: how it is spelled does not tell names apart. Upper and lower case, «Hall» in front, and
 * spaces, hyphens and other signs are left out, so «Studio 3», «studio-3» and «STUDIO3» are one name.
 */
const spelled = (name: string): string => clean(name).replace(/[^\p{L}\p{N}]+/gu, '')

/** The one name of the list that the text is, however it is spelled; none where two of them are spelled alike. */
const named = (text: string, names: string[]): string | undefined => {
  const wanted = spelled(text)
  const found = wanted ? names.filter((name) => spelled(name) === wanted) : []
  return found.length === 1 ? found[0] : undefined
}

/** The numbered halls of a letter: «B1» to «B4» for «b». */
const numberedHalls = (letter: string, halls: string[]): string[] => halls.filter((hall) => /\d$/.test(hall.trim()) && lower(hall).replace(/\d+$/, '') === letter)

/** A place that stands for several halls of the ledger: «B» for «B1» to «B4». */
export interface SharedPlace {
  name: string
  halls: string[]
  /** What lands in one of its halls counts under the place: «B1» is «B». */
  collects?: boolean
}

/** The places a workspace starts with, as examples: a name that several numbered halls share, with those halls. */
export const examplePlaces = (halls: string[]): SharedPlace[] => {
  const letters = [...new Set(halls.filter((hall) => /\d$/.test(hall.trim())).map((hall) => hall.trim().replace(/\d+$/, '')))]
  return letters
    .map((name) => ({ name, halls: numberedHalls(lower(name), halls).sort((a, b) => a.localeCompare(b, 'nb', { numeric: true })) }))
    .filter((place) => place.halls.length > 1 && !halls.some((hall) => lower(hall) === lower(place.name)))
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'))
}

/**
 * The planner's rules as the Hallregler tab shows and edits them. The example places are put among his own once:
 * where he has no rules yet, and where his rules are from before the examples were his to change.
 */
export const hallRulesOf = (halls: string[], rules?: HallRules): HallRules => {
  if (rules?.seeded) return rules
  const own = rules?.places ?? []
  return { places: [...examplePlaces(halls).filter((example) => !own.some((place) => lower(place.name) === lower(example.name))), ...own], phrases: rules?.phrases ?? [], seeded: true }
}

/**
 * The choices a workspace starts with, as examples: a letter is its numbered hall where there is one such hall,
 * «A» is «A1». A choice for a text holds for it with «Hall» in front, so this places «Hall A».
 */
export const exampleChoices = (halls: string[]): Aliases => {
  const letters = [...new Set(halls.filter((hall) => /\d$/.test(hall.trim())).map((hall) => lower(hall).replace(/\d+$/, '')))]
  return Object.fromEntries(letters.filter((letter) => letter && numberedHalls(letter, halls).length === 1 && !halls.some((hall) => lower(hall) === letter)).map((letter) => [letter, numberedHalls(letter, halls)[0]]))
}

/**
 * The planner's rules and choices as the Hallregler tab shows and edits them: with the examples put in, the places
 * and the choices for letters, each once. What it writes back is his own from then on.
 */
export const hallSetupOf = (halls: string[], rules: HallRules | undefined, aliases: Aliases = {}): { rules: HallRules; aliases: Aliases } => ({
  rules: { ...hallRulesOf(halls, rules), lettersSeeded: true },
  aliases: rules?.lettersSeeded ? aliases : { ...exampleChoices(halls), ...aliases },
})

/**
 * The shared places: the planner's own, with the halls of them that are in the ledger, in his order. One without
 * such a hall, or named as a hall or as the halls of the project together, is none.
 */
export const sharedPlaces = (halls: string[], rules?: HallRules): SharedPlace[] =>
  hallRulesOf(halls, rules)
    .places.map((place) => ({ name: place.name.trim(), halls: halls.filter((hall) => place.halls.some((member) => lower(member) === lower(hall))), collects: place.collects !== false }))
    .filter((place) => place.name && place.halls.length > 0 && lower(place.name) !== lower(PROJECT_HALLS) && !halls.some((hall) => lower(hall) === lower(place.name)))

/**
 * Where what lands in a hall counts: under the first of the planner's places that collects the hall, «B» for «B1»,
 * else in the hall itself. So the halls of such a place are no places of their own.
 */
export const collectedIn = (hall: string, halls: string[], rules?: HallRules): string => sharedPlaces(halls, rules).find((place) => place.collects && place.halls.includes(hall))?.name ?? hall

/** Every place a line can count under: the halls of the ledger that no place collects, the shared places, and the halls of the project together. */
export const placeNames = (halls: string[], rules?: HallRules): string[] => {
  const places = sharedPlaces(halls, rules)
  const free = halls.filter((hall) => !places.some((place) => place.collects && place.halls.includes(hall)))
  return [...[...free, ...places.map((place) => place.name)].sort((a, b) => a.localeCompare(b, 'nb', { numeric: true })), PROJECT_HALLS]
}

/** The place a choice stands for, the unresolved location, or nothing where the place is no longer in the ledger. */
const chosenPlace = (alias: string | undefined, halls: string[], rules?: HallRules): string | undefined => {
  const wanted = alias?.trim().toLowerCase()
  if (!wanted) return undefined
  if (wanted === UNRESOLVED_HALL.toLowerCase() || wanted === UNRESOLVED_HALL_BEFORE) return UNRESOLVED_HALL
  if (wanted === PROJECT_HALLS_BEFORE) return PROJECT_HALLS
  // A choice of a hall that a place collects since is a choice of the place.
  const hall = halls.find((other) => lower(other) === wanted)
  return hall ? collectedIn(hall, halls, rules) : placeNames(halls, rules).find((place) => lower(place) === wanted)
}

/** How a text was read as a hall: it is the name of the hall or the place, or it holds the words of one of the planner's rules (`phrase`). */
export interface Reading {
  hall: string
  by: 'text' | 'phrase'
  /** The words of the rule that placed it. */
  phrase?: string
  /** The hall the text names, where it counts under the place that collects it. */
  via?: string
}

/**
 * The place that the text names, and how it was found, or null. «Hall C» and «c» name the hall «C», «Studio 3» the
 * hall «STUDIO3», and «Hall B» the planner's place «B»: the whole text is the name, however it is spelled (`spelled`).
 * A text that is none of this counts under the place of the first of the planner's rules whose words it holds.
 */
export const readHall = (text: string, halls: string[], rules?: HallRules): Reading | null => {
  const wanted = clean(text)
  if (!wanted) return null
  const exact = halls.find((hall) => lower(hall) === wanted) ?? named(text, halls) ?? named(text, sharedPlaces(halls, rules).map((place) => place.name))
  const hall = exact
  if (hall) {
    const place = halls.includes(hall) ? collectedIn(hall, halls, rules) : hall
    return place === hall ? { hall, by: 'text' } : { hall: place, by: 'text', via: hall }
  }
  const whole = text.trim().toLowerCase()
  for (const phrase of hallRulesOf(halls, rules).phrases) {
    const hall = phrase.text.trim() && whole.includes(phrase.text.trim().toLowerCase()) ? chosenPlace(phrase.hall, halls, rules) : undefined
    if (hall) return { hall, by: 'phrase', phrase: phrase.text.trim() }
  }
  return null
}

/** The place the text names, or null. See `readHall`. */
export const resolveHall = (text: string, halls: string[], rules?: HallRules): string | null => readHall(text, halls, rules)?.hall ?? null

/** A hall that is offered for a text. `own` says the offer rests on what the project has booked, and so holds for that project alone. */
export interface HallOffer {
  hall: string
  own: boolean
}

/**
 * A hall to offer for a text that is not placed by itself. First the one place named somewhere in it, in one word or
 * in several, by its name however it is spelled or by a choice the planner has made for those words: «D1» in «cafe hall D», «STUDIO3» in «Kafé ved Studio 3», and «E» in «Møterom
 * hall E1». A text that names several places, as «Hall C, D, E», is offered the halls of the project together: the
 * demand is one sum for them. For a text that names no hall at all, what the project has booked decides (`booked`):
 * the hall of a project that has booked one hall only, and so for that project alone. A hall that is not in the
 * ledger, as «Hall F», is offered nothing.
 */
export const suggestHall = (text: string, halls: string[], booked: string[] = [], rules?: HallRules, aliases: Aliases = {}): HallOffer | null => {
  // A line without a Hall/Sted names no hall: it is offered the hall of a project that has booked one only.
  if (!text.trim()) return booked.length === 1 && halls.includes(booked[0]) ? { hall: collectedIn(booked[0], halls, rules), own: true } : null
  if (resolveHall(text, halls, rules)) return null
  /** What some words of the text are placed as, were they a text of their own; not the unresolved location. */
  const placed = (words: string): string | null => {
    const { hall, by } = placeOf(words, halls, aliases, undefined, rules)
    return by === 'none' || hall === UNRESOLVED_HALL ? null : hall
  }
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const isHallWord = (word?: string) => /^hall(en)?$/i.test(word ?? '')
  const found = new Set<string>()
  let hallWords = 0
  for (let index = 0; index < words.length; ) {
    const afterHall = isHallWord(words[index - 1])
    // The longest run of words from here that is a name: «Studio 3» before «Studio».
    let taken = 0
    for (let length = Math.min(3, words.length - index); length >= 1 && !taken; length -= 1) {
      const run = words.slice(index, index + length)
      // A single letter is a hall where it is written as one: after «hall», or as a capital.
      if (length === 1 && run[0].length === 1 && !afterHall && run[0] !== run[0].toUpperCase()) continue
      // «E1» is a room in hall «E» where the ledger has no «E1», and a letter is offered its numbered hall where there is one such hall.
      const single = length === 1 ? numberedHalls(lower(run[0]), halls) : []
      const place = placed(run.join(' ')) ?? (length === 1 && /\d$/.test(run[0]) ? placed(run[0].replace(/\d+$/, '')) : null) ?? (single.length === 1 ? collectedIn(single[0], halls, rules) : null)
      if (!place) continue
      found.add(place)
      taken = length
    }
    if (taken || afterHall) hallWords += 1
    index += taken || 1
  }
  if (found.size === 1) return { hall: [...found][0], own: false }
  if (found.size > 1) return { hall: PROJECT_HALLS, own: false }
  return !hallWords && booked.length === 1 && halls.includes(booked[0]) ? { hall: collectedIn(booked[0], halls, rules), own: true } : null
}

/** A Hall/Sted text as the key of the planner's choice for it: for every project, or for one. */
export const aliasKey = (text: string, projectNo?: string): string => (projectNo ? `${projectNo.trim().toLowerCase()}\t${text.trim().toLowerCase()}` : text.trim().toLowerCase())

/**
 * What placed a text: the planner's choice for the text in this project (`own`) or in every project (`choice`),
 * the text itself (`text`), a rule for words it holds (`phrase`), or nothing (`none`).
 */
export type PlacedBy = 'own' | 'choice' | Reading['by'] | 'none'

export interface Place {
  hall: string
  by: PlacedBy
  /** Chosen by the planner for this text, and not read from it. */
  chosen: boolean
  /** The choice is for this project alone. */
  own: boolean
  /** The text the choice was made for, where it is not this one: «a» for «Hall A». */
  choiceFor?: string
  /** The words of the rule that placed it, where one did. */
  phrase?: string
  /** The hall the text names, where it counts under the place that collects it. */
  via?: string
}

/**
 * Where a Hall/Sted text counts for a project: the place the planner chose for the text in that project, else the
 * place chosen for the text in every project, else the place the text names, else unresolved. A chosen place that
 * is no longer in the ledger does not count as chosen.
 */
export const placeOf = (text: string, halls: string[], aliases: Aliases = {}, projectNo?: string, rules?: HallRules): Place => {
  const own = projectNo ? chosenPlace(aliases[aliasKey(text, projectNo)], halls, rules) : undefined
  if (own) return { hall: own, by: 'own', chosen: true, own: true }
  const chosen = chosenPlace(aliases[aliasKey(text)], halls, rules)
  if (chosen) return { hall: chosen, by: 'choice', chosen: true, own: false }
  // A choice for a text holds for it with «Hall» in front too: the choice for «D» places «Hall D». Until the planner
  // has made the example choices his own, a letter is its one numbered hall.
  const short = clean(text)
  const forShort = chosenPlace(aliases[short] ?? (rules?.lettersSeeded ? undefined : exampleChoices(halls)[short]), halls, rules)
  if (forShort) return { hall: forShort, by: 'choice', chosen: true, own: false, ...(short === aliasKey(text) ? {} : { choiceFor: short }) }
  const read = readHall(text, halls, rules)
  return { hall: read?.hall ?? UNRESOLVED_HALL, by: read?.by ?? 'none', chosen: false, own: false, ...(read?.phrase ? { phrase: read.phrase } : {}), ...(read?.via ? { via: read.via } : {}) }
}

/** The planner's choices with one text set to a place, or back to automatic: for every project, or for the one given. */
export const withAlias = (aliases: Aliases, text: string, hall: string | undefined, projectNo?: string): Aliases => {
  const next = { ...aliases }
  if (hall) next[aliasKey(text, projectNo)] = hall
  else delete next[aliasKey(text, projectNo)]
  return next
}

/** One of the planner's choices for a text, as the Hallregler tab lists it: for every project, or for one. */
export interface HallChoice {
  key: string
  text: string
  projectNo?: string
  hall: string
}

/** The planner's choices for texts: the texts in order, a choice for every project before those for one. */
export const hallChoices = (aliases: Aliases): HallChoice[] =>
  Object.entries(aliases)
    .map(([key, hall]): HallChoice => {
      const [first, second] = key.split('\t')
      return second === undefined ? { key, text: first, hall } : { key, text: second, projectNo: first, hall }
    })
    .sort((a, b) => a.text.localeCompare(b.text, 'nb') || (a.projectNo ?? '').localeCompare(b.projectNo ?? '', 'nb'))

/**
 * The rules with a place under another name, and what points at it with it: the word rules, and the choices for
 * texts (`aliases`). The same rules where the name is taken or empty.
 */
export const withPlaceRenamed = (halls: string[], rules: HallRules, aliases: Aliases, from: string, to: string): { rules: HallRules; aliases: Aliases } => {
  const name = to.trim()
  if (!name || (lower(name) !== lower(from) && [...halls, ...placeNames(halls, rules), UNRESOLVED_HALL].some((place) => lower(place) === lower(name)))) return { rules, aliases }
  const moved = (hall: string) => (lower(hall) === lower(from) ? name : hall)
  return {
    rules: { ...rules, places: rules.places.map((place) => (lower(place.name) === lower(from) ? { ...place, name } : place)), phrases: rules.phrases.map((phrase) => ({ ...phrase, hall: moved(phrase.hall) })) },
    aliases: Object.fromEntries(Object.entries(aliases).map(([key, hall]) => [key, moved(hall)])),
  }
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

export const NO_HALL_RULES: HallRules = { places: [], phrases: [], seeded: true }

/** The planner's rules and choices together: what the Hallregler tab holds, and what its file holds. */
export interface HallSetup {
  rules: HallRules
  aliases: Aliases
}

/** What a file would change in one of the three lists. */
export interface SetupDiff {
  added: number
  changed: number
  unchanged: number
  onlyInApp: number
}

const samePlace = (a: HallRules['places'][number], b: HallRules['places'][number]): boolean =>
  (a.collects !== false) === (b.collects !== false) && a.halls.length === b.halls.length && a.halls.every((hall) => b.halls.some((other) => lower(other) === lower(hall)))

/** The setup as a file has it: the planner's own from then on, with no examples put in. */
export const replaceHallSetup = (incoming: HallSetup): HallSetup => ({ rules: { places: incoming.rules.places, phrases: incoming.rules.phrases, seeded: true, lettersSeeded: true }, aliases: incoming.aliases })

/**
 * A file merged into the setup: the file wins for a place of the same name, a word rule for the same words and a
 * choice for the same text; what only the app has is kept. The file's word rules are tried before those only the app has.
 */
export const mergeHallSetup = (existing: HallSetup, incoming: HallSetup): HallSetup => {
  const filePlace = (name: string) => incoming.rules.places.find((place) => lower(place.name) === lower(name))
  const filePhrase = (text: string) => incoming.rules.phrases.some((phrase) => lower(phrase.text) === lower(text))
  return {
    rules: {
      places: [...existing.rules.places.map((place) => filePlace(place.name) ?? place), ...incoming.rules.places.filter((place) => !existing.rules.places.some((other) => lower(other.name) === lower(place.name)))],
      phrases: [...incoming.rules.phrases, ...existing.rules.phrases.filter((phrase) => !filePhrase(phrase.text))],
      seeded: true,
      lettersSeeded: true,
    },
    aliases: { ...existing.aliases, ...incoming.aliases },
  }
}

/** What a file would change: in the places, the word rules and the choices. */
export const diffHallSetup = (existing: HallSetup, incoming: HallSetup): { places: SetupDiff; phrases: SetupDiff; choices: SetupDiff } => {
  const diff = <T,>(app: T[], file: T[], key: (item: T) => string, same: (a: T, b: T) => boolean): SetupDiff => {
    const known = new Map(app.map((item) => [key(item), item]))
    const out = { added: 0, changed: 0, unchanged: 0, onlyInApp: 0 }
    for (const item of file) {
      const before = known.get(key(item))
      if (!before) out.added += 1
      else if (same(before, item)) out.unchanged += 1
      else out.changed += 1
    }
    const inFile = new Set(file.map(key))
    out.onlyInApp = app.filter((item) => !inFile.has(key(item))).length
    return out
  }
  return {
    places: diff(existing.rules.places, incoming.rules.places, (place) => lower(place.name), samePlace),
    phrases: diff(existing.rules.phrases, incoming.rules.phrases, (phrase) => lower(phrase.text), (a, b) => lower(a.hall) === lower(b.hall)),
    choices: diff(Object.entries(existing.aliases), Object.entries(incoming.aliases), ([key]) => key, (a, b) => lower(a[1]) === lower(b[1])),
  }
}
