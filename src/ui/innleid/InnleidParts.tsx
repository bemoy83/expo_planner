import { Fragment, memo, type ReactNode } from 'react'
import { ChevronsUpDown, CircleHelp, Eraser, Printer, MousePointer2, Paintbrush, TriangleAlert } from 'lucide-react'
import { dayText, type ISODate } from '../../domain/dates'
import { coverage, coveredBy, coverFigure, coverLines, dayKey, HOURS_NOISE, isWaiting, orderedLabel, shiftText, type Coverage, type HireBoard, type OrderGroup } from '../../domain/hire'
import type { CompetenceStyle, HireOrder, Supplier, WorkdaySettings } from '../../domain/types'
import { PanelToggle, ToolSwitch, UndoRedoButtons, type ToolChoice } from '../common'
import { competenceColor, count } from '../dom'
import { useBemanning } from '../bemanning/BemanningScope'
import { DensityToggle } from '../bemanning/DensityToggle'
import { ProjectLines } from '../bemanning/ProjectLines'
import { AvvikSection } from '../bemanning/AvvikSection'
import { Line } from '../kalender/GridRows'
import { dayClass, type Columns } from '../kalender/gridTypes'
import { ModeSwitch, ModeTag, PartSwitch } from '../kalender/KalenderBar'
import { LEFT_W, ROW_H } from '../kalender/layout'
import { HIRE_COMPACT_H, HIRE_H, HIRE_PROJECT_H } from '../bemanning/layout'
import { LinePick, NeedLabel, NeedLine } from '../bemanning/NeedLabel'
import { PlanBar } from '../kalender/PlanBar'
import type { CrewPart, PlanMode } from '../kalender/zoom'
import { numberKey } from '../../domain/projects'
import { useInnleid, type HireProjectLine, type HireTool, type InnleidActions, type StrokePreview } from './InnleidScope'
import { OrderEditor } from './OrderEditor'
import { SupplierRows } from './SupplierRows'
import { AnswerGlyph, AnswerPopover, LineMenu, ShiftMenu, SupplierMenu, TimePopover, type MenuItem } from './OrderPopovers'
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

/** What is pinned above the competences: the projects in view, and the Avvik of each day. */
export function InnleidTop() {
  const { board } = useInnleid()
  return (
    <>
      <ProjectLines />
      <AvvikSection board={board} />
    </>
  )
}

/** The planning bar in Innleid: the mode and the part, undo, the tools with the supplier they work with, and what is still to do. */
export function InnleidToolbar({ width, mode, onMode, onPart, onToday }: { width: number; mode: PlanMode; onMode: (mode: PlanMode) => void; onPart: (part: CrewPart) => void; onToday: () => void }) {
  const { styles } = useBemanning()
  const { board, waiting, openNextUnder, openControl, tool, pickTool, brush, pickBrush, eraseFrom, pickErase, suppliers, open, panel, setPanel } = useInnleid()
  const under = board.underDays.length
  // With a competence open, the suppliers that offer it are listed first, and those that do not cannot be picked.
  const focus = open ? styles.get(open.competence) : undefined
  const option = (supplier: Supplier, disabled = false) => (
    <option key={supplier.id} value={supplier.id} disabled={disabled}>
      {suppliers.indexOf(supplier) < 9 ? `${suppliers.indexOf(supplier) + 1} · ` : ''}
      {supplier.name}
    </option>
  )
  const offers = focus ? suppliers.filter((supplier) => supplier.competences.includes(focus.key)) : suppliers
  const others = focus ? suppliers.filter((supplier) => !supplier.competences.includes(focus.key)) : []
  const tools: ToolChoice<HireTool>[] = [
    { value: 'select', icon: <MousePointer2 size={14} aria-hidden />, name: 'Velg', shortcut: 'V', title: 'Velg dager på en kompetanse: klikk en dag, dra over flere, eller Shift+klikk for å utvide (V).' },
    { value: 'paint', icon: <Paintbrush size={14} aria-hidden />, name: 'Pensel', shortcut: 'B', title: 'Bestill en leverandør: dra over dager på en kompetanse, så bestilles det som mangler på hver av dem (B, eller 1–9 for leverandøren).' },
    { value: 'erase', icon: <Eraser size={14} aria-hidden />, name: 'Tøm', shortcut: 'T', title: 'Fjern bestillinger: dra over dager på en kompetanse (T, eller hold Alt).' },
  ]
  return (
    <PlanBar width={width} fitKey={`innleid|${under}|${waiting > HOURS_NOISE}|${tool}|${brush?.id}`}>
      <div className="bar-zone">
        <ModeSwitch mode={mode} onChange={onMode} />
        <PartSwitch part="innleid" onChange={onPart} />
        <UndoRedoButtons />
        <ToolSwitch tool={tool} tools={tools} onChange={pickTool} />
        {tool !== 'select' && (
          <select
            className="bar-select"
            aria-label="Leverandør"
            title={tool === 'paint' ? 'Leverandøren penselen bestiller fra' : 'Leverandøren som tømmes, eller alle'}
            value={(tool === 'erase' ? eraseFrom : brush?.id) ?? ''}
            onChange={(e) => (tool === 'erase' ? pickErase(e.target.value || null) : pickBrush(e.target.value || null))}
          >
            {tool === 'erase' && <option value="">Alle leverandører</option>}
            {focus ? (
              <>
                <optgroup label={`Tilbyr ${focus.label}`}>{offers.map((supplier) => option(supplier))}</optgroup>
                {others.length > 0 && <optgroup label={`Tilbyr ikke ${focus.label}`}>{others.map((supplier) => option(supplier, true))}</optgroup>}
              </>
            ) : (
              suppliers.map((supplier) => option(supplier))
            )}
          </select>
        )}
        {tool === 'paint' && !suppliers.length && <span className="bm-hints">Ingen leverandører ennå</span>}
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

/** The heading over the competences, at the foot of the planning bar. */
export function InnleidHeading() {
  const { rows, density, setDensity } = useInnleid()
  return (
    <div className="grid-row col-head bm-people-head" style={{ height: ROW_H }}>
      <div className="grid-label">
        <span className="lbl-desc il-head-name">
          Kompetanse<DensityToggle compact={density === 'compact'} onChange={(compact) => setDensity(compact ? 'compact' : 'detail')} />
        </span>
        <span className="bm-label-note">{rows.length} med restbehov</span>
        <span className="bm-label-note bm-label-end">timer mangler</span>
      </div>
      <span className="phase-legend" style={{ left: LEFT_W }}>
        <span>Klikk en dag for å bestille, eller dra over flere · ← → flytter dagene · med Pensel bestiller draget · Alt+dra tømmer</span>
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
    orders.map((order) => `\n${order.fte} pers. ${nameOf(order.supplierId)} · ${order.projectNo ? projectName(order.projectNo) : 'Uten prosjekt'} · ${shiftText(order, wd)}${isWaiting(order) ? ' · venter på svar' : order.asked ? `, ${order.fte} av ${order.asked}` : ''}`).join('')
  )
}

/** A supplier and its people, hatched where none of them is confirmed: the name gives way, the figure never. */
function SupplierPeople({ name, people, waits }: { name: string; people: number; waits: boolean }) {
  return (
    <span className="il-who-top">
      {waits && <AnswerGlyph waits />}
      <span>{name}</span>
      <em>{people}</em>
    </span>
  )
}

/** Who covers a project's day, under its label: the supplier with the most confirmed by name, and one «+N» for the others, hatched where one waits. */
function Who({ orders, nameOf }: { orders: HireOrder[]; nameOf: (id: string) => string }) {
  const who = coveredBy(orders)
  if (!who) return null
  return (
    <span className="il-who">
      <SupplierPeople name={nameOf(who.supplierId)} people={who.people} waits={who.waits} />
      {who.more > 0 && (
        <span className="il-who-more">
          {who.moreWaits && <AnswerGlyph waits />}+{who.more}
        </span>
      )}
    </span>
  )
}

/** The days of the competence that is open: a line per supplier and project, as the editor's lines are, the project in small type, what waits hatched and dimmed. */
function CoverList({ orders, suppliers, nameOf, projectName }: { orders: HireOrder[]; suppliers: Supplier[]; nameOf: (id: string) => string; projectName: (projectNo: string) => string }) {
  const lines = coverLines(orders, suppliers, projectName)
  if (!lines.length) return null
  return (
    <span className="il-cover-list">
      {lines.map((line) => (
        <span key={line.key} className={line.waits ? 'waits' : ''}>
          <SupplierPeople name={nameOf(line.supplierId)} people={line.people} waits={line.waits} />
          <small>{line.projectNo ? projectName(line.projectNo) : 'Uten prosjekt'}</small>
        </span>
      ))}
    </span>
  )
}

interface RowProps {
  style: CompetenceStyle
  cols: Columns
  board: HireBoard
  /** The orders per competence and day. */
  ordersOn: Map<string, HireOrder[]>
  suppliers: Supplier[]
  wd: WorkdaySettings
  projectName: (projectNo: string) => string
  /** The hours missing in the days in view. */
  missing: number
  /** The competence is open: its label is the editor of the days picked, and its days list who covers them. */
  open: boolean
  /** The days picked on this line. */
  pickedFrom: ISODate | null
  pickedTo: ISODate | null
  /** The days a drag has reached on this line. */
  dragFrom: ISODate | null
  dragTo: ISODate | null
  /** What a stroke on this line would do, shown as what its days would be after it. */
  stroke: StrokePreview | null
  /** How the pointer shows what a press would do here: the brush, a brush whose supplier does not offer the competence, or the eraser. */
  cursor: '' | 'brush' | 'nobrush' | 'erase'
  /** Compact: one line high, with the label as a thin line. */
  compact: boolean
  actions: InnleidActions
  /** A line under the competence that is open, a project or «Uten prosjekt»: its orders and its cover, in place of the competence's. */
  project?: HireProjectLine
  /** The line is the one the days are picked on. */
  lineOn?: boolean
  /** Another competence is open: this one steps back. */
  dim?: boolean
  /** The last line under the competence, where the tree bends. */
  last?: boolean
}

/**
 * One competence, or a line under the open one: its name with what is missing in the days in view, and per day its
 * label. With days picked, the competence's label is the editor of their orders, and its days list who covers them.
 */
const CompetenceRow = memo(function CompetenceRow({ style, cols, board, ordersOn, suppliers, wd, projectName, missing, open, pickedFrom, pickedTo, dragFrom, dragTo, stroke, cursor, compact, actions, project, lineOn = false, dim = false, last = false }: RowProps) {
  const nameOf = (id: string) => suppliers.find((supplier) => supplier.id === id)?.name ?? 'Ukjent leverandør'
  const coverOf = (date: ISODate) => (project ? project.cover(date) : board.cover(style.key, date))
  const ordersOf = (date: ISODate) => (project ? project.orders(date) : (ordersOn.get(dayKey(style.key, date)) ?? []))
  const label = project ? `${style.label} · ${project.name}` : style.label
  const height = project ? (compact ? HIRE_COMPACT_H : HIRE_PROJECT_H) : compact ? HIRE_COMPACT_H : HIRE_H
  return (
    <Line
      className={`il-row ${project ? 'il-project' : ''} ${open ? 'open' : ''} ${compact && !open ? 'compact' : ''} ${lineOn ? 'on' : ''} ${dim ? 'dim' : ''} ${cursor}`}
      height={height}
      minHeight={open ? HIRE_H : undefined}
      style={competenceColor(style)}
      label={
        project ? (
          <LinePick
            kind="project"
            name={project.name}
            hours={missing}
            pressed={lineOn}
            outer={last ? 'end' : 'branch'}
            title={project.rest ? `${style.label} uten prosjekt: det ingen av prosjektlinjene har. Penselen her bestiller uten prosjekt.` : `Det ${project.name} mangler av ${style.label} etter de faste, og det som er bestilt for prosjektet. Penselen her bestiller for prosjektet.`}
            onClick={() => actions.openLine(project.projectNo)}
          />
        ) : open ? (
          <OrderEditor style={style} />
        ) : (
          <LinePick name={style.label} hours={missing} glyph={<ChevronsUpDown className="il-unfold" size={13} aria-hidden />} title={`Åpne ${style.label}`} onClick={() => actions.openCompetence(style.key)} />
        )
      }
      cols={cols}
      cells={(date) => {
        const picked = pickedFrom !== null && pickedTo !== null && date >= pickedFrom && date <= pickedTo
        const dragged = dragFrom !== null && dragTo !== null && date >= dragFrom && date <= dragTo
        const stroked = stroke !== null && date >= stroke.from && date <= stroke.to
        let orders = ordersOf(date)
        let cover = coverOf(date)
        // A stroke shows what the day would be after it: the orders it would add, or without those it would remove.
        if (stroked) {
          const holds = project ? project.holds : () => true
          orders = stroke.mode === 'erase' ? orders.filter((order) => stroke.supplierId !== undefined && order.supplierId !== stroke.supplierId) : [...orders, ...stroke.added.filter((order) => order.date === date && holds(order))]
          cover = coverage(cover.rest, orders, wd)
        }
        const parts = cover.state === 'none' ? null : orderedLabel(cover, orders, wd, suppliers)
        return (
          <div
            key={date}
            className={`${dayClass(cols, date)} cell bm-need il-day ${picked ? 'picked' : ''} ${dragged ? 'dragged' : ''} ${stroked ? `stroked-${stroke.mode}` : ''}`}
            title={coverTitle(label, date, cover, orders, nameOf, projectName, wd)}
            onMouseDown={(e) => {
              if (e.button !== 0) return
              e.preventDefault()
              actions.dayDown(style.key, date, e.shiftKey, e.altKey, project?.projectNo)
            }}
            onMouseEnter={() => actions.dayEnter(style.key, date, project?.projectNo)}
          >
            {open ? (
              <>
                {parts && <NeedLabel parts={parts} className="il-need-open" />}
                <CoverList orders={orders} suppliers={suppliers} nameOf={nameOf} projectName={projectName} />
              </>
            ) : compact ? (
              parts && <NeedLine parts={parts} figure />
            ) : (
              <>
                {parts && <NeedLabel parts={parts} className={project ? 'il-need-small' : ''} />}
                {project && <Who orders={orders} nameOf={nameOf} />}
              </>
            )}
          </div>
        )
      }}
    />
  )
})

/** The rows of Innleid: a line per competence with hours that remain after the permanent staff, or with orders. */
export function InnleidRows({ onOpenSuppliers }: { onOpenSuppliers: () => void }) {
  const { cols, dates, viewFrom, viewTo, styles } = useBemanning()
  const il = useInnleid()
  const { board, rows, suppliers, ordersOn, wd, open, dragOn, groups, pop, setPop, edits, actions, tool, brush, preview, density, projectLines, projectName } = il
  const view = dates.slice(viewFrom, viewTo + 1)
  const missing = (key: string) => view.reduce((sum, date) => sum + Math.max(0, board.cover(key, date).remaining), 0)
  const popGroup = pop?.group ? groups.find((group) => group.key === pop.group) : undefined
  const popSupplier = popGroup && suppliers.find((supplier) => supplier.id === popGroup.supplierId)
  const openStyle = open ? styles.get(open.competence) : undefined
  const close = () => setPop(null)
  const compact = density === 'compact'
  const onLine = (projectNo: string | undefined, line: string | undefined) => projectNo === line || (!!projectNo && !!line && numberKey(projectNo) === numberKey(line))
  /** The menu behind ⋯ on a line of the editor: fill the days it lacks, another supplier or shift, another line, or remove it. */
  const menu = (group: OrderGroup, at: DOMRect): MenuItem[] => {
    const days = new Set(group.orders.map((order) => order.date)).size
    const lacking = il.openDates.length - days
    // The lines it is not on; «Uten prosjekt» too where the line is not shown, for an order with a project.
    const elsewhere = projectLines.filter((line) => !line.holds(group.orders[0])).map((line) => ({ name: line.name, projectNo: line.rest ? null : line.projectNo }))
    if (group.projectNo && !projectLines.some((line) => line.rest)) elsewhere.push({ name: 'Uten prosjekt', projectNo: null })
    return [
      ...(lacking > 0 ? [{ label: `Fyll ${count(lacking, 'dag', 'dager')} som mangler`, onPick: () => (close(), edits.fill(group)) }] : []),
      { label: 'Bytt leverandør …', onPick: () => setPop({ kind: 'supplier', group: group.key, at }), rule: lacking > 0 },
      { label: 'Skift eller egen tid …', onPick: () => setPop({ kind: 'shift', group: group.key, at }) },
      ...elsewhere.map((line, i) => ({ label: `Flytt til ${line.name}`, onPick: () => (close(), edits.project(group, line.projectNo)), rule: i === 0 })),
      { label: 'Fjern bestillingen', onPick: () => edits.remove(group), rule: true, danger: true },
    ]
  }
  return (
    <div className="bm-people il-rows" onMouseLeave={actions.rowsLeave}>
      {rows.map((style) => {
        const mine = open?.competence === style.key
        const lineOf = (projectNo: string | undefined) => ({
          picked: mine && onLine(open.projectNo, projectNo),
          dragged: dragOn?.competence === style.key && onLine(dragOn.projectNo, projectNo) ? dragOn : null,
          stroke: preview?.competence === style.key && onLine(preview.projectNo, projectNo) ? preview : null,
        })
        const own = lineOf(undefined)
        const cursor = tool === 'erase' ? 'erase' : tool === 'paint' ? (brush?.competences.includes(style.key) ? 'brush' : 'nobrush') : ''
        return (
          <Fragment key={style.key}>
            <CompetenceRow
              style={style}
              cols={cols}
              board={board}
              ordersOn={ordersOn}
              suppliers={suppliers}
              wd={wd}
              projectName={projectName}
              missing={missing(style.key)}
              open={mine}
              pickedFrom={own.picked ? open!.from : null}
              pickedTo={own.picked ? open!.to : null}
              dragFrom={own.dragged ? own.dragged.from : null}
              dragTo={own.dragged ? own.dragged.to : null}
              stroke={own.stroke}
              cursor={cursor}
              // As in Faste, the other competences shrink to their thin line while one is open.
              compact={compact || (!!open && !mine)}
              actions={actions}
              lineOn={own.picked}
              dim={!!open && !mine}
            />
            {mine &&
              projectLines.map((project, i) => {
                const line = lineOf(project.projectNo)
                return (
                  <CompetenceRow
                    key={project.projectNo || 'rest'}
                    style={style}
                    cols={cols}
                    board={board}
                    ordersOn={ordersOn}
                    suppliers={suppliers}
                    wd={wd}
                    projectName={projectName}
                    missing={project.missing}
                    open={false}
                    pickedFrom={line.picked ? open.from : null}
                    pickedTo={line.picked ? open.to : null}
                    dragFrom={line.dragged ? line.dragged.from : null}
                    dragTo={line.dragged ? line.dragged.to : null}
                    stroke={line.stroke}
                    cursor={cursor}
                    compact={compact}
                    actions={actions}
                    project={project}
                    lineOn={line.picked}
                    last={i === projectLines.length - 1}
                  />
                )
              })}
          </Fragment>
        )
      })}
      <SupplierRows />
      {rows.length === 0 && <p className="empty-rows">Ingen restbehov i perioden: de faste dekker det som er planlagt, eller ingenting er planlagt ennå.</p>}
      {rows.length > 0 && !suppliers.length && (
        <p className="empty-rows">
          Ingen leverandører er registrert ennå. Legg dem inn på{' '}
          <button className="link" onClick={onOpenSuppliers}>
            Leverandører
          </button>{' '}
          for å kunne bestille.
        </p>
      )}
      {pop?.kind === 'brush' && openStyle && <SupplierMenu at={pop.at} competence={openStyle} suppliers={suppliers} current={tool === 'paint' ? brush?.id : undefined} onPick={(supplier) => il.brushWith(supplier.id)} onClose={close} />}
      {pop?.kind === 'more' && popGroup && <LineMenu at={pop.at} items={menu(popGroup, pop.at)} onClose={close} />}
      {pop?.kind === 'supplier' && popGroup && openStyle && <SupplierMenu at={pop.at} competence={openStyle} suppliers={suppliers} current={popGroup.supplierId} onPick={(supplier) => edits.supplier(popGroup, supplier.id)} onClose={close} />}
      {pop?.kind === 'shift' && popGroup && <ShiftMenu at={pop.at} group={popGroup} supplier={popSupplier} wd={wd} onPick={(times) => edits.times(popGroup, times)} onOwn={() => setPop({ ...pop, kind: 'time' })} onClose={close} />}
      {pop?.kind === 'time' && popGroup && <TimePopover at={pop.at} group={popGroup} wd={wd} onTimes={(times) => edits.times(popGroup, times)} onClose={close} />}
      {pop?.kind === 'answer' && popGroup && <AnswerPopover at={pop.at} group={popGroup} supplier={popSupplier} onWaits={() => edits.waits(popGroup)} onConfirm={() => edits.confirm(popGroup)} onFewer={edits.fewer} onClose={close} />}
    </div>
  )
}
