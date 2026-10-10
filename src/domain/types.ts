import type { ISODate } from './dates'

/** Values keyed by date; missing dates mean blank. */
export type DayValues = Record<ISODate, number>

export interface Settings {
  /** Permanent crew available on a workday (`fte_fulltid`). */
  baseCrew: number
  /** Hours in one FTE-day (`normaltid`). */
  hoursPerDay: number
  /** The hours of a normal day, used by Bemanning. */
  workday: WorkdaySettings
}

/** Minutes after midnight, 0–1440. Values made by the UI are multiples of `snap`. */
export type Minute = number

/** Half-open: from `start` up to, not including, `end`. */
export interface Interval {
  start: Minute
  end: Minute
}

export interface WorkdaySettings {
  dayStart: Minute
  dayEnd: Minute
  /** The lunch break, unpaid. */
  breakStart: Minute
  breakEnd: Minute
  /** The first and last minute overtime can be drawn in. */
  overtimeEarliest: Minute
  overtimeLatest: Minute
  snap: Minute
}

/** 07:00–15:00 with lunch 11:00–11:30, which is 7,5 paid hours. */
export const DEFAULT_WORKDAY: WorkdaySettings = {
  dayStart: 420,
  dayEnd: 900,
  breakStart: 660,
  breakEnd: 690,
  overtimeEarliest: 360,
  overtimeLatest: 1260,
  snap: 15,
}

export const DEFAULT_SETTINGS: Settings = {
  baseCrew: 21,
  hoursPerDay: 7.5,
  workday: DEFAULT_WORKDAY,
}

/** Settings stored before a field existed get its default. */
export const withSettingsDefaults = (settings: Partial<Settings>): Settings => ({
  ...DEFAULT_SETTINGS,
  ...settings,
  workday: { ...DEFAULT_WORKDAY, ...settings.workday },
})

export type VenuePhase = 'assembly' | 'movingIn' | 'event' | 'movingOut' | 'dismantle'
export const VENUE_PHASES: VenuePhase[] = ['assembly', 'movingIn', 'event', 'movingOut', 'dismantle']

export interface DateSpan {
  start: ISODate
  end: ISODate
}

/** One Venyou row: an event occupying a hall, with its phase periods. */
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

/** A row of the project table: a name a project goes by. See `domain/projects.ts`. */
export interface ProjectRef {
  name: string
  projectNo: string
  /** The year the name is matched in, kept only where it is another than the number begins with. */
  year?: string
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
  /** Where the line comes from: a Visma export, or the planner. */
  origin: 'visma' | 'manual'
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
  /** The hall whose demand the row covers. Unset covers every hall; empty is demand without a hall. */
  hall?: string
  /** The Visma department whose demand the row covers. Unset covers every department; empty is demand without one. */
  avdeling?: string
  fte: DayValues
  notes: Record<ISODate, string>
}

export type CapacityGroup = 'added' | 'overtime' | 'unavailable'

/** A staffing line of the Kalender beside «Faste». The lines are worked out from Bemanning (absence, overtime), never stored. */
export interface CapacityLine {
  id: string
  label: string
  group: CapacityGroup
  /** FTE per day, or for overtime the number of people. */
  values: DayValues
  /** Overtime only: hours per person per day. */
  hours?: DayValues
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
  /** `Produkttype 2` as Visma writes it, e.g. «14 [FOGA-vegger]», or the name typed for a type added by hand. Its name is worked out, see `productTypeName`. */
  productType: string
  unit: string
  competence: string
}

/** Units of work done per person-hour for a work type and unit. */
export interface KpiRate {
  /** The name of the product type the rate is for, see `productTypeName`. */
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

/** A competence text as it is compared: trimmed and in lower case. */
export type CompetenceKey = string

export const competenceKey = (text: string): CompetenceKey => text.trim().toLowerCase()

export const LINE_COLORS = ['line-blue', 'line-teal', 'line-green', 'line-amber', 'line-rose', 'line-violet', 'line-slate', 'line-orange'] as const
export type LineColor = (typeof LINE_COLORS)[number]

/** How a competence is shown in Bemanning. */
export interface CompetenceStyle {
  key: CompetenceKey
  label: string
  /** At most four characters, for narrow blocks. */
  shortLabel: string
  color: LineColor
  /** Order in the demand strip and of the keys 1–9. */
  order: number
}

/** One of the permanent staff. */
export interface Person {
  id: string
  name: string
  order: number
  /** Inactive people are hidden in Bemanning but keep their history. */
  active: boolean
  competences: CompetenceKey[]
  note?: string
}

export type UnavailabilityKind = 'syk' | 'ferie' | 'kurs' | 'annet'

/** A day, or a part of one, a person is away. */
export interface Unavailability {
  id: string
  personId: string
  date: ISODate
  kind: UnavailabilityKind
  /** Both unset: the whole day. Set: only this part of the day. */
  start?: Minute
  end?: Minute
  note?: string
}

/** A person doing work of one competence for a stretch of a day. */
export interface Assignment {
  id: string
  personId: string
  date: ISODate
  competence: CompetenceKey
  start: Minute
  end: Minute
  /** `suggested` is kept for assignments the app may propose later. */
  source: 'manual' | 'suggested'
  /** Not set yet; kept so an assignment can later be tied to a Kalender row. */
  projectNo?: string
  hall?: string
}

/** Hours added to a day's demand for a competence, on top of what the Kalender plans. */
export interface DemandAdjustment {
  id: string
  competence: CompetenceKey
  /** The day the hours are added to. */
  date: ISODate
  hours: number
  reason: 'carry'
  /** The day the work was not finished. */
  fromDate?: ISODate
  createdAt: string
  note?: string
}

/** The planner's own rules for placing a Hall/Sted text, beside the choices for single texts (`hallAliases`). See `domain/locations.ts`. */
export interface HallRules {
  /** Places the planner has made of several halls of the ledger: a name, and the halls it stands for. */
  places: { name: string; halls: string[] }[]
  /** A text that holds these words counts under the place. The first that fits, in the planner's order. */
  phrases: { text: string; hall: string }[]
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
  /** Only in data stored by earlier versions: numbers typed on the events. Read into `projects` by `withEventLinksAsProjects`. */
  eventLinks?: Record<string, string>
  /** Halls chosen by hand for Hall/Sted texts, keyed by `aliasKey`: for every line with the text, or for those of one project. */
  hallAliases?: Record<string, string>
  hallRules?: HallRules
  /** Hall bookings left out of the Kalender, keyed by `venueKey`. They stay in the hall ledger. */
  hiddenVenue?: Record<string, true>
  /** The latest Venyou export read into the app, and the dates it covers. */
  venueImport?: VenueImportInfo
  /** Latest Visma export per project number. */
  visma?: VismaImport[]
  kpi?: KpiConfig
  /** Keyed by Visma line key, see `vismaLineKey`. */
  overrides?: Record<string, LineOverride>
  persons?: Person[]
  unavailability?: Unavailability[]
  assignments?: Assignment[]
  demandAdjustments?: DemandAdjustment[]
  competenceStyles?: Record<CompetenceKey, CompetenceStyle>
}
