import { useMemo } from 'react'
import { competenceStyles } from '../../domain/competences'
import { ORDERED_STAGES, stageOrderOf, WEIGHTS, weightsOf, type Weights } from '../../domain/planner/score'
import type { Stage } from '../../domain/types'
import { STAGE_NAMES } from '../../import/kompetanserFile'
import { useWorkspace } from '../../store/workspaceStore'
import { NumberField } from '../fields'
import { OrderHandle, useRowOrder } from '../RowOrder'

/** What each stage is, in the planner's words (the interview of 2026-10-25). */
const STAGE_TEXT: Record<Stage, string> = {
  oppmerking: 'Standarealene måles ut og merkes, minst to per hall.',
  gulv: 'Teppe, engangsteppe, oppbygget gulv og laminat.',
  standbygging: 'Systemvegger og skillevegger mellom utstillere.',
  tilvalg: 'Kundens tilvalg: profilering, snekkervegger.',
  losore: 'Møbler og innredning: disker, podier, hyller og heng.',
  lopende: 'Går mens veggene står, utenfor rekkefølgen: banner og transport.',
  ekstra: 'Husets egne tjenester, utenfor rekkefølgen: møterom og tribuner. Viker for alt annet og kommer sist.',
}

/** The weights of the score, each with what it is and what it counts, in the order they are read. */
const WEIGHT_ROWS: { key: keyof Weights; label: string; text: string; unit: string }[] = [
  { key: 'uncovered', label: 'Udekket time', text: 'En time ingen dekker. Det dyreste: motoren prøver alt annet først.', unit: 'per time' },
  { key: 'hireEasiest', label: 'Innleid time, letteste kompetanse', text: 'For kompetansen nederst på Kompetanser.', unit: 'per time' },
  { key: 'hireHardest', label: 'Innleid time, vanskeligste kompetanse', text: 'For kompetansen øverst på Kompetanser; de imellom får en verdi imellom.', unit: 'per time' },
  { key: 'minCallOut', label: 'Minste oppmøte for innleide', text: 'En innleid betales for minst så mange timer, uansett hvor lite det er å gjøre.', unit: 'timer' },
  { key: 'overtimePerson', label: 'Person på overtid', text: 'Hver person som tar overtid en dag.', unit: 'per person og dag' },
  { key: 'overtimeShort', label: 'Kort overtid', text: 'Så mange timer per person og dag teller som kort overtid.', unit: 'timer' },
  { key: 'overtimeHour', label: 'Overtidstime, kort', text: 'En time av den korte overtiden.', unit: 'per time' },
  { key: 'overtimeLongHour', label: 'Overtidstime, utover', text: 'En time overtid utover den korte.', unit: 'per time' },
  { key: 'competenceSwitch', label: 'Bytte av kompetanse', text: 'En person går til en annen kompetanse. Langs en kjede på Kompetanser teller det ikke.', unit: 'per bytte' },
  { key: 'hallSwitch', label: 'Bytte av hall', text: 'En person går til en annen hall.', unit: 'per bytte' },
  { key: 'projectSwitch', label: 'Bytte av prosjekt', text: 'En person går til et annet prosjekt i samme hall.', unit: 'per bytte' },
  { key: 'outsideWindow', label: 'Dag utenfor vinduet', text: 'En dag et prosjekt bruker en hall før monteringen eller etter demonteringen.', unit: 'per hall og dag' },
  { key: 'stageDay', label: 'Dag i feil trinnrekkefølge', text: 'En dag et trinn starter før trinnet før det, eller slutter etter trinnet etter.', unit: 'per dag' },
  { key: 'belowMinimum', label: 'For få i hallen', text: 'En person for lite av det minste antallet per hall på Kompetanser.', unit: 'per person' },
]

/**
 * The planning engine's rules, open to the planner (2026-10-25): the order of the stages, what each holds, and the
 * weights of the score, each in hours against a permanent hour, which counts nothing. Stored in the settings
 * (`EngineRules`); the engine and the score read them from there.
 */
export function EngineRules({ notify }: { notify: (text: string) => void }) {
  const { workspace, updateSettings } = useWorkspace()
  const ws = workspace!
  const order = stageOrderOf(ws.settings)
  const weights = weightsOf(ws.settings)
  const styles = useMemo(() => competenceStyles(ws), [ws])
  const onStage = (stage: Stage) => styles.filter((style) => style.stage === stage).map((style) => style.label)
  const ownTypes = (stage: Stage) => (ws.kpi?.workTypes ?? []).filter((rule) => rule.stage === stage).map((rule) => rule.productType)

  const setRules = (patch: Partial<NonNullable<typeof ws.settings.engine>>, text: string) => {
    updateSettings({ ...ws.settings, engine: { ...ws.settings.engine, ...patch } })
    notify(text)
  }
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= order.length) return
    const next = [...order]
    const [stage] = next.splice(from, 1)
    next.splice(to, 0, stage)
    setRules({ stageOrder: next }, `${STAGE_NAMES[stage]} er nå trinn ${to + 1} i monteringen`)
  }
  const rowOrder = useRowOrder(move, true)
  const setWeight = (key: keyof Weights, value: number, label: string) => {
    const own = { ...ws.settings.engine?.weights }
    if (value === WEIGHTS[key]) delete own[key]
    else own[key] = value
    setRules({ weights: own }, `${label}: ${String(value).replace('.', ',')}`)
  }
  const changed = !!ws.settings.engine?.stageOrder?.length || Object.keys(ws.settings.engine?.weights ?? {}).length > 0

  const stageRow = (stage: Stage, extra?: string) => {
    const competences = onStage(stage)
    const types = ownTypes(stage)
    return (
      <>
        <span className="eng-stage">
          <strong>{STAGE_NAMES[stage]}</strong>
          <span className="muted small">{extra ?? STAGE_TEXT[stage]}</span>
        </span>
        <span className="small">{competences.length ? competences.join(', ') : <span className="faint">ingen kompetanser</span>}</span>
        <span className="small muted">{types.join(', ')}</span>
      </>
    )
  }

  return (
    <div className="op eng-page">
      <div className="op-zone">
        <p className="op-flow">
          <span>
            Motoren bak <strong>✦ Foreslå plan</strong> følger reglene her. Trinnet til en kompetanse settes på Mannskap › Kompetanser, og en produkttype kan få sitt eget på Oppsett › Produkttyper.
          </span>
          <span className="op-flow-aside">{changed ? 'Noe er endret fra standard.' : 'Alt står på standard.'}</span>
          <span className="toolbar-gap" />
          {changed && (
            <button className="ghost" onClick={() => (updateSettings({ ...ws.settings, engine: undefined }), notify('Motorens regler er satt tilbake til standard'))}>
              Tilbake til standard
            </button>
          )}
        </p>
      </div>

      <h3 className="eng-head">Trinn i en montering</h3>
      <p className="muted small eng-lead">
        Et trinn åpnes når trinnet før har startet i hallen, dagen etter der vinduet har dager nok. Demontering tar trinnene baklengs. Dra eller bruk pilene for å endre rekkefølgen.
      </p>
      <div className="op-table eng-stages">
        <div className="op-row op-head">
          <span />
          <span>Trinn</span>
          <span>Kompetanser</span>
          <span>Produkttyper med eget trinn</span>
        </div>
        <div className="op-body">
          {order.map((stage, index) => (
            <div key={stage} {...rowOrder.row(index)}>
              <OrderHandle index={index} count={order.length} grip={rowOrder.grip(index)} onMove={move} gripTitle="Dra for å flytte" />
              {stageRow(stage)}
            </div>
          ))}
          {(['lopende', 'ekstra'] as Stage[]).map((stage) => (
            <div key={stage} className="op-row eng-outside">
              <span />
              {stageRow(stage)}
            </div>
          ))}
        </div>
      </div>
      <p className="muted small eng-lead">{ORDERED_STAGES.length} trinn i rekkefølge, og to utenfor den.</p>

      <h3 className="eng-head">Vekter i poengsummen</h3>
      <p className="muted small eng-lead">Alt regnes i timer. En fast time teller 0, siden de faste er der uansett; alt annet veies mot den. Motoren velger planen med lavest sum.</p>
      <div className="op-table eng-weights">
        <div className="op-row op-head">
          <span>Kostnad</span>
          <span>Hva den teller</span>
          <span className="num">Vekt</span>
          <span>Per</span>
          <span className="num">Standard</span>
        </div>
        <div className="op-body">
          {WEIGHT_ROWS.map(({ key, label, text, unit }) => (
            <div key={key} className="op-row">
              <strong>{label}</strong>
              <span className="muted small">{text}</span>
              <span className="num">
                <NumberField value={weights[key]} ariaLabel={label} onCommit={(value) => setWeight(key, Math.max(0, value), label)} />
              </span>
              <span className="muted small">{unit}</span>
              <span className={weights[key] === WEIGHTS[key] ? 'num faint' : 'num'}>{String(WEIGHTS[key]).replace('.', ',')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
