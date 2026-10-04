import type { KpiConfig, KpiRate, WorkTypeRule } from './types'

/**
 * The KPI setup as one editable table: a row per work type and unit, with the rates for that unit.
 * A work type can have rates for several units (lm and stk); exactly one unit is the one in use.
 */

export interface KpiRow {
  name: string
  unit: string
  competence: string
  assembly: number
  dismantle: number
  /** This unit is the one used when Visma lines of the work type are calculated. */
  active: boolean
  /** The work type is set up to use this unit, but no rates are entered for it. */
  missingRate: boolean
}

export const EMPTY_KPI: KpiConfig = { workTypes: [], rates: [] }

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const rateKey = (name: string, unit: string) => `${name.trim().toLowerCase()}|${unit.trim().toLowerCase()}`

export const kpiRows = (kpi: KpiConfig): KpiRow[] => {
  const rules = new Map(kpi.workTypes.map((rule) => [rule.name.toLowerCase(), rule]))
  const rows: KpiRow[] = kpi.rates.map((rate) => {
    const rule = rules.get(rate.name.toLowerCase())
    return { name: rate.name, unit: rate.unit, competence: rule?.competence ?? '', assembly: rate.assembly, dismantle: rate.dismantle, active: !!rule && same(rule.unit, rate.unit), missingRate: false }
  })
  const withRate = new Set(kpi.rates.map((rate) => rateKey(rate.name, rate.unit)))
  for (const rule of kpi.workTypes) {
    if (!withRate.has(rateKey(rule.name, rule.unit))) rows.push({ name: rule.name, unit: rule.unit, competence: rule.competence, assembly: 0, dismantle: 0, active: true, missingRate: true })
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'nb') || Number(b.active) - Number(a.active) || a.unit.localeCompare(b.unit, 'nb'))
}

const ruleFor = (name: string, unit: string, competence: string): WorkTypeRule => ({ name: name.trim(), productType: `[${name.trim()}]`, unit: unit.trim(), competence: competence.trim() })

/** Sets the rates for a work type and unit, adding the row if it is new. */
export const setRate = (kpi: KpiConfig, name: string, unit: string, patch: Partial<Pick<KpiRate, 'assembly' | 'dismantle'>>): KpiConfig => {
  const exists = kpi.rates.some((rate) => rateKey(rate.name, rate.unit) === rateKey(name, unit))
  const rates = exists
    ? kpi.rates.map((rate) => (rateKey(rate.name, rate.unit) === rateKey(name, unit) ? { ...rate, ...patch } : rate))
    : [...kpi.rates, { name: name.trim(), unit: unit.trim(), assembly: 0, dismantle: 0, ...patch }]
  return { ...kpi, rates }
}

/** Makes the given unit the one in use for the work type. */
export const setActiveUnit = (kpi: KpiConfig, name: string, unit: string): KpiConfig => {
  const existing = kpi.workTypes.find((rule) => same(rule.name, name))
  return {
    ...kpi,
    workTypes: existing ? kpi.workTypes.map((rule) => (rule === existing ? { ...rule, unit: unit.trim() } : rule)) : [...kpi.workTypes, ruleFor(name, unit, '')],
  }
}

/** Sets the competence (nøkkelområde) of a work type; it applies to all its units. */
export const setCompetence = (kpi: KpiConfig, name: string, unit: string, competence: string): KpiConfig => {
  const existing = kpi.workTypes.find((rule) => same(rule.name, name))
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
  return kpi.workTypes.some((rule) => same(rule.name, row.name)) ? withRate : { ...withRate, workTypes: [...withRate.workTypes, ruleFor(row.name, row.unit, row.competence)] }
}

/** Removes one unit of a work type. If it was the unit in use, another unit takes over; the last unit takes the work type with it. */
export const removeKpiRow = (kpi: KpiConfig, name: string, unit: string): KpiConfig => {
  const rates = kpi.rates.filter((rate) => rateKey(rate.name, rate.unit) !== rateKey(name, unit))
  const remaining = rates.filter((rate) => same(rate.name, name))
  const workTypes = kpi.workTypes.flatMap((rule) => {
    if (!same(rule.name, name) || !same(rule.unit, unit)) return [rule]
    return remaining.length ? [{ ...rule, unit: remaining[0].unit }] : []
  })
  return { workTypes, rates }
}

/** Rows from a file win over rows already in the app; rows only in the app are kept. */
export const mergeKpi = (existing: KpiConfig, incoming: Partial<KpiConfig>): KpiConfig => {
  const types = new Map(existing.workTypes.map((rule) => [rule.name.toLowerCase(), rule]))
  for (const rule of incoming.workTypes ?? []) types.set(rule.name.toLowerCase(), rule)
  const rates = new Map(existing.rates.map((rate) => [rateKey(rate.name, rate.unit), rate]))
  for (const rate of incoming.rates ?? []) rates.set(rateKey(rate.name, rate.unit), rate)
  return { workTypes: [...types.values()], rates: [...rates.values()] }
}

/** The parts the file contains replace those parts in the app; a part the file lacks is left as it is. */
export const replaceKpi = (existing: KpiConfig, incoming: Partial<KpiConfig>): KpiConfig => ({
  workTypes: incoming.workTypes ?? existing.workTypes,
  rates: incoming.rates ?? existing.rates,
})

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
  workTypes: diffPart(existing.workTypes, incoming.workTypes, (rule) => rule.name.toLowerCase(), (a, b) => same(a.unit, b.unit) && same(a.competence, b.competence)),
  rates: diffPart(existing.rates, incoming.rates, (rate) => rateKey(rate.name, rate.unit), (a, b) => a.assembly === b.assembly && a.dismantle === b.dismantle),
})
