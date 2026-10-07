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

/** «C04-44» → «Hall C»; without a stand, the free-text location is the hall. */
export const hallOf = (row: Pick<VismaRow, 'stand' | 'transInfo'>): string => (row.stand ? `Hall ${row.stand[0]}` : row.transInfo)

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
  const rules = new Map(kpi.workTypes.map((rule) => [rule.name.toLowerCase(), rule]))
  const rates = new Map(kpi.rates.map((rate) => [`${rate.name.toLowerCase()}|${rate.unit.toLowerCase()}`, rate]))
  return groupRows(rows).map((group) => {
    const key = vismaLineKey(group.projectNo, group.avdeling, group.workType, group.hall)
    const override = overrides[key] ?? {}
    const workType = group.workType === NO_PRODUCT_TYPE && override.workType ? override.workType : group.workType
    const rule = workType === NO_PRODUCT_TYPE ? undefined : rules.get(workType.toLowerCase())
    const unit = rule?.unit ?? ''
    const rate = rule ? rates.get(`${workType.toLowerCase()}|${unit.toLowerCase()}`) : undefined
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

/** True for ledger rows a Visma export for the project replaces: earlier exports, in the app or from the workbook. */
export const isVismaLine = (line: DemandLine): boolean => line.origin === 'visma' || (!line.origin && line.source.trim().toLowerCase() === VISMA_SOURCE)

/**
 * Carries the planner's decisions on the workbook's Visma rows over to the app the first time a project is imported:
 * Effekt, comments, rows relabelled «Planlagt», and work types assigned by hand to lines without a product type.
 */
export const harvestOverrides = (legacy: DemandLine[], rows: VismaRow[], kpi: KpiConfig): Record<string, LineOverride> => {
  const overrides: Record<string, LineOverride> = {}
  const computed = buildVismaLines(rows, kpi, {})
  const byKey = new Map(computed.map((line) => [line.key, line]))
  for (const line of legacy.filter(isVismaLine)) {
    let key = vismaLineKey(line.projectNo, line.avdeling ?? '', line.workType, line.hall)
    const override: LineOverride = {}
    if (!byKey.has(key)) {
      // A line Visma has no product type for, which the planner gave a work type: same department, hall and quantity.
      const unclassified = computed.find(
        (c) => c.issue === 'no-product-type' && c.avdeling === (line.avdeling ?? '') && c.hall.toLowerCase() === line.hall.toLowerCase() && c.quantity === line.quantity,
      )
      if (!unclassified) continue
      key = unclassified.key
      override.workType = line.workType
    }
    if (line.effekt) override.effekt = line.effekt
    if (line.comment) override.comment = line.comment
    if (line.basis.trim().toLowerCase() === PLANNED_BASIS.toLowerCase()) override.inPlan = true
    if (Object.keys(override).length) {
      const target = byKey.get(key)!
      overrides[key] = { ...overrides[key], ...override, ref: { avdeling: target.avdeling, workType: target.sourceWorkType, hall: target.hall } }
    }
  }
  return overrides
}

/**
 * Puts the Visma exports held in the app back into a workspace, replacing whatever Visma rows it carries.
 * Used when the planner workbook is imported again, so newer exports and the planner's decisions are kept.
 */
export const withVismaImports = (workspace: Workspace, kept: Pick<Workspace, 'kpi' | 'overrides' | 'visma'>): Workspace => {
  const visma = kept.visma ?? []
  const next = { ...workspace, kpi: kept.kpi, overrides: kept.overrides ?? {}, visma }
  if (!visma.length) return next
  const projects = new Set(visma.map((v) => v.projectNo))
  return {
    ...next,
    demand: [
      ...workspace.demand.filter((line) => !(projects.has(line.projectNo) && isVismaLine(line))),
      ...visma.flatMap((v) => vismaDemandLines(v, kept.kpi ?? { workTypes: [], rates: [] }, next.overrides)),
    ],
  }
}
