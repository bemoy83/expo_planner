import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { todayIso } from '../../domain/dates'
import { diffHallSetup, hallChoices, hallSetupOf, mergeHallSetup, placeNames, PROJECT_HALLS, replaceHallSetup, UNRESOLVED_HALL, withAlias, withPlaceRenamed, type HallSetup, type SetupDiff } from '../../domain/locations'
import type { HallRules as Rules } from '../../domain/types'
import { hallNames } from '../../domain/venue'
import { readHallreglerWorkbook, writeHallreglerWorkbook } from '../../import/hallreglerFile'
import { useWorkspace } from '../../store/workspaceStore'
import { Menu, MergeReplaceDialog, MessageBanner, UndoRedoButtons, type Message } from '../common'
import { download, errorText, XLSX_TYPE } from '../files'
import { TableFileButtons } from '../TableFile'
import { TextField } from '../fields'

/** The halls a place stands for, as a button that opens the list of all halls to tick, like the filter of a column. */
function HallPicker({ halls, picked, label, onChange }: { halls: string[]; picked: string[]; label: string; onChange: (halls: string[]) => void }) {
  const chosen = new Set(picked.map((hall) => hall.toLowerCase()))
  const shown = halls.filter((hall) => chosen.has(hall.toLowerCase()))
  return (
    <Menu label={shown.length ? shown.join(', ') : 'Velg haller'} ariaLabel={label} title="Kryss av hallene stedet står for" className={`hall-picker ${shown.length ? '' : 'empty'}`}>
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

const describeDiff = (label: string, diff: SetupDiff) => `${label}: ${diff.added} nye, ${diff.changed} endret, ${diff.unchanged} like, ${diff.onlyInApp} bare i appen`

/**
 * The rules that place a Hall/Sted text in a hall, so none of them is hidden and all of them are the planner's own:
 * places that stand for several halls, words that mean a place, and every choice made for a single text.
 * A page of its own, reached from Behov, where the rules are used.
 */
export function HallRules({ onOpenBehov }: { onOpenBehov: () => void }) {
  const { workspace, setHallRules } = useWorkspace()
  const ws = workspace!
  const halls = useMemo(() => hallNames(ws.venue), [ws.venue])
  // Until the planner has made rules of his own, the examples are shown, places and choices; the first edit here makes them his.
  const { rules, aliases } = hallSetupOf(halls, ws.hallRules, ws.hallAliases)
  const projectName = (projectNo: string) => ws.visma?.find((v) => v.projectNo === projectNo)?.eventName ?? ws.projects.find((ref) => ref.projectNo === projectNo)?.name ?? projectNo
  const places = placeNames(halls, rules)
  const choices = hallChoices(aliases)
  const [place, setPlace] = useState<{ name: string; halls: string[] }>({ name: '', halls: [] })
  const [phrase, setPhrase] = useState({ text: '', hall: '' })
  const [pending, setPending] = useState<{ file: string; incoming: HallSetup } | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const empty = !rules.places.length && !rules.phrases.length && !choices.length
  const apply = (file: string, next: HallSetup, how: string) => {
    setHallRules(next.rules, next.aliases)
    setMessage({ kind: 'ok', text: `${file} ${how}. Kan angres med Ctrl/Cmd+Z.` })
    setPending(null)
  }
  const onFile = async (file: File) => {
    try {
      const incoming = readHallreglerWorkbook(new Uint8Array(await file.arrayBuffer()))
      // Nothing to merge with while there are no rules.
      if (empty) apply(file.name, replaceHallSetup(incoming), 'lest inn')
      else setPending({ file: file.name, incoming })
    } catch (e) {
      setMessage({ kind: 'error', text: errorText(e) })
    }
  }
  const diff = pending ? diffHallSetup({ rules, aliases }, pending.incoming) : null
  const taken = (name: string) => [...halls, ...places, UNRESOLVED_HALL].some((other) => other.toLowerCase() === name.trim().toLowerCase())
  const setPlaces = (next: Rules['places']) => setHallRules({ ...rules, places: next }, aliases)
  const setPhrases = (next: Rules['phrases']) => setHallRules({ ...rules, phrases: next }, aliases)
  /** The rules are tried from the top, so their order is the planner's to set. */
  const movePhrase = (from: number, to: number) => {
    const next = [...rules.phrases]
    next.splice(to, 0, ...next.splice(from, 1))
    setPhrases(next)
  }
  /** The word rules and the choices that point at the place follow it to its new name. */
  const rename = (from: string, to: string) => {
    const next = withPlaceRenamed(halls, rules, aliases, from, to)
    if (next.rules !== rules) setHallRules(next.rules, next.aliases)
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
        <span className="muted small">
          {rules.places.length} steder · {rules.phrases.length} regler for ord · {choices.length} valg for enkelte tekster
        </span>
        <span className="toolbar-gap" />
        <UndoRedoButtons />
        <TableFileButtons
          exportTitle="Last ned hallreglene som en Excel-fil, med et ark for steder, et for ord og et for valg."
          importTitle="Les inn en fil med hallregler: en som er eksportert herfra, eller en med de samme arkene og kolonnene."
          canExport={!empty}
          onExport={() => download(`expo-planner-hallregler-${todayIso()}.xlsx`, writeHallreglerWorkbook({ rules, aliases }), XLSX_TYPE)}
          onFile={onFile}
        />
      </div>

      <MessageBanner message={message} onClose={() => setMessage(null)} />

      <div className="behov-body rules">
        <p className="hint">
          Slik blir Hall/sted til en hall i Kalender, i denne rekkefølgen: ditt valg for teksten i prosjektet, ditt valg for teksten i alle prosjekter, navnet på hallen eller stedet («Hall
          C» er C), og til slutt den første regelen for ord som teksten inneholder. Et navn leses uansett stavemåte: store og små bokstaver, «Hall» foran, mellomrom og bindestrek skiller ikke, så «Studio 3» er
          STUDIO3. Hele teksten må være navnet. Alt annet her er ditt eget: det som står fra start er eksempler du kan endre og slette.
        </p>

        <h3>Steder som står for flere haller</h3>
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

        <h3>Ord som betyr et sted</h3>
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
                <input className="inline" placeholder="Ord, f.eks. scene" aria-label="Ord i en ny regel" value={phrase.text} onChange={(e) => setPhrase({ ...phrase, text: e.target.value })} />
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

        <h3>Valg for enkelte tekster</h3>
        <p className="hint">
          En tekst som teller under et sted fordi du har valgt det. Valget gjelder også når «Hall» står foran: «a» gir A1 plasserer «Hall A». Bokstavene som står her fra start er eksempler
          for bokstaver med én hall. Du lager nye valg i kolonnen Plassering på Behov.
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
                    <button className="row-action" title="Fjern valget: teksten leses automatisk igjen" onClick={() => setHallRules(rules, withAlias(aliases, choice.text, undefined, choice.projectNo))}>
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
      {pending && diff && (
        <MergeReplaceDialog
          title="Importer hallregler"
          source={pending.file}
          results={[describeDiff('Steder', diff.places), describeDiff('Regler for ord', diff.phrases), describeDiff('Valg for tekster', diff.choices)]}
          replaceText={`stedene, reglene for ord og valgene i appen byttes helt ut med filen${
            diff.places.onlyInApp + diff.phrases.onlyInApp + diff.choices.onlyInApp > 0 ? `; ${diff.places.onlyInApp + diff.phrases.onlyInApp + diff.choices.onlyInApp} som bare finnes i appen forsvinner` : ''
          }. Ved sammenslåing prøves filens regler for ord før de som bare finnes i appen`}
          onCancel={() => setPending(null)}
          onApply={(mode) => apply(pending.file, mode === 'merge' ? mergeHallSetup({ rules, aliases }, pending.incoming) : replaceHallSetup(pending.incoming), mode === 'merge' ? 'slått sammen med reglene' : 'har erstattet reglene')}
        />
      )}
    </div>
  )
}
