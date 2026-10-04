import type { AllocationRow, DemandLine } from './types'

/**
 * The Hall/Sted of a demand line is free text: «Hall C» from a stand number, or whatever was typed in Visma.
 * Only text that names a hall in the hall ledger (Haller) counts as that hall. Everything else is gathered
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
 * Where a line counts: the hall the planner chose for it, else the hall its Hall/Sted names, else unresolved.
 * A chosen hall that is no longer in the ledger does not count as chosen.
 */
export const placeOf = (line: Pick<DemandLine, 'hall' | 'location'>, halls: string[]): { hall: string; chosen: boolean } => {
  const location = line.location?.trim().toLowerCase()
  if (location === UNRESOLVED_HALL.toLowerCase()) return { hall: UNRESOLVED_HALL, chosen: true }
  const chosen = location ? halls.find((hall) => hall.trim().toLowerCase() === location) : undefined
  return chosen ? { hall: chosen, chosen: true } : { hall: resolveHall(line.hall, halls) ?? UNRESOLVED_HALL, chosen: false }
}

/** The demand with each line placed in a hall from the ledger, or in the unresolved location. The lines themselves keep their text. */
export const locateDemand = (demand: DemandLine[], halls: string[]): DemandLine[] =>
  demand.map((line) => {
    const { hall } = placeOf(line, halls)
    return hall === line.hall ? line : { ...line, hall }
  })

/**
 * Planning rows placed the same way, so a row follows its demand when the hall it was made for is read
 * differently later. Rows for all halls are left as they are.
 */
export const locateRows = (rows: AllocationRow[], halls: string[]): AllocationRow[] =>
  rows.map((row) => {
    if (row.hall === undefined) return row
    const hall = resolveHall(row.hall, halls) ?? UNRESOLVED_HALL
    return hall === row.hall ? row : { ...row, hall }
  })
