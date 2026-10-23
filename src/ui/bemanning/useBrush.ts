import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { ISODate } from '../../domain/dates'
import { numberKey, projectNamer } from '../../domain/projects'
import { defaultBrush, type Balance } from '../../domain/staffing/balance'
import { placeKey, projectsWithWork, type ProjectBalance } from '../../domain/staffing/projectBalance'
import type { AllocationRow, CompetenceStyle, Work, Workspace } from '../../domain/types'
import { placeTag } from '../../domain/workPlace'
import { brushStep, placeLinesOf, type PlaceLine, type ProjectLine } from './lineBalances'
import type { Rect, Tool } from './tools'

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
 * The tool of Bemanning and the brush: the competence in focus, which is also what the brush paints, and under it the line of a project
 * and of a place of that project, which the brush paints for. A line that is gone from the demand is no brush any more.
 */
export function useBrush({ ws, staffed, balance, projectBalance, planned, viewDates, firstWorkday, toast, setSelection, setUnfolded }: Options) {
  const [tool, setTool] = useState<Tool>('select')
  /** The competence in focus, which is also what the brush paints. */
  const [brush, setBrush] = useState<string | null>(null)
  /** The project whose line under the competence in focus is the brush, by its number; none is the sum line, which paints for no project. */
  const [brushProject, setBrushProject] = useState<string | null>(null)
  /** The place whose line under the project in focus is the brush, as the rows name it; none is the project's line, which paints for no place. */
  const [brushHall, setBrushHall] = useState<string | null>(null)

  // A brush whose competence nobody has any more is no brush.
  const activeBrush = brush && staffed.some((style) => style.key === brush) ? brush : null
  const activeTool: Tool = tool === 'paint' && !activeBrush ? 'select' : tool

  /** A project's name by its number, from the one source of names (`projectNamer`). */
  const projectName = useMemo(() => projectNamer(ws), [ws.projects, ws.allocations]) // eslint-disable-line react-hooks/exhaustive-deps
  /** The projects shown in the Kalender, by `numberKey`: those a project's line can be for. */
  const kalenderProjects = useMemo(() => new Set(planned.filter((row) => row.projectNo.trim()).map((row) => numberKey(row.projectNo))), [planned])
  /** The lines under the competence in focus, as Innleid has them (`projectsWithWork`). */
  const projectLines = useMemo<ProjectLine[]>(
    () => (activeBrush ? projectsWithWork(projectBalance, activeBrush, viewDates, kalenderProjects, projectName).map((projectNo) => ({ projectNo, name: projectName(projectNo) })) : []),
    [activeBrush, kalenderProjects, viewDates, projectBalance, projectName],
  )
  const activeProject = brushProject && projectLines.some((line) => numberKey(line.projectNo) === numberKey(brushProject)) ? brushProject : null
  /** The lines under the project in focus, see `placeLinesOf`. */
  const placeLines = useMemo<PlaceLine[]>(() => (activeBrush && activeProject ? placeLinesOf(projectBalance, activeBrush, activeProject, viewDates) : []), [activeBrush, activeProject, viewDates, projectBalance])
  const activeHall = brushHall !== null && placeLines.some((line) => placeKey(line.hall) === placeKey(brushHall)) ? brushHall : null
  /** What the brush paints: the competence in focus, for the project of the line in focus, in the place of the line in focus. */
  const brushWork = useMemo<Work | null>(
    () => (activeBrush ? { competence: activeBrush, ...(activeProject && { projectNo: activeProject }), ...(activeProject && activeHall !== null && { hall: placeTag(activeHall) }) } : null),
    [activeBrush, activeProject, activeHall],
  )

  const pickBrush = (competence: string) => {
    if (competence !== activeBrush) setBrushProject(null)
    setBrush(competence)
    setTool('paint')
    setSelection(null)
  }
  const clearBrush = () => {
    setBrush(null)
    setBrushProject(null)
    setBrushHall(null)
    setTool('select')
    setSelection(null)
  }
  /** A project's line under the competence in focus is made the brush, or the sum line where it is `null`. */
  const pickProject = (projectNo: string | null) => {
    setBrushProject(projectNo)
    setBrushHall(null)
    setTool('paint')
    setSelection(null)
  }
  /** A place's line under the project in focus is made the brush, or the project's line where it is `null`. */
  const pickPlace = (hall: string | null) => {
    setBrushHall(hall)
    setTool('paint')
    setSelection(null)
  }
  /** Steps the brush to the line above or below under the competence in focus, see `brushStep`. */
  const stepProject = (delta: number) => {
    const next = brushStep(projectLines, placeLines, { projectNo: activeProject, hall: activeHall }, delta)
    setBrushProject(next.projectNo)
    setBrushHall(next.hall)
    setTool('paint')
    setSelection(null)
  }
  const pickTool = (next: Tool) => {
    if (next === 'paint' && !activeBrush) {
      // R14: the competence with the most left to cover on the first workday in view.
      const competence = defaultBrush(ws, firstWorkday, balance)
      if (!competence) return toast('Ingen av de faste har en kompetanse ennå. Legg dem inn på Mannskap › Faste.')
      setBrush(competence)
    }
    setTool(next)
  }
  /** A pick in the demand is a step back to all the people: the open hours fold. */
  const pickFromDemand = (competence: string) => {
    // On the competence in focus, a pick goes from a project's line back to the sum line, and from the sum line out of focus.
    if (competence === activeBrush) return activeHall !== null ? pickPlace(null) : activeProject ? pickProject(null) : clearBrush()
    pickBrush(competence)
    setUnfolded(null)
  }

  return {
    tool, activeTool, activeBrush, activeProject, activeHall, brushWork, projectLines, placeLines, projectName, kalenderProjects,
    pickBrush, clearBrush, pickProject, pickPlace, stepProject, pickTool, pickFromDemand,
  }
}
