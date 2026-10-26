import { Fragment, memo, type ReactNode } from 'react'
import { CircleHelp, Eraser, Minus, Plus, Printer, MousePointer2, Paintbrush, TriangleAlert } from 'lucide-react'
import { dayText, type ISODate } from '../../domain/dates'
import { coverFigure, HOURS_NOISE, isWaiting, orderedLabel, shiftText, type Coverage, type HireBoard } from '../../domain/hire'
import type { CompetenceStyle, HireOrder, Supplier, WorkdaySettings } from '../../domain/types'
import { PanelToggle, ToolSwitch, UndoRedoButtons, type ToolChoice } from '../common'
import { competenceColor, count } from '../dom'
import { useBemanning } from '../bemanning/BemanningScope'
import { DensityToggle } from '../bemanning/DensityToggle'
import { ProjectLines } from '../bemanning/ProjectLines'
import { AvvikSection } from '../bemanning/AvvikSection'
import { Line, SectionLine } from '../kalender/GridRows'
import { dayClass, type Columns } from '../kalender/gridTypes'
import { ModeSwitch, ModeTag, PartSwitch } from '../kalender/KalenderBar'
import { LEFT_W, ROW_H } from '../kalender/layout'
import { DEMAND_COMPACT_H, DEMAND_H } from '../bemanning/layout'
import { LinePick, NeedLabel, NeedLine } from '../bemanning/NeedLabel'
import { PlanBar } from '../kalender/PlanBar'
import type { CrewPart, PlanMode } from '../kalender/zoom'
import { numberKey } from '../../domain/projects'
import { useInnleid, type HireProjectLine, type HireTool, type InnleidActions } from './InnleidScope'
import { AnswerGlyph } from './OrderPopovers'
import { hoursText } from '../format'

const days = (n: number) => count(n, 'dag', 'dager')

/** The page header in Innleid: how much of what the permanent staff leave is still missing. */
export function InnleidHead({ places, onDayPlan }: { places: ReactNode; onDayPlan: () => void }) {
  const { ws } = useBemanning()
  const { board, rows, panel, setPanel } = useInnleid()
  const suppliers = ws.suppliers?.length ?? 0
  const meta = [count(suppliers, 'leverandør', 'leverandører'), `${count(rows.length, 'kompetanse', 'kompetanser')} med restbehov`, board.underDays.length ? `${days(board.underDays.length)} udekket` : 'Alt dekket']
  return (
    <div className="page-head mode-band">
      <h2>Kalender</h2>
      <ModeTag mode="bemanning" part="innleid" />
      <span className="page-meta" title="Gjelder hele perioden">{meta.join(' · ')}</span>
      {places}
      <button className="ghost" onClick={onDayPlan} title="Arbeidsplan til utskrift: dagsplanen for dagen du står på, og ukeplanen.">
        <Printer size={14} aria-hidden /> Arbeidsplan
      </button>
      <PanelToggle open={!!panel} what="leverandørkontroll" hint="se over og bekreft bestillingene til leverandørene" onToggle={() => setPanel(panel ? null : { kind: 'control' })} />
    </div>
  )
}

/** What is pinned above the suppliers, as above the people in Faste: the projects in view, the Avvik of each day, and the demand per competence. */
export function InnleidTop() {
  const { board } = useInnleid()
  return (
    <>
      <ProjectLines />
      <AvvikSection board={board} />
      <HireDemandRows />
    </>
  )
}

/** The planning bar in Innleid, where Faste has its own, between the demand and the lines that are painted: the mode and the part, undo, the tools with the brush and its people, and what is still to do. */
export function InnleidToolbar({ width, mode, onMode, onPart, onToday }: { width: number; mode: PlanMode; onMode: (mode: PlanMode) => void; onPart: (part: CrewPart) => void; onToday: () => void }) {
  const { styles, projectName } = useBemanning()
  const { board, rows, waiting, openNextUnder, openControl, tool, pickTool, brush, brushProject, people, stepCount, panel, setPanel } = useInnleid()
  const under = board.underDays.length
  const style = brush ? styles.get(brush) : undefined
  const tools: ToolChoice<HireTool>[] = [
    { value: 'select', icon: <MousePointer2 size={14} aria-hidden />, name: 'Velg', shortcut: 'V', title: 'Velg dager på leverandørenes linjer: klikk en dag, eller dra over flere (V).' },
    {
      value: 'paint',
      icon: <Paintbrush size={14} aria-hidden />,
      name: style ? (
        <>
          Pensel <i className="swatch" style={competenceColor(style)} /> {style.label}
          {brushProject && <span className="bm-brush-project"> · {projectName(brushProject)}</span>}
        </>
      ) : (
        'Pensel'
      ),
      shortcut: 'B',
      title: 'Bestill penselens antall personer: dra over dager og skiftlinjer hos leverandørene, Shift for å stoppe der behovet er dekket. Velg et prosjekt under kompetansen i behovet for å bestille for det (B, 1–9 for kompetansen).',
    },
    { value: 'erase', icon: <Eraser size={14} aria-hidden />, name: 'Tøm', shortcut: 'T', title: 'Dra over dager for å fjerne bestillinger: startet på en bestilling fjernes bare den kompetansen, ellers alt; Shift fjerner alt (T, eller hold Alt).' },
  ]
  return (
    <PlanBar width={width} fitKey={`innleid|${under}|${waiting > HOURS_NOISE}|${tool}|${brush}|${brushProject}|${people}`}>
      <div className="bar-zone">
        <ModeSwitch mode={mode} onChange={onMode} />
        <PartSwitch part="innleid" onChange={onPart} />
        <UndoRedoButtons />
        <ToolSwitch tool={tool} tools={tools} onChange={pickTool} />
        {brush && tool === 'paint' && (
          <span className="il-count" title="Personene penselen bestiller per dag og skift (+ og −)">
            <button className="ghost icon-button" aria-label="Færre personer" disabled={people <= 1} onClick={() => stepCount(-1)}>
              <Minus size={14} aria-hidden />
            </button>
            <b>{people}</b>
            <button className="ghost icon-button" aria-label="Flere personer" onClick={() => stepCount(1)}>
              <Plus size={14} aria-hidden />
            </button>
            <span>pers.</span>
          </span>
        )}
        {!brush && rows.length > 0 && <span className="bm-hints">Velg kompetanse i behovet (1–{Math.min(9, rows.length)})</span>}
      </div>
      <div className="bar-view">
        <div className="bar-zone bar-zone-end">
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
          <button className="ghost" onClick={onToday}>
            I dag
          </button>
          <button className={`ghost icon-button ${panel?.kind === 'help' ? 'active' : ''}`} aria-label="Hjelp" title="Hjelp (?)" onClick={() => setPanel(panel?.kind === 'help' ? null : { kind: 'help' })}>
            <CircleHelp size={16} aria-hidden />
          </button>
        </div>
      </div>
    </PlanBar>
  )
}

/** The heading over the suppliers, at the foot of the planning bar, as Faste's over the people. */
export function SupplierHeading() {
  const { styles } = useBemanning()
  const { suppliers, brush, able } = useInnleid()
  return (
    <div className="grid-row col-head bm-people-head" style={{ height: ROW_H }}>
      <div className="grid-label">
        <span className="lbl-desc">Leverandører</span>
        <span className="bm-label-note">{brush ? `${able} av ${suppliers.length} tilbyr ${styles.get(brush)?.label ?? brush}` : count(suppliers.length, 'leverandør', 'leverandører')}</span>
        <span className="bm-label-note bm-label-end">pers.</span>
      </div>
      <span className="phase-legend" style={{ left: LEFT_W }}>
        <span>Klikk et navn for leverandøren · Pensel bestiller antallet på dagene og skiftene du drar over · Alt+dra tømmer</span>
      </span>
    </div>
  )
}

/** What a day of a line says when it is pointed at: what remains, what is ordered, what is missing or over, and each order. */
const coverTitle = (label: string, date: ISODate, cover: Coverage, orders: HireOrder[], nameOf: (id: string) => string, projectName: (projectNo: string) => string, wd: WorkdaySettings): string => {
  if (cover.state === 'none') return `${label} · ${dayText(date)}\nIngen restbehov`
  const figure = coverFigure(cover)
  return (
    `${label} · ${dayText(date)}\nRestbehov ${hoursText(cover.rest)} t · bestilt ${hoursText(cover.planned)} t, bekreftet ${hoursText(cover.confirmed)} t` +
    (figure === null ? '' : figure < 0 ? `\n${hoursText(-figure)} t mangler` : `\n${hoursText(figure)} t over`) +
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
  /** The line is the brush. */
  on: boolean
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
const CompetenceRow = memo(function CompetenceRow({ style, cols, board, ordersOf, suppliers, wd, projectName, missing, pickKey, on, compact, actions, project, dim = false, last = false }: RowProps) {
  const nameOf = (id: string) => suppliers.find((supplier) => supplier.id === id)?.name ?? 'Ukjent leverandør'
  const coverOf = (date: ISODate) => (project ? project.cover(date) : board.cover(style.key, date))
  const label = project ? `${style.label} · ${project.name}` : style.label
  return (
    <Line
      className={`il-row ${project ? 'il-project' : ''} ${compact ? 'compact' : ''} ${on ? 'on' : ''} ${dim ? 'dim' : ''}`}
      height={compact ? DEMAND_COMPACT_H : DEMAND_H}
      style={competenceColor(style)}
      label={
        project ? (
          <LinePick
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
          <LinePick name={style.label} hours={missing} compact={compact} kbd={pickKey > 0 && !compact && <kbd>{pickKey}</kbd>} pressed={on} title={on ? 'Legg bort penselen (Esc)' : `Bestill ${style.label} med penselen${pickKey ? ` (${pickKey})` : ''}`} onClick={() => actions.pickFromDemand(style.key)} />
        )
      }
      cols={cols}
      cells={(date) => {
        const orders = ordersOf(date)
        const cover = coverOf(date)
        const parts = cover.state === 'none' ? null : orderedLabel(cover, orders, wd, suppliers)
        return (
          <button key={date} className={`${dayClass(cols, date)} cell bm-need il-day`} title={coverTitle(label, date, cover, orders, nameOf, projectName, wd)} onClick={() => actions.pickDay(style.key, project?.projectNo)}>
            {parts && (compact ? <NeedLine parts={parts} figure /> : <NeedLabel parts={parts} />)}
          </button>
        )
      }}
    />
  )
})

/** The demand of Innleid, as Faste's (`DemandRows`): a line per competence with hours that remain after the permanent staff, or with orders, and under the brush's its projects. */
function HireDemandRows() {
  const { cols, dates, viewFrom, viewTo } = useBemanning()
  const { board, rows, suppliers, orders, wd, actions, brush, brushProject, density, setDensity, projectLines, projectName } = useInnleid()
  const view = dates.slice(viewFrom, viewTo + 1)
  const missing = (key: string) => view.reduce((sum, date) => sum + Math.max(0, board.cover(key, date).remaining), 0)
  const compact = density === 'compact'
  const byDay = new Map<string, HireOrder[]>()
  for (const order of orders) {
    const key = `${order.competence}|${order.date}`
    const list = byDay.get(key)
    if (list) list.push(order)
    else byDay.set(key, [order])
  }
  return (
    <div className={`top-section bm-demand-section open ${compact ? 'compact' : ''}`}>
      <SectionLine>
        Kompetanse
        <DensityToggle compact={compact} onChange={(next) => setDensity(next ? 'compact' : 'detail')} />
        <span className="section-meta section-meta-end" title="Timer som mangler i dagene som vises">
          {count(rows.length, 'med restbehov', 'med restbehov')} · timer mangler
        </span>
      </SectionLine>
      {rows.map((style, at) => {
        const mine = brush === style.key
        return (
          <Fragment key={style.key}>
            <CompetenceRow
              style={style}
              cols={cols}
              board={board}
              ordersOf={(date) => byDay.get(`${style.key}|${date}`) ?? []}
              suppliers={suppliers}
              wd={wd}
              projectName={projectName}
              missing={missing(style.key)}
              pickKey={at < 9 ? at + 1 : 0}
              on={mine && !brushProject}
              // As in Faste, the other competences shrink to their thin line while one is the brush.
              compact={compact || (!!brush && !mine)}
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
                  on={!project.rest && !!brushProject && numberKey(project.projectNo) === numberKey(brushProject)}
                  compact={compact}
                  actions={actions}
                  project={project}
                  last={i === projectLines.length - 1}
                />
              ))}
          </Fragment>
        )
      })}
      {rows.length === 0 && <p className="empty-rows">Ingen restbehov i perioden: de faste dekker det som er planlagt, eller ingenting er planlagt ennå.</p>}
    </div>
  )
}
