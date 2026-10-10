import { useState } from 'react'
import { formatFte } from '../../domain/calc'
import type { UnplacedText } from '../../domain/hallReview'
import { PROJECT_HALLS } from '../../domain/locations'
import { Segmented } from '../common'
import { DataTable } from '../DataTable'
import { useTable, type Column } from '../useTable'

/** Whom a place picked in the list is for: every project, or the projects the text stands in. */
type Scope = 'all' | 'own'

const hours = (value: number) => formatFte(value, 1)

interface Props {
  unplaced: UnplacedText[]
  /** Every place a text can count under. */
  places: string[]
  projectName: (projectNo: string) => string
  /** Places the text: for every project, or with `own` for each of the projects it stands in. */
  onPlace: (found: UnplacedText, hall: string, own: boolean) => void
  /** Takes what the texts are offered, all in one step. */
  onOffers: (found: UnplacedText[]) => void
  /** Tries the text against the rules, in the panel. */
  onTry: (text: string, projectNo: string) => void
  /** Starts a rule for words from the text. */
  onWordRule: (text: string) => void
}

/**
 * The Hall/Sted texts of the demand that no rule places, a row per text with the lines and hours that wait for it.
 * A place picked here is a choice for the text, as one made in the Plassering column of Behov.
 */
export function Unplaced({ unplaced, places, projectName, onPlace, onOffers, onTry, onWordRule }: Props) {
  const [scope, setScope] = useState<Scope>('all')
  const offered = unplaced.filter((found) => found.offers.length > 0)
  const offerText = (found: UnplacedText): string => {
    const [first] = found.offers
    if (!first) return ''
    if (!first.projectNo) return `Bruk ${first.hall}`
    return found.offers.length === 1 && found.projectNos.length === 1 ? `Bruk ${first.hall}` : found.offers.length === 1 ? `Bruk ${first.hall} for ${projectName(first.projectNo)}` : `Bruk forslag for ${found.offers.length} prosjekter`
  }
  const offerTitle = (found: UnplacedText): string =>
    found.offers
      .map((offer) =>
        offer.projectNo
          ? `${projectName(offer.projectNo)} har booket ${offer.hall} alene. Valget gjelder det prosjektet.`
          : offer.hall === PROJECT_HALLS
            ? `Teksten nevner flere haller. ${PROJECT_HALLS} er behov som ikke er fordelt på hall. Valget gjelder alle prosjekter.`
            : `Teksten nevner ${offer.hall}. Valget gjelder alle prosjekter.`,
      )
      .join('\n')
  const columns: Column<UnplacedText>[] = [
    {
      key: 'text',
      head: 'Hall/sted i behovet',
      text: (found) => found.text || '(tom)',
      cell: (found) =>
        found.text ? (
          <button className="link" title="Prøv teksten mot reglene, i panelet" onClick={() => onTry(found.text, found.projectNos[0])}>
            {found.text}
          </button>
        ) : (
          <span className="muted" title="Linjer uten Hall/sted. De plasseres for prosjektet alene: en tom tekst sier ingenting som gjelder andre.">
            (tom)
          </span>
        ),
    },
    {
      key: 'projects',
      head: 'Prosjekter',
      text: (found) => found.projectNos.map(projectName),
      cell: (found) => (found.projectNos.length > 2 ? `${found.projectNos.slice(0, 2).map(projectName).join(', ')} +${found.projectNos.length - 2}` : found.projectNos.map(projectName).join(', ')),
      cellProps: (found) => ({ title: found.projectNos.map(projectName).join('\n') }),
    },
    { key: 'lines', head: 'Linjer', className: 'num', text: (found) => String(found.lines), sort: (found) => found.lines, cell: (found) => found.lines },
    { key: 'hours', head: 'Timer', title: 'Timene til linjene, montering og demontering', className: 'num', text: (found) => hours(found.hours), sort: (found) => found.hours, cell: (found) => hours(found.hours) },
    {
      key: 'planned',
      head: 'I plan t',
      title: `Av timene: de som er tatt inn i plan, og som Kalender nå viser under «Mangler hall»`,
      className: 'num',
      text: (found) => hours(found.plannedHours),
      sort: (found) => found.plannedHours,
      cell: (found) => hours(found.plannedHours),
    },
    {
      key: 'offer',
      head: 'Forslag',
      title: 'Stedet teksten nevner et sted i seg, eller den eneste hallen prosjektet har booket',
      text: (found) => (found.offers.length ? [...new Set(found.offers.map((offer) => offer.hall))] : ''),
      cell: (found) =>
        found.offers.length > 0 && (
          <button className="link" title={offerTitle(found)} onClick={() => onOffers([found])}>
            {offerText(found)}
          </button>
        ),
    },
    {
      key: 'place',
      head: 'Plasser i',
      cell: (found) => (
        <select
          className="location unresolved"
          value=""
          aria-label={`Plassering for ${found.text || '(tom)'}`}
          title={!found.text ? 'Valget gjelder linjene uten Hall/sted i dette prosjektet.' : scope === 'own' ? 'Valget gjelder teksten i prosjektene den står i nå.' : 'Valget gjelder teksten i alle prosjekter.'}
          onChange={(e) => e.target.value && onPlace(found, e.target.value, scope === 'own')}
        >
          <option value="">Velg sted …</option>
          {places.map((hall) => (
            <option key={hall} value={hall}>
              {hall === PROJECT_HALLS ? `${hall} (flere haller under ett)` : hall}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: 'actions',
      className: 'actions',
      cell: (found) =>
        found.text && (
          <button className="link" title="Lag en regel for ord fra teksten, i stedet for et valg: den plasserer også andre tekster med de samme ordene" onClick={() => onWordRule(found.text)}>
            Regel for ord …
          </button>
        ),
    },
  ]
  const table = useTable(unplaced, columns)
  if (!unplaced.length) return <p className="muted">Alt er plassert: hver Hall/sted-tekst i behovet teller under en hall eller et sted.</p>
  return (
    <>
      <div className="section-title">
        <Segmented
          label="Hvem et valg gjelder"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'Alle prosjekter', title: 'Et sted du velger gjelder teksten i alle prosjekter, også de som kommer' },
            { value: 'own', label: 'Bare prosjektene', title: 'Et sted du velger gjelder teksten i prosjektene den står i nå, ett valg per prosjekt' },
          ]}
        />
        <span className="toolbar-gap" />
        {offered.length > 0 && (
          <button title={offered.map((found) => `${found.text || '(tom)'}: ${[...new Set(found.offers.map((offer) => offer.hall))].join(', ')}`).join('\n')} onClick={() => onOffers(offered)}>
            Bruk forslagene ({offered.length})
          </button>
        )}
      </div>
      <DataTable table={table} rowKey={(found) => found.key} className="rules" />
    </>
  )
}
