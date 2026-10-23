import {
  PLANNED_BASIS,
  VISMA_BASIS,
  VISMA_SOURCE,
  type DemandLine,
  type KpiConfig,
  type LineOverride,
  type VismaImport,
  type VismaRow,
  type Workspace,
} from './types'
import { EMPTY_KPI, isCounted, productTypeKey } from './kpi'

/**
 * Turns Visma booking lines into demand lines the way the planner's «Nøkkeltall Visma» workbook does:
 * one line per project × Avdeling × work type × hall, quantity ÷ KPI rate = hours. Booking lines without a product type
 * are also kept apart by their article text, so that unlike articles are neither summed nor given one work type together.
 */

/** The work type of booking lines that have no product type, as the planner's workbook called it. */
export const NO_PRODUCT_TYPE = '01_ingen produkttype'

/**
 * Every line of a Visma export belongs to a project with a number and a name. A line that lacks the name
 * takes it from the other lines of its project; a project no line names cannot be read.
 */
export const withProjectNames = (rows: VismaRow[]): VismaRow[] => {
  const names = new Map<string, string>()
  for (const row of rows) if (row.eventName.trim() && !names.has(row.projectNo)) names.set(row.projectNo, row.eventName.trim())
  const unnamed = [...new Set(rows.map((row) => row.projectNo))].filter((projectNo) => !names.has(projectNo))
  if (unnamed.length) throw new Error(`Visma-filen mangler prosjektnavn (kolonnen «Navn2») for prosjekt ${unnamed.join(', ')}.`)
  return rows.map((row) => (row.eventName.trim() ? row : { ...row, eventName: names.get(row.projectNo)! }))
}

/** The key of a line; `text` is the article text of lines without a product type, which keeps them apart. */
export const vismaLineKey = (projectNo: string, avdeling: string, workType: string, hall: string, text = ''): string =>
  [projectNo, avdeling, workType, hall, ...(text.trim() ? [text.replaceAll('|', '/')] : [])].map((part) => part.trim().toLowerCase()).join('|')

const COUNTED_UNITS = new Set(['ordre', 'stands'])

/** A unit that counts the stands of the lines, not their quantity. */
export const countsStands = (unit: string): boolean => COUNTED_UNITS.has(unit.trim().toLowerCase())

export interface VismaLine {
  key: string
  projectNo: string
  eventName: string
  avdeling: string
  /** Work type as Visma gives it. */
  sourceWorkType: string
  /** Work type used for the calculation: the planner's choice when Visma has none, else the one the setup gives its article text. */
  workType: string
  /** The work type was given by the rule for its article text on KPI, not chosen for the line. */
  typeByText: boolean
  hall: string
  unit: string
  competence: string
  quantity: number
  /** Number of booking lines behind this line. */
  rowCount: number
  /** The article texts of the booking lines behind it, each once: what a line without a product type says it is. */
  texts: string[]
  /** The booking lines behind it, as they were read. */
  bookings: VismaRow[]
  rateAssembly: number | null
  rateDismantle: number | null
  effekt: number
  /** Left out by the planner: it does not count, whatever it has. */
  excluded: boolean
  comment: string
  assemblyHours: number
  dismantleHours: number
  /** Why no hours could be calculated, if so. */
  issue: 'no-product-type' | 'unknown-work-type' | 'no-rate' | null
  /** The phase the rate table has no rate for, when it has one for the other. That phase gets no hours; it may be meant, so it is no issue. */
  missingRate: 'assembly' | 'dismantle' | null
}

interface Group {
  projectNo: string
  eventName: string
  avdeling: string
  workType: string
  hall: string
  /** The article text that keeps it apart, for booking lines without a product type. */
  text: string
  sum: number
  locations: Set<string>
  texts: Set<string>
  rows: VismaRow[]
}

const groupRows = (rows: VismaRow[]): Group[] => {
  const groups = new Map<string, Group>()
  for (const row of rows) {
    const workType = row.productType || NO_PRODUCT_TYPE
    const hall = row.hall
    const text = row.productType ? '' : row.description.trim()
    const key = vismaLineKey(row.projectNo, row.avdeling, workType, hall, text)
    let group = groups.get(key)
    if (!group) {
      group = { projectNo: row.projectNo, eventName: row.eventName, avdeling: row.avdeling, workType, hall, text, sum: 0, locations: new Set(), texts: new Set(), rows: [] }
      groups.set(key, group)
    }
    group.sum += row.quantity
    group.locations.add(row.transInfo || row.stand)
    const said = row.description.trim()
    // Each text once, however it is written.
    if (said && ![...group.texts].some((known) => known.toLowerCase() === said.toLowerCase())) group.texts.add(said)
    group.rows.push(row)
  }
  return [...groups.values()]
}

const hoursFor = (quantity: number, rate: number | null, effekt: number): number => (rate ? (quantity / rate) * (1 - effekt) : 0)

export const buildVismaLines = (rows: VismaRow[], kpi: KpiConfig, overrides: Record<string, LineOverride>): VismaLine[] => {
  const rules = new Map(kpi.workTypes.map((rule) => [productTypeKey(rule.productType), rule]))
  const rates = new Map(kpi.rates.map((rate) => [`${productTypeKey(rate.name)}|${rate.unit.toLowerCase()}`, rate]))
  const byText = new Map((kpi.byText ?? []).map((rule) => [rule.text.trim().toLowerCase(), rule.productType]))
  // A booking line of an article number the planner has left out is not read at all.
  return groupRows(rows.filter(isCounted(kpi))).map((group) => {
    const key = vismaLineKey(group.projectNo, group.avdeling, group.workType, group.hall, group.text)
    const override = overrides[key] ?? {}
    const fromText = group.workType === NO_PRODUCT_TYPE ? [...group.texts].map((text) => byText.get(text.toLowerCase())).find(Boolean) : undefined
    const workType = group.workType === NO_PRODUCT_TYPE ? (override.workType ?? fromText ?? group.workType) : group.workType
    const rule = workType === NO_PRODUCT_TYPE ? undefined : rules.get(productTypeKey(workType))
    const unit = rule?.unit ?? ''
    const rate = rule ? rates.get(`${productTypeKey(workType)}|${unit.toLowerCase()}`) : undefined
    const quantity = COUNTED_UNITS.has(unit.toLowerCase()) ? group.locations.size : group.sum
    const effekt = override.effekt ?? 0
    const issue: VismaLine['issue'] = workType === NO_PRODUCT_TYPE ? 'no-product-type' : !rule ? 'unknown-work-type' : !rate?.assembly && !rate?.dismantle ? 'no-rate' : null
    const missingRate: VismaLine['missingRate'] = issue ? null : !rate?.assembly ? 'assembly' : !rate?.dismantle ? 'dismantle' : null
    return {
      key,
      projectNo: group.projectNo,
      eventName: group.eventName,
      avdeling: group.avdeling,
      sourceWorkType: group.workType,
      workType,
      typeByText: !override.workType && !!fromText,
      hall: group.hall,
      unit,
      competence: rule?.competence ?? 'Ukjent',
      quantity,
      rowCount: group.rows.length,
      texts: [...group.texts],
      bookings: group.rows,
      rateAssembly: rate?.assembly ?? null,
      rateDismantle: rate?.dismantle ?? null,
      effekt,
      excluded: override.excluded ?? false,
      comment: override.comment ?? '',
      assemblyHours: hoursFor(quantity, rate?.assembly ?? null, effekt),
      dismantleHours: hoursFor(quantity, rate?.dismantle ?? null, effekt),
      issue,
      missingRate,
    }
  })
}

/** What the lines of a product type give: their quantity in its unit in use, and the hours of each phase before any Effekt. */
export interface TypeYield {
  quantity: number
  assembly: number
  dismantle: number
}

/**
 * The lines of the held exports by product type, as the setup reads them: what each type's unit in use gives, and the hours
 * that gives before the planner's Effekt or a line left out. Lines given a type by their article text count under it.
 */
export const yieldByType = (rows: VismaRow[], kpi: KpiConfig): Map<string, TypeYield> => {
  const byType = new Map<string, TypeYield>()
  for (const line of buildVismaLines(rows, kpi, {})) {
    if (line.workType === NO_PRODUCT_TYPE) continue
    const key = productTypeKey(line.workType)
    const sum = byType.get(key) ?? { quantity: 0, assembly: 0, dismantle: 0 }
    sum.quantity += line.quantity
    sum.assembly += line.assemblyHours
    sum.dismantle += line.dismantleHours
    byType.set(key, sum)
  }
  return byType
}

/** The line as it reads now, kept with a decision so it can be shown after the line has left the export. */
export const lineRef = (line: VismaLine): NonNullable<LineOverride['ref']> => ({
  avdeling: line.avdeling,
  workType: line.sourceWorkType === NO_PRODUCT_TYPE && line.texts.length ? `${line.sourceWorkType} «${line.texts[0]}»` : line.sourceWorkType,
  hall: line.hall,
})

const hasDecision = (override: LineOverride): boolean => !!override.effekt || !!override.comment || !!override.excluded || !!override.workType

interface OrphanedDecision {
  key: string
  override: LineOverride
  avdeling: string
  workType: string
  hall: string
}

/** Decisions the planner made on lines that are no longer in the project's latest export. */
export const orphanedDecisions = (projectNo: string, lines: VismaLine[], overrides: Record<string, LineOverride>): OrphanedDecision[] => {
  const present = new Set(lines.map((line) => line.key))
  const prefix = `${projectNo.trim().toLowerCase()}|`
  return Object.entries(overrides)
    .filter(([key, override]) => key.startsWith(prefix) && !present.has(key) && hasDecision(override))
    .map(([key, override]) => {
      const [, avdeling, workType, hall] = key.split('|')
      return { key, override, avdeling: override.ref?.avdeling ?? avdeling, workType: override.ref?.workType ?? workType, hall: override.ref?.hall ?? hall }
    })
}

const VISMA_LINE_PREFIX = 'visma|'

/**
 * Visma lines as ledger rows. A line that gives hours counts under «Planlagt» by itself unless the planner has left it out;
 * the rest stay under the Visma basis. One without a hall is taken out again where the lines are placed (`locateDemand`).
 */
export const vismaDemandLines = (source: VismaImport, kpi: KpiConfig, overrides: Record<string, LineOverride>): DemandLine[] =>
  buildVismaLines(source.rows, kpi, overrides).map((line) => ({
    id: `${VISMA_LINE_PREFIX}${line.key}`,
    projectNo: line.projectNo,
    projectName: line.eventName,
    source: VISMA_SOURCE,
    workType: line.workType,
    quantity: line.quantity,
    unit: line.unit,
    stand: '',
    hall: line.hall,
    competence: line.competence,
    basis: !line.excluded && !line.issue ? PLANNED_BASIS : VISMA_BASIS,
    assemblyHours: line.assemblyHours,
    dismantleHours: line.dismantleHours,
    comment: line.comment,
    avdeling: line.avdeling,
    effekt: line.effekt,
    origin: 'visma',
  }))

/** True for the ledger lines a Visma export for the project replaces: those of earlier exports. */
export const isVismaLine = (line: DemandLine): boolean => line.origin === 'visma'

/**
 * The ledger with the Visma lines of the given projects, or of every project, worked out again from the exports, the
 * KPI setup and the planner's decisions. The Visma lines are always this, so they are never stored or synced: they
 * are worked out wherever those three change, and when the workspace is loaded.
 */
export const withVismaDemand = (ws: Pick<Workspace, 'demand' | 'visma' | 'kpi' | 'overrides'>, projectNos?: string[]): DemandLine[] => {
  const affected = (projectNo: string) => !projectNos || projectNos.includes(projectNo)
  const kept = ws.demand.filter((line) => !(isVismaLine(line) && affected(line.projectNo)))
  return [...kept, ...(ws.visma ?? []).filter((v) => affected(v.projectNo)).flatMap((v) => vismaDemandLines(v, ws.kpi ?? EMPTY_KPI, ws.overrides ?? {}))]
}
