import { memo, useMemo, type ReactNode } from 'react'
import { CircleHelp, Minus, Plus, TriangleAlert } from 'lucide-react'
import { dayText, type ISODate } from '../../domain/dates'
import { coverFigure, dayKey, HOURS_NOISE, isWaiting, missingIn, orderedLabel, ordersByDay, shiftText, type Coverage, type HireBoard } from '../../domain/hire'
import type { CompetenceStyle, HireOrder, Supplier, WorkdaySettings } from '../../domain/types'
import { PanelToggle } from '../common'
import { count } from '../dom'
import { useBemanning, type DemandRow } from '../bemanning/BemanningScope'
import { CompetenceList } from '../bemanning/DemandRows'
import type { Columns } from '../kalender/gridTypes'
import { LinePick, NeedRow } from '../bemanning/NeedLabel'
import { numberKey } from '../../domain/projects'
import { useInnleid, type HireProjectLine, type InnleidActions } from './InnleidScope'
import { AnswerGlyph } from './OrderPopovers'
import { hoursText } from '../format'
import { CrewBar, CrewHead, CrewHeading, CrewTop, type CrewBarProps } from '../bemanning/CrewFrame'
import { crewTools } from '../bemanning/crewTools'

const days = (n: number) => count(n, 'dag', 'dager')
const NO_ORDERS: HireOrder[] = []

/** The page header in Innleid: how much of what the permanent staff leave is still missing. */
export function InnleidHead({ places, onDayPlan }: { places: ReactNode; onDayPlan: () => void }) {
  const { ws } = useBemanning()
  const { board, rows, panel, setPanel } = useInnleid()
  const suppliers = ws.suppliers?.length ?? 0
  const meta = [count(suppliers, 'leverandør', 'leverandører'), `${count(rows.length, 'kompetanse', 'kompetanser')} med restbehov`, board.underDays.length ? `${days(board.underDays.length)} udekket` : 'Alt dekket']
  return (
    <CrewHead
      part="innleid"
      meta={meta}
      metaTitle="Gjelder hele perioden"
      places={places}
      onDayPlan={onDayPlan}
      dayPlanTitle="Arbeidsplan til utskrift: dagsplanen for dagen du står på, og ukeplanen."
      panel={<PanelToggle open={!!panel} what="leverandørkontroll" hint="se over og bekreft bestillingene til leverandørene" onToggle={() => setPanel(panel ? null : { kind: 'control' })} />}
    />
  )
}

/** What is pinned above the suppliers, as above the people in Faste: the projects in view, the demand per competence, and the Avvik of each day (`CrewTop`). */
export const InnleidTop = () => <CrewTop demand={<HireDemandRows />} />

/** The planning bar in Innleid, as Faste's: the mode and the part, undo, the tools with the brush and its people, and what is still to do. */
export function InnleidToolbar(bar: CrewBarProps) {
  const { styles, projectName, lastKey } = useBemanning()
  const { board, waiting, openNextUnder, openControl, tool, pickTool, brush, brushProject, people, stepCount, panel, setPanel } = useInnleid()
  const under = board.underDays.length
  const tools = crewTools(brush ? styles.get(brush) : undefined, brushProject && projectName(brushProject), {
    select: 'Velg dager på leverandørenes linjer: klikk en dag, eller dra over flere (V).',
    paint: 'Bestill penselens antall personer: dra over dager og skiftlinjer hos leverandørene, Shift for å stoppe der behovet er dekket. Velg et prosjekt under kompetansen i behovet for å bestille for det (B, 1–9 for kompetansen).',
    erase: 'Dra over dager for å fjerne bestillinger: startet på en bestilling fjernes bare den kompetansen, ellers alt; Shift fjerner alt (T, eller hold Alt).',
  })
  return (
    <CrewBar
      {...bar}
      fitKey={`${under}|${waiting > HOURS_NOISE}|${tool}|${brush}|${brushProject}|${people}`}
      part="innleid"
      tool={tool}
      tools={tools}
      pickTool={pickTool}
      pickKeys={brush ? null : lastKey}
      before={
        <>
          {waiting > HOURS_NOISE && (
            <button className="il-waiting" title="Timer som er bestilt, men ikke bekreftet. Klikk for å se over og bekrefte bestillingene." onClick={openControl}>
              <AnswerGlyph waits /> {hoursText(waiting)} t venter på svar
            </button>
          )}
          {under > 0 && (
            <button className="il-under" title="Dager der det mangler timer. Klikk for å gå til den neste, fra dagene som vises." onClick={openNextUnder}>
              <TriangleAlert size={14} aria-hidden /> {days(under)} udekket
            </button>
          )}
          {under === 0 && waiting <= HOURS_NOISE && <span className="bm-hints">Alt dekket og bekreftet</span>}
        </>
      }
      after={
        <button className={`ghost icon-button ${panel?.kind === 'help' ? 'active' : ''}`} aria-label="Hjelp" title="Hjelp (?)" onClick={() => setPanel(panel?.kind === 'help' ? null : { kind: 'help' })}>
          <CircleHelp size={16} aria-hidden />
        </button>
      }
    >
      {brush && tool === 'paint' && (
        <span className="il-count" title="Personene penselen bestiller per dag og skift (+ og −). Under 1 er Auto: så mange hele personer av skiftet som mangler hver dag.">
          <button className="ghost icon-button" aria-label="Færre personer" disabled={people === 0} onClick={() => stepCount(-1)}>
            <Minus size={14} aria-hidden />
          </button>
          <b>{people || 'Auto'}</b>
          <button className="ghost icon-button" aria-label="Flere personer" onClick={() => stepCount(1)}>
            <Plus size={14} aria-hidden />
          </button>
          {people > 0 && <span>pers.</span>}
        </span>
      )}
    </CrewBar>
  )
}

/** The heading over the suppliers, at the foot of the planning bar, as Faste's over the people. */
export function SupplierHeading() {
  const { styles } = useBemanning()
  const { suppliers, brush, able } = useInnleid()
  return (
    <CrewHeading
      title="Leverandører"
      note={brush ? `${able} av ${suppliers.length} tilbyr ${styles.get(brush)?.label ?? brush}` : count(suppliers.length, 'leverandør', 'leverandører')}
      end="uke · timer"
      legend="Klikk et navn for leverandøren · Pensel bestiller antallet på dagene og skiftene du drar over · Alt+dra tømmer"
    />
  )
}

/** What a day of a line says when it is pointed at: what remains, what is ordered, what is missing or over, and each order. */
const coverTitle = (label: string, date: ISODate, cover: Coverage, orders: HireOrder[], nameOf: (id: string) => string, projectName: (projectNo: string) => string, wd: WorkdaySettings): string => {
  if (cover.state === 'none') return `${label} · ${dayText(date)}\nIngen restbehov`
  const figure = coverFigure(cover)
  return (
    `${label} · ${dayText(date)}\nRestbehov ${count(cover.need, 'person', 'personer')} (${hoursText(cover.rest)} t) · bestilt ${hoursText(cover.people)} pers. (${hoursText(cover.planned)} t), bekreftet ${hoursText(cover.confirmed)} t` +
    (figure === null ? '' : figure < 0 ? `\n${count(-figure, 'person', 'personer')} mangler` : `\n${count(figure, 'person', 'personer')} over`) +
    orders.map((order) => `\n${hoursText(order.fte)} pers. ${nameOf(order.supplierId)} · ${order.projectNo ? projectName(order.projectNo) : 'Uten prosjekt'} · ${shiftText(order, wd)}${isWaiting(order) ? ' · venter på svar' : order.asked ? `, ${order.fte} av ${order.asked}` : ''}`).join('')
  )
}

interface RowProps {
  style: CompetenceStyle
  cols: Columns
  board: HireBoard
  /** The orders of the competence by day, as the board counts them. */
  ordersOf: (date: ISODate) => HireOrder[]
  suppliers: Supplier[]
  wd: WorkdaySettings
  projectName: (projectNo: string) => string
  /** The hours missing in the days in view. */
  missing: number
  /** The key that picks it as the brush, 1 to 9, or 0. */
  pickKey: number
  /** A supplier offers the competence: a line none does is greyed, and its key picks nothing. */
  able: boolean
  /** The line is the brush, or holds it where `held`: a project's line under it is. */
  on: boolean
  held?: boolean
  /** The line has lines under it, which show its days: as an open level of the plan, it shows no sums of its own. */
  summed?: boolean
  /** Compact: one line high, with the label as a thin line. */
  compact: boolean
  actions: InnleidActions
  /** A line under the competence of the brush, a project or «Uten prosjekt»: its orders and its cover, in place of the competence's. */
  project?: HireProjectLine
  /** Another competence is the brush: this one steps back. */
  dim?: boolean
  /** The last line under the competence, where the tree bends. */
  last?: boolean
}

/** One competence, or a line under the brush's: its name with what is missing in the days in view, and per day its label. A click on either makes it the brush. */
const CompetenceRow = memo(function CompetenceRow({ style, cols, board, ordersOf, suppliers, wd, projectName, missing, pickKey, able, on, held = false, summed = false, compact, actions, project, dim = false, last = false }: RowProps) {
  const nameOf = (id: string) => suppliers.find((supplier) => supplier.id === id)?.name ?? 'Ukjent leverandør'
  const coverOf = (date: ISODate) => (project ? project.cover(date) : board.cover(style.key, date))
  const label = project ? `${style.label} · ${project.name}` : style.label
  return (
    <NeedRow
      style={style}
      cols={cols}
      compact={compact}
      className={`${project ? 'bm-demand-project' : ''} ${on ? 'on' : ''} ${held ? 'held' : ''} ${dim ? 'dim' : ''} ${summed ? 'summed' : ''}`}
      label={
        project ? (
          <LinePick
            unit="pers."
            kind="project"
            name={project.name}
            hours={missing}
            compact={compact}
            pressed={on}
            disabled={project.rest}
            outer={last ? 'end' : 'branch'}
            title={project.rest ? `${style.label} uten prosjekt: det ingen av prosjektlinjene har. Bestill på sumlinjen.` : on ? `Bestill uten prosjekt: velg sumlinjen (${style.label})` : `Bestill ${style.label} for ${project.name}. Pil opp og ned bytter linje.`}
            onClick={() => actions.pickProject(project.projectNo)}
          />
        ) : (
          <LinePick
            unit="pers."
            name={style.label}
            hours={missing}
            compact={compact}
            kbd={able && pickKey > 0 && !compact && <kbd>{pickKey}</kbd>}
            pressed={on}
            disabled={!able && !on}
            outer={summed ? 'start' : undefined}
            title={on ? 'Legg bort penselen (Esc)' : able ? `Bestill ${style.label} med penselen${pickKey ? ` (${pickKey})` : ''}` : `Ingen leverandør tilbyr ${style.label}`}
            onClick={() => actions.pickFromDemand(style.key)}
          />
        )
      }
      onDay={(date, event) => actions.pickDay(style.key, project?.projectNo, date, event)}
      day={(date) => {
        if (summed) return null
        const orders = ordersOf(date)
        const cover = coverOf(date)
        return { parts: cover.state === 'none' ? null : orderedLabel(cover, orders, wd, suppliers), title: coverTitle(label, date, cover, orders, nameOf, projectName, wd) }
      }}
    />
  )
})

/** The demand of Innleid, Faste's list of competences (`CompetenceList`): a line per competence with what remains after the permanent staff and how far the orders cover it, and under the brush's its projects. */
function HireDemandRows() {
  const { cols, dates, viewFrom, viewTo, demandRows, demandDensity } = useBemanning()
  const { board, suppliers, orders, wd, actions, brush, brushProject, projectLines, projectName, isOffered } = useInnleid()
  const view = dates.slice(viewFrom, viewTo + 1)
  const missing = (key: string) => missingIn((date) => board.cover(key, date), view)
  const compact = demandDensity === 'compact'
  // One function per competence for as long as the orders are the same, so a scroll frame draws no line again.
  const ordersOf = useMemo(() => {
    const byDay = ordersByDay(orders)
    return new Map(demandRows.map(({ style }) => [style.key, (date: ISODate) => byDay.get(dayKey(style.key, date)) ?? NO_ORDERS]))
  }, [orders, demandRows])
  const line = ({ style, key }: DemandRow) => {
    const mine = brush === style.key
    // The competence of the brush with lines under it leaves its days to them, as an open level of the plan.
    const opened = mine && projectLines.length > 0
    return (
      <>
        <CompetenceRow
          style={style}
          cols={cols}
          board={board}
          ordersOf={ordersOf.get(style.key)!}
          suppliers={suppliers}
          wd={wd}
          projectName={projectName}
          missing={missing(style.key)}
          pickKey={key}
          able={isOffered(style.key)}
          on={mine}
          held={mine && !!brushProject}
          summed={opened}
          // As in Faste, the brush's competence and its lines are drawn in full, and the others shrink to their thin line.
          compact={!mine && (compact || !!brush)}
          actions={actions}
          dim={!!brush && !mine}
        />
        {mine &&
          projectLines.map((project, i) => (
            <CompetenceRow
              key={project.projectNo || 'rest'}
              style={style}
              cols={cols}
              board={board}
              ordersOf={project.orders}
              suppliers={suppliers}
              wd={wd}
              projectName={projectName}
              missing={project.missing}
              pickKey={0}
              able
              on={!project.rest && !!brushProject && numberKey(project.projectNo) === numberKey(brushProject)}
              compact={false}
              actions={actions}
              project={project}
              last={i === projectLines.length - 1}
            />
          ))}
      </>
    )
  }
  // A competence with nothing left after the permanent staff and no orders in the period is set aside under «Uten behov».
  return <CompetenceList busy={(competence) => board.competences.includes(competence)} line={line} missing="personer" />
}
