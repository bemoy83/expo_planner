import { placeOf, UNRESOLVED_HALL } from './locations'
import type { HallRules, KpiConfig, LineOverride, VismaImport } from './types'
import { buildVismaLines, type VismaLine } from './visma'

/**
 * Going through the Visma lines after an import. A line counts by itself once it is resolved: it gives hours (a work type
 * the KPI table has a rate for) and it has a hall. The planner resolves what is missing, or leaves a line out.
 */

/** What a line can lack before it counts. */
export type Missing = 'type' | 'kpi' | 'rate' | 'hall'

/** Where a line stands: it lacks something, it counts, or the planner has left it out. */
export type LineStatus = 'need' | 'counted' | 'excluded'

/** Which Visma lines Behov shows: those that need the planner, those that count, those left out, or all. */
export type LineFilter = LineStatus | 'all'

/** A line whose Hall/Sted names no hall of the hall ledger counts under «Mangler hall» in the Kalender. */
export const isUnplaced = (line: VismaLine, halls: string[], rules?: HallRules): boolean => placeOf(line.hall, halls, rules, line.projectNo).hall === UNRESOLVED_HALL

/** What the line lacks before it counts, in the order it is resolved in. */
export const missingOf = (line: VismaLine, halls: string[], rules?: HallRules): Missing[] => {
  const missing: Missing[] = []
  if (line.issue === 'no-product-type') missing.push('type')
  if (line.issue === 'unknown-work-type') missing.push('kpi')
  if (line.issue === 'no-rate') missing.push('rate')
  if (isUnplaced(line, halls, rules)) missing.push('hall')
  return missing
}

const MISSING_TEXT: Record<Missing, string> = {
  type: 'arbeidstype',
  kpi: 'produkttypen på KPI',
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

/** How many lines match the filter in a project. */
export const countOf = (project: ProjectReview, filter: LineFilter): number => (filter === 'all' ? project.lines.length : project[filter])
