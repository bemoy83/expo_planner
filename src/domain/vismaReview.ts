import { placeOf, UNRESOLVED_HALL } from './locations'
import { articleKey } from './kpi'
import type { HallRules, KpiConfig, LineOverride, VismaImport, VismaRow } from './types'
import { buildVismaLines, type VismaLine } from './visma'

/**
 * Going through the Visma lines after an import. A line counts by itself once it is resolved: it gives hours (a work type
 * the KPI table has a rate for) and it has a hall. The planner resolves what is missing, or leaves a line out.
 */

/** What a line can lack before it counts: a work type, its product type on KPI, the unit in use there, a rate, a hall. */
type Missing = 'type' | 'kpi' | 'unit' | 'rate' | 'hall'

/** Where a line stands: it lacks something, it counts, or the planner has left it out. */
export type LineStatus = 'need' | 'counted' | 'excluded'

/** Which Visma lines Behov shows: those that need the planner, those that count, those left out, or all. */
export type LineFilter = LineStatus | 'all'

/** A line whose Hall/Sted names no hall of the hall ledger counts under «Mangler hall» in the Kalender. */
const isUnplaced = (line: VismaLine, halls: string[], rules?: HallRules): boolean => placeOf(line.hall, halls, rules, line.projectNo).hall === UNRESOLVED_HALL

/** What the line lacks before it counts, in the order it is resolved in. */
const missingOf = (line: VismaLine, halls: string[], rules?: HallRules): Missing[] => {
  const missing: Missing[] = []
  if (line.issue === 'no-product-type') missing.push('type')
  if (line.issue === 'unknown-work-type') missing.push('kpi')
  // A product type on KPI with no unit in use has no rate to look for: the unit is chosen there first.
  if (line.issue === 'no-rate') missing.push(line.unit ? 'rate' : 'unit')
  if (isUnplaced(line, halls, rules)) missing.push('hall')
  return missing
}

const MISSING_TEXT: Record<Missing, string> = {
  type: 'arbeidstype',
  kpi: 'produkttypen på KPI',
  unit: 'enhet i bruk på KPI',
  rate: 'sats',
  hall: 'hall',
}

/** «Mangler arbeidstype og hall»: what a line lacks, as a tooltip says it. */
export const missingText = (missing: Missing[]): string => {
  const words = missing.map((m) => MISSING_TEXT[m])
  return words.length ? `Mangler ${words.length > 1 ? `${words.slice(0, -1).join(', ')} og ${words[words.length - 1]}` : words[0]}` : ''
}

/** The word of a product type a text is looked for by: its first, «FOGA» of «FOGA-vegger». Shorter than three letters says too little. */
const typeWord = (productType: string): string => {
  const word = productType.trim().toLowerCase().split(/[-\s/]/)[0]
  return word.length >= 3 ? word : ''
}

/**
 * The product type a line without one is offered: the one whose word most of its article texts hold («Fritekst Foga» is FOGA-vegger),
 * the longest such word where several are. A line of many texts that name a type here and there («ikke frontbord») is offered nothing.
 */
export const suggestWorkType = (texts: string[], kpi: KpiConfig): string | undefined => {
  const said = texts.map((text) => text.toLowerCase())
  let best: { productType: string; word: string } | undefined
  for (const { productType } of kpi.workTypes) {
    const word = typeWord(productType)
    if (!word || (best && word.length <= best.word.length)) continue
    if (said.filter((text) => text.includes(word)).length * 2 > said.length) best = { productType, word }
  }
  return best?.productType
}

/** A Visma line with where it stands. A line left out is settled, whatever it lacks; else it needs the planner while it lacks anything. */
export interface ReviewedLine extends VismaLine {
  /** The hall or place the line counts under in the Kalender, or «Mangler hall». */
  place: string
  status: LineStatus
  missing: Missing[]
  /** For a line that lacks a work type: the one its texts point to. */
  suggestedType?: string
}

export interface ProjectReview {
  projectNo: string
  lines: ReviewedLine[]
  need: number
  counted: number
  excluded: number
  /** The hours of the lines that count, montering and demontering together. */
  countedHours: number
}

/** The Visma lines of every project, sorted as Behov lists them, with where each stands and the counts of them. */
export const reviewVisma = (visma: VismaImport[], kpi: KpiConfig, overrides: Record<string, LineOverride>, halls: string[], rules?: HallRules): Map<string, ProjectReview> => {
  const review = new Map<string, ProjectReview>()
  for (const { projectNo, rows } of visma) {
    const lines = buildVismaLines(rows, kpi, overrides)
      .sort((a, b) => a.competence.localeCompare(b.competence, 'nb') || a.workType.localeCompare(b.workType, 'nb') || a.hall.localeCompare(b.hall, 'nb'))
      .map((line): ReviewedLine => {
        const missing = missingOf(line, halls, rules)
        return {
          ...line,
          place: placeOf(line.hall, halls, rules, line.projectNo).hall,
          missing,
          status: line.excluded ? 'excluded' : missing.length ? 'need' : 'counted',
          suggestedType: missing.includes('type') ? suggestWorkType(line.texts, kpi) : undefined,
        }
      })
    const counted = lines.filter((line) => line.status === 'counted')
    review.set(projectNo, {
      projectNo,
      lines,
      need: lines.filter((line) => line.status === 'need').length,
      counted: counted.length,
      excluded: lines.filter((line) => line.status === 'excluded').length,
      countedHours: counted.reduce((sum, line) => sum + line.assemblyHours + line.dismantleHours, 0),
    })
  }
  return review
}

/** What Visma gives the demand of the lines in view, whatever the filter shows: how many count, are left out or need the planner, and the hours of those that count. */
export const reviewTotals = (lines: ReviewedLine[]) => {
  const counted = lines.filter((line) => line.status === 'counted')
  return {
    lines: lines.length,
    counted: counted.length,
    excluded: lines.filter((line) => line.status === 'excluded').length,
    need: lines.filter((line) => line.status === 'need').length,
    assembly: counted.reduce((sum, line) => sum + line.assemblyHours, 0),
    dismantle: counted.reduce((sum, line) => sum + line.dismantleHours, 0),
  }
}

/** How many lines match the filter in a project. */
export const countOf = (project: ProjectReview, filter: LineFilter): number => (filter === 'all' ? project.lines.length : project[filter])

/** Lines that lack the same thing for the same reason, resolved in one go in «Avklar»: a Hall/Sted text, an article text without a type, a product type and unit without a rate. */
export interface CauseGroup {
  key: string
  lines: ReviewedLine[]
  /** The projects of the lines, by number. */
  projects: string[]
  /** For a Hall/Sted text: the text, and whether it is empty, which is placed per project. */
  text: string
  blank: boolean
  /** For a rate: the product type and its unit. */
  workType: string
  unit: string
  quantity: number
}

const group = (map: Map<string, CauseGroup>, key: string, line: ReviewedLine, fields: Partial<CauseGroup>) => {
  const found = map.get(key) ?? { key, lines: [], projects: [], text: '', blank: false, workType: '', unit: '', quantity: 0, ...fields }
  found.lines.push(line)
  if (!found.projects.includes(line.projectNo)) found.projects.push(line.projectNo)
  found.quantity += line.quantity
  map.set(key, found)
}

/** The lines that need the planner, grouped by what they lack: one decision per Hall/Sted text, per article text and per product type without a rate. Largest first. */
export const causeGroups = (lines: ReviewedLine[]): { hall: CauseGroup[]; type: CauseGroup[]; rate: CauseGroup[] } => {
  const hall = new Map<string, CauseGroup>()
  const type = new Map<string, CauseGroup>()
  const rate = new Map<string, CauseGroup>()
  for (const line of lines) {
    if (line.status !== 'need') continue
    const text = line.hall.trim()
    if (line.missing.includes('hall')) group(hall, text ? `h|${text.toLowerCase()}` : `h||${line.projectNo}`, line, { text, blank: !text })
    if (line.missing.includes('type')) {
      const said = line.texts.join(' · ')
      group(type, said ? `t|${said.toLowerCase()}` : `t||${line.key}`, line, { text: said })
    }
    if (line.missing.includes('rate')) group(rate, `r|${line.workType.toLowerCase()}|${line.unit.toLowerCase()}`, line, { workType: line.workType, unit: line.unit })
  }
  const largest = (groups: Map<string, CauseGroup>) => [...groups.values()].sort((a, b) => b.lines.length - a.lines.length || a.key.localeCompare(b.key, 'nb'))
  return { hall: largest(hall), type: largest(type), rate: largest(rate) }
}

/** An article number among the booking lines of some Visma lines: how many it has, and the first, to show as it reads in the orders. */
interface ArticleSample {
  articleNo: string
  bookings: number
  sample: VismaRow
}

/** The article numbers of the booking lines behind the lines, each once, the most frequent first; booking lines without one are left out. */
export const articleSamples = (lines: Pick<VismaLine, 'bookings'>[]): ArticleSample[] => {
  const found = new Map<string, ArticleSample>()
  for (const row of lines.flatMap((line) => line.bookings)) {
    const number = row.articleNo.trim()
    if (!number) continue
    const key = articleKey(number)
    const entry = found.get(key) ?? { articleNo: number, bookings: 0, sample: row }
    entry.bookings += 1
    found.set(key, entry)
  }
  return [...found.values()].sort((a, b) => b.bookings - a.bookings || a.articleNo.localeCompare(b.articleNo, 'nb', { numeric: true }))
}
