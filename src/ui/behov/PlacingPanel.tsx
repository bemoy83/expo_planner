import type { HallReview } from '../../domain/hallReview'
import { PLACE_STEPS } from '../../domain/hallReview'
import { placeOf, type Place, type PlacedBy, suggestHall, UNRESOLVED_HALL } from '../../domain/locations'
import type { HallRules } from '../../domain/types'

/** A text to try against the rules, as it would stand on a line of a project, or of none. */
export interface TriedText {
  text: string
  projectNo: string
}

const STEP_TEXT: Record<PlacedBy, { label: string; detail: string }> = {
  own: { label: 'Valg i prosjektet', detail: 'Ditt valg for teksten i akkurat dette prosjektet.' },
  choice: { label: 'Valg i alle prosjekter', detail: 'Ditt valg for teksten, uansett prosjekt. Det gjelder også med «Hall» foran: «a» plasserer «Hall A».' },
  text: { label: 'Navnet på en hall eller et sted', detail: 'Hele teksten er navnet. Store og små bokstaver, «Hall» foran, mellomrom og bindestrek skiller ikke: «Studio 3» er STUDIO3.' },
  phrase: { label: 'Første regel for ord som passer', detail: 'Teksten inneholder ordene. Reglene prøves ovenfra.' },
  none: { label: UNRESOLVED_HALL, detail: `Ingenting passet. Linjen teller under «${UNRESOLVED_HALL}» i Kalender til du plasserer teksten.` },
}

interface Props {
  halls: string[]
  rules: HallRules
  /** The halls each project has booked: what an offer for a text may rest on. */
  booked: Map<string, string[]>
  review: HallReview
  /** The projects that have demand, by number and name. */
  projects: [string, string][]
  tried: TriedText
  onTry: (tried: TriedText) => void
  /** A click on a step: the page shows the rules of that step. */
  onStep: (step: PlacedBy) => void
}

/**
 * Beside the rules: a text to try, with where it lands and why, and the order the rules are tried in, with the lines
 * of the demand each step places. The step that placed the text tried is lit, and those tried before it are dimmed.
 */
export function PlacingPanel({ halls, rules, booked, review, projects, tried, onTry, onStep }: Props) {
  const text = tried.text.trim()
  const place = text ? placeOf(text, halls, rules, tried.projectNo || undefined) : null
  const offered = place?.by === 'none' ? suggestHall(text, halls, booked.get(tried.projectNo), rules) : null
  const projectName = projects.find(([no]) => no === tried.projectNo)?.[1] ?? tried.projectNo
  const why = (found: Place): string => {
    if (found.by === 'own') return `ditt valg for teksten i ${projectName}`
    if (found.by === 'choice') return found.choiceFor ? `ditt valg for «${found.choiceFor}», som også gjelder med «Hall» foran` : 'ditt valg for teksten i alle prosjekter'
    if (found.by === 'phrase') return `regel for ord nr. ${(found.rule ?? 0) + 1}: teksten inneholder «${found.phrase}»`
    if (found.by === 'text') return found.via ? `teksten er navnet på ${found.via}, som ${found.hall} samler` : 'teksten er navnet'
    return offered ? `ingen regel passer. Forslag: ${offered.hall}${offered.own ? ', den eneste hallen prosjektet har' : ''}` : 'ingen regel passer'
  }
  const at = place ? PLACE_STEPS.indexOf(place.by) : -1
  return (
    <aside className="rules-panel" aria-label="Prøv en tekst mot reglene">
      <h4 className="section-head">Prøv en tekst</h4>
      <input placeholder="Hall/sted, f.eks. Scene øst" aria-label="Hall/sted-tekst å prøve" value={tried.text} onChange={(e) => onTry({ ...tried, text: e.target.value })} />
      <select aria-label="Prosjektet teksten står i" title="Et valg kan gjelde ett prosjekt alene: velg prosjektet teksten står i" value={tried.projectNo} onChange={(e) => onTry({ ...tried, projectNo: e.target.value })}>
        <option value="">Uten prosjekt</option>
        {projects.map(([no, name]) => (
          <option key={no} value={no}>
            {name} ({no})
          </option>
        ))}
      </select>
      <p className="rules-result" role="status">
        {place ? (
          <>
            → <strong className={place.hall === UNRESOLVED_HALL ? 'issue' : ''}>{place.hall}</strong> <span className="muted">{why(place)}</span>
          </>
        ) : (
          <span className="muted">Skriv en tekst for å se hvor den havner, og hvorfor.</span>
        )}
      </p>
      <h4 className="section-head">Rekkefølgen reglene prøves i</h4>
      <ol className="rules-chain">
        {PLACE_STEPS.map((step, index) => (
          <li key={step}>
            <button className={index === at ? 'hit' : index < at ? 'past' : ''} aria-current={index === at ? 'step' : undefined} title={`Vis ${step === 'none' ? 'tekstene som mangler hall' : 'reglene for dette steget'}`} onClick={() => onStep(step)}>
              <span className="nr">{index + 1}</span>
              <span className="label">{STEP_TEXT[step].label}</span>
              <span className={`count ${step === 'none' && review.steps.none ? 'issue' : 'muted'}`}>
                {review.steps[step]} {review.steps[step] === 1 ? 'linje' : 'linjer'}
              </span>
              <span className="detail">{STEP_TEXT[step].detail}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="hint">Områder endrer ikke hvor behovet teller. De bestemmer bare hva som vises under «Steder» i Kalender.</p>
      <p className="hint">Alt her er ditt eget: det som kom inn med de første hallene er eksempler du kan endre og slette.</p>
    </aside>
  )
}
