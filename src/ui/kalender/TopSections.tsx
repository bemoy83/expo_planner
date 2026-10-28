import type { ReactNode } from 'react'
import type { ISODate } from '../../domain/dates'
import { VENUE_PHASES, type CapacityLine, type DayValues, type Settings } from '../../domain/types'
import { PHASE_CODES, PHASE_LABELS } from '../../domain/venue'
import { DensityToggle } from '../bemanning/DensityToggle'
import { Twisty } from '../common'
import { BaseCrewRow, FromBemanningRow, HallRow, SectionLine, SumRows } from './GridRows'
import type { Columns } from './gridTypes'
import { LEFT_W, ROW_H } from './layout'
import type { useHallCalendar } from './useHallCalendar'

/** The blocks pinned above the planning rows: the hall calendar, the staffing lines and the heading of the planning rows. */

type HallCalendar = ReturnType<typeof useHallCalendar>

/** What the colours of the hall phases mean, each with the letter the bars write. It ends a section's heading, and stays beside the label column. */
export function PhaseLegend() {
  return (
    <span className="phase-legend">
      {VENUE_PHASES.map((phase) => (
        <span key={phase}>
          <i className={`ph-${phase}`}>{PHASE_CODES[phase]}</i> {PHASE_LABELS[phase]}
        </span>
      ))}
    </span>
  )
}

interface HallSectionProps extends Pick<HallCalendar, 'halls' | 'hallCount' | 'hallBars' | 'hallLabels' | 'hallProjectLists'> {
  open: boolean
  onOpen: (open: boolean) => void
  /** Thin lines, as the project lines of Bemanning have: the bars alone, so more of the rows is in sight. */
  compact: boolean
  onCompact: (compact: boolean) => void
  /** No hall bookings are read in. */
  empty: boolean
  /** Where the hall calendar stays while the rows scroll: right under the date header. */
  pinTop: number
  /** The today line: the hall calendar is pinned over what scrolls under it, so it has the line once more. */
  todayLine: ReactNode
  /** The tint of the day under the pointer, laid in the section as the today line is, since the section covers what is under it. */
  dayHover: ReactNode
  cols: Columns
  /** The day at the left edge of what is seen. */
  first: number
}

/**
 * The hall calendar opens with a tinted heading, which is all that is left of it when folded. Open, the heading carries the legend.
 * It stays under the date header whatever the height of the top block: where the block has to give way, the staffing lines slide in under it.
 */
export function HallSection({ open, onOpen, compact, onCompact, empty, pinTop, todayLine, dayHover, halls, hallCount, hallBars, hallLabels, hallProjectLists, cols, first }: HallSectionProps) {
  return (
    <div className={`top-section halls ${open ? 'open' : ''} ${compact ? 'compact' : ''}`} style={{ top: pinTop }}>
      <SectionLine>
        <Twisty open={open} show="Vis hallkalenderen" hide="Skjul hallkalenderen" onToggle={() => onOpen(!open)} />
        Haller
        {open && <DensityToggle compact={compact} onChange={onCompact} />}
        {!open && <span className="section-meta">{halls.length} skjult</span>}
        {open && halls.length < hallCount && (
          <span className="section-meta" title="Hallene som er valgt under «Steder» øverst på siden">
            {halls.length} av {hallCount}
          </span>
        )}
        {open && <PhaseLegend />}
      </SectionLine>
      {open && empty && (
        <div className="section-hint" style={{ width: LEFT_W }}>
          Ingen hallbookinger. Les inn <code>location_format</code> med «Les inn VenYou» øverst til høyre.
        </div>
      )}
      {dayHover}
      {todayLine}
      {open && halls.map((hall) => <HallRow key={`hall:${hall}`} hall={hall} bars={hallBars.get(hall)} runs={hallLabels.get(hall)} projects={hallProjectLists.get(hall)} compact={compact} cols={cols} first={first} />)}
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
  /** The people ordered in Innleid who are not confirmed, as FTE per day: told of on «Tilgjengelig», counted nowhere. */
  waitingHired: DayValues
  settings: Settings
  heat: boolean
  heatMax: { maxShortage: number; maxSurplus: number }
}

/** Bemanning has a heading as the hall calendar has; it always has the Avvik line under it. */
export function StaffingSection({ open, onOpen, detailsOpen, onDetailsOpen, cols, need, capacity, fromBemanning, waitingHired, settings, heat, heatMax }: StaffingSectionProps) {
  return (
    <div className="top-section staffing open">
      <SectionLine>
        <Twisty open={open} show="Vis bemanningen" hide="Skjul bemanningen" onToggle={() => onOpen(!open)} />
        Bemanning <span className="muted">(FTE)</span>
        {open ? (
          <button className="link small" onClick={() => onDetailsOpen(!detailsOpen)}>
            {detailsOpen ? 'Skjul detaljer' : 'Vis detaljer'}
          </button>
        ) : (
          <span className="section-meta">bare mangler og over vises</span>
        )}
      </SectionLine>
      {open && detailsOpen && (
        <>
          <BaseCrewRow cols={cols} baseCrew={settings.baseCrew} />
          {fromBemanning.map((line) => (
            <FromBemanningRow key={line.label} cols={cols} {...line} />
          ))}
        </>
      )}
      <SumRows cols={cols} need={need} capacity={capacity} waitingHired={waitingHired} settings={settings} deviationOnly={!open} heat={heat} maxShortage={heatMax.maxShortage} maxSurplus={heatMax.maxSurplus} />
    </div>
  )
}

/** The heading over the planning rows, at the foot of the planning bar. */
export function PlanningHeading() {
  return (
    <div className="grid-row col-head" style={{ height: ROW_H }}>
      <div className="grid-label">
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
