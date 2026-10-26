import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
import type { ISODate } from '../../domain/dates'
import { numberKey, projectNamer } from '../../domain/projects'
import { defaultBrush, type Balance } from '../../domain/staffing/balance'
import { projectsWithWork, type ProjectBalance } from '../../domain/staffing/projectBalance'
import type { AllocationRow, CompetenceStyle, Work, Workspace } from '../../domain/types'
import { placeTag } from '../../domain/workPlace'
import { placeLinesOf, type ProjectLine } from './lineBalances'
import type { Rect } from './tools'
import { useBrushPick } from './useBrushPick'

interface Options {
  ws: Workspace
  staffed: CompetenceStyle[]
  balance: Balance
  projectBalance: ProjectBalance
  planned: AllocationRow[]
  viewDates: ISODate[]
  firstWorkday: ISODate
  toast: (text: string) => void
  setSelection: Dispatch<SetStateAction<Rect | null>>
  setUnfolded: Dispatch<SetStateAction<string | null>>
}

/**
 * The tool and the brush of Faste (`useBrushPick`, shared with Innleid), with its lines: under the competence in focus the projects
 * with work in the days in view, and under a project its places, and what the brush paints.
 */
export function useBrush({ ws, staffed, balance, projectBalance, planned, viewDates, firstWorkday, toast, setSelection, setUnfolded }: Options) {
  /** A project's name by its number, from the one source of names (`projectNamer`). */
  const projectName = useMemo(() => projectNamer(ws), [ws.projects, ws.allocations]) // eslint-disable-line react-hooks/exhaustive-deps
  /** The projects shown in the Kalender, by `numberKey`: those a project's line can be for. */
  const kalenderProjects = useMemo(() => new Set(planned.filter((row) => row.projectNo.trim()).map((row) => numberKey(row.projectNo))), [planned])
  /** The lines under the competence in focus, as Innleid has them (`projectsWithWork`). */
  const linesOf = useCallback(
    (competence: string): ProjectLine[] => projectsWithWork(projectBalance, competence, viewDates, kalenderProjects, projectName).map((projectNo) => ({ projectNo, name: projectName(projectNo) })),
    [kalenderProjects, viewDates, projectBalance, projectName],
  )
  /** The lines under the project in focus, see `placeLinesOf`. */
  const placesOf = useCallback((competence: string, projectNo: string) => placeLinesOf(projectBalance, competence, projectNo, viewDates), [viewDates, projectBalance])
  const keys = useMemo(() => staffed.map((style) => style.key), [staffed])
  const pick = useBrushPick({
    keys,
    linesOf,
    placesOf,
    // R14: the competence with the most left to cover on the first workday in view.
    fallback: () => defaultBrush(ws, firstWorkday, balance),
    noneText: 'Ingen av de faste har en kompetanse ennå. Legg dem inn på Mannskap › Faste.',
    toast,
    setSelection,
    // A pick in the demand is a step back to all the people: the open hours fold.
    onPick: () => setUnfolded(null),
  })
  const { brush: activeBrush, project: activeProject, hall: activeHall } = pick
  /** What the brush paints: the competence in focus, for the project of the line in focus, in the place of the line in focus. */
  const brushWork = useMemo<Work | null>(
    () => (activeBrush ? { competence: activeBrush, ...(activeProject && { projectNo: activeProject }), ...(activeProject && activeHall !== null && { hall: placeTag(activeHall) }) } : null),
    [activeBrush, activeProject, activeHall],
  )

  return {
    tool: pick.tool, activeTool: pick.activeTool, activeBrush, activeProject, activeHall, brushWork, projectLines: pick.lines, placeLines: pick.placeLines, projectName, kalenderProjects,
    pickBrush: pick.pickBrush, clearBrush: pick.clearBrush, pickProject: pick.pickProject, pickPlace: pick.pickPlace, stepProject: pick.stepLines, pickTool: pick.pickTool, pickFromDemand: pick.pickFromDemand,
  }
}
