import { useMemo } from 'react'
import { placeNames, placeOf, type HallOffer, PROJECT_HALLS, sharedPlaces, suggestHall, UNRESOLVED_HALL } from '../../domain/locations'
import { hallsOfProjects } from '../../domain/projects'
import { hallNames } from '../../domain/venue'
import { useWorkspace } from '../../store/workspaceStore'
import { projectHallSpans, spanText } from '../../domain/ownDemand'
import type { PickGroup } from '../fields'
import { CLEAR, OFFER, ONLY_HERE } from './picks'
import { SplitPick } from './SplitPick'

type Placed = { hall: string; projectNo: string }


/**
 * Where the demand lines of Behov count in the Kalender, why, and the cell to change it in: the same for Visma lines and the planner's own.
 * Behov holds one and hands it to its views (`Placing`), so the halls, places and days are worked out once.
 */
export function usePlacing() {
  const { workspace, setHallChoice } = useWorkspace()
  const ws = workspace!
  // The Kalender places demand in the halls of the hall ledger; show where each line's Hall/Sted ends up.
  const halls = useMemo(() => hallNames(ws.venue), [ws.venue])
  const booked = useMemo(() => hallsOfProjects(ws.venue, ws.projects), [ws.venue, ws.projects])
  const rules = ws.hallRules
  const places = useMemo(() => placeNames(halls, rules), [halls, rules])
  const shared = useMemo(() => new Map(sharedPlaces(halls, rules).map((place) => [place.name, place.halls])), [halls, rules])
  const spans = useMemo(() => projectHallSpans(ws.venue, ws.projects), [ws.venue, ws.projects])
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
  const projectNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const p of ws.projects) if (!names.has(p.projectNo)) names.set(p.projectNo, p.name)
    return names
  }, [ws.projects])
  const projectName = (no: string) => projectNames.get(no) ?? no
  /** The places of the hall ledger in the order the list gives them: those the project has booked first, then places of several halls, then the other halls. */
  const placesFor = (projectNo: string) => {
    const own = new Set((booked.get(projectNo) ?? []).map((hall) => hall.toLowerCase()))
    const isOwn = (place: string) => own.has(place.toLowerCase()) || (shared.get(place) ?? []).some((hall) => own.has(hall.toLowerCase()))
    return {
      booked: places.filter(isOwn),
      shared: places.filter((place) => !isOwn(place) && (shared.has(place) || place === PROJECT_HALLS)),
      other: places.filter((place) => !isOwn(place) && !shared.has(place) && place !== PROJECT_HALLS),
    }
  }
  /** A few words on a place: its build-up and tear-down days in the project, or the halls it stands for. */
  const placeNote = (projectNo: string, place: string): string => {
    if (place === PROJECT_HALLS) return 'flere haller under ett'
    if (shared.has(place)) return shared.get(place)!.join(', ')
    const days = spans.get(projectNo)?.get(place)
    return days ? [days.assembly && `Opp ${spanText(days.assembly)}`, days.dismantle && `Ned ${spanText(days.dismantle)}`].filter(Boolean).join(' · ') : ''
  }
  /**
   * The hall a line counts under in the Kalender: quiet text once it is placed, else the button of what needs the planner,
   * with the offer where there is one. The list has the offer first, then the halls the project has booked, places of
   * several halls, the other halls, and the booked halls for this project alone. The planner's choice is for the Hall/Sted
   * text in every project, unless the text has a choice for this project alone, or no text: then it is for this project.
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
    const name = projectName(line.projectNo)
    const forProject = place.own || blank
    const scope = place.choiceFor
      ? `Plassert av valget for «${place.choiceFor}» på Hallregler, som også gjelder med «Hall» foran. Velger du noe her, gjelder det bare «${text.trim()}».`
      : place.own
        ? `Valget gjelder linjene med «${shown}» i dette prosjektet.`
        : blank
          ? 'Linjen har ingen Hall/sted. Et valg her gjelder linjene uten Hall/sted i dette prosjektet.'
          : `Valget gjelder alle linjer med «${shown}», i alle prosjekter.`
    const placed = place.hall !== UNRESOLVED_HALL
    const { booked: own, shared: several, other } = placesFor(line.projectNo)
    const item = (prefix: string) => (hall: string) => ({ value: `${prefix}${hall}`, label: hall, note: placeNote(line.projectNo, hall) })
    const groups: PickGroup[] = [
      ...(offered ? [{ label: 'Forslag', hint: offerReason(offered), items: [{ value: `${OFFER}${offered.hall}`, label: offered.hall, note: offered.own ? `bare ${name}` : `alle «${shown}»` }] }] : []),
      { label: own.length ? `Booket av ${name}` : `${name} har ingen booking`, hint: forProject ? 'gjelder prosjektet' : `gjelder alle «${shown}»`, items: own.map(item('')) },
      { label: 'Steder', items: several.map(item('')) },
      { label: 'Andre haller', hint: 'ikke booket', items: other.map(item('')) },
      ...(!forProject && own.length ? [{ label: `Bare i ${name}`, hint: 'andre prosjekter beholder sin plassering', items: own.map((hall) => ({ value: `${ONLY_HERE}${hall}`, label: hall, note: `«${shown}» her` })) }] : []),
      ...(pinned ? [{ items: [{ value: CLEAR, label: 'Fjern valget, bruk reglene' }] }] : []),
    ]
    return (
      <SplitPick
        label={`Plassering for ${shown}`}
        value={placed ? place.hall : undefined}
        chosen={pinned}
        offer={offered?.hall}
        offerTitle={offered ? offerReason(offered) : undefined}
        missing="Velg hall"
        title={`${ruleOf(line)}. ${placed ? '' : `Behovet teller ikke før linjen har en hall. `}${scope}`}
        head={`«${shown}» · ${ruleOf(line)}`}
        groups={groups}
        onPick={(value) => {
          if (value === CLEAR) setHallChoice(text, undefined, forProject ? line.projectNo : undefined)
          else if (value.startsWith(OFFER)) setHallChoice(text, offered!.hall, offered!.own ? line.projectNo : undefined)
          else if (value.startsWith(ONLY_HERE)) setHallChoice(text, value.slice(ONLY_HERE.length), line.projectNo)
          else setHallChoice(text, value, forProject ? line.projectNo : undefined)
        }}
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
  return { halls, rules, booked, places, spans, placesFor, placeNote, placeOfLine, ruleOf, locationCell, offersFor }
}

/** What `usePlacing` gives: Behov holds one and hands it on. */
export type Placing = ReturnType<typeof usePlacing>
