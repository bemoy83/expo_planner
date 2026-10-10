import {
  PLANNED_BASIS,
  VISMA_BASIS,
  VISMA_SOURCE,
  type DemandLine,
  type KpiConfig,
  type LineOverride,
  type VismaImport,
  type VismaRow,
} from './types'

/**
 * Turns Visma booking lines into demand lines the way the planner's «Nøkkeltall Visma» workbook does:
 * one line per project × Avdeling × work type × hall, quantity ÷ KPI rate = hours.
 */

export const NO_PRODUCT_TYPE = '01_ingen produkttype'

/** «14 [FOGA-vegger]» → «FOGA-vegger»; «1 [5999 [Diverse]]» → «5999 [Diverse» (first «[» to first «]», as the workbook does). */
export const workTypeName = (productType: string): string => {
  const close = productType.indexOf(']')
  const open = productType.indexOf('[')
  return close > open && open >= 0 ? productType.slice(open + 1, close) : NO_PRODUCT_TYPE
}

/** The name of a product type: the text in the brackets of its Visma text, or the text itself for a type added by hand. */
export const productTypeName = (productType: string): string => {
  const name = workTypeName(productType)
  return name === NO_PRODUCT_TYPE ? productType.trim() : name
}

/** A product type as it is shown, from its Visma text or its name: «1 [5999 [Diverse]]» and «5999 [Diverse» → «5999 Diverse». */
export const productTypeLabel = (productType: string): string => productTypeName(productType).replace(/[[\]]/g, ' ').replace(/\s+/g, ' ').trim()

/** What product types are matched by: its Visma text, its name and its label all name the same type. */
export const productTypeKey = (productType: string): string => productTypeLabel(productType).toLowerCase()

/** «C04-44» → «Hall C»; without a stand, the free-text location is the hall. */
export const hallOf = (row: Pick<VismaRow, 'stand' | 'transInfo'>): string => (row.stand ? `Hall ${row.stand[0]}` : row.transInfo)

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

export const vismaLineKey = (projectNo: string, avdeling: string, workType: string, hall: string): string =>
  [projectNo, avdeling, workType, hall].map((part) => part.trim().toLowerCase()).join('|')

const COUNTED_UNITS = new Set(['ordre', 'stands'])

export interface VismaLine {
  key: string
  projectNo: string
  eventName: string
  avdeling: string
  /** Work type as Visma gives it. */
  sourceWorkType: string
  /** Work type used for the calculation: the planner's choice when Visma has none. */
  workType: string
  hall: string
  unit: string
  competence: string
  quantity: number
  /** Number of booking lines behind this line. */
  rowCount: number
  rateAssembly: number | null
  rateDismantle: number | null
  effekt: number
  inPlan: boolean
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
  sum: number
  locations: Set<string>
  rowCount: number
}

const groupRows = (rows: VismaRow[]): Group[] => {
  const groups = new Map<string, Group>()
  for (const row of rows) {
    const workType = workTypeName(row.productType)
    const hall = hallOf(row)
    const key = vismaLineKey(row.projectNo, row.avdeling, workType, hall)
    let group = groups.get(key)
    if (!group) {
      group = { projectNo: row.projectNo, eventName: row.eventName, avdeling: row.avdeling, workType, hall, sum: 0, locations: new Set(), rowCount: 0 }
      groups.set(key, group)
    }
    group.sum += row.quantity
    group.locations.add(row.transInfo || row.stand)
    group.rowCount += 1
  }
  return [...groups.values()]
}

const hoursFor = (quantity: number, rate: number | null, effekt: number): number => (rate ? (quantity / rate) * (1 - effekt) : 0)

export const buildVismaLines = (rows: VismaRow[], kpi: KpiConfig, overrides: Record<string, LineOverride>): VismaLine[] => {
  const rules = new Map(kpi.workTypes.map((rule) => [productTypeKey(rule.productType), rule]))
  const rates = new Map(kpi.rates.map((rate) => [`${productTypeKey(rate.name)}|${rate.unit.toLowerCase()}`, rate]))
  return groupRows(rows).map((group) => {
    const key = vismaLineKey(group.projectNo, group.avdeling, group.workType, group.hall)
    const override = overrides[key] ?? {}
    const workType = group.workType === NO_PRODUCT_TYPE && override.workType ? override.workType : group.workType
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
      hall: group.hall,
      unit,
      competence: rule?.competence ?? 'Ukjent',
      quantity,
      rowCount: group.rowCount,
      rateAssembly: rate?.assembly ?? null,
      rateDismantle: rate?.dismantle ?? null,
      effekt,
      inPlan: override.inPlan ?? false,
      comment: override.comment ?? '',
      assemblyHours: hoursFor(quantity, rate?.assembly ?? null, effekt),
      dismantleHours: hoursFor(quantity, rate?.dismantle ?? null, effekt),
      issue,
      missingRate,
    }
  })
}

const hasDecision = (override: LineOverride): boolean => !!override.effekt || !!override.comment || !!override.inPlan || !!override.workType

export interface OrphanedDecision {
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

export const VISMA_LINE_PREFIX = 'visma|'

/** Visma lines as ledger rows. Lines taken into the plan count under «Planlagt», the rest stay under the Visma basis. */
export const vismaDemandLines = (source: VismaImport, kpi: KpiConfig, overrides: Record<string, LineOverride>): DemandLine[] =>
  buildVismaLines(source.rows, kpi, overrides).map((line) => ({
    id: `${VISMA_LINE_PREFIX}${line.key}`,
    projectNo: line.projectNo,
    projectName: line.eventName,
    eventYear: `20${line.projectNo.slice(0, 2)}`,
    source: VISMA_SOURCE,
    workType: line.workType,
    quantity: line.quantity,
    unit: line.unit,
    stand: '',
    hall: line.hall,
    competence: line.competence,
    basis: line.inPlan ? PLANNED_BASIS : VISMA_BASIS,
    assemblyHours: line.assemblyHours,
    dismantleHours: line.dismantleHours,
    comment: line.comment,
    avdeling: line.avdeling,
    effekt: line.effekt,
    origin: 'visma',
  }))

/** True for the ledger lines a Visma export for the project replaces: those of earlier exports. */
export const isVismaLine = (line: DemandLine): boolean => line.origin === 'visma'
