import { useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronUp, GripVertical, Plus, Trash2, X } from 'lucide-react'
import { withAreaRenamed } from '../../domain/areas'
import { todayIso } from '../../domain/dates'
import { reviewPlacing, type UnplacedText } from '../../domain/hallReview'
import { diffHallRules, hallChoices, mergeHallRules, NO_HALL_RULES, placeNames, type PlacedBy, PROJECT_HALLS, withChoice, withPlaceRenamed } from '../../domain/locations'
import { hallsOfProjects } from '../../domain/projects'
import type { HallRules as Rules } from '../../domain/types'
import { hallNames } from '../../domain/venue'
import { readHallreglerWorkbook, writeHallreglerWorkbook } from '../../import/hallreglerFile'
import { usePref } from '../../store/prefs'
import { useWorkspace } from '../../store/workspaceStore'
import { MergeReplaceDialog, Segmented, Switch } from '../common'
import { count } from '../dom'
import { download, XLSX_TYPE } from '../files'
import { TextField, type PickGroup } from '../fields'
import type { TablePage } from '../RegisterHead'
import { TableFileMenu } from '../TableFile'
import { describeDiff, useTableFile } from '../useTableFile'
import { hours } from './format'
import { PlacingPanel, type TriedText } from './PlacingPanel'
import { SplitPick } from './SplitPick'

/** The parts of the page, of which one is shown at a time. */
type Part = 'unplaced' | 'choices' | 'places' | 'phrases' | 'areas'
const PARTS: Part[] = ['unplaced', 'choices', 'places', 'phrases', 'areas']

/** Whom a place picked for a text is for: every project, or the projects the text stands in. */
type Scope = 'all' | 'own'

const LEAD: Record<Part, string> = {
  unplaced: 'Tekster i behovet som ingen regel plasserer. Velg et sted, så lagres det som et valg, for alle prosjekter eller bare prosjektet.',
  choices: 'Steder du har valgt for enkelte tekster. Et valg gjelder også med «Hall» foran: «a» plasserer «Hall A».',
  places: 'Et sted samler flere haller under ett navn og teller som én plass i Kalender. Står en hall i flere steder som samler, gjelder det øverste.',
  phrases: 'En tekst som inneholder ordet teller under stedet, når ingen regel over har plassert den. Første som passer gjelder; dra for å endre rekkefølgen.',
  areas: 'Samler haller for visning, som «NV HALLS». Velges under «Steder» i Kalender. Endrer ikke hvor behovet teller.',
}

const texts = (n: number) => count(n, 'tekst', 'tekster')
const lines = (n: number) => count(n, 'linje', 'linjer')
const quoted = (text: string) => (text ? `«${text}»` : '(tom)')

/** A name that no other of the list has: «Nytt sted», else «Nytt sted 2» and on. */
const freeName = (base: string, taken: (name: string) => boolean) => {
  for (let n = 1; ; n++) if (!taken(n === 1 ? base : `${base} ${n}`)) return n === 1 ? base : `${base} ${n}`
}

/** The halls a place stands for or an area holds, a button each; a hall that counts under a place above is outlined. */
function HallToggles({ halls, picked, shadowOf, onChange }: { halls: string[]; picked: string[]; shadowOf?: (hall: string) => string | undefined; onChange: (halls: string[]) => void }) {
  const chosen = new Set(picked.map((hall) => hall.toLowerCase()))
  return (
    <span className="hl-halls">
      {halls.map((hall) => {
        const on = chosen.has(hall.toLowerCase())
        const shadow = on ? shadowOf?.(hall) : undefined
        return (
          <button
            key={hall}
            className={`${on ? 'on' : ''} ${shadow ? 'shadowed' : ''}`}
            aria-pressed={on}
            title={shadow ? `${hall} telles under ${shadow}, som står over` : on ? `Fjern ${hall}` : `Legg til ${hall}`}
            onClick={() => onChange(halls.filter((other) => (other === hall ? !on : chosen.has(other.toLowerCase()))))}
          >
            {hall}
          </button>
        )
      })}
    </span>
  )
}

/**
 * The rules that place a Hall/Sted text in a hall, all of them the planner's own: the texts no rule places, the choices
 * made for single texts, places that stand for several halls, and words that mean a place, in the order they are
 * tried. Apart from them the areas, which place nothing and decide what the Kalender shows. One part is shown at a
 * time; on the right, a text is tried against the rules, with the order they are tried in.
 */
export function HallRules({ head, notify, show }: TablePage & { onOpenBehov: () => void }) {
  const { workspace, setHallRules } = useWorkspace()
  const ws = workspace!
  const halls = useMemo(() => hallNames(ws.venue), [ws.venue])
  const rules = ws.hallRules ?? NO_HALL_RULES
  const projectName = (projectNo: string) => ws.visma?.find((v) => v.projectNo === projectNo)?.eventName ?? ws.projects.find((ref) => ref.projectNo === projectNo)?.name ?? projectNo
  const places = placeNames(halls, rules)
  const choices = hallChoices(rules.choices)
  const areas = rules.areas ?? []
  const booked = useMemo(() => hallsOfProjects(ws.venue, ws.projects), [ws.venue, ws.projects])
  const review = useMemo(() => reviewPlacing(ws.demand, halls, booked, rules), [ws.demand, halls, booked, rules])
  const projects = useMemo(() => [...new Set(ws.demand.map((line) => line.projectNo))].map((no): [string, string] => [no, projectName(no)]).sort((a, b) => a[1].localeCompare(b[1], 'nb')), [ws.demand, ws.visma, ws.projects]) // eslint-disable-line react-hooks/exhaustive-deps
  const [part, setPartPref] = usePref<Part>('rulesPart', 'unplaced', (stored) => (PARTS.includes(stored as Part) ? (stored as Part) : 'unplaced'))
  const [tried, setTried] = useState<TriedText>({ text: '', projectNo: '' })
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [scopes, setScopes] = useState<Record<string, Scope>>({})
  const [bulkScope, setBulkScope] = useState<Scope>('all')
  const [dragged, setDragged] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  /** Switching parts lets go of what was selected. */
  const setPart = (next: Part) => {
    setPartPref(next)
    setSelected(new Set())
  }
  /** The part that holds the rules of a step of the order. */
  const showStep = (step: PlacedBy) => setPart(step === 'none' ? 'unplaced' : step === 'text' ? 'places' : step === 'phrase' ? 'phrases' : 'choices')

  const save = (next: Rules, text: string) => {
    setHallRules(next)
    notify(text)
  }
  const setPlaces = (next: Rules['places'], text: string) => save({ ...rules, places: next }, text)
  const setPhrases = (next: Rules['phrases'], text: string) => save({ ...rules, phrases: next }, text)
  const setAreas = (next: NonNullable<Rules['areas']>, text: string) => save({ ...rules, areas: next }, text)
  const taken = (name: string) => [...halls, ...places].some((other) => other.toLowerCase() === name.trim().toLowerCase())

  /** Places texts that no rule places: a choice for every project, or one for each project a text stands in. A text that is empty is placed for its project alone. */
  const placeTexts = (found: UnplacedText[], hall: string, scope: Scope) => {
    const next = found.reduce((with_, one) => (scope === 'own' || !one.text ? one.projectNos.reduce((each, projectNo) => withChoice(each, one.text, hall, projectNo), with_) : withChoice(with_, one.text, hall)), rules)
    const where = scope === 'all' ? ' i alle prosjekter' : ''
    save(next, `${found.length === 1 ? quoted(found[0].text) : texts(found.length)} teller under ${hall}${where} · ${lines(found.reduce((n, one) => n + one.lines, 0))}`)
    setSelected(new Set())
  }
  /** What the texts are offered, taken in one step to undo. */
  const takeOffers = (taken: UnplacedText[]) => {
    save(
      taken.reduce((next, found) => found.offers.reduce((with_, offer) => withChoice(with_, found.text, offer.hall, offer.projectNo), next), rules),
      `${texts(taken.length)} er plassert etter forslaget`,
    )
    setSelected(new Set())
  }
  /** The text as the words of a new rule, last in the order, for its place to be picked. */
  const startWordRule = (text: string) => {
    setPhrases([...rules.phrases, { text: text.toLowerCase(), hall: '' }], `Ny ordregel ${quoted(text.toLowerCase())}`)
    setPart('phrases')
  }
  /** The rules are tried from the top, so their order is the planner's to set. */
  const movePhrase = (from: number, to: number) => {
    if (from === to || to < 0 || to >= rules.phrases.length) return
    const next = [...rules.phrases]
    next.splice(to, 0, ...next.splice(from, 1))
    setPhrases(next, `${quoted(rules.phrases[from].text)} prøves nå som nr. ${to + 1}`)
  }

  /** The places to count under, in groups: the planner's places, the halls, and the place of demand not shared out on halls. */
  const placeGroups: PickGroup[] = [
    { label: 'Steder', items: rules.places.map((place) => ({ value: place.name, note: place.halls.join(', ') })).filter((item) => places.includes(item.value)) },
    { label: 'Haller', items: places.filter((name) => name !== PROJECT_HALLS && !rules.places.some((place) => place.name === name)).map((name) => ({ value: name })) },
    { items: [{ value: PROJECT_HALLS, note: 'flere haller under ett' }] },
  ].filter((group) => group.items.length > 0)
  const placePick = (value: string, label: string, onPick: (hall: string) => void, missing = 'Velg sted', offer?: string) => (
    <SplitPick value={value || undefined} offer={offer} missing={missing} label={label} head="Teller under" groups={offer ? [{ label: 'Forslag', items: [{ value: offer }] }, ...placeGroups] : placeGroups} onPick={onPick} />
  )

  const { pending, onFile, done } = useTableFile<Rules>({
    read: readHallreglerWorkbook,
    empty: !rules.places.length && !rules.phrases.length && !choices.length && !areas.length,
    takeIn: (incoming, file) => save(incoming, `${file} lest inn`),
    onError: show,
  })
  const diff = pending ? diffHallRules(rules, pending.incoming) : null
  const onlyInApp = diff ? diff.places.onlyInApp + diff.phrases.onlyInApp + diff.choices.onlyInApp + diff.areas.onlyInApp : 0

  const unplaced = review.unplaced
  const allSelected = unplaced.length > 0 && unplaced.every((found) => selected.has(found.key))
  const toggle = (key: string) =>
    setSelected((before) => {
      const next = new Set(before)
      if (!next.delete(key)) next.add(key)
      return next
    })
  const unused = choices.filter((choice) => !review.choices.get(choice.key))
  const offered = unplaced.filter((found) => found.offers.length > 0)
  const loose = halls.filter((hall) => !areas.some((area) => area.halls.some((other) => other.toLowerCase() === hall.toLowerCase())))

  const partLabel = (label: string, n: number, issue = false) => (
    <>
      {label} {issue && n ? <span className="count-chip alert">{n}</span> : <span className="count">{n}</span>}
    </>
  )

  return (
    <>
      {head(
        <TableFileMenu
          exportTitle="Last ned hallreglene som en Excel-fil, med et ark for steder, et for ord, et for valg og et for områder."
          importTitle="Les inn en fil med hallregler: en som er eksportert herfra, eller en med de samme arkene og kolonnene."
          canExport={rules.places.length + rules.phrases.length + choices.length + areas.length > 0}
          onExport={() => download(`expo-planner-hallregler-${todayIso()}.xlsx`, writeHallreglerWorkbook(rules), XLSX_TYPE)}
          onFile={onFile}
        />,
      )}
      <div className="hl-rules">
        <div className="op">
          <div className="op-bar">
            <Segmented
              label="Del av hallreglene"
              value={part}
              onChange={setPart}
              options={[
                { value: 'unplaced', label: partLabel('Uplassert', unplaced.length, true), title: 'Hall/sted-tekster i behovet som ingen regel plasserer' },
                { value: 'choices', label: partLabel('Valg for tekster', choices.length), title: 'Stedene du har valgt for enkelte tekster' },
                { value: 'places', label: partLabel('Steder', rules.places.length), title: 'Steder som står for flere haller' },
                { value: 'phrases', label: partLabel('Ordregler', rules.phrases.length), title: 'Ord som betyr et sted' },
              ]}
            />
            <span className="rules-apart" aria-hidden />
            <Segmented
              label="Det som bare bestemmer hva som vises"
              value={part}
              onChange={setPart}
              options={[{ value: 'areas', label: partLabel('Områder', areas.length), title: 'Områdene hallene er samlet i. De bestemmer bare hva som vises i Kalender, ikke hvor behovet teller.' }]}
            />
            <span className="toolbar-gap" />
            {part === 'unplaced' && offered.length > 0 && (
              <button title={offered.map((found) => `${quoted(found.text)}: ${[...new Set(found.offers.map((offer) => offer.hall))].join(', ')}`).join('\n')} onClick={() => takeOffers(offered)}>
                Bruk forslagene ({offered.length})
              </button>
            )}
            {part === 'choices' && unused.length > 0 && (
              <button title="Valg som ingen linje i behovet bruker nå" onClick={() => save(unused.reduce((next, choice) => withChoice(next, choice.text, undefined, choice.projectNo), rules), `Fjernet ${count(unused.length, 'ubrukt valg', 'ubrukte valg')}`)}>
                <Trash2 size={13} aria-hidden /> Fjern ubrukte ({unused.length})
              </button>
            )}
            {part === 'places' && (
              <button className="primary" onClick={() => setPlaces([...rules.places, { name: freeName('Nytt sted', taken), halls: [] }], 'La til et sted')}>
                <Plus size={14} aria-hidden /> Nytt sted
              </button>
            )}
            {part === 'phrases' && (
              <button className="primary" onClick={() => setPhrases([...rules.phrases, { text: '', hall: '' }], 'La til en ordregel')}>
                <Plus size={14} aria-hidden /> Ny ordregel
              </button>
            )}
            {part === 'areas' && (
              <button className="primary" onClick={() => setAreas([...areas, { name: freeName('Nytt område', (name) => areas.some((area) => area.name.toLowerCase() === name.toLowerCase())), halls: [] }], 'La til et område')}>
                <Plus size={14} aria-hidden /> Nytt område
              </button>
            )}
          </div>
          <p className="op-lead hl-lead">{LEAD[part]}</p>

          {part === 'unplaced' &&
            (!ws.demand.length ? (
              <p className="op-empty">Ingen behov er lest inn ennå.</p>
            ) : unplaced.length ? (
              <div className="op-table hl-unplaced">
                <div className="op-row op-head">
                  <span className="mk-center">
                    <input type="checkbox" checked={allSelected} aria-label="Velg alle" onChange={() => setSelected(allSelected ? new Set() : new Set(unplaced.map((found) => found.key)))} />
                  </span>
                  <span>Hall/sted i behovet</span>
                  <span>Prosjekter</span>
                  <span className="num">Linjer</span>
                  <span className="num" title="Timene til linjene, montering og demontering">
                    Timer
                  </span>
                  <span>Gjelder</span>
                  <span>Plasser i</span>
                  <span />
                </div>
                <div className="op-body">
                  {unplaced.map((found) => {
                    const scope = scopes[found.key] ?? 'all'
                    const offer = found.offers.length === 1 && (scope === 'all') === !found.offers[0].projectNo ? found.offers[0].hall : undefined
                    return (
                      <div key={found.key} className={`op-row ${selected.has(found.key) ? 'hl-selected' : ''}`}>
                        <span className="mk-center">
                          <input type="checkbox" checked={selected.has(found.key)} aria-label={`Velg ${quoted(found.text)}`} onChange={() => toggle(found.key)} />
                        </span>
                        <span>
                          {found.text ? (
                            <button className="link hl-text" title="Prøv teksten i panelet til høyre" onClick={() => setTried({ text: found.text, projectNo: found.projectNos[0] })}>
                              «{found.text}»
                            </button>
                          ) : (
                            <span className="faint" title="Linjer uten Hall/sted. De plasseres for prosjektet alene: en tom tekst sier ingenting som gjelder andre.">
                              (tom)
                            </span>
                          )}
                        </span>
                        <span className="muted small ellipsis" title={found.projectNos.map(projectName).join('\n')}>
                          {found.projectNos.map(projectName).join(', ')}
                        </span>
                        <span className="num">{found.lines}</span>
                        <span className="num muted">{hours(found.hours)}</span>
                        <span>
                          {found.text ? (
                            <Segmented
                              label={`Hvem valget for ${quoted(found.text)} gjelder`}
                              value={scope}
                              onChange={(next) => setScopes({ ...scopes, [found.key]: next })}
                              options={[
                                { value: 'all', label: 'Alle prosjekter', title: 'Valget gjelder teksten i alle prosjekter, også de som kommer' },
                                { value: 'own', label: found.projectNos.length > 1 ? 'Hvert prosjekt' : 'Bare prosjektet', title: 'Et valg for teksten i hvert prosjekt den står i nå' },
                              ]}
                            />
                          ) : (
                            <span className="muted small">Bare prosjektet</span>
                          )}
                        </span>
                        <span>{placePick('', `Plassering for ${quoted(found.text)}`, (hall) => placeTexts([found], hall, scope), 'Velg sted', offer)}</span>
                        <span className="op-actions">
                          {found.text && (
                            <button className="link small" title="Lag en ordregel fra teksten i stedet for et valg: den plasserer også andre tekster med de samme ordene" onClick={() => startWordRule(found.text)}>
                              Ordregel
                            </button>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {selected.size > 0 && (
                  <div className="hl-bulk" role="toolbar" aria-label="Det som er valgt">
                    <strong>{texts(selected.size)}</strong>
                    <span className="hl-bulk-gap" />
                    <Segmented
                      label="Hvem valgene gjelder"
                      value={bulkScope}
                      onChange={setBulkScope}
                      options={[
                        { value: 'all', label: 'Alle prosjekter' },
                        { value: 'own', label: 'Hvert prosjekt' },
                      ]}
                    />
                    {placePick('', 'Plasser de valgte', (hall) => placeTexts(unplaced.filter((found) => selected.has(found.key)), hall, bulkScope), 'Plasser i …')}
                    <button className="link small" onClick={() => setSelected(new Set())}>
                      Avbryt
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="hl-done">
                <Check size={18} aria-hidden />
                <div>
                  <strong>Alt er plassert</strong>
                  <span className="muted">Alle Hall/sted-tekster i behovet teller under en hall eller et sted.</span>
                </div>
              </div>
            ))}

          {part === 'choices' &&
            (choices.length ? (
              <div className="op-table hl-choices">
                <div className="op-row op-head">
                  <span>Hall/sted</span>
                  <span>Gjelder</span>
                  <span>Teller under</span>
                  <span className="num">Linjer</span>
                  <span />
                </div>
                <div className="op-body">
                  {choices.map((choice) => {
                    const used = review.choices.get(choice.key) ?? 0
                    return (
                      <div key={choice.key} className="op-row">
                        <span className="hl-text">{choice.text ? `«${choice.text}»` : <span className="faint">(tom)</span>}</span>
                        <span>
                          <SplitPick
                            value={choice.projectNo ? projectName(choice.projectNo) : 'Alle prosjekter'}
                            missing="Alle prosjekter"
                            label={`Hvem valget for ${quoted(choice.text)} gjelder`}
                            head="Valget gjelder"
                            groups={[{ items: [{ value: '', label: 'Alle prosjekter' }] }, { label: 'Prosjekter', items: projects.map(([no, name]) => ({ value: no, label: name, note: no })) }]}
                            onPick={(projectNo) =>
                              projectNo !== (choice.projectNo ?? '') &&
                              save(withChoice(withChoice(rules, choice.text, undefined, choice.projectNo), choice.text, choice.hall, projectNo || undefined), `${quoted(choice.text)} gjelder nå ${projectNo ? projectName(projectNo) : 'alle prosjekter'}`)
                            }
                          />
                        </span>
                        <span>{placePick(choice.hall, `Sted for ${quoted(choice.text)}`, (hall) => save(withChoice(rules, choice.text, hall, choice.projectNo), `${quoted(choice.text)} teller under ${hall}`))}</span>
                        <span className="num">{used || <span className="op-tag">ubrukt</span>}</span>
                        <span className="op-actions">
                          <button className="icon-button" title="Fjern valget: teksten leses automatisk igjen" onClick={() => save(withChoice(rules, choice.text, undefined, choice.projectNo), `Valget for ${quoted(choice.text)} er fjernet`)}>
                            <X size={13} aria-hidden />
                          </button>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p className="op-empty">Ingen ennå. Et sted du velger under Uplassert, eller i kolonnen Plassering på Behov, havner her.</p>
            ))}

          {part === 'places' && (
            <div className="op-table hl-places">
              <div className="op-row op-head">
                <span>Sted</span>
                <span>Står for</span>
                <span title="Samler: det som havner i en av hallene teller under stedet (B1 blir B). Hver for seg: hallene teller hver for seg.">Samler hallene</span>
                <span />
              </div>
              <div className="op-body">
                {rules.places.map((place, index) => {
                  const collects = place.collects !== false
                  return (
                    <div key={index} className="op-row">
                      <span className="mk-name">
                        <TextField
                          value={place.name}
                          ariaLabel={`Navn på stedet ${place.name}`}
                          onCommit={(name) => {
                            if (!name || name === place.name) return
                            if (taken(name)) return show(`${name} er en hall eller et sted fra før.`)
                            save(withPlaceRenamed(halls, rules, place.name, name), `Stedet heter nå ${name}`)
                          }}
                        />
                      </span>
                      <HallToggles
                        halls={halls}
                        picked={place.halls}
                        shadowOf={collects ? (hall) => rules.places.slice(0, index).find((other) => other.collects !== false && other.halls.some((h) => h.toLowerCase() === hall.toLowerCase()))?.name : undefined}
                        onChange={(picked) => setPlaces(rules.places.map((other, at) => (at === index ? { ...other, halls: picked } : other)), `${place.name}: ${picked.join(', ') || 'ingen haller'}`)}
                      />
                      <span className="hl-collects">
                        <Switch
                          on={collects}
                          label={`${place.name} samler hallene`}
                          onChange={(on) => setPlaces(rules.places.map((other, at) => (at === index ? { ...other, collects: on } : other)), on ? `${place.name} samler hallene` : `Hallene i ${place.name} teller hver for seg`)}
                        />
                        <span className="small muted">{collects ? 'Samler' : 'Hver for seg'}</span>
                      </span>
                      <span className="op-actions">
                        <button className="icon-button" title={`Slett stedet ${place.name}`} onClick={() => setPlaces(rules.places.filter((_, at) => at !== index), `Stedet ${place.name} er slettet`)}>
                          <Trash2 size={13} aria-hidden />
                        </button>
                      </span>
                    </div>
                  )
                })}
                <div className="op-row hl-fixed">
                  <strong>{PROJECT_HALLS}</strong>
                  <span className="muted small">Alle hallene prosjektet har. For behov bestilt som én sum, som «Hall C, D, E». Finnes alltid, og er ikke det samme som en rad for «Alle haller» i Kalender.</span>
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}

          {part === 'phrases' &&
            (rules.phrases.length ? (
              <div className="op-table hl-phrases">
                <div className="op-row op-head">
                  <span />
                  <span className="num" title="Rekkefølgen reglene prøves i">
                    Nr.
                  </span>
                  <span>Inneholder teksten</span>
                  <span>teller den under</span>
                  <span className="num">Linjer</span>
                  <span />
                  <span />
                </div>
                <div className="op-body">
                  {rules.phrases.map((phrase, index) => {
                    const use = review.phrases[index] ?? { lines: 0, texts: [], matches: 0 }
                    return (
                      <div
                        key={index}
                        className={`op-row ${dragged === index ? 'mk-dragged' : ''} ${over === index && dragged !== null && dragged !== index ? 'mk-over' : ''}`}
                        onDragOver={(e) => {
                          if (dragged === null) return
                          e.preventDefault()
                          setOver(index)
                        }}
                        onDrop={() => {
                          if (dragged !== null) movePhrase(dragged, index)
                          setDragged(null)
                          setOver(null)
                        }}
                      >
                        <span className="mk-order">
                          <span className="mk-grip" draggable title="Dra for å endre rekkefølgen" onDragStart={() => setDragged(index)} onDragEnd={() => (setDragged(null), setOver(null))}>
                            <GripVertical size={14} aria-hidden />
                          </span>
                          <span className="mk-arrows">
                            <button className="icon-button" title="Flytt opp: prøves før" disabled={index === 0} onClick={() => movePhrase(index, index - 1)}>
                              <ChevronUp size={12} aria-hidden />
                            </button>
                            <button className="icon-button" title="Flytt ned: prøves etter" disabled={index === rules.phrases.length - 1} onClick={() => movePhrase(index, index + 1)}>
                              <ChevronDown size={12} aria-hidden />
                            </button>
                          </span>
                        </span>
                        <span className="num muted">{index + 1}</span>
                        <span className="op-name">
                          <span className={`hl-words ${phrase.text ? '' : 'want'}`}>
                            <TextField
                              value={phrase.text}
                              placeholder="+ ord"
                              autoFocus={!phrase.text && index === rules.phrases.length - 1}
                              ariaLabel="Ord i teksten"
                              onCommit={(text) => {
                                const words = text.trim().toLowerCase()
                                if (words !== phrase.text) setPhrases(rules.phrases.map((other, at) => (at === index ? { ...other, text: words } : other)), words ? `Ordregel ${quoted(words)}` : 'Ordregelen har ingen ord')
                              }}
                            />
                          </span>
                          {use.texts.length > 0 && (
                            <span className="op-tag ellipsis" title={use.texts.join('\n')}>
                              {use.texts.join(', ')}
                            </span>
                          )}
                        </span>
                        <span>
                          {placePick(
                            places.find((name) => name.toLowerCase() === phrase.hall.toLowerCase()) ?? phrase.hall,
                            `Sted for ${quoted(phrase.text)}`,
                            (hall) => setPhrases(rules.phrases.map((other, at) => (at === index ? { ...other, hall } : other)), `${quoted(phrase.text)} teller under ${hall}`),
                          )}
                        </span>
                        <span className={`num ${use.lines ? '' : 'muted'}`}>{use.lines}</span>
                        <span>
                          {!phrase.text || !phrase.hall ? null : !use.lines && use.matches ? (
                            <span className="op-lacking" title={`Alle tekster med ${quoted(phrase.text)} blir plassert av reglene over før de når denne`}>
                              Skygget av reglene over
                            </span>
                          ) : !use.matches ? (
                            <span className="op-tag">ingen treff</span>
                          ) : null}
                        </span>
                        <span className="op-actions">
                          <button className="icon-button" title="Slett regelen" onClick={() => setPhrases(rules.phrases.filter((_, at) => at !== index), `Ordregelen ${quoted(phrase.text)} er slettet`)}>
                            <Trash2 size={13} aria-hidden />
                          </button>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p className="op-empty">Ingen ordregler ennå. Lag en med «Ny ordregel», eller fra en tekst under Uplassert.</p>
            ))}

          {part === 'areas' && (
            <div className="op-table hl-areas">
              <div className="op-row op-head">
                <span>Område</span>
                <span>Haller</span>
                <span />
              </div>
              <div className="op-body">
                {areas.map((area, index) => (
                  <div key={index} className="op-row">
                    <span className="mk-name">
                      <TextField
                        value={area.name}
                        ariaLabel={`Navn på området ${area.name}`}
                        onCommit={(name) => {
                          if (!name || name === area.name) return
                          const next = withAreaRenamed(areas, index, name)
                          if (next === areas) return show(`Et område heter ${name} fra før.`)
                          setAreas(next, `Området heter nå ${name}`)
                        }}
                      />
                    </span>
                    <HallToggles
                      halls={halls}
                      picked={area.halls}
                      shadowOf={(hall) => areas.slice(0, index).find((other) => other.halls.some((h) => h.toLowerCase() === hall.toLowerCase()))?.name}
                      onChange={(picked) => setAreas(areas.map((other, at) => (at === index ? { ...other, halls: picked } : other)), `${area.name}: ${picked.join(', ') || 'ingen haller'}`)}
                    />
                    <span className="op-actions">
                      <button className="icon-button" title={`Slett området ${area.name}. Hallene blir stående.`} onClick={() => setAreas(areas.filter((_, at) => at !== index), `Området ${area.name} er slettet`)}>
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </span>
                  </div>
                ))}
                {loose.length > 0 && (
                  <div className="op-row hl-fixed">
                    <span className="muted">Uten område</span>
                    <span className="num muted small">{loose.join(', ')}</span>
                    <span />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <PlacingPanel halls={halls} rules={rules} booked={booked} review={review} projects={projects} tried={tried} part={part === 'areas' ? undefined : part} onTry={setTried} onStep={showStep} />
      </div>

      {pending && diff && (
        <MergeReplaceDialog
          title="Importer hallregler"
          source={pending.file}
          results={[describeDiff('Steder', diff.places), describeDiff('Ordregler', diff.phrases), describeDiff('Valg for tekster', diff.choices), describeDiff('Områder', diff.areas)]}
          replaceText={`stedene, ordreglene, valgene og områdene i appen byttes helt ut med filen${onlyInApp > 0 ? `; ${onlyInApp} som bare finnes i appen forsvinner` : ''}. Ved sammenslåing prøves filens ordregler før de som bare finnes i appen`}
          onCancel={done}
          onApply={(mode) => {
            save(mode === 'merge' ? mergeHallRules(rules, pending.incoming) : pending.incoming, `${pending.file} ${mode === 'merge' ? 'slått sammen med reglene' : 'har erstattet reglene'}`)
            done()
          }}
        />
      )}
    </>
  )
}
