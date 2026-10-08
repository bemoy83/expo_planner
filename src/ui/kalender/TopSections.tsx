import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ISODate } from '../../domain/dates'
import { VENUE_PHASES, type CapacityLine, type DayValues, type Settings } from '../../domain/types'
import { PHASE_CODES, PHASE_LABELS } from '../../domain/venue'
import { BaseCrewRow, FromBemanningRow, HallRow, SumRows } from './GridRows'
import type { Columns } from './gridTypes'
import { LEFT_W, ROW_H } from './layout'
import type { useHallCalendar } from './useHallCalendar'

/** The blocks pinned above the planning rows: the hall calendar, the staffing lines and the heading of the planning rows. */

type HallCalendar = ReturnType<typeof useHallCalendar>

interface HallSectionProps extends Pick<HallCalendar, 'halls' | 'hallCount' | 'hallBars' | 'hallLabels' | 'hallProjectLists'> {
  open: boolean
  onOpen: (open: boolean) => void
  allHalls: boolean
  onAllHalls: (all: boolean) => void
  /** No hall bookings are read in. */
  empty: boolean
  cols: Columns
}

/** The hall calendar is framed by a hairline above and below, so it still reads as a line of its own when folded. Open, its heading with the legend is a line of its own too. */
export function HallSection({ open, onOpen, allHalls, onAllHalls, empty, halls, hallCount, hallBars, hallLabels, hallProjectLists, cols }: HallSectionProps) {
  return (
    <div className={`top-section ${open ? 'open' : ''}`}>
      <div className="section-head" style={{ width: LEFT_W }}>
        <button className="twisty" aria-expanded={open} aria-label={open ? 'Skjul hallkalenderen' : 'Vis hallkalenderen'} onClick={() => onOpen(!open)}>
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        </button>
        Haller
        {!open && <span className="section-meta">{halls.length} skjult</span>}
        {open && (
          <button className="link small" onClick={() => onAllHalls(!allHalls)}>
            {allHalls ? 'Bare messehaller' : `Vis alle (${hallCount})`}
          </button>
        )}
        {open && (
          <span className="phase-legend">
            {VENUE_PHASES.map((phase) => (
              <span key={phase}>
                <i className={`ph-${phase}`}>{PHASE_CODES[phase]}</i> {PHASE_LABELS[phase]}
              </span>
            ))}
          </span>
        )}
      </div>
      {open && empty && (
        <div className="section-hint" style={{ width: LEFT_W }}>
          Ingen hallbookinger. Les inn <code>location_format</code> med «Les inn haller» øverst til høyre.
        </div>
      )}
      {open && halls.map((hall) => <HallRow key={`hall:${hall}`} hall={hall} bars={hallBars.get(hall)} runs={hallLabels.get(hall)} projects={hallProjectLists.get(hall)} cols={cols} />)}
    </div>
  )
}

interface StaffingSectionProps {
  open: boolean
  onOpen: (open: boolean) => void
  detailsOpen: boolean
  onDetailsOpen: (open: boolean) => void
  cols: Columns
  need: Map<ISODate, number>
  /** The staffing lines beside «Faste»: those from Bemanning. */
  capacity: CapacityLine[]
  /** The lines that come from Bemanning, in FTE per day; none until people are entered on Personell. */
  fromBemanning: { label: string; title: string; values: DayValues }[]
  settings: Settings
  heat: boolean
  heatMax: { maxShortage: number; maxSurplus: number }
}

/** Bemanning is framed as the hall calendar is; its heading always has the Avvik line under it. */
export function StaffingSection({ open, onOpen, detailsOpen, onDetailsOpen, cols, need, capacity, fromBemanning, settings, heat, heatMax }: StaffingSectionProps) {
  return (
    <div className="top-section staffing open">
      <div className="section-head" style={{ width: LEFT_W }}>
        <button className="twisty" aria-expanded={open} aria-label={open ? 'Skjul bemanningen' : 'Vis bemanningen'} onClick={() => onOpen(!open)}>
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        </button>
        Bemanning <span className="muted">(FTE)</span>
        {open ? (
          <button className="link small" onClick={() => onDetailsOpen(!detailsOpen)}>
            {detailsOpen ? 'Skjul detaljer' : 'Vis detaljer'}
          </button>
        ) : (
          <span className="section-meta">bare avvik vises</span>
        )}
      </div>
      {open && detailsOpen && (
        <>
          <BaseCrewRow cols={cols} baseCrew={settings.baseCrew} />
          {fromBemanning.map((line) => (
            <FromBemanningRow key={line.label} cols={cols} {...line} />
          ))}
        </>
      )}
      <SumRows cols={cols} need={need} capacity={capacity} settings={settings} deviationOnly={!open} heat={heat} maxShortage={heatMax.maxShortage} maxSurplus={heatMax.maxSurplus} />
    </div>
  )
}

/** The heading over the planning rows, at the foot of the planning bar. */
export function PlanningHeading() {
  return (
    <div className="grid-row col-head" style={{ height: ROW_H }}>
      <div className="grid-label" style={{ width: LEFT_W }}>
        <span className="lbl-desc">Planlegging</span>
        <span className="lbl-nums">
          <span className="lbl-num" title="Behov (FTE-dager)">
            Behov
          </span>
          <span className="lbl-num" title="Planlagt (FTE-dager)">
            Plan
          </span>
          <span className="lbl-num" title="Plan minus behov">
            Δ
          </span>
        </span>
        {/* The rows end in a slot for their actions; the same slot here keeps the headings over their columns. */}
        <span className="row-slot" />
      </div>
      {/* What the colours of the planning cells mean; stays beside the label column when scrolling sideways. */}
      <span className="phase-legend" style={{ left: LEFT_W }}>
        <span>
          <i className="mon" /> Montering
        </span>
        <span>
          <i className="dem" /> Demontering
        </span>
        <span title="FTE på en dag utenfor radens monterings- eller demonteringsdager i hallen">
          <i className="outside" /> Utenfor
        </span>
      </span>
    </div>
  )
}
