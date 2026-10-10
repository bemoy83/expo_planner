import type { AllocationRow, DemandLine } from './types'

/**
 * The Hall/Sted of a demand line is free text: «Hall C» from a stand number, or whatever was typed in Visma.
 * Only text that names a hall in the hall ledger (Haller), or that the planner has given a hall, counts as
 * that hall. Everything else is gathered
 * under one unresolved location, so odd names and misspellings do not each become a place in the Kalender,
 * while their hours still count.
 */

export const UNRESOLVED_HALL = 'Uavklart'

const clean = (text: string): string => text.trim().toLowerCase().replace(/^hall\s+/, '')

/**
 * The hall in the ledger that the text names, or null. «Hall C» and «c» name the hall «C». A hall letter
 * also names a numbered hall when there is only one of them: «Hall D» names «D1», but «Hall B» does not
 * choose between «B1» and «B2».
 */
export const resolveHall = (text: string, halls: string[]): string | null => {
  const wanted = clean(text)
  if (!wanted) return null
  const exact = halls.find((hall) => hall.trim().toLowerCase() === wanted)
  if (exact) return exact
  const numbered = halls.filter((hall) => hall.trim().toLowerCase().replace(/\d+$/, '') === wanted)
  return numbered.length === 1 ? numbered[0] : null
}

/**
 * A hall to offer for a text that names none by itself: the one hall of the ledger named among its words, as «D1» in
 * «cafe hall D» and «E» in «Møterom hall E1». Where it names several, the one the project has booked (`booked`), if
 * that is one. A text without a hall in it, or with a hall that is not in the ledger, is offered nothing: the planner places it.
 */
export const suggestHall = (text: string, halls: string[], booked: string[] = []): string | null => {
  if (!text.trim() || resolveHall(text, halls)) return null
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const named = new Set<string>()
  words.forEach((word, index) => {
    // A single letter is a hall where it is written as one: after «hall», or as a capital.
    if (word.length === 1 && !/^hall(en)?$/i.test(words[index - 1] ?? '') && word !== word.toUpperCase()) return
    // «E1» is a room in hall «E» where the ledger has no «E1».
    const hall = resolveHall(word, halls) ?? (/\d$/.test(word) ? resolveHall(word.replace(/\d+$/, ''), halls) : null)
    if (hall) named.add(hall)
  })
  if (named.size === 1) return [...named][0]
  const own = [...named].filter((hall) => booked.includes(hall))
  return own.length === 1 ? own[0] : null
}

/** A Hall/Sted text as the key of the planner's choice for it. */
export const aliasKey = (text: string): string => text.trim().toLowerCase()

/**
 * Where a Hall/Sted text counts: the hall the planner chose for that text, else the hall the text names,
 * else unresolved. A chosen hall that is no longer in the ledger does not count as chosen.
 */
export const placeOf = (text: string, halls: string[], aliases: Record<string, string> = {}): { hall: string; chosen: boolean } => {
  const alias = aliases[aliasKey(text)]?.trim().toLowerCase()
  if (alias === UNRESOLVED_HALL.toLowerCase()) return { hall: UNRESOLVED_HALL, chosen: true }
  const chosen = alias ? halls.find((hall) => hall.trim().toLowerCase() === alias) : undefined
  return chosen ? { hall: chosen, chosen: true } : { hall: resolveHall(text, halls) ?? UNRESOLVED_HALL, chosen: false }
}

/** The planner's choices with one text set to a hall, or back to automatic. */
export const withAlias = (aliases: Record<string, string>, text: string, hall: string | undefined): Record<string, string> => {
  const next = { ...aliases }
  if (hall) next[aliasKey(text)] = hall
  else delete next[aliasKey(text)]
  return next
}

/** The demand with each line placed in a hall from the ledger, or in the unresolved location. The lines themselves keep their text. */
export const locateDemand = (demand: DemandLine[], halls: string[], aliases: Record<string, string> = {}): DemandLine[] => {
  const found = new Map<string, string>()
  return demand.map((line) => {
    let hall = found.get(line.hall)
    if (hall === undefined) {
      hall = placeOf(line.hall, halls, aliases).hall
      found.set(line.hall, hall)
    }
    return hall === line.hall ? line : { ...line, hall }
  })
}

/**
 * Planning rows placed the same way, so a row follows its demand when the hall it was made for is read
 * differently later. Rows for all halls are left as they are.
 */
export const locateRows = (rows: AllocationRow[], halls: string[], aliases: Record<string, string> = {}): AllocationRow[] =>
  rows.map((row) => {
    if (row.hall === undefined) return row
    const { hall } = placeOf(row.hall, halls, aliases)
    return hall === row.hall ? row : { ...row, hall }
  })
