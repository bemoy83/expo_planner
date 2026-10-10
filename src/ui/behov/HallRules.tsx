import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { hallChoices, letterRules, NO_HALL_RULES, placeNames, ruleKey, sharedPlaces, UNRESOLVED_HALL } from '../../domain/locations'
import type { HallRules as Rules } from '../../domain/types'
import { hallNames } from '../../domain/venue'
import { useWorkspace } from '../../store/workspaceStore'
import { UndoRedoButtons } from '../common'
import { TextField } from '../fields'

/** The halls a typed list names, as the ledger writes them; what is not a hall is left out. */
const hallsIn = (text: string, halls: string[]): string[] => {
  const typed = text.split(/[,;\s]+/).map((part) => part.trim().toLowerCase()).filter(Boolean)
  return halls.filter((hall) => typed.includes(hall.toLowerCase()))
}

/**
 * The rules that place a Hall/Sted text in a hall, so none of them is hidden and all of them are the planner's own:
 * places that stand for several halls, what a shared name counts under, words that mean a place, and every choice
 * made for a single text. A page of its own, reached from Behov, where the rules are used.
 */
export function HallRules({ onOpenBehov }: { onOpenBehov: () => void }) {
  const { workspace, setHallAlias: onSet, setHallRules: onRules } = useWorkspace()
  const ws = workspace!
  const halls = useMemo(() => hallNames(ws.venue), [ws.venue])
  const aliases = ws.hallAliases ?? {}
  const rules = ws.hallRules ?? NO_HALL_RULES
  const projectName = (projectNo: string) => ws.visma?.find((v) => v.projectNo === projectNo)?.eventName ?? ws.projects.find((ref) => ref.projectNo === projectNo)?.name ?? projectNo
  const letters = letterRules(halls)
  const shared = sharedPlaces(halls, rules)
  const places = placeNames(halls, rules)
  const choices = hallChoices(aliases, halls)
  const [place, setPlace] = useState({ name: '', halls: '' })
  const [phrase, setPhrase] = useState({ text: '', hall: '' })
  const placeHalls = hallsIn(place.halls, halls)
  const placeTaken = places.some((name) => name.toLowerCase() === place.name.trim().toLowerCase())
  const setPlaces = (next: Rules['places']) => onRules({ ...rules, places: next })
  const setPhrases = (next: Rules['phrases']) => onRules({ ...rules, phrases: next })
  /** The rules are tried from the top, so their order is the planner's to set. */
  const movePhrase = (from: number, to: number) => {
    const next = [...rules.phrases]
    next.splice(to, 0, ...next.splice(from, 1))
    setPhrases(next)
  }
  const placeSelect = (value: string, label: string, onChange: (hall: string) => void, empty?: string) => (
    <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {empty !== undefined && <option value="">{empty}</option>}
      {places.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  )

  return (
    <div className="behov">
      <div className="toolbar">
        <button className="ghost" onClick={onOpenBehov} title="Tilbake til Behov, der reglene plasserer linjene">
          ← Behov
        </button>
        <span className="muted small">
          {rules.places.length} egne steder · {rules.phrases.length} regler for ord · {choices.length} valg for enkelte tekster
        </span>
        <span className="toolbar-gap" />
        <UndoRedoButtons />
      </div>
      <div className="behov-body rules">
        <p className="hint">
          Slik blir Hall/sted til en hall i Kalender, i denne rekkefølgen: ditt valg for teksten i prosjektet, ditt valg for teksten i alle prosjekter, navnet på hallen eller stedet («Hall
          C» er C), regelen for et navn flere haller deler, og til slutt den første regelen for ord som teksten inneholder. En tekst som sier hallen helt ut, som «B2», går alltid dit.
        </p>

        <h3>Steder som står for flere haller</h3>
        <p className="hint">Et sted teller som én plass i Kalender, med dagene til hallene det står for. Haller med samme navn foran et nummer er et sted av seg selv.</p>
        <table className="ledger rules">
          <thead>
            <tr>
              <th>Sted</th>
              <th>Står for</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shared.map((entry) => {
              const own = rules.places.find((other) => other.name.trim().toLowerCase() === entry.name.toLowerCase())
              return (
                <tr key={entry.name}>
                  <td>{entry.name}</td>
                  <td>
                    {own ? (
                      <TextField value={entry.halls.join(', ')} ariaLabel={`Hallene til ${entry.name}`} onCommit={(value) => hallsIn(value, halls).length && setPlaces(rules.places.map((other) => (other === own ? { ...other, halls: hallsIn(value, halls) } : other)))} />
                    ) : (
                      <span className="inline-text">{entry.halls.join(', ')}</span>
                    )}
                  </td>
                  <td className="actions">
                    {own ? (
                      <button className="row-action" title={`Slett stedet ${entry.name}`} onClick={() => setPlaces(rules.places.filter((other) => other !== own))}>
                        <X size={13} aria-hidden />
                      </button>
                    ) : (
                      <span className="muted small">av seg selv</span>
                    )}
                  </td>
                </tr>
              )
            })}
            <tr>
              <td>
                <input className="inline" placeholder="Nytt sted, f.eks. Nordfløy" aria-label="Navn på nytt sted" value={place.name} onChange={(e) => setPlace({ ...place, name: e.target.value })} />
              </td>
              <td>
                <input className="inline" placeholder="Haller, f.eks. B1, B2" aria-label="Hallene til det nye stedet" value={place.halls} onChange={(e) => setPlace({ ...place, halls: e.target.value })} />
              </td>
              <td className="actions">
                <button
                  disabled={!place.name.trim() || !placeHalls.length || placeTaken}
                  title={placeTaken ? 'Navnet er en hall eller et sted fra før' : !placeHalls.length ? 'Skriv haller som finnes på VenYou-fanen, med komma mellom' : `Stedet står for ${placeHalls.join(', ')}`}
                  onClick={() => {
                    setPlaces([...rules.places, { name: place.name.trim(), halls: placeHalls }])
                    setPlace({ name: '', halls: '' })
                  }}
                >
                  Legg til
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        {letters.length > 0 && (
          <>
            <h3>Navn som flere haller deler</h3>
            <table className="ledger rules">
              <thead>
                <tr>
                  <th>Står det</th>
                  <th>teller det under</th>
                </tr>
              </thead>
              <tbody>
                {letters.map((entry) => {
                  const rule = aliases[ruleKey(entry.name)]
                  const value = places.find((name) => name.toLowerCase() === rule?.trim().toLowerCase() && name !== entry.name) ?? ''
                  return (
                    <tr key={entry.name}>
                      <td>
                        {entry.name.length === 1 ? `Hall ${entry.name}` : entry.name} <span className="muted">uten nummer</span>
                      </td>
                      <td>{placeSelect(value, `Regel for ${entry.name}`, (hall) => onSet(entry.name, hall || undefined), `${entry.name}, felles for ${entry.halls.join(', ')}`)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}

        <h3>Ord som betyr et sted</h3>
        <p className="hint">En tekst som inneholder ordene teller under stedet, når den ikke er plassert av reglene over. Reglene prøves ovenfra, og den første som passer gjelder: flytt en regel opp for å la den gå foran.</p>
        <table className="ledger rules">
          <thead>
            <tr>
              <th className="num" title="Rekkefølgen reglene prøves i">Nr.</th>
              <th>Inneholder teksten</th>
              <th>teller den under</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rules.phrases.map((entry, index) => (
              <tr key={index}>
                <td className="num">{index + 1}</td>
                <td>
                  <TextField value={entry.text} ariaLabel="Ord i teksten" onCommit={(value) => value && setPhrases(rules.phrases.map((other, at) => (at === index ? { ...other, text: value } : other)))} />
                </td>
                <td>{placeSelect(places.find((name) => name.toLowerCase() === entry.hall.toLowerCase()) ?? '', `Sted for ${entry.text}`, (hall) => hall && setPhrases(rules.phrases.map((other, at) => (at === index ? { ...other, hall } : other))), 'Velg sted')}</td>
                <td className="actions">
                  <button className="row-action" title="Flytt opp: regelen prøves før den over" disabled={index === 0} onClick={() => movePhrase(index, index - 1)}>
                    <ChevronUp size={13} aria-hidden />
                  </button>
                  <button className="row-action" title="Flytt ned: regelen prøves etter den under" disabled={index === rules.phrases.length - 1} onClick={() => movePhrase(index, index + 1)}>
                    <ChevronDown size={13} aria-hidden />
                  </button>
                  <button className="row-action" title="Slett regelen" onClick={() => setPhrases(rules.phrases.filter((_, at) => at !== index))}>
                    <X size={13} aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td />
              <td>
                <input className="inline" placeholder="Ord, f.eks. scene" aria-label="Ord i en ny regel" value={phrase.text} onChange={(e) => setPhrase({ ...phrase, text: e.target.value })} />
              </td>
              <td>{placeSelect(phrase.hall, 'Sted for den nye regelen', (hall) => setPhrase({ ...phrase, hall }), 'Velg sted')}</td>
              <td className="actions">
                <button
                  disabled={!phrase.text.trim() || !phrase.hall}
                  onClick={() => {
                    setPhrases([...rules.phrases, { text: phrase.text.trim(), hall: phrase.hall }])
                    setPhrase({ text: '', hall: '' })
                  }}
                >
                  Legg til
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <h3>Valg for enkelte tekster</h3>
        {choices.length ? (
          <table className="ledger rules">
            <thead>
              <tr>
                <th>Hall/sted</th>
                <th>Gjelder</th>
                <th>Teller under</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {choices.map((choice) => (
                <tr key={choice.key}>
                  <td>{choice.text}</td>
                  <td>{choice.projectNo ? projectName(choice.projectNo) : 'Alle prosjekter'}</td>
                  <td>{choice.hall === UNRESOLVED_HALL ? UNRESOLVED_HALL : choice.hall}</td>
                  <td className="actions">
                    <button className="row-action" title="Fjern valget: teksten leses automatisk igjen" onClick={() => onSet(choice.text, undefined, choice.projectNo)}>
                      <X size={13} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Ingen ennå. Et valg i kolonnen Plassering, eller et forslag du bruker, havner her.</p>
        )}

      </div>
    </div>
  )
}
