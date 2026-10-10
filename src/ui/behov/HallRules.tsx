import { X } from 'lucide-react'
import { hallChoices, ruleKey, sharedPlaces, UNRESOLVED_HALL } from '../../domain/locations'

interface Props {
  halls: string[]
  aliases: Record<string, string>
  projectName: (projectNo: string) => string
  /** Sets or removes a choice: for a text in every project, or in the one given. A hall letter by itself is its rule. */
  onSet: (text: string, hall: string | undefined, projectNo?: string) => void
  onClose: () => void
}

/**
 * The rules that place a Hall/Sted text in a hall, so none of them is hidden: what a hall letter with several halls
 * stands for, and every choice the planner has made for a text, in every project or in one.
 */
export function HallRules({ halls, aliases, projectName, onSet, onClose }: Props) {
  const shared = sharedPlaces(halls)
  const choices = hallChoices(aliases, halls)
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog wide tall">
        <h2>Hallregler</h2>
        <p className="hint">
          Slik blir Hall/sted til en hall i Kalender, i denne rekkefølgen: ditt valg for teksten i prosjektet, ditt valg for teksten i alle prosjekter, hallens eget navn («Hall C» er C), og
          til slutt regelen for et navn flere haller deler, som bokstaven B. En tekst som sier hallen helt ut, som «B2», går alltid dit.
        </p>

        <h3>Navn som flere haller deler</h3>
        {shared.length ? (
          <table className="ledger">
            <thead>
              <tr>
                <th>Står det</th>
                <th>teller det under</th>
              </tr>
            </thead>
            <tbody>
              {shared.map((place) => {
                const rule = aliases[ruleKey(place.name)]
                const value = place.halls.find((hall) => hall.toLowerCase() === rule?.trim().toLowerCase()) ?? ''
                return (
                  <tr key={place.name}>
                    <td>
                      {place.name.length === 1 ? `Hall ${place.name}` : place.name} <span className="muted">uten nummer</span>
                    </td>
                    <td>
                      <select value={value} aria-label={`Regel for ${place.name}`} onChange={(e) => onSet(place.name, e.target.value || undefined)}>
                        <option value="">
                          {place.name}, felles for {place.halls.join(', ')}
                        </option>
                        {place.halls.map((hall) => (
                          <option key={hall} value={hall}>
                            {hall}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted">Ingen haller på VenYou-fanen deler navn.</p>
        )}

        <h3>Valg for enkelte tekster</h3>
        {choices.length ? (
          <table className="ledger">
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

        <div className="dialog-actions">
          <button className="primary" onClick={onClose}>
            Lukk
          </button>
        </div>
      </div>
    </div>
  )
}
