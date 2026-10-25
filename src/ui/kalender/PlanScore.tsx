import { dayText } from '../../domain/dates'
import type { CostKind, Finding, Score } from '../../domain/planner/score'
import { STAGE_NAMES } from '../../import/kompetanserFile'
import { hours } from '../format'

const KIND_LABELS: Record<CostKind, string> = {
  uncovered: 'Udekket',
  hire: 'Innleie',
  overtime: 'Overtid',
  switch: 'Bytter',
  outside: 'Utenfor vinduet',
  stage: 'Trinn i feil rekkefølge',
  minimum: 'For få i hallen',
}

const SWITCHED: Record<NonNullable<Finding['switched']>, string> = { competence: 'kompetanse', hall: 'hall', project: 'prosjekt' }

/** How many of the costliest findings are listed. */
const SHOWN = 6

/** One finding in words: what, where and when. */
const findingText = (f: Finding, competence: (key: string) => string, person: (id: string) => string): string => {
  const day = dayText(f.date)
  const where = [f.competence && competence(f.competence), f.hall].filter(Boolean).join(' · ')
  switch (f.kind) {
    case 'uncovered':
      return `${where} ${day}: ${hours(f.hours ?? 0)} t udekket`
    case 'hire':
      return `${where} ${day}: ${hours(f.hours ?? 0)} t innleid`
    case 'overtime':
      return `${person(f.personId ?? '')} ${day}: ${hours(f.hours ?? 0)} t overtid`
    case 'switch':
      return `${person(f.personId ?? '')} ${day}: bytter ${SWITCHED[f.switched ?? 'project']}`
    case 'outside':
      return `${f.hall ?? 'Hallen'} ${day}: utenfor vinduet`
    case 'stage':
      return `${f.stage ? STAGE_NAMES[f.stage] : 'Trinn'}${f.hall ? ` i ${f.hall}` : ''} ${day}: før eller etter sin tur`
    case 'minimum':
      return `${where} ${day}: for få`
  }
}

interface Props {
  score: Score
  competence: (key: string) => string
  person: (id: string) => string
}

/**
 * The score of the project of the row in focus, in the row details: what its plan and staffing cost, in hours, by kind,
 * and the costliest findings. A permanent hour costs nothing; everything else is weighed against it (`domain/planner/score.ts`).
 */
export function PlanScore({ score, competence, person }: Props) {
  const kinds = (Object.keys(KIND_LABELS) as CostKind[]).filter((kind) => score.byKind[kind] > 0)
  return (
    <section className="insp-sec">
      <h3 className="insp-h" title="Hva planen og bemanningen for prosjektet koster, regnet i timer: en fast time teller 0, en time ingen dekker teller 10">
        Poengsum for prosjektet<span>{hours(score.total)} t</span>
      </h3>
      {kinds.length ? (
        <>
          <dl className="insp-dl">
            {kinds.map((kind) => (
              <div key={kind} className="insp-pair">
                <dt>{KIND_LABELS[kind]}</dt>
                <dd className="num">{hours(score.byKind[kind])} t</dd>
              </div>
            ))}
          </dl>
          <ul className="insp-findings">
            {score.findings.slice(0, SHOWN).map((f, i) => (
              <li key={i}>
                <span>{findingText(f, competence, person)}</span>
                <b>{hours(f.cost)}</b>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="insp-note">Planen koster ingenting utover de faste: alt er dekket i normal tid, i vinduet og uten bytter.</p>
      )}
    </section>
  )
}
