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
  /** The share added to the planned hours on Resultat, 0.1 for 10 %: the budget holds overhead, the plan direct work only. */
  overhead: number
  /** The planning engine's rules as the planner has set them; the defaults where not (`domain/planner/score.ts`). */
  engine?: EngineRules
}

/** What the planner sets of the planning engine's rules on Oppsett › Planleggingsmotor. */
export interface EngineRules {
  /** The order of the stages in a build-up; a tear-down takes them the other way round. */
  stageOrder?: Stage[]
  /** The weights of the score that differ from the defaults, by name. */
  weights?: Record<string, number>
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

/** 07:00–15:00 with lunch 11:30–12:00, which is 7,5 paid hours. The lunch is the planner's to move, under Innstillinger. */
export const DEFAULT_WORKDAY: WorkdaySettings = {
  dayStart: 420,
  dayEnd: 900,
  breakStart: 690,
  breakEnd: 720,
  overtimeEarliest: 360,
  overtimeLatest: 1260,
  snap: 15,
}

export const DEFAULT_SETTINGS: Settings = {
  baseCrew: 21,
  hoursPerDay: 7.5,
  workday: DEFAULT_WORKDAY,
  overhead: 0.1,
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

interface VenueImportInfo {
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
  /** For the planner's own line made in place of a Visma line: the key of that line, which is left out. */
  replaces?: string
  /** The projects of a later year this own line is not offered to again («Ikke i år»). */
  notIn?: string[]
  /** For the planner's own line: the team its build-up hours were given as, people × days, which the planning engine keeps whole (R8). */
  assemblyCrew?: Crew
  /** The same for its tear-down hours. */
  dismantleCrew?: Crew
}

/** Work given as a team and how long it works, «2 people for 3 days», not as a quantity at a rate. The hours are people × days × a normal day. */
export interface Crew {
  people: number
  days: number
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
  /** The days whose FTE the planning engine wrote, in order. A day the planner types into is his own from then on. */
  engine?: ISODate[]
}

type CapacityGroup = 'added' | 'overtime' | 'unavailable'

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

/** One booking line of a Visma export (`utskrift_visma`). The customer and the order number are not read: the app needs neither. */
export interface VismaRow {
  projectNo: string
  eventName: string
  stand: string
  transInfo: string
  /** The Hall/Sted of the line, as the reader worked it out from the two above. */
  hall: string
  avdeling: string
  articleNo: string
  description: string
  quantity: number
  productGroup: string
  /** The name of the product type; empty where the line has none. */
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
  /** The name of the product type, «FOGA-vegger»: what joins an ordered line to its rate. See `productTypeKey`. */
  productType: string
  unit: string
  competence: string
  /** Where its work comes in a build-up, where it is not where its competence's does: built-up floor is carpentry on the floor (the planner, 2026-10-25). */
  stage?: Stage
}

/** Units of work done per person-hour for a work type and unit. */
export interface KpiRate {
  /** The name of the product type the rate is for. */
  name: string
  unit: string
  assembly: number
  dismantle: number
}

export interface KpiConfig {
  workTypes: WorkTypeRule[]
  rates: KpiRate[]
  /** The product type the planner gave an article text of lines that have none in the orders: the next export is read with it. */
  byText?: { text: string; productType: string }[]
  /** Article numbers whose booking lines are left out of the demand altogether, in every project and every export. */
  excludedArticles?: ExcludedArticle[]
}

/** An article number the planner does not count, with what it is, for the planner's own reading. */
export interface ExcludedArticle {
  articleNo: string
  note: string
}

/** The planner's own decisions about one Visma line; they survive a new export. */
export interface LineOverride {
  effekt?: number
  comment?: string
  /** Left out of the demand the planner plans with («Planlagt»), which a line that gives hours and has a hall is in by itself. */
  excluded?: boolean
  /** Work type chosen by hand for a line Visma has no product type for. */
  workType?: string
  /** The line as it read when the decision was made, for showing it after it has left the export. */
  ref?: { avdeling: string; workType: string; hall: string }
}

/** A competence text as it is compared: trimmed and in lower case. */
export type CompetenceKey = string

export const competenceKey = (text: string): CompetenceKey => text.trim().toLowerCase()

/** What a block or an order is work of: a competence, and the project it is for where the planner picked one. */
export interface Work {
  competence: CompetenceKey
  projectNo?: string
  /** The place of the project the work is in, as the Kalender's rows name it, where the planner picked one. Only with a project. */
  hall?: string
}

/** A competence alone is work for no project in particular. */
export const workOf = (work: CompetenceKey | Work): Work => (typeof work === 'string' ? { competence: work } : work)

/** The project as it is stored on a block or an order: none rather than an empty number. */
export const projectTag = (work: Work): { projectNo?: string } => (work.projectNo ? { projectNo: work.projectNo } : {})

/** Whether two pieces of work are for the same project, none being the same as none. */
export const sameProject = (a: { projectNo?: string }, b: { projectNo?: string }): boolean => (a.projectNo ?? '').trim().toLowerCase() === (b.projectNo ?? '').trim().toLowerCase()

/** The project and the place as they are stored on a block: a place only with a project, and none rather than an empty text. */
export const workTag = (work: { projectNo?: string; hall?: string }): { projectNo?: string; hall?: string } =>
  work.projectNo ? { projectNo: work.projectNo, ...(work.hall?.trim() && { hall: work.hall }) } : {}

/** Whether two pieces of work are for the same project and the same place, none being the same as none. */
export const sameTag = (a: { projectNo?: string; hall?: string }, b: { projectNo?: string; hall?: string }): boolean =>
  sameProject(a, b) && (a.hall ?? '').trim().toLowerCase() === (b.hall ?? '').trim().toLowerCase()

export const LINE_COLORS = ['line-blue', 'line-teal', 'line-green', 'line-amber', 'line-rose', 'line-violet', 'line-slate', 'line-orange'] as const
export type LineColor = (typeof LINE_COLORS)[number]

/**
 * Where the work of a competence comes in a build-up, in the order a stand is built (the planning engine's R2):
 * marking out, floor, stand walls, the customer's additions, and the loose items. `lopende` runs through the whole
 * build-up (banner, transport) and `ekstra` is the house's own services (meeting rooms, stands for seats), which give way to the rest.
 */
export const STAGES = ['oppmerking', 'gulv', 'standbygging', 'tilvalg', 'losore', 'lopende', 'ekstra'] as const
export type Stage = (typeof STAGES)[number]

/** How a competence is shown in Bemanning, and what the planning engine knows of it. */
export interface CompetenceStyle {
  key: CompetenceKey
  label: string
  /** At most four characters, for narrow blocks. */
  shortLabel: string
  color: LineColor
  /** Order in the demand strip and of the keys 1–9, and the planning engine's ranking: the hardest to replace first (R7). */
  order: number
  /** Where its work comes in a build-up; none where the planner has not said. */
  stage?: Stage
  /** The competence its team goes on to when its own work is done, as the carpet layers go on to the furniture (R3). */
  next?: CompetenceKey
  /** The fewest people it is done by in a hall, as marking out is by two (R4). */
  minPerHall?: number
}

/** One of the permanent staff. */
export interface Person {
  id: string
  name: string
  order: number
  competences: CompetenceKey[]
  note?: string
}

/** A day, or a part of one, a person is away. Why is not stored: the plan needs only there or away, and the reason belongs in HR. */
export interface Unavailability {
  id: string
  personId: string
  date: ISODate
  /** Both unset: the whole day. Set: only this part of the day. */
  start?: Minute
  end?: Minute
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
  /** The project the work is for, where the planner painted it on the project's line. Without it, the hours are shared out over the projects that lack them (`projectBalance`). */
  projectNo?: string
  /** The place of the project the work is in, where the planner painted it on the place's line. Without it, the place is worked out from the project's rows (`workPlace.ts`). Only with a project. */
  hall?: string
}

/** The shifts a supplier can be ordered for. An order can also have times of its own. */
export type ShiftId = 'dag' | 'kveld' | 'natt'
export const SHIFT_IDS: ShiftId[] = ['dag', 'kveld', 'natt']

/** A company the planner hires people from. */
export interface Supplier {
  id: string
  name: string
  order: number
  /** What its people can do: it can be ordered for these competences only. */
  competences: CompetenceKey[]
  shifts: ShiftId[]
  /** Kroner per hour. */
  rate?: number
  contact?: string
  note?: string
}

/** People ordered from a supplier for one competence, one day and one stretch of time. */
export interface HireOrder {
  id: string
  supplierId: string
  competence: CompetenceKey
  date: ISODate
  /** The number of people. */
  fte: number
  /** `end` at or before `start` is a shift through the night; it counts on the day it starts. */
  start: Minute
  end: Minute
  /** `null` while the supplier has not answered, else the number of people it confirmed, which is `fte`. */
  conf: number | null
  /** What was asked for, where the supplier confirmed fewer. */
  asked?: number
  /** The project the people are for, as on a block. */
  projectNo?: string
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
  /** The project the hours are for. Without it they are demand without a project («Uten prosjekt»). */
  projectNo?: string
  createdAt: string
  note?: string
}

/** The planner's own rules for placing a Hall/Sted text. See `domain/locations.ts`. */
export interface HallRules {
  /** Places the planner has made of several halls of the ledger: a name, and the halls it stands for. */
  places: { name: string; halls: string[]; /** False where the halls keep counting by themselves; else what lands in one of them counts under the place. */ collects?: boolean }[]
  /** A text that holds these words counts under the place. The first that fits, in the planner's order. */
  phrases: { text: string; hall: string }[]
  /** Places chosen for single Hall/Sted texts, keyed by `choiceKey`: for every line with the text, or for those of one project. */
  choices: Record<string, string>
  /** Areas the planner has gathered halls in, as «NV HALLS»: a name and its halls. They decide what the Kalender shows, not where demand counts (`areas.ts`). */
  areas?: { name: string; halls: string[] }[]
}

export const PLANNED_BASIS = 'Planlagt'
/** The basis of an own line that is saved but not yet counted. */
export const DRAFT_BASIS = 'Utkast'
/** The source of the planner's own lines. */
export const OWN_SOURCE = 'Egen registrering'
export const VISMA_BASIS = 'visma per reg. dato'
export const VISMA_SOURCE = 'visma per reg. dato'

/** The planner's budget of work hours per project number, overhead included: one total each. */
export type Budgets = Record<string, number>

export interface Workspace {
  settings: Settings
  venue: VenueBooking[]
  projects: ProjectRef[]
  demand: DemandLine[]
  allocations: AllocationRow[]
  /** Unset until halls are first read in, which writes the examples (`exampleRules`). */
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
  suppliers?: Supplier[]
  hireOrders?: HireOrder[]
  competenceStyles?: Record<CompetenceKey, CompetenceStyle>
  budgets?: Budgets
}
