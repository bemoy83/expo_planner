import { useMemo } from 'react'
import { placeNames, placeOf, type HallOffer, PROJECT_HALLS, sharedPlaces, suggestHall, UNRESOLVED_HALL } from '../../domain/locations'
import { hallsOfProjects } from '../../domain/projects'
import { hallNames } from '../../domain/venue'
import { useWorkspace } from '../../store/workspaceStore'
import { SplitPick } from './SplitPick'

type Placed = { hall: string; projectNo: string }

/** The last choice in the list of a line placed by the planner: it is then placed by the rules again. */
const CLEAR_CHOICE = 'Fjern valget, bruk reglene'

/** Where the demand lines of Behov count in the Kalender, why, and the cell to change it in: the same for Visma lines and the planner's own. */
export function usePlacing() {
  const { workspace, setHallChoice } = useWorkspace()
  const ws = workspace!
  // The Kalender places demand in the halls of the hall ledger; show where each line's Hall/Sted ends up.
  const halls = useMemo(() => hallNames(ws.venue), [ws.venue])
  const booked = useMemo(() => hallsOfProjects(ws.venue, ws.projects), [ws.venue, ws.projects])
  const rules = ws.hallRules
  const places = useMemo(() => placeNames(halls, rules), [halls, rules])
  const shared = useMemo(() => new Map(sharedPlaces(halls, rules).map((place) => [place.name, place.halls])), [halls, rules])
  const placeOfLine = (line: Placed) => placeOf(line.hall, halls, rules, line.projectNo)
  const offerFor = (line: Placed) => (placeOfLine(line).by === 'none' ? suggestHall(line.hall, halls, booked.get(line.projectNo), rules) : null)
  /** Why a line that is not placed is offered the hall it is, in a few words: an offer is explained where it is made. */
  const offerReason = (offered: HallOffer): string =>
    offered.own ? `prosjektet har bare ${offered.hall}` : offered.hall === PROJECT_HALLS ? 'teksten nevner flere haller' : `teksten nevner ${offered.hall}`
  /** Why the line counts where it does: the rule that placed it, in a few words. For a line that is not placed, why it is offered what it is. */
  const ruleOf = (line: Placed): string => {
    const place = placeOfLine(line)
    if (place.by === 'own') return 'Valgt for prosjektet'
    const offered = offerFor(line)
    if (offered) return `Forslag: ${offerReason(offered)}`
    if (!line.hall.trim()) return 'Ingen Hall/sted'
    if (place.by === 'choice') return place.choiceFor ? `Valgt: ${place.choiceFor.toUpperCase()} er ${place.hall}` : 'Valgt for teksten'
    if (place.by === 'phrase') return `Regel: inneholder «${place.phrase}»`
    if (place.via) return `Sted: ${place.hall} samler ${place.via}`
    if (place.by === 'text' && shared.has(place.hall)) return `Sted: ${place.hall} står for ${shared.get(place.hall)!.join(', ')}`
    if (place.by === 'text') return 'Lest fra teksten'
    return 'Ingen regel'
  }
  /** The places offered in the list of a project's line: the halls it has booked first, then the rest. */
  const optionsFor = (projectNo: string): string[] => {
    const own = new Set((booked.get(projectNo) ?? []).map((hall) => hall.toLowerCase()))
    const isOwn = (place: string) => own.has(place.toLowerCase()) || (shared.get(place) ?? []).some((hall) => own.has(hall.toLowerCase()))
    return [...places.filter(isOwn), ...places.filter((place) => !isOwn(place))]
  }
  const noteFor = (projectNo: string) => {
    const own = new Set((booked.get(projectNo) ?? []).map((hall) => hall.toLowerCase()))
    return (option: string) =>
      option === CLEAR_CHOICE
        ? ''
        : option === PROJECT_HALLS
          ? 'flere haller under ett'
          : shared.has(option)
            ? shared.get(option)!.join(', ')
            : own.has(option.toLowerCase())
              ? 'booket'
              : ''
  }
  /**
   * The hall a line counts under in the Kalender: quiet text once it is placed, the offer one click away where there is one,
   * else a chip to pick from the list. The planner's choice is for the Hall/Sted text in every project, unless the text has a
   * choice for this project alone, or no text: then it is for this project.
   */
  const locationCell = (line: Placed) => {
    const text = line.hall
    const place = placeOfLine(line)
    // A line placed by the choice for its text without «Hall» has no choice of its own to show or to remove.
    const pinned = place.chosen && !place.choiceFor
    const offered = offerFor(line)
    // A line without a Hall/Sted can only be placed for its project: an empty text says nothing that holds for others.
    const blank = !text.trim()
    const shown = blank ? '(tom)' : text.trim()
    const scope = place.choiceFor
      ? `Plassert av valget for «${place.choiceFor}» på Hallregler, som også gjelder med «Hall» foran. Velger du noe her, gjelder det bare «${text.trim()}».`
      : place.own
        ? `Valget gjelder linjene med «${shown}» i dette prosjektet.`
        : blank
          ? 'Linjen har ingen Hall/sted. Et valg her gjelder linjene uten Hall/sted i dette prosjektet.'
          : `Valget gjelder alle linjer med «${shown}», i alle prosjekter.`
    const offerTitle =
      offered &&
      (offered.own
        ? `Prosjektet har booket ${offered.hall}. Plasserer linjene med «${shown}» i dette prosjektet i ${offered.hall}.`
        : offered.hall === PROJECT_HALLS
          ? `«${text.trim()}» nevner flere haller. ${PROJECT_HALLS} er behov som ikke er fordelt på hall: det teller som ett sted i Kalender, med dagene til alle hallene prosjektet har.`
          : `«${text.trim()}» nevner ${offered.hall}. Plasserer alle linjer med denne teksten i ${offered.hall}.`)
    const placed = place.hall !== UNRESOLVED_HALL
    return (
      <SplitPick
        label={`Plassering for ${shown}`}
        value={placed ? place.hall : undefined}
        chosen={pinned}
        offer={offered?.hall}
        offerTitle={offerTitle || undefined}
        missing="Velg hall"
        title={`${ruleOf(line)}. ${placed ? '' : `Behovet teller ikke før linjen har en hall. `}${scope}`}
        options={pinned ? [...optionsFor(line.projectNo), CLEAR_CHOICE] : optionsFor(line.projectNo)}
        note={noteFor(line.projectNo)}
        onPick={(hall) =>
          offered && hall === offered.hall
            ? setHallChoice(text, hall, offered.own ? line.projectNo : undefined)
            : setHallChoice(text, hall === CLEAR_CHOICE ? undefined : hall, place.own || blank ? line.projectNo : undefined)
        }
      />
    )
  }
  /** The offers for the lines that lack a hall, each text once: what «Bruk forslagene» takes. */
  const offersFor = (lines: Placed[]): { text: string; hall: string; projectNo?: string }[] => {
    const found = new Map<string, { text: string; hall: string; projectNo?: string }>()
    for (const line of lines) {
      const offered = offerFor(line)
      if (!offered) continue
      const projectNo = offered.own ? line.projectNo : undefined
      found.set(`${line.hall.trim().toLowerCase()}|${projectNo ?? ''}`, { text: line.hall, hall: offered.hall, projectNo })
    }
    return [...found.values()]
  }
  return { halls, rules, placeOfLine, ruleOf, locationCell, offersFor }
}
