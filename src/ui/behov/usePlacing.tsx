import { useMemo } from 'react'
import { placeNames, placeOf, type HallOffer, PROJECT_HALLS, resolveHall, sharedPlaces, suggestHall, UNRESOLVED_HALL } from '../../domain/locations'
import { hallsOfProjects } from '../../domain/projects'
import { hallNames } from '../../domain/venue'
import { useWorkspace } from '../../store/workspaceStore'

type Placed = { hall: string; projectNo: string }

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
  /**
   * The hall a line counts under in the Kalender. The planner's choice is for the Hall/Sted text in every project,
   * unless the text has a choice for this project alone: then that is the one the list changes.
   */
  const locationCell = (line: Placed) => {
    const text = line.hall
    const place = placeOfLine(line)
    // A line placed by the choice for its text without «Hall» has no choice of its own to show or to remove.
    const pinned = place.chosen && !place.choiceFor
    const auto = place.choiceFor ? place.hall : (resolveHall(text, halls, rules) ?? UNRESOLVED_HALL)
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
    return (
      <>
        <select
          className={`location ${place.hall === UNRESOLVED_HALL ? 'unresolved' : ''} ${pinned ? 'chosen' : ''}`}
          value={pinned ? place.hall : ''}
          aria-label={`Plassering for ${shown}`}
          title={`${ruleOf(line)}. ${place.by === 'none' ? `Hall/sted finnes ikke blant hallene på VenYou-fanen. Behovet teller med under «${UNRESOLVED_HALL}» til du velger en hall. ` : ''}${scope}`}
          onChange={(e) => setHallChoice(text, e.target.value || undefined, place.own || blank ? line.projectNo : undefined)}
        >
          <option value="">{auto} (auto)</option>
          {places.map((hall) => (
            <option key={hall} value={hall}>
              {hall === PROJECT_HALLS ? `${hall} (flere haller under ett)` : hall}
            </option>
          ))}
          <option value={UNRESOLVED_HALL}>{UNRESOLVED_HALL}</option>
        </select>
        {offered && (
          <button
            className="link"
            title={
              offered.own
                ? `Prosjektet har booket ${offered.hall}. Plasserer linjene med «${shown}» i dette prosjektet i ${offered.hall}.`
                : offered.hall === PROJECT_HALLS
                  ? `«${text.trim()}» nevner flere haller. ${PROJECT_HALLS} er behov som ikke er fordelt på hall: det teller som ett sted i Kalender, med dagene til alle hallene prosjektet har.`
                  : `«${text.trim()}» nevner ${offered.hall}. Plasserer alle linjer med denne teksten i ${offered.hall}.`
            }
            onClick={() => setHallChoice(text, offered.hall, offered.own ? line.projectNo : undefined)}
          >
            Bruk {offered.hall}
          </button>
        )}
      </>
    )
  }
  return { halls, booked, rules, placeOfLine, ruleOf, locationCell }
}
