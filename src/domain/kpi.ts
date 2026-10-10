import type { KpiConfig, KpiRate, VismaImport, WorkTypeRule } from './types'
import { NO_PRODUCT_TYPE, productTypeKey, productTypeLabel, productTypeName, workTypeName } from './visma'

/**
 * The KPI setup as one editable table: a row per product type and unit, with the rates for that unit.
 * A product type can have rates for several units (lm and stk); exactly one unit is the one in use.
 * Product types that occur in the Visma exports are listed even before they are set up.
 */

/** What a product type still lacks before its Visma lines give hours. Their hours are unknown until then, not 0. */
export type Lacking = 'new' | 'no-unit-in-use' | 'unit' | 'competence' | 'rate'

export interface KpiRow {
  /** The product type as it is shown, see `productTypeLabel`. */
  name: string
  /** `Produkttype 2` as Visma writes it, where it has been seen or imported; else the name. The functions here take either. */
  productType: string
  unit: string
  /** The competence (nøkkelområde) of the product type, the same on all its units. */
  competence: string
  assembly: number
  dismantle: number
  /** This unit is the one used when Visma lines of the product type are calculated. */
  active: boolean
  /** Booking lines of this product type in the Visma exports held in the app. */
  lines: number
  /** False for a product type that has no unit in use yet: one that only occurs in an export, or only has rates. */
  configured: boolean
  /** The same on every row of the product type. */
  lacking: Lacking | null
}

export const EMPTY_KPI: KpiConfig = { workTypes: [], rates: [] }

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
/** Whether two texts name the same product type, each a Visma text, a name or a label. */
const sameType = (a: string, b: string) => productTypeKey(a) === productTypeKey(b)
const rateKey = (name: string, unit: string) => `${productTypeKey(name)}|${unit.trim().toLowerCase()}`

/**
 * A setup stored while a product type held its name beside its Visma text. The text alone is kept; a type added
 * by hand, which had its name in brackets for a text, keeps the name.
 */
export const withoutStoredNames = (kpi: KpiConfig): KpiConfig => {
  const stored = kpi.workTypes as (WorkTypeRule & { name?: string })[]
  if (!stored.some((rule) => rule.name !== undefined)) return kpi
  const workTypes = stored.map(({ name, ...rule }): WorkTypeRule => {
    if (name === undefined) return rule
    const fromVisma = sameType(rule.productType, name) && !rule.productType.trim().startsWith('[')
    return { ...rule, productType: fromVisma ? rule.productType : name }
  })
  return { ...kpi, workTypes }
}

export const kpiRows = (kpi: KpiConfig, visma: VismaImport[] = []): KpiRow[] => {
  const seen = new Map<string, { productType: string; lines: number }>()
  for (const source of visma) {
    for (const row of source.rows) {
      if (workTypeName(row.productType) === NO_PRODUCT_TYPE) continue
      const key = productTypeKey(row.productType)
      const entry = seen.get(key) ?? { productType: row.productType, lines: 0 }
      entry.lines += 1
      seen.set(key, entry)
    }
  }
  const rules = new Map(kpi.workTypes.map((rule) => [productTypeKey(rule.productType), rule]))
  const rates = new Map(kpi.rates.map((rate) => [rateKey(rate.name, rate.unit), rate]))
  const lackingOf = (name: string): Lacking | null => {
    const rule = rules.get(productTypeKey(name))
    const rated = kpi.rates.some((rate) => sameType(rate.name, name))
    if (!rule) return rated ? 'no-unit-in-use' : 'new'
    if (!rule.unit) return rated ? 'no-unit-in-use' : 'unit'
    if (!rule.competence) return 'competence'
    const rate = rates.get(rateKey(rule.productType, rule.unit))
    return !rate?.assembly && !rate?.dismantle ? 'rate' : null
  }
  const row = (name: string, unit: string, assembly: number, dismantle: number): KpiRow => {
    const rule = rules.get(productTypeKey(name))
    const used = seen.get(productTypeKey(name))
    return { name: productTypeLabel(name), productType: used?.productType ?? rule?.productType ?? name, unit, competence: rule?.competence ?? '', assembly, dismantle, active: !!rule && same(rule.unit, unit), lines: used?.lines ?? 0, configured: !!rule, lacking: lackingOf(name) }
  }
  const rows = kpi.rates.map((rate) => row(rate.name, rate.unit, rate.assembly, rate.dismantle))
  for (const rule of kpi.workTypes) if (!rates.has(rateKey(rule.productType, rule.unit))) rows.push(row(rule.productType, rule.unit, 0, 0))
  // A product type whose unit is still to be chosen among its rates has no row of its own.
  const chosen = rows.filter((r) => r.unit !== '' || !kpi.rates.some((rate) => sameType(rate.name, r.name)))
  const listed = new Set(rows.map((r) => productTypeKey(r.name)))
  for (const [key, entry] of seen) if (!listed.has(key)) chosen.push(row(entry.productType, '', 0, 0))
  return chosen.sort((a, b) => Number(a.configured) - Number(b.configured) || a.name.localeCompare(b.name, 'nb') || Number(b.active) - Number(a.active) || a.unit.localeCompare(b.unit, 'nb'))
}

const ruleFor = (productType: string, unit: string, competence: string): WorkTypeRule => ({ productType: productType.trim(), unit: unit.trim(), competence: competence.trim() })

/** Sets the rates for a work type and unit, adding the row if it is new. */
export const setRate = (kpi: KpiConfig, name: string, unit: string, patch: Partial<Pick<KpiRate, 'assembly' | 'dismantle'>>): KpiConfig => {
  const exists = kpi.rates.some((rate) => rateKey(rate.name, rate.unit) === rateKey(name, unit))
  const rates = exists
    ? kpi.rates.map((rate) => (rateKey(rate.name, rate.unit) === rateKey(name, unit) ? { ...rate, ...patch } : rate))
    : [...kpi.rates, { name: productTypeName(name), unit: unit.trim(), assembly: 0, dismantle: 0, ...patch }]
  return { ...kpi, rates }
}

/** Makes the given unit the one in use for the work type. */
export const setActiveUnit = (kpi: KpiConfig, name: string, unit: string): KpiConfig => {
  const existing = kpi.workTypes.find((rule) => sameType(rule.productType, name))
  return {
    ...kpi,
    workTypes: existing ? kpi.workTypes.map((rule) => (rule === existing ? { ...rule, unit: unit.trim() } : rule)) : [...kpi.workTypes, ruleFor(name, unit, '')],
  }
}

/**
 * Gives one unit of a product type another name, with its rates. Where the product type already has the new unit,
 * nothing is renamed: the unit in use hands over to it, and another unit is left as it is.
 */
export const renameUnit = (kpi: KpiConfig, name: string, from: string, to: string): KpiConfig => {
  if (same(from, to)) return kpi
  const rule = kpi.workTypes.find((r) => sameType(r.productType, name))
  // A product type with nothing set up yet is set up by the unit typed for it.
  const inUse = rule ? same(rule.unit, from) : !kpi.rates.some((rate) => sameType(rate.name, name))
  if (kpi.rates.some((rate) => rateKey(rate.name, rate.unit) === rateKey(name, to))) return inUse ? setActiveUnit(kpi, name, to) : kpi
  const rates = kpi.rates.map((rate) => (rateKey(rate.name, rate.unit) === rateKey(name, from) ? { ...rate, unit: to.trim() } : rate))
  return inUse ? setActiveUnit({ ...kpi, rates }, name, to) : { ...kpi, rates }
}

/** Sets the competence (nøkkelområde) of a work type; it applies to all its units. */
export const setCompetence = (kpi: KpiConfig, name: string, unit: string, competence: string): KpiConfig => {
  const existing = kpi.workTypes.find((rule) => sameType(rule.productType, name))
  return {
    ...kpi,
    workTypes: existing ? kpi.workTypes.map((rule) => (rule === existing ? { ...rule, competence: competence.trim() } : rule)) : [...kpi.workTypes, ruleFor(name, unit, competence)],
  }
}

export interface NewKpiRow {
  name: string
  unit: string
  competence: string
  assembly: number
  dismantle: number
}

/** Adds a work type, or another unit for an existing one. A new work type starts out using the unit given. */
export const addKpiRow = (kpi: KpiConfig, row: NewKpiRow): KpiConfig => {
  const withRate = setRate(kpi, row.name, row.unit, { assembly: row.assembly, dismantle: row.dismantle })
  return kpi.workTypes.some((rule) => sameType(rule.productType, row.name)) ? withRate : { ...withRate, workTypes: [...withRate.workTypes, ruleFor(row.name, row.unit, row.competence)] }
}

/** Removes one unit of a work type. If it was the unit in use, another unit takes over; the last unit takes the work type with it. */
export const removeKpiRow = (kpi: KpiConfig, name: string, unit: string): KpiConfig => {
  const rates = kpi.rates.filter((rate) => rateKey(rate.name, rate.unit) !== rateKey(name, unit))
  const remaining = rates.filter((rate) => sameType(rate.name, name))
  const workTypes = kpi.workTypes.flatMap((rule) => {
    if (!sameType(rule.productType, name) || !same(rule.unit, unit)) return [rule]
    return remaining.length ? [{ ...rule, unit: remaining[0].unit }] : []
  })
  return { workTypes, rates }
}

/**
 * The product types of a file as they are taken in: the unit the planner has chosen for a product type is kept
 * for as long as it has rates. The file says which units there are; which one is in use is the planner's decision.
 */
const keepChosenUnits = (existing: KpiConfig, incoming: WorkTypeRule[], rates: KpiRate[]): WorkTypeRule[] => {
  const rated = new Set(rates.map((rate) => rateKey(rate.name, rate.unit)))
  return incoming.map((rule) => {
    const chosen = existing.workTypes.find((old) => sameType(old.productType, rule.productType))?.unit
    return chosen && rated.has(rateKey(rule.productType, chosen)) ? { ...rule, unit: chosen } : rule
  })
}

/** Rows from a file win over rows already in the app; rows only in the app are kept. */
export const mergeKpi = (existing: KpiConfig, incoming: Partial<KpiConfig>): KpiConfig => {
  const rates = new Map(existing.rates.map((rate) => [rateKey(rate.name, rate.unit), rate]))
  for (const rate of incoming.rates ?? []) rates.set(rateKey(rate.name, rate.unit), rate)
  const types = new Map(existing.workTypes.map((rule) => [productTypeKey(rule.productType), rule]))
  for (const rule of keepChosenUnits(existing, incoming.workTypes ?? [], [...rates.values()])) types.set(productTypeKey(rule.productType), rule)
  return { workTypes: [...types.values()], rates: [...rates.values()] }
}

/** The parts the file contains replace those parts in the app; a part the file lacks is left as it is. */
export const replaceKpi = (existing: KpiConfig, incoming: Partial<KpiConfig>): KpiConfig => {
  const rates = incoming.rates ?? existing.rates
  return { workTypes: incoming.workTypes ? keepChosenUnits(existing, incoming.workTypes, rates) : existing.workTypes, rates }
}

export interface KpiDiff {
  added: number
  changed: number
  /** Rows in the app that the file does not have: kept when merging, removed when replacing. */
  onlyInApp: number
  unchanged: number
}

const diffPart = <T,>(existing: T[], incoming: T[] | undefined, key: (item: T) => string, equal: (a: T, b: T) => boolean): KpiDiff => {
  const diff: KpiDiff = { added: 0, changed: 0, onlyInApp: 0, unchanged: 0 }
  if (!incoming) return diff
  const old = new Map(existing.map((item) => [key(item), item]))
  const seen = new Set<string>()
  for (const item of incoming) {
    const k = key(item)
    if (seen.has(k)) continue
    seen.add(k)
    const previous = old.get(k)
    if (!previous) diff.added += 1
    else if (equal(previous, item)) diff.unchanged += 1
    else diff.changed += 1
  }
  diff.onlyInApp = [...old.keys()].filter((k) => !seen.has(k)).length
  return diff
}

/** What a KPI file would change, for the work types and for the rates. */
export const diffKpi = (existing: KpiConfig, incoming: Partial<KpiConfig>): { workTypes: KpiDiff; rates: KpiDiff } => ({
  // Counted as they would be taken in: a unit the planner has chosen is no change.
  workTypes: diffPart(existing.workTypes, incoming.workTypes && keepChosenUnits(existing, incoming.workTypes, [...existing.rates, ...(incoming.rates ?? [])]), (rule) => productTypeKey(rule.productType), (a, b) => same(a.unit, b.unit) && same(a.competence, b.competence)),
  rates: diffPart(existing.rates, incoming.rates, (rate) => rateKey(rate.name, rate.unit), (a, b) => a.assembly === b.assembly && a.dismantle === b.dismantle),
})

/** Booking lines in the held exports that Visma has no product type for. */
export const linesWithoutProductType = (visma: VismaImport[]): number =>
  visma.reduce((n, source) => n + source.rows.filter((row) => workTypeName(row.productType) === NO_PRODUCT_TYPE).length, 0)
