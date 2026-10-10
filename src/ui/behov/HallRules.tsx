import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Eye, X } from 'lucide-react'
import { withAreaRenamed } from '../../domain/areas'
import { todayIso } from '../../domain/dates'
import { reviewPlacing, type UnplacedText } from '../../domain/hallReview'
import { diffHallRules, hallChoices, mergeHallRules, NO_HALL_RULES, placeNames, type PlacedBy, PROJECT_HALLS, UNRESOLVED_HALL, withChoice, withPlaceRenamed } from '../../domain/locations'
import { hallsOfProjects } from '../../domain/projects'
import type { HallRules as Rules } from '../../domain/types'
import { hallNames } from '../../domain/venue'
import { readHallreglerWorkbook, writeHallreglerWorkbook } from '../../import/hallreglerFile'
import { useWorkspace } from '../../store/workspaceStore'
import { Menu, MergeReplaceDialog, MessageBanner, Segmented, UndoRedoButtons, type Message } from '../common'
import { download, XLSX_TYPE } from '../files'
import { TableFileButtons } from '../TableFile'
import { describeDiff, useTableFile } from '../useTableFile'
import { TextField } from '../fields'
import { PlacingPanel, type TriedText } from './PlacingPanel'
import { Unplaced } from './Unplaced'

/** The halls a place stands for or an area holds, as a button that opens the list of all halls to tick, like the filter of a column. */
function HallPicker({ halls, picked, label, title = 'Kryss av hallene stedet står for', onChange }: { halls: string[]; picked: string[]; label: string; title?: string; onChange: (halls: string[]) => void }) {
  const chosen = new Set(picked.map((hall) => hall.toLowerCase()))
  const shown = halls.filter((hall) => chosen.has(hall.toLowerCase()))
  return (
    <Menu label={shown.length ? shown.join(', ') : 'Velg haller'} ariaLabel={label} title={title} className={`hall-picker ${shown.length ? '' : 'empty'}`}>
      {() => (
        <div className="col-filter-pop">
          <div className="col-filter-all">
            <button className="link small" onClick={() => onChange(halls)}>
              Velg alle
            </button>
            <button className="link small" onClick={() => onChange([])}>
              Fjern alle
            </button>
          </div>
          <div className="col-filter-list">
            {halls.map((hall) => (
              <label key={hall}>
                <input type="checkbox" checked={chosen.has(hall.toLowerCase())} onChange={() => onChange(halls.filter((other) => (other === hall ? !chosen.has(hall.toLowerCase()) : chosen.has(other.toLowerCase()))))} />
                <span>{hall}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </Menu>
  )
}

/** The parts of the page, of which one is shown at a time. */
type Part = 'unplaced' | 'places' | 'phrases' | 'choices' | 'areas'

/**
 * The rules that place a Hall/Sted text in a hall, so none of them is hidden and all of them are the planner's own:
 * places that stand for several halls, words that mean a place, the areas the halls are gathered in, which decide what
 * the Kalender shows, and every choice made for a single text. The choices are last: their list grows long.
 * First come the texts of the demand that no rule places, to place here. One part is shown at a time, picked in the
 * bar above them, so no table has to be scrolled past to reach another; the areas stand apart there, since they place
 * nothing. Beside the part stands the panel that tries a text and shows the order the rules are tried in. A page of
 * its own, reached from Behov, where the rules are used.
 */
export function HallRules({ onOpenBehov }: { onOpenBehov: () => void }) {
  const { workspace, setHallRules } = useWorkspace()
  const ws = workspace!
  const halls = useMemo(() => hallNames(ws.venue), [ws.venue])
  const rules = ws.hallRules ?? NO_HALL_RULES
  const projectName = (projectNo: string) => ws.visma?.find((v) => v.projectNo === projectNo)?.eventName ?? ws.projects.find((ref) => ref.projectNo === projectNo)?.name ?? projectNo
  const places = placeNames(halls, rules)
  const choices = hallChoices(rules.choices)
  const booked = useMemo(() => hallsOfProjects(ws.venue, ws.projects), [ws.venue, ws.projects])
  const review = useMemo(() => reviewPlacing(ws.demand, halls, booked, rules), [ws.demand, halls, booked, rules])
  const projects = useMemo(() => [...new Set(ws.demand.map((line) => line.projectNo))].map((no): [string, string] => [no, projectName(no)]).sort((a, b) => a[1].localeCompare(b[1], 'nb')), [ws.demand, ws.visma, ws.projects]) // eslint-disable-line react-hooks/exhaustive-deps
  const [tried, setTried] = useState<TriedText>({ text: '', projectNo: '' })
  // The page opens on the texts that wait to be placed, where there are any.
  const [part, setPart] = useState<Part>(() => (review.steps.none > 0 ? 'unplaced' : 'places'))
  const phraseInput = useRef<HTMLInputElement>(null)
  /** Set when a rule for words is started from a text: its field is in the part that is shown next. */
  const [phraseStarted, setPhraseStarted] = useState(0)
  useEffect(() => {
    if (phraseStarted) phraseInput.current?.focus()
  }, [phraseStarted])
  /** The part that holds the rules of a step of the order. */
  const showStep = (step: PlacedBy) => setPart(step === 'none' ? 'unplaced' : step === 'text' ? 'places' : step === 'phrase' ? 'phrases' : 'choices')
  const partLabel = (name: ReactNode, count: number, issue = false) => (
    <>
      {name} <em className={issue ? 'issue' : undefined}>{count}</em>
    </>
  )
  const [place, setPlace] = useState<{ name: string; halls: string[] }>({ name: '', halls: [] })
  const [phrase, setPhrase] = useState({ text: '', hall: '' })
  const areas = rules.areas ?? []
  const [area, setArea] = useState<{ name: string; halls: string[] }>({ name: '', halls: [] })
  const areaTaken = areas.some((other) => other.name.toLowerCase() === area.name.trim().toLowerCase())
  const setAreas = (next: NonNullable<Rules['areas']>) => setHallRules({ ...rules, areas: next })
  const [message, setMessage] = useState<Message | null>(null)
  const empty = !rules.places.length && !rules.phrases.length && !choices.length && !areas.length
  const apply = (file: string, next: Rules, how: string) => {
    setHallRules(next)
    setMessage({ kind: 'ok', text: `${file} ${how}. Kan angres med Ctrl/Cmd+Z.` })
    done()
  }
  const { pending, onFile, done } = useTableFile<Rules>({ read: readHallreglerWorkbook, empty, takeIn: (incoming, file) => apply(file, incoming, 'lest inn'), onError: (text) => setMessage({ kind: 'error', text }) })
  const diff = pending ? diffHallRules(rules, pending.incoming) : null
  const onlyInApp = diff ? diff.places.onlyInApp + diff.phrases.onlyInApp + diff.choices.onlyInApp + diff.areas.onlyInApp : 0
  const taken = (name: string) => [...halls, ...places, UNRESOLVED_HALL].some((other) => other.toLowerCase() === name.trim().toLowerCase())
  const setPlaces = (next: Rules['places']) => setHallRules({ ...rules, places: next })
  const setPhrases = (next: Rules['phrases']) => setHallRules({ ...rules, phrases: next })
  /** The rules are tried from the top, so their order is the planner's to set. */
  const movePhrase = (from: number, to: number) => {
    const next = [...rules.phrases]
    next.splice(to, 0, ...next.splice(from, 1))
    setPhrases(next)
  }
  /** The word rules and the choices that point at the place follow it to its new name. */
  const rename = (from: string, to: string) => {
    const next = withPlaceRenamed(halls, rules, from, to)
    if (next !== rules) setHallRules(next)
  }
  const textCount = (n: number) => (n === 1 ? '1 tekst' : `${n} tekster`)
  const lineCount = (n: number) => (n === 1 ? '1 linje' : `${n} linjer`)
  /** A place for a text that no rule places: a choice for every project, or one for each project the text stands in. A text that is empty is placed for its project alone. */
  const placeText = (found: UnplacedText, hall: string, own: boolean) => {
    const perProject = own || !found.text
    setHallRules(perProject ? found.projectNos.reduce((next, projectNo) => withChoice(next, found.text, hall, projectNo), rules) : withChoice(rules, found.text, hall))
    setMessage({ kind: 'ok', text: `«${found.text || '(tom)'}» teller under ${hall}${perProject ? (found.projectNos.length === 1 ? ` i ${projectName(found.projectNos[0])}` : ` i ${found.projectNos.length} prosjekter`) : ' i alle prosjekter'}: ${lineCount(found.lines)}. Kan angres med Ctrl/Cmd+Z.` })
  }
  /** What the texts are offered, taken in one step to undo. */
  const takeOffers = (taken: UnplacedText[]) => {
    setHallRules(taken.reduce((next, found) => found.offers.reduce((with_, offer) => withChoice(with_, found.text, offer.hall, offer.projectNo), next), rules))
    setMessage({ kind: 'ok', text: `${textCount(taken.length)} er plassert etter forslaget. Kan angres med Ctrl/Cmd+Z.` })
  }
  /** The text as the words of a new rule, ready for its place to be picked. */
  const startWordRule = (text: string) => {
    setPhrase({ text: text.toLowerCase(), hall: '' })
    setPart('phrases')
    setPhraseStarted((n) => n + 1)
  }
  const placeSelect = (value: string, label: string, onChange: (hall: string) => void) => (
    <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      <option value="">Velg sted</option>
      {places.map((name) => (
        <option key={name} value={name}>
          {name === PROJECT_HALLS ? `${name} (flere haller under ett)` : name}
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
        <Segmented
          label="Del av hallreglene"
          value={part}
          onChange={setPart}
          options={[
            { value: 'unplaced', label: partLabel(UNRESOLVED_HALL, review.unplaced.length, review.unplaced.length > 0), title: 'Hall/sted-tekster i behovet som ingen regel plasserer' },
            { value: 'places', label: partLabel('Steder', rules.places.length), title: 'Steder som står for flere haller' },
            { value: 'phrases', label: partLabel('Regler for ord', rules.phrases.length), title: 'Ord som betyr et sted' },
            { value: 'choices', label: partLabel('Valg for tekster', choices.length), title: 'Stedene du har valgt for enkelte tekster' },
          ]}
        />
        <span className="rules-apart" aria-hidden />
        <Segmented
          label="Det som bare bestemmer hva som vises"
          value={part}
          onChange={setPart}
          options={[
            {
              value: 'areas',
              label: partLabel(
                <>
                  <Eye size={13} aria-hidden /> Områder
                </>,
                areas.length,
              ),
              title: 'Områdene hallene er samlet i. De bestemmer bare hva som vises i Kalender, ikke hvor behovet teller.',
            },
          ]}
        />
        {review.steps.none > 0 && <span className="issue small">{lineCount(review.steps.none)} mangler hall</span>}
        <span className="toolbar-gap" />
        <UndoRedoButtons />
        <TableFileButtons
          exportTitle="Last ned hallreglene som en Excel-fil, med et ark for steder, et for ord, et for valg og et for områder."
          importTitle="Les inn en fil med hallregler: en som er eksportert herfra, eller en med de samme arkene og kolonnene."
          canExport={!empty}
          onExport={() => download(`expo-planner-hallregler-${todayIso()}.xlsx`, writeHallreglerWorkbook(rules), XLSX_TYPE)}
          onFile={onFile}
        />
      </div>

      <MessageBanner message={message} onClose={() => setMessage(null)} />

      <div className="behov-body rules">
        <div className="rules-work">
          {part === 'unplaced' && (
            <>
              <p className="hint">
                Hall/sted-tekster i behovet som ingen regel plasserer, de med flest timer først. Velg et sted, så lagres det som et valg for teksten. Klikk en tekst for å prøve den i panelet.
              </p>
              {ws.demand.length ? (
                <Unplaced unplaced={review.unplaced} places={places} projectName={projectName} onPlace={placeText} onOffers={takeOffers} onTry={(text, projectNo) => setTried({ text, projectNo })} onWordRule={startWordRule} />
              ) : (
                <p className="muted">Ingen behov er lest inn ennå.</p>
              )}
            </>
          )}

          {part === 'places' && (
            <>
              <p className="hint">
                Et sted teller som én plass i Kalender, med dagene til hallene det står for. En tekst som sier navnet, som «Hall B», teller under stedet, og når stedet samler hallene sine gjør «B2»
                det også. Da er ikke hallene egne plasser lenger. Står en hall i flere steder som samler, gjelder det øverste. <strong>{PROJECT_HALLS}</strong> finnes
                alltid: det er behov som ikke er fordelt på hall, bestilt som én sum for flere haller, som «Hall C, D, E». Det teller for seg, med dagene til alle hallene prosjektet har, og er ikke
                det samme som en rad for «Alle haller» i Kalender, som summerer alt behovet i prosjektet.
              </p>
              <table className="ledger rules">
                <thead>
                  <tr>
                    <th>Sted</th>
                    <th>Står for</th>
                    <th className="center" title="Med hake teller alt som havner i en av hallene under stedet: B1 blir B. Uten hake teller hallene hver for seg, og stedet får bare det som plasseres på stedet selv.">
                      Samler hallene
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rules.places.map((entry, index) => (
                    <tr key={index}>
                      <td>
                        <TextField value={entry.name} ariaLabel={`Navn på stedet ${entry.name}`} onCommit={(value) => rename(entry.name, value)} />
                      </td>
                      <td>
                        <HallPicker halls={halls} picked={entry.halls} label={`Hallene til ${entry.name}`} onChange={(picked) => setPlaces(rules.places.map((other, at) => (at === index ? { ...other, halls: picked } : other)))} />
                      </td>
                      <td className="center">
                        <input type="checkbox" checked={entry.collects !== false} aria-label={`${entry.name} samler hallene sine`} onChange={(e) => setPlaces(rules.places.map((other, at) => (at === index ? { ...other, collects: e.target.checked } : other)))} />
                      </td>
                      <td className="actions">
                        <button className="row-action" title={`Slett stedet ${entry.name}`} onClick={() => setPlaces(rules.places.filter((_, at) => at !== index))}>
                          <X size={13} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>
                      <input className="inline" placeholder="Nytt sted, f.eks. Nordfløy" aria-label="Navn på nytt sted" value={place.name} onChange={(e) => setPlace({ ...place, name: e.target.value })} />
                    </td>
                    <td>
                      <HallPicker halls={halls} picked={place.halls} label="Hallene til det nye stedet" onChange={(picked) => setPlace({ ...place, halls: picked })} />
                    </td>
                    <td />
                    <td className="actions">
                      <button
                        disabled={!place.name.trim() || !place.halls.length || taken(place.name)}
                        title={taken(place.name) ? 'Navnet er en hall eller et sted fra før' : !place.halls.length ? 'Kryss av hallene stedet står for' : !place.name.trim() ? 'Gi stedet et navn' : `Stedet står for ${place.halls.join(', ')}`}
                        onClick={() => {
                          setPlaces([...rules.places, { name: place.name.trim(), halls: place.halls }])
                          setPlace({ name: '', halls: [] })
                        }}
                      >
                        Legg til
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {part === 'phrases' && (
            <>
              <p className="hint">
                En tekst som inneholder ordene teller under stedet, når den ikke er plassert av reglene over. Reglene prøves ovenfra, og den første som passer gjelder: flytt en regel opp for å
                la den gå foran.
              </p>
              <table className="ledger rules">
                <thead>
                  <tr>
                    <th className="num" title="Rekkefølgen reglene prøves i">
                      Nr.
                    </th>
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
                      <td>{placeSelect(places.find((name) => name.toLowerCase() === entry.hall.toLowerCase()) ?? '', `Sted for ${entry.text}`, (hall) => hall && setPhrases(rules.phrases.map((other, at) => (at === index ? { ...other, hall } : other))))}</td>
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
                      <input ref={phraseInput} className="inline" placeholder="Ord, f.eks. scene" aria-label="Ord i en ny regel" value={phrase.text} onChange={(e) => setPhrase({ ...phrase, text: e.target.value })} />
                    </td>
                    <td>{placeSelect(phrase.hall, 'Sted for den nye regelen', (hall) => setPhrase({ ...phrase, hall }))}</td>
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
            </>
          )}

          {part === 'areas' && (
            <>
              <p className="hint">
                Et område samler haller under ett navn, som «NV HALLS» for A til E. Det bestemmer bare hva som vises: under «Steder» i Kalender krysser du av områdene og hallene du vil arbeide med, og
                hallkalenderen, planen og bemanningen følger valget. Hvor behovet teller, endres ikke. En hall som står i flere områder, hører til det øverste.
              </p>
              <table className="ledger rules">
                <thead>
                  <tr>
                    <th>Område</th>
                    <th>Haller</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {areas.map((entry, index) => (
                    <tr key={index}>
                      <td>
                        <TextField value={entry.name} ariaLabel={`Navn på området ${entry.name}`} onCommit={(value) => setAreas(withAreaRenamed(areas, index, value))} />
                      </td>
                      <td>
                        <HallPicker halls={halls} picked={entry.halls} label={`Hallene i ${entry.name}`} title="Kryss av hallene i området" onChange={(picked) => setAreas(areas.map((other, at) => (at === index ? { ...other, halls: picked } : other)))} />
                      </td>
                      <td className="actions">
                        <button className="row-action" title={`Slett området ${entry.name}. Hallene blir stående.`} onClick={() => setAreas(areas.filter((_, at) => at !== index))}>
                          <X size={13} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>
                      <input className="inline" placeholder="Nytt område, f.eks. NV HALLS" aria-label="Navn på nytt område" value={area.name} onChange={(e) => setArea({ ...area, name: e.target.value })} />
                    </td>
                    <td>
                      <HallPicker halls={halls} picked={area.halls} label="Hallene i det nye området" title="Kryss av hallene i området" onChange={(picked) => setArea({ ...area, halls: picked })} />
                    </td>
                    <td className="actions">
                      <button
                        disabled={!area.name.trim() || !area.halls.length || areaTaken}
                        title={areaTaken ? 'Et område har navnet fra før' : !area.halls.length ? 'Kryss av hallene i området' : !area.name.trim() ? 'Gi området et navn' : `Området har ${area.halls.join(', ')}`}
                        onClick={() => {
                          setAreas([...areas, { name: area.name.trim(), halls: area.halls }])
                          setArea({ name: '', halls: [] })
                        }}
                      >
                        Legg til
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {part === 'choices' && (
            <>
              <p className="hint">
                En tekst som teller under et sted fordi du har valgt det. Valget gjelder også når «Hall» står foran: «a» gir A1 plasserer «Hall A». Bokstavene som kom inn med de første hallene er eksempler
                for bokstaver med én hall. Du lager nye valg øverst på siden, eller i kolonnen Plassering på Behov.
              </p>
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
                        <td>{choice.text || <span className="muted">(tom)</span>}</td>
                        <td>{choice.projectNo ? projectName(choice.projectNo) : 'Alle prosjekter'}</td>
                        <td>{choice.hall}</td>
                        <td className="actions">
                          <button className="row-action" title="Fjern valget: teksten leses automatisk igjen" onClick={() => setHallRules(withChoice(rules, choice.text, undefined, choice.projectNo))}>
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
            </>
          )}
        </div>
        <PlacingPanel halls={halls} rules={rules} booked={booked} review={review} projects={projects} tried={tried} onTry={setTried} onStep={showStep} />
      </div>
      {pending && diff && (
        <MergeReplaceDialog
          title="Importer hallregler"
          source={pending.file}
          results={[describeDiff('Steder', diff.places), describeDiff('Regler for ord', diff.phrases), describeDiff('Valg for tekster', diff.choices), describeDiff('Områder', diff.areas)]}
          replaceText={`stedene, reglene for ord, valgene og områdene i appen byttes helt ut med filen${onlyInApp > 0 ? `; ${onlyInApp} som bare finnes i appen forsvinner` : ''}. Ved sammenslåing prøves filens regler for ord før de som bare finnes i appen`}
          onCancel={done}
          onApply={(mode) => apply(pending.file, mode === 'merge' ? mergeHallRules(rules, pending.incoming) : pending.incoming, mode === 'merge' ? 'slått sammen med reglene' : 'har erstattet reglene')}
        />
      )}
    </div>
  )
}
