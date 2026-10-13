import { createContext, memo, useContext, useMemo, type CSSProperties, type ReactNode } from 'react'
import { Check, Clock, TriangleAlert } from 'lucide-react'
import { coverFigure, hireBoard, HOURS_NOISE, waitingHours, type HireBoard } from '../../domain/hire'
import type { CompetenceStyle } from '../../domain/types'
import { Segmented, UndoRedoButtons } from '../common'
import { competenceColor } from '../dom'
import { useBemanning } from '../bemanning/BemanningScope'
import { DEMAND_H } from '../bemanning/layout'
import { ProjectLines } from '../bemanning/ProjectLines'
import { hoursShort, hoursText } from '../bemanning/week'
import { HeatLegend, Line, SectionLine } from '../kalender/GridRows'
import { dayClass, type Columns } from '../kalender/gridTypes'
import { heatScale, heatTile, HEAT_LABELS, signed } from '../kalender/heat'
import { ModeSwitch, ModeTag } from '../kalender/KalenderBar'
import { fmtDay } from '../kalender/labels'
import { HEAT_ROW_H, LEFT_W, ROW_H } from '../kalender/layout'
import { PlanBar } from '../kalender/PlanBar'
import type { PlanMode } from '../kalender/zoom'

/** The two parts of Bemanning: the permanent staff, and the people hired for what they leave. */
export type CrewPart = 'faste' | 'innleid'
// eslint-disable-next-line react-refresh/only-export-components
export const cleanCrewPart = (stored: unknown): CrewPart => (stored === 'innleid' ? 'innleid' : 'faste')

export function PartSwitch({ part, onChange }: { part: CrewPart; onChange: (part: CrewPart) => void }) {
  return (
    <Segmented
      label="Mannskap"
      value={part}
      onChange={onChange}
      options={[
        { value: 'faste', label: 'Faste', title: 'Faste: sett de faste på arbeidet som er planlagt' },
        { value: 'innleid', label: 'Innleid', title: 'Innleid: dekk behovet som står igjen etter de faste, med folk fra leverandører' },
      ]}
    />
  )
}

/** Hours with their sign, as Innleid writes them: «−» for what is missing, «+» for what is over. */
const signedHours = (hours: number): string => signed(hoursShort(hours))

interface InnleidState {
  board: HireBoard
  /** The competences of the board with how each is shown. */
  rows: CompetenceStyle[]
  /** The largest shortage and surplus of a day in the period, in hours, which the Avvik line is scaled by. */
  scale: { maxShortage: number; maxSurplus: number }
  /** The hours ordered that wait for an answer. */
  waiting: number
}

const InnleidContext = createContext<InnleidState | null>(null)

/** What the parts of Innleid share: the board of the period, worked out once. Nothing is worked out while Innleid is not shown. */
export function InnleidScope({ active, children }: { active: boolean; children: ReactNode }) {
  const { ws, dates, balance, styles } = useBemanning()
  const orders = ws.hireOrders
  const wd = ws.settings.workday
  const state = useMemo<InnleidState>(() => {
    const board = hireBoard(active ? [...styles.keys()] : [], dates, (competence, date) => Math.max(0, balance.get(competence, date).remaining), orders ?? [], wd)
    return {
      board,
      rows: board.competences.map((key) => styles.get(key)!),
      scale: heatScale([...board.deviations.values()].map((dev) => dev.value)),
      waiting: waitingHours(orders ?? [], wd),
    }
  }, [active, styles, dates, balance, orders, wd])
  return <InnleidContext.Provider value={state}>{children}</InnleidContext.Provider>
}

const useInnleid = (): InnleidState => {
  const state = useContext(InnleidContext)
  if (!state) throw new Error('Innleid is read outside its scope')
  return state
}

const days = (n: number) => (n === 1 ? '1 dag' : `${n} dager`)

/** The page header in Innleid: how much of what the permanent staff leave is still missing. */
export function InnleidHead({ places }: { places: ReactNode }) {
  const { ws } = useBemanning()
  const { board, rows } = useInnleid()
  const suppliers = ws.suppliers?.length ?? 0
  const meta = [suppliers === 1 ? '1 leverandør' : `${suppliers} leverandører`, `${rows.length} ${rows.length === 1 ? 'kompetanse' : 'kompetanser'} med restbehov`, board.underDays.length ? `${days(board.underDays.length)} udekket` : 'Alt dekket']
  return (
    <div className="page-head mode-band">
      <h2>Kalender</h2>
      <ModeTag mode="bemanning" part="innleid" />
      <span className="page-meta" title="Gjelder hele perioden">{meta.join(' · ')}</span>
      {places}
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

/** The planning bar in Innleid: the mode and the part, undo, and what is still to do. */
export function InnleidToolbar({ width, mode, onMode, onPart, onToday }: { width: number; mode: PlanMode; onMode: (mode: PlanMode) => void; onPart: (part: CrewPart) => void; onToday: () => void }) {
  const { onShowDate } = useBemanning()
  const { board, waiting } = useInnleid()
  const under = board.underDays.length
  return (
    <PlanBar width={width} fitKey={`innleid|${under}|${waiting > HOURS_NOISE}`}>
      <div className="bar-zone">
        <ModeSwitch mode={mode} onChange={onMode} />
        <PartSwitch part="innleid" onChange={onPart} />
        <UndoRedoButtons />
      </div>
      <div className="bar-view">
        <div className="bar-zone bar-zone-end">
          {waiting > HOURS_NOISE && (
            <span className="il-waiting" title="Timer som er bestilt, men ikke bekreftet av leverandøren">
              <Clock size={14} aria-hidden /> {hoursText(waiting)} t venter på svar
            </span>
          )}
          {under > 0 && (
            <button className="il-under" title="Dager der det mangler timer. Klikk for å gå til den første." onClick={() => onShowDate(board.underDays[0])}>
              <TriangleAlert size={14} aria-hidden /> {days(under)} udekket
            </button>
          )}
          {under === 0 && waiting <= HOURS_NOISE && <span className="bm-hints">Alt dekket og bekreftet</span>}
          <button className="ghost" onClick={onToday}>
            I dag
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
        <span>Linjen under tallet viser hvor mye av restbehovet som er bestilt · −: timer som mangler · +: timer over</span>
      </span>
    </div>
  )
}

interface RowProps {
  style: CompetenceStyle
  cols: Columns
  board: HireBoard
  /** The hours missing in the days in view. */
  missing: number
}

/** One competence: its name with what is missing in the days in view, and per day a line of how far it is covered and the hours missing or over. */
const CompetenceRow = memo(function CompetenceRow({ style, cols, board, missing }: RowProps) {
  return (
    <Line
      className="il-row"
      height={DEMAND_H}
      style={competenceColor(style)}
      label={
        <>
          <i className="swatch" />
          <span className="lbl-desc">{style.label}</span>
          <span className="il-total">{missing > HOURS_NOISE ? `${signedHours(-missing)} t` : <Check size={13} aria-label="Dekket" />}</span>
        </>
      }
      cols={cols}
      cells={(date) => {
        const cover = board.cover(style.key, date)
        const classes = `${dayClass(cols, date)} cell il-cover`
        if (cover.state === 'none') return <div key={date} className={classes} />
        const figure = coverFigure(cover)
        const confirmed = cover.rest > 0 ? Math.min(1, cover.confirmed / cover.rest) : 0
        const waiting = cover.rest > 0 ? Math.min(1 - confirmed, (cover.planned - cover.confirmed) / cover.rest) : 0
        const title = `${style.label} · ${fmtDay(date)}\nRestbehov ${hoursText(cover.rest)} t · bestilt ${hoursText(cover.planned)} t, bekreftet ${hoursText(cover.confirmed)} t` + (figure === null ? '' : figure < 0 ? `\n${hoursText(-figure)} t mangler` : `\n${hoursText(figure)} t over`)
        return (
          <div key={date} className={`${classes} ${cover.state}`} title={title}>
            {cover.rest > 0 && (
              <span className="il-bar">
                <i className="confirmed" style={{ width: `${confirmed * 100}%` }} />
                {waiting > 0 && <i className="waiting" style={{ left: `${confirmed * 100}%`, width: `${waiting * 100}%` }} />}
              </span>
            )}
            {figure !== null && <b className={figure < 0 ? 'short' : 'over'}>{signedHours(figure)}</b>}
          </div>
        )
      }}
    />
  )
})

/** The rows of Innleid: a line per competence with hours that remain after the permanent staff, or with orders. */
export function InnleidRows({ onOpenSuppliers }: { onOpenSuppliers: () => void }) {
  const { ws, cols, dates, viewFrom, viewTo } = useBemanning()
  const { board, rows } = useInnleid()
  const view = dates.slice(viewFrom, viewTo + 1)
  const missing = (key: string) => view.reduce((sum, date) => sum + Math.max(0, board.cover(key, date).remaining), 0)
  return (
    <div className="bm-people il-rows">
      {rows.map((style) => (
        <CompetenceRow key={style.key} style={style} cols={cols} board={board} missing={missing(style.key)} />
      ))}
      {rows.length === 0 && <p className="empty-rows">Ingen restbehov i perioden: de faste dekker det som er planlagt, eller ingenting er planlagt ennå.</p>}
      {rows.length > 0 && !ws.suppliers?.length && (
        <p className="empty-rows">
          Ingen leverandører er registrert ennå. Legg dem inn på{' '}
          <button className="link" onClick={onOpenSuppliers}>
            Leverandører
          </button>{' '}
          for å kunne bestille.
        </p>
      )}
    </div>
  )
}
