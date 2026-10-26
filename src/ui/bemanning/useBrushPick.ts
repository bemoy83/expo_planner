import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { numberKey } from '../../domain/projects'
import { placeKey } from '../../domain/staffing/projectBalance'
import { brushStep, type PlaceLine } from './lineBalances'
import type { Rect, Tool } from './tools'

/** A line under the competence of the brush that a project is picked from: «Uten prosjekt» (`rest`) is none. */
interface PickLine {
  projectNo: string
  name: string
  rest?: boolean
}

interface Options<L extends PickLine> {
  /** What the brush can be: a competence that is gone from them is no brush. */
  keys: string[]
  /** The lines under a competence (Faste's projects, Innleid's with «Uten prosjekt»). Kept as it is while its inputs are, see `useMemo`. */
  linesOf: (competence: string) => L[]
  /** The places under a project's line, where the part has them (Faste). */
  placesOf?: (competence: string, projectNo: string) => PlaceLine[]
  /** R14: what Pensel takes when no competence is the brush, or `null` with the message that says why there is none. */
  fallback: () => string | null
  noneText: string
  toast: (text: string) => void
  setSelection: Dispatch<SetStateAction<Rect | null>>
  /** A pick in the demand of another competence: Faste folds the open hours. */
  onPick?: () => void
}

/**
 * The tool and the brush, the same in Faste and in Innleid: the competence in focus, which is what the brush paints, and under it the
 * line of a project, and of a place of it where the part has places, which the brush paints for. A line that is gone is no brush any more.
 */
export function useBrushPick<L extends PickLine>({ keys, linesOf, placesOf, fallback, noneText, toast, setSelection, onPick }: Options<L>) {
  const [tool, setTool] = useState<Tool>('select')
  const [brushKey, setBrush] = useState<string | null>(null)
  /** The project whose line is the brush, by its number; none is the sum line, which paints for no project. */
  const [brushProject, setBrushProject] = useState<string | null>(null)
  /** The place whose line under the project is the brush, as the rows name it; none is the project's line. */
  const [brushHall, setBrushHall] = useState<string | null>(null)

  const brush = brushKey && keys.includes(brushKey) ? brushKey : null
  const activeTool: Tool = tool === 'paint' && !brush ? 'select' : tool
  const lines = useMemo(() => (brush ? linesOf(brush) : []), [brush, linesOf])
  const picked = lines.filter((line) => !line.rest)
  const project = brushProject && picked.some((line) => numberKey(line.projectNo) === numberKey(brushProject)) ? brushProject : null
  const placeLines = useMemo<PlaceLine[]>(() => (brush && project && placesOf ? placesOf(brush, project) : []), [brush, project, placesOf])
  const hall = brushHall !== null && placeLines.some((line) => placeKey(line.hall) === placeKey(brushHall)) ? brushHall : null

  /** The brush is made what is given, with the tool: from Faste into Innleid and back, or to show an order. */
  const take = (competence: string | null, projectNo: string | null = null, next: Tool = competence ? 'paint' : 'select') => {
    setBrush(competence)
    setBrushProject(projectNo)
    setBrushHall(null)
    setTool(next)
  }
  const pickBrush = (competence: string) => {
    if (competence !== brush) setBrushProject(null)
    setBrush(competence)
    setTool('paint')
    setSelection(null)
  }
  const clearBrush = () => {
    take(null)
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
  const pickPlace = (place: string | null) => {
    setBrushHall(place)
    setTool('paint')
    setSelection(null)
  }
  /** Steps the brush to the line above or below under the competence in focus, see `brushStep`. */
  const stepLines = (delta: number) => {
    const next = brushStep(picked, placeLines, { projectNo: project, hall }, delta)
    setBrushProject(next.projectNo)
    setBrushHall(next.hall)
    setTool('paint')
    setSelection(null)
  }
  const pickTool = (next: Tool) => {
    if (next === 'paint' && !brush) {
      const competence = fallback()
      if (!competence) return toast(noneText)
      setBrush(competence)
    }
    setTool(next)
  }
  /** On the competence in focus, a pick goes from a place to its project, from a project's line to the sum line, and from the sum line out of focus. */
  const pickFromDemand = (competence: string) => {
    if (competence === brush) return hall !== null ? pickPlace(null) : project ? pickProject(null) : clearBrush()
    pickBrush(competence)
    onPick?.()
  }

  return { tool, activeTool, brush, project, hall, lines, placeLines, take, pickBrush, clearBrush, pickProject, pickPlace, stepLines, pickTool, pickFromDemand }
}
