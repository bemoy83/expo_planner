import type { ISODate } from './dates'

/** Values keyed by date; missing dates mean blank. */
export type DayValues = Record<ISODate, number>

export interface Settings {
  /** Permanent crew available on a workday (`fte_fulltid`). */
  baseCrew: number
  /** Hours in one FTE-day (`normaltid`). */
  hoursPerDay: number
  absenceRate: number
  overheadRate: number
}

export const DEFAULT_SETTINGS: Settings = {
  baseCrew: 21,
  hoursPerDay: 7.5,
  absenceRate: 0.05,
  overheadRate: 0.1,
}

export type VenuePhase = 'assembly' | 'movingIn' | 'event' | 'movingOut' | 'dismantle'
export const VENUE_PHASES: VenuePhase[] = ['assembly', 'movingIn', 'event', 'movingOut', 'dismantle']

export interface DateSpan {
  start: ISODate
  end: ISODate
}

/** One Venyoo row: an event occupying a hall, with its phase periods. */
export interface VenueBooking {
  id: string
  hall: string
  eventName: string
  status: string
  phases: Partial<Record<VenuePhase, DateSpan>>
}

export interface VenueImportInfo {
  fileName: string
  importedAt: string
  from: ISODate
  to: ISODate
}

export interface ProjectRef {
  name: string
  projectNo: string
}

export type WorkPhase = 'Montering' | 'Demontering'

/** One row of the demand ledger (`Tabell_oppgaver`). */
export interface DemandLine {
  id: string
  projectNo: string
  projectName: string
  eventYear: string
  source: string
  workType: string
  quantity: number | null
  unit: string
  stand: string
  hall: string
  competence: string
  basis: string
  assemblyHours: number
  dismantleHours: number
  comment: string
  /** Visma department (`Avdeling` / `FAKTURA-MOTTAKER`). */
  avdeling?: string
  /** Share of the calculated hours to leave out: 1 removes the line's hours, negative adds. */
  effekt?: number
  /** Where the line comes from. Unset for rows that came with the planner workbook. */
  origin?: 'visma' | 'manual'
}

/** One planning row in the Kalender: required hours for a scope, and FTE typed per day. */
export interface AllocationRow {
  id: string
  order: number
  projectName: string
  projectNo: string
  /** Year whose demand is used (`DATA FRA`). */
  refYear: string
  competence: string
  phase: WorkPhase | ''
  /** Kind of demand data used (`DATAGRUNNLAG`). */
  basis: string
  /** Hours the workbook showed at import, kept for comparison. */
  importedHours: number | null
  fte: DayValues
  notes: Record<ISODate, string>
}

export type CapacityGroup = 'added' | 'overtime' | 'unavailable'

/** A manually entered staffing line, such as hired help, a trade crew, overtime or absence. */
export interface CapacityLine {
  id: string
  order: number
  label: string
  group: CapacityGroup
  /** FTE per day, or for overtime the number of people. */
  values: DayValues
  /** Overtime only: hours per person per day. */
  hours?: DayValues
  notes: Record<ISODate, string>
}

/** One booking line of a Visma export (`utskrift_visma`). */
export interface VismaRow {
  projectNo: string
  eventName: string
  stand: string
  transInfo: string
  customer: string
  avdeling: string
  orderNo: string
  articleNo: string
  description: string
  quantity: number
  productGroup: string
  productType: string
}

/** The latest Visma export held for one project. A new export replaces it. */
export interface VismaImport {
  projectNo: string
  eventName: string
  fileName: string
  importedAt: string
  rows: VismaRow[]
}

/** How one Visma product type is counted and which competence it belongs to. */
export interface WorkTypeRule {
  /** Text inside the brackets of `Produkttype 2`, e.g. «FOGA-vegger». */
  name: string
  productType: string
  unit: string
  competence: string
}

/** Units of work done per person-hour for a work type and unit. */
export interface KpiRate {
  name: string
  unit: string
  assembly: number
  dismantle: number
}

export interface KpiConfig {
  workTypes: WorkTypeRule[]
  rates: KpiRate[]
}

/** The planner's own decisions about one Visma line; they survive a new export. */
export interface LineOverride {
  effekt?: number
  comment?: string
  /** Counts in the demand the planner plans with («Planlagt»). */
  inPlan?: boolean
  /** Work type chosen by hand for a line Visma has no product type for. */
  workType?: string
  /** The line as it read when the decision was made, for showing it after it has left the export. */
  ref?: { avdeling: string; workType: string; hall: string }
}

export const PLANNED_BASIS = 'Planlagt'
export const VISMA_BASIS = 'visma per reg. dato'
export const VISMA_SOURCE = 'visma per reg. dato'

export interface Workspace {
  settings: Settings
  venue: VenueBooking[]
  projects: ProjectRef[]
  demand: DemandLine[]
  allocations: AllocationRow[]
  capacity: CapacityLine[]
  /** Hall bookings left out of the Kalender, keyed by `venueKey`. They stay in the hall ledger. */
  hiddenVenue?: Record<string, true>
  /** The latest Venyou export read into the app, and the dates it covers. */
  venueImport?: VenueImportInfo
  /** Latest Visma export per project number. */
  visma?: VismaImport[]
  kpi?: KpiConfig
  /** Keyed by Visma line key, see `vismaLineKey`. */
  overrides?: Record<string, LineOverride>
  importedFrom?: { fileName: string; importedAt: string }
}
