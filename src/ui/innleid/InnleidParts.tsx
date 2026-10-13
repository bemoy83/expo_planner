import { memo, type CSSProperties, type ReactNode } from 'react'
import { Check, ChevronsUpDown, CircleHelp, Clock, Eraser, MousePointer2, Paintbrush, TriangleAlert } from 'lucide-react'
import type { ISODate } from '../../domain/dates'
import { coverFigure, coverShares, dayChips, dayKey, HOURS_NOISE, isWaiting, shiftText, type Coverage, type HireBoard, type OrderChip } from '../../domain/hire'
import type { CompetenceStyle, HireOrder, Supplier, WorkdaySettings } from '../../domain/types'
import { PanelToggle, ToolSwitch, UndoRedoButtons, type ToolChoice } from '../common'
import { competenceColor, count } from '../dom'
import { useBemanning } from '../bemanning/BemanningScope'
import { DEMAND_H } from '../bemanning/layout'
import { ProjectLines } from '../bemanning/ProjectLines'
import { hoursText } from '../bemanning/week'
import { HeatLegend, Line, SectionLine } from '../kalender/GridRows'
import { dayClass, type Columns } from '../kalender/gridTypes'
import { heatTile, HEAT_LABELS } from '../kalender/heat'
import { ModeSwitch, ModeTag, PartSwitch } from '../kalender/KalenderBar'
import { fmtDay } from '../kalender/labels'
import { daysWide, HEAT_ROW_H, LEFT_W, ROW_H } from '../kalender/layout'
import { PlanBar } from '../kalender/PlanBar'
import type { CrewPart, PlanMode } from '../kalender/zoom'
import { signedHours } from './hours'
import { useInnleid, type HireTool, type InnleidActions } from './InnleidScope'
import { OrderEditor } from './OrderEditor'
import { SupplierRows } from './SupplierRows'
import { AnswerGlyph, AnswerPopover, ShiftMenu, SupplierMenu, TimePopover } from './OrderPopovers'

const days = (n: number) => count(n, 'dag', 'dager')

/** The page header in Innleid: how much of what the permanent staff leave is still missing. */
export function InnleidHead({ places }: { places: ReactNode }) {
  const { ws } = useBemanning()
  const { board, rows, panel, setPanel, brush } = useInnleid()
  const suppliers = ws.suppliers?.length ?? 0
  const meta = [count(suppliers, 'leverandør', 'leverandører'), `${count(rows.length, 'kompetanse', 'kompetanser')} med restbehov`, board.underDays.length ? `${days(board.underDays.length)} udekket` : 'Alt dekket']
  return (
    <div className="page-head mode-band">
      <h2>Kalender</h2>
      <ModeTag mode="bemanning" part="innleid" />
      <span className="page-meta" title="Gjelder hele perioden">{meta.join(' · ')}</span>
      {places}
      <PanelToggle open={!!panel} what="leverandører" hint="bestillingen til en leverandør, og hva hver av dem tilbyr" onToggle={() => setPanel(panel ? null : brush ? { kind: 'supplier', id: brush.id } : { kind: 'matrix' })} />
    </div>
  )
}

/** A day of the Avvik line: under, ok or over as a tile, with the hours and a clock where an order waits for an answer. */
const AvvikLine = memo(function AvvikLine({ cols, board, maxShortage, maxSurplus, total }: { cols: Columns; board: HireBoard; maxShortage: number; maxSurplus: number; total: number }) {
  return (
    <Line
      className="sum-row deviation-row heat-row"
      height={HEAT_ROW_H}
      label={
        <>
          <span className="lbl-cap strong">Avvik</span>
          <HeatLegend title="Rødt: timer som mangler (mørkere = flere). Grønt: ok, dekket innenfor én person på ett skift. Oker: bestilt over behovet." />
          <span className="il-total">{total > HOURS_NOISE ? `${signedHours(-total)} t` : <Check size={13} aria-label="Dekket" />}</span>
        </>
      }
      cols={cols}
      cells={(date) => {
        const dev = board.deviations.get(date)
        if (!dev || dev.state === 'none') return <div key={date} className={`${dayClass(cols, date)} cell sum-cell`} />
        const tile = heatTile(dev.value, maxShortage, maxSurplus, dev.state)
        const waits = dev.pending > HOURS_NOISE
        return (
          <div key={date} className={`${dayClass(cols, date)} cell sum-cell heat-cell ${tile.kind} ${tile.strong ? 'strong' : ''}`} title={`${fmtDay(date)} · ${HEAT_LABELS[tile.kind]} ${signedHours(dev.value) || '0'} t${waits ? `\n${hoursText(dev.pending)} t venter på svar` : ''}`}>
            <span className={`heat ${tile.kind}`} style={{ '--p': `${tile.percent}%` } as CSSProperties} />
            {waits && <Clock className="il-waits" size={12} aria-label="Venter på svar" />}
            <span className="heat-value">{signedHours(dev.value)}</span>
          </div>
        )
      }}
    />
  )
})

/** What is pinned above the competences: the projects in view, and the Avvik of each day. */
export function InnleidTop() {
  const { cols, dates, viewFrom, viewTo } = useBemanning()
  const { board, scale } = useInnleid()
  // The hours missing in the days in view.
  const total = dates.slice(viewFrom, viewTo + 1).reduce((sum, date) => sum + Math.max(0, -(board.deviations.get(date)?.value ?? 0)), 0)
  return (
    <>
      <ProjectLines />
      <div className="top-section open il-avvik-section">
        <SectionLine>
          Restbehov etter faste
          <span className="section-meta section-meta-end" title="Timer som mangler i dagene som vises">timer</span>
        </SectionLine>
        <AvvikLine cols={cols} board={board} maxShortage={scale.maxShortage} maxSurplus={scale.maxSurplus} total={total} />
      </div>
    </>
  )
}

/** The planning bar in Innleid: the mode and the part, undo, the tools with the supplier they work with, and what is still to do. */
export function InnleidToolbar({ width, mode, onMode, onPart, onToday }: { width: number; mode: PlanMode; onMode: (mode: PlanMode) => void; onPart: (part: CrewPart) => void; onToday: () => void }) {
  const { board, waiting, openFirstUnder, openFirstWaiting, tool, pickTool, brush, pickBrush, suppliers, panel, setPanel } = useInnleid()
  const under = board.underDays.length
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
            value={brush?.id ?? ''}
            onChange={(e) => pickBrush(e.target.value || null)}
          >
            {tool === 'erase' && <option value="">Alle leverandører</option>}
            {suppliers.map((supplier, index) => (
              <option key={supplier.id} value={supplier.id}>
                {index < 9 ? `${index + 1} · ` : ''}
                {supplier.name}
              </option>
            ))}
          </select>
        )}
        {tool === 'paint' && !suppliers.length && <span className="bm-hints">Ingen leverandører ennå</span>}
      </div>
      <div className="bar-view">
        <div className="bar-zone bar-zone-end">
          {waiting > HOURS_NOISE && (
            <button className="il-waiting" title="Timer som er bestilt, men ikke bekreftet. Klikk for leverandøren til den første som venter." onClick={openFirstWaiting}>
              <Clock size={14} aria-hidden /> {hoursText(waiting)} t venter på svar
            </button>
          )}
          {under > 0 && (
            <button className="il-under" title="Dager der det mangler timer. Klikk for å åpne den første." onClick={openFirstUnder}>
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
  const { rows } = useInnleid()
  return (
    <div className="grid-row col-head bm-people-head" style={{ height: ROW_H }}>
      <div className="grid-label" style={{ width: LEFT_W }}>
        <span className="lbl-desc">Kompetanse</span>
        <span className="bm-label-note">{rows.length} med restbehov</span>
        <span className="bm-label-note bm-label-end">t mangler</span>
      </div>
      <span className="phase-legend" style={{ left: LEFT_W }}>
        <span>Klikk en dag for å bestille, eller dra over flere · Shift+klikk utvider · med Pensel bestiller draget · Alt+dra tømmer</span>
      </span>
    </div>
  )
}

/** What a day of a competence says when it is pointed at: what remains, what is ordered, and what is missing or over. */
const coverTitle = (label: string, date: ISODate, cover: Coverage): string => {
  if (cover.state === 'none') return `${label} · ${fmtDay(date)}\nIngen restbehov`
  const figure = coverFigure(cover)
  return `${label} · ${fmtDay(date)}\nRestbehov ${hoursText(cover.rest)} t · bestilt ${hoursText(cover.planned)} t, bekreftet ${hoursText(cover.confirmed)} t` + (figure === null ? '' : figure < 0 ? `\n${hoursText(-figure)} t mangler` : `\n${hoursText(figure)} t over`)
}

/** What a chip says when it is pointed at: the supplier, and each of its orders with its time and answer. */
const chipTitle = (name: string, chip: OrderChip, wd: WorkdaySettings): string =>
  `${name}\n${chip.orders.map((order) => `${order.fte} pers. ${shiftText(order, wd)} · ${isWaiting(order) ? 'venter på svar' : order.asked ? `bekreftet, ${order.fte} av ${order.asked}` : 'bekreftet'}`).join('\n')}`

/** Columns narrower than this have no room for a supplier's name on a chip: the people alone are shown. */
const NAME_FROM_W = 84
/** A day shows at most this many chips; where there are more, one fewer and the count of the rest. */
const CHIPS_MAX = 3

interface RowProps {
  style: CompetenceStyle
  cols: Columns
  board: HireBoard
  /** The orders per competence and day. */
  ordersOn: Map<string, HireOrder[]>
  suppliers: Supplier[]
  wd: WorkdaySettings
  /** The hours missing in the days in view. */
  missing: number
  /** The days picked on this competence, whose editor is its label; `null` on the others. */
  pickedFrom: ISODate | null
  pickedTo: ISODate | null
  /** The line of the editor that is picked. */
  pickedGroup: string | null
  /** The days a drag has reached on this competence. */
  dragFrom: ISODate | null
  dragTo: ISODate | null
  /** What a stroke on this competence would do: the days it covers, and with the brush the people each would get. */
  strokeFrom: ISODate | null
  strokeTo: ISODate | null
  strokePeople: Map<ISODate, number> | null
  /** The supplier the stroke orders, or the one whose orders it removes; none where it removes every supplier's. */
  strokeSupplier: string | undefined
  /** How the pointer shows what a press would do here: the brush, a brush whose supplier does not offer the competence, or the eraser. */
  cursor: '' | 'brush' | 'nobrush' | 'erase'
  actions: InnleidActions
}

/**
 * One competence: its name with what is missing in the days in view, and per day a line of how far it is covered,
 * the hours missing or over, and a chip per supplier ordered. With days picked, its label is the editor of their orders.
 */
const CompetenceRow = memo(function CompetenceRow({ style, cols, board, ordersOn, suppliers, wd, missing, pickedFrom, pickedTo, pickedGroup, dragFrom, dragTo, strokeFrom, strokeTo, strokePeople, strokeSupplier, cursor, actions }: RowProps) {
  const open = pickedFrom !== null && pickedTo !== null
  const nameOf = (id: string) => suppliers.find((supplier) => supplier.id === id)?.name ?? 'Ukjent leverandør'
  const named = cols.colW >= NAME_FROM_W
  return (
    <div className={`grid-row il-row ${open ? 'open' : ''} ${cursor}`} style={{ ...competenceColor(style), minHeight: DEMAND_H }}>
      <div className="grid-label" style={{ width: LEFT_W }} onClick={open ? undefined : () => actions.openFirst(style.key)} title={open ? undefined : `Bestill ${style.label}`}>
        {open ? (
          <OrderEditor style={style} />
        ) : (
          <>
            <ChevronsUpDown className="il-unfold" size={13} aria-hidden />
            <i className="swatch" />
            <span className="lbl-desc">{style.label}</span>
            <span className="il-total">{missing > HOURS_NOISE ? `${signedHours(-missing)} t` : <Check size={13} aria-label="Dekket" />}</span>
          </>
        )}
      </div>
      <div className="grid-spacer" style={{ width: daysWide(cols.c0) }} />
      {cols.dates.map((date) => {
        const cover = board.cover(style.key, date)
        const picked = open && date >= pickedFrom && date <= pickedTo
        const dragged = dragFrom !== null && dragTo !== null && date >= dragFrom && date <= dragTo
        const stroked = strokeFrom !== null && strokeTo !== null && date >= strokeFrom && date <= strokeTo
        // The stroke is the eraser where it has no people to give.
        const erasing = stroked && strokePeople === null
        const ghost = stroked ? strokePeople?.get(date) : undefined
        const figure = coverFigure(cover)
        const { confirmed, waiting } = coverShares(cover)
        const chips = dayChips(ordersOn.get(dayKey(style.key, date)) ?? [], suppliers, open)
        const shown = chips.length > CHIPS_MAX && !open ? chips.slice(0, CHIPS_MAX - 1) : chips
        return (
          <div
            key={date}
            className={`${dayClass(cols, date)} cell il-day ${cover.state} ${picked ? 'picked' : ''} ${dragged ? 'dragged' : ''} ${erasing ? 'erasing' : ''}`}
            title={coverTitle(style.label, date, cover)}
            onMouseDown={(e) => {
              if (e.button !== 0) return
              e.preventDefault()
              actions.dayDown(style.key, date, e.shiftKey, e.altKey)
            }}
            onMouseEnter={() => actions.dayEnter(style.key, date)}
          >
            <span className="il-cover">
              {cover.rest > 0 && (
                <span className="il-bar">
                  <i className="confirmed" style={{ width: `${confirmed * 100}%` }} />
                  {waiting > 0 && <i className="waiting" style={{ left: `${confirmed * 100}%`, width: `${waiting * 100}%` }} />}
                </span>
              )}
              {figure !== null && <b className={figure < 0 ? 'short' : 'over'}>{signedHours(figure)}</b>}
            </span>
            {(chips.length > 0 || ghost !== undefined) && (
              <span className="il-chips">
                {shown.map((chip) => (
                  <span
                    key={chip.key}
                    className={`il-chip ${chip.waits ? 'waits' : ''} ${picked && pickedGroup !== null && chip.key === pickedGroup ? 'on' : ''} ${erasing && (strokeSupplier === undefined || chip.supplierId === strokeSupplier) ? 'gone' : ''}`}
                    title={chipTitle(nameOf(chip.supplierId), chip, wd)}
                  >
                    {chip.waits && <AnswerGlyph waits size={12} />}
                    <b>{chip.fte}</b>
                    {named && <span>{nameOf(chip.supplierId)}</span>}
                  </span>
                ))}
                {shown.length < chips.length && <span className="il-more">+{chips.length - shown.length} til</span>}
                {ghost !== undefined && strokeSupplier && (
                  <span className="il-chip ghost">
                    <b>{ghost}</b>
                    {named && <span>{nameOf(strokeSupplier)}</span>}
                  </span>
                )}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
})

/** The rows of Innleid: a line per competence with hours that remain after the permanent staff, or with orders. */
export function InnleidRows({ onOpenSuppliers }: { onOpenSuppliers: () => void }) {
  const { cols, dates, viewFrom, viewTo, styles } = useBemanning()
  const il = useInnleid()
  const { board, rows, suppliers, ordersOn, wd, open, dragOn, groups, pop, setPop, edits, actions, tool, brush, preview } = il
  const view = dates.slice(viewFrom, viewTo + 1)
  const missing = (key: string) => view.reduce((sum, date) => sum + Math.max(0, board.cover(key, date).remaining), 0)
  const popGroup = pop?.group ? groups.find((group) => group.key === pop.group) : undefined
  const popSupplier = popGroup && suppliers.find((supplier) => supplier.id === popGroup.supplierId)
  const openStyle = open ? styles.get(open.competence) : undefined
  const close = () => setPop(null)
  return (
    <div className="bm-people il-rows" onMouseLeave={actions.rowsLeave}>
      {rows.map((style) => {
        const mine = open?.competence === style.key
        const dragged = dragOn?.competence === style.key
        const stroked = preview?.competence === style.key ? preview : null
        return (
          <CompetenceRow
            key={style.key}
            style={style}
            cols={cols}
            board={board}
            ordersOn={ordersOn}
            suppliers={suppliers}
            wd={wd}
            missing={missing(style.key)}
            pickedFrom={mine ? open.from : null}
            pickedTo={mine ? open.to : null}
            pickedGroup={mine ? open.group : null}
            dragFrom={dragged ? dragOn.from : null}
            dragTo={dragged ? dragOn.to : null}
            strokeFrom={stroked ? stroked.from : null}
            strokeTo={stroked ? stroked.to : null}
            strokePeople={stroked?.mode === 'paint' ? stroked.people : null}
            strokeSupplier={stroked?.supplierId}
            cursor={tool === 'erase' ? 'erase' : tool === 'paint' ? (brush?.competences.includes(style.key) ? 'brush' : 'nobrush') : ''}
            actions={actions}
          />
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
      {pop?.kind === 'add' && openStyle && <SupplierMenu at={pop.at} competence={openStyle} suppliers={suppliers} onPick={edits.addSupplier} onClose={close} />}
      {pop?.kind === 'supplier' && popGroup && openStyle && <SupplierMenu at={pop.at} competence={openStyle} suppliers={suppliers} current={popGroup.supplierId} onPick={(supplier) => edits.supplier(popGroup, supplier.id)} onClose={close} />}
      {pop?.kind === 'shift' && popGroup && <ShiftMenu at={pop.at} group={popGroup} supplier={popSupplier} wd={wd} onPick={(times) => edits.times(popGroup, times)} onOwn={() => setPop({ ...pop, kind: 'time' })} onClose={close} />}
      {pop?.kind === 'time' && popGroup && <TimePopover at={pop.at} group={popGroup} wd={wd} onTimes={(times) => edits.times(popGroup, times)} onClose={close} />}
      {pop?.kind === 'answer' && popGroup && <AnswerPopover at={pop.at} group={popGroup} supplier={popSupplier} onWaits={() => edits.waits(popGroup)} onConfirm={() => edits.confirm(popGroup)} onFewer={edits.fewer} onClose={close} />}
    </div>
  )
}
