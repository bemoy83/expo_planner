import type { AllocationRow, DemandLine } from './types'

/**
 * The Hall/Sted of a demand line is free text: «Hall C» from a stand number, or whatever was typed in Visma.
 * Only text that names a hall in the hall ledger (Haller), or that the planner has given a hall, counts as
 * that hall. Everything else is gathered
 * under one unresolved location, so odd names and misspellings do not each become a place in the Kalender,
 * while their hours still count.
 *
 * The halls the line's project has booked say more than the text alone: «Hall B» is «B2» for the project that has
 * booked «B2» of the B halls. So a text is placed for a project, and the planner's choice for a text can be for
 * every project or for one.
 */

export const UNRESOLVED_HALL = 'Uavklart'

/** The halls each project has booked, by project number: what `hallsOfProjects` in `projects.ts` gives. */
export type BookedHalls = ReadonlyMap<string, string[]>

const NONE: string[] = []
const bookedBy = (booked: BookedHalls | undefined, projectNo: string | undefined): string[] => (projectNo && booked?.get(projectNo)) || NONE

const clean = (text: string): string => text.trim().toLowerCase().replace(/^hall\s+/, '')
const lower = (hall: string): string => hall.trim().toLowerCase()

/** The numbered halls of a letter: «B1» to «B4» for «b». */
const numberedHalls = (letter: string, halls: string[]): string[] => halls.filter((hall) => /\d$/.test(hall.trim()) && lower(hall).replace(/\d+$/, '') === letter)

/**
 * The hall in the ledger that the text names, or null. «Hall C» and «c» name the hall «C». A hall letter
 * also names a numbered hall when there is only one of them, or only one that the project has booked (`booked`):
 * «Hall D» names «D1», and «Hall B» names «B2» for a project that has booked «B2» alone of «B1» to «B4».
 */
export const resolveHall = (text: string, halls: string[], booked: string[] = NONE): string | null => {
  const wanted = clean(text)
  if (!wanted) return null
  const exact = halls.find((hall) => lower(hall) === wanted)
  if (exact) return exact
  const numbered = numberedHalls(wanted, halls)
  if (numbered.length === 1) return numbered[0]
  const own = numbered.filter((hall) => booked.includes(hall))
  return own.length === 1 ? own[0] : null
}

/** A hall that is offered for a text. `own` says the offer rests on what the project has booked, and so holds for that project alone. */
export interface HallOffer {
  hall: string
  own: boolean
}

/**
 * A hall to offer for a text that is not placed by itself. First the one hall of the ledger named among its words,
 * as «D1» in «cafe hall D» and «E» in «Møterom hall E1». Else what the project has booked decides: of several halls
 * the text names, or several halls of the letter it names, the first the project has booked; and for a text that
 * names no hall at all, the hall of a project that has booked one hall only. A hall that is not in the ledger,
 * as «Hall F», is offered nothing.
 */
export const suggestHall = (text: string, halls: string[], booked: string[] = NONE): HallOffer | null => {
  if (!text.trim() || resolveHall(text, halls, booked)) return null
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const named = new Set<string>()
  let hallWords = 0
  words.forEach((word, index) => {
    const afterHall = /^hall(en)?$/i.test(words[index - 1] ?? '')
    // A single letter is a hall where it is written as one: after «hall», or as a capital.
    if (word.length === 1 && !afterHall && word !== word.toUpperCase()) return
    // «E1» is a room in hall «E» where the ledger has no «E1».
    const letter = /\d$/.test(word) ? word.replace(/\d+$/, '') : word
    const found = resolveHall(word, halls) ?? (letter === word ? null : resolveHall(letter, halls))
    const among = found ? [found] : [...numberedHalls(lower(word), halls), ...(letter === word ? [] : numberedHalls(lower(letter), halls))]
    for (const hall of among) named.add(hall)
    if (among.length || afterHall) hallWords += 1
  })
  if (named.size === 1) return { hall: [...named][0], own: false }
  const own = [...named].filter((hall) => booked.includes(hall)).sort((a, b) => a.localeCompare(b, 'nb'))
  if (own.length) return { hall: own[0], own: true }
  return !hallWords && booked.length === 1 && halls.includes(booked[0]) ? { hall: booked[0], own: true } : null
}

/** A Hall/Sted text as the key of the planner's choice for it: for every project, or for one. */
export const aliasKey = (text: string, projectNo?: string): string => (projectNo ? `${projectNo.trim().toLowerCase()}\t${text.trim().toLowerCase()}` : text.trim().toLowerCase())

/** The hall of the ledger a choice stands for, the unresolved location, or nothing where the hall is no longer in the ledger. */
const chosenHall = (alias: string | undefined, halls: string[]): string | undefined => {
  const wanted = alias?.trim().toLowerCase()
  if (!wanted) return undefined
  return wanted === UNRESOLVED_HALL.toLowerCase() ? UNRESOLVED_HALL : halls.find((hall) => lower(hall) === wanted)
}

export interface Place {
  hall: string
  /** Chosen by the planner, and not read from the text. */
  chosen: boolean
  /** The choice is for this project alone. */
  own: boolean
}

/**
 * Where a Hall/Sted text counts for a project: the hall the planner chose for the text in that project, else the hall
 * chosen for the text in every project, else the hall the text names, else unresolved. A chosen hall that is no
 * longer in the ledger does not count as chosen.
 */
export const placeOf = (text: string, halls: string[], aliases: Record<string, string> = {}, projectNo?: string, booked?: BookedHalls): Place => {
  const own = projectNo ? chosenHall(aliases[aliasKey(text, projectNo)], halls) : undefined
  if (own) return { hall: own, chosen: true, own: true }
  const chosen = chosenHall(aliases[aliasKey(text)], halls)
  return chosen ? { hall: chosen, chosen: true, own: false } : { hall: resolveHall(text, halls, bookedBy(booked, projectNo)) ?? UNRESOLVED_HALL, chosen: false, own: false }
}

/** The planner's choices with one text set to a hall, or back to automatic: for every project, or for the one given. */
export const withAlias = (aliases: Record<string, string>, text: string, hall: string | undefined, projectNo?: string): Record<string, string> => {
  const next = { ...aliases }
  if (hall) next[aliasKey(text, projectNo)] = hall
  else delete next[aliasKey(text, projectNo)]
  return next
}

/** The demand with each line placed in a hall from the ledger, or in the unresolved location. The lines themselves keep their text. */
export const locateDemand = (demand: DemandLine[], halls: string[], aliases: Record<string, string> = {}, booked?: BookedHalls): DemandLine[] => {
  const found = new Map<string, string>()
  return demand.map((line) => {
    const key = aliasKey(line.hall, line.projectNo || ' ')
    let hall = found.get(key)
    if (hall === undefined) {
      hall = placeOf(line.hall, halls, aliases, line.projectNo, booked).hall
      found.set(key, hall)
    }
    return hall === line.hall ? line : { ...line, hall }
  })
}

/**
 * Planning rows placed the same way, so a row follows its demand when the hall it was made for is read
 * differently later. Rows for all halls are left as they are.
 */
export const locateRows = (rows: AllocationRow[], halls: string[], aliases: Record<string, string> = {}, booked?: BookedHalls): AllocationRow[] =>
  rows.map((row) => {
    if (row.hall === undefined) return row
    const { hall } = placeOf(row.hall, halls, aliases, row.projectNo, booked)
    return hall === row.hall ? row : { ...row, hall }
  })
