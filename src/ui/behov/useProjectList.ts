import { useMemo } from 'react'
import { todayIso } from '../../domain/dates'
import { projectTiming, type HallSpans } from '../../domain/ownDemand'
import { isVismaLine } from '../../domain/visma'
import { useWorkspace } from '../../store/workspaceStore'

/** The groups of the rail, by where a project's build-up stands. */
const GROUPS = [
  ['now', 'Nå og neste 3 uker'],
  ['later', 'Senere'],
  ['done', 'Ferdig'],
  ['', 'Uten hallbooking'],
] as const

/**
 * The projects of Behov in the order of their build-up: the rail both views share, and the projects a line of Egen registrering
 * can be made for. Those of the project table, of Visma and of the own lines, by name.
 */
export function useProjectList(spans: Map<string, Map<string, HallSpans>>) {
  const { workspace } = useWorkspace()
  const ws = workspace!
  const today = todayIso()
  const own = useMemo(() => ws.demand.filter((line) => !isVismaLine(line)), [ws.demand])
  const names = useMemo(() => {
    const names = new Map<string, string>()
    for (const p of ws.projects) if (p.projectNo.trim() && !names.has(p.projectNo)) names.set(p.projectNo, p.name)
    for (const v of ws.visma ?? []) if (!names.has(v.projectNo)) names.set(v.projectNo, v.eventName)
    for (const l of own) if (!names.has(l.projectNo)) names.set(l.projectNo, l.projectName)
    return names
  }, [ws.projects, ws.visma, own])
  const timing = useMemo(() => new Map([...names.keys()].map((no) => [no, projectTiming(spans.get(no), today)] as const)), [names, spans, today])
  /** The own lines of each project and their hours. */
  const ownHours = useMemo(() => {
    const sums = new Map<string, { lines: number; hours: number }>()
    for (const l of own) {
      const sum = sums.get(l.projectNo) ?? { lines: 0, hours: 0 }
      sums.set(l.projectNo, { lines: sum.lines + 1, hours: sum.hours + l.assemblyHours + l.dismantleHours })
    }
    return sums
  }, [own])
  // What is being built now and in the next three weeks, later, and done.
  const ordered = useMemo(
    () =>
      [...names]
        .filter(([no]) => timing.get(no) || ownHours.has(no) || (ws.visma ?? []).some((v) => v.projectNo === no))
        .sort(([a, an], [b, bn]) => (timing.get(a)?.start ?? '9999').localeCompare(timing.get(b)?.start ?? '9999') || an.localeCompare(bn, 'nb')),
    [names, timing, ownHours, ws.visma],
  )
  const groups = useMemo(
    () =>
      GROUPS.map(([group, heading]) => ({
        heading,
        // What is done is listed from the last one back.
        projects: (group === 'done' ? [...ordered].reverse() : ordered).filter(([no]) => (timing.get(no)?.group ?? '') === group),
      })),
    [ordered, timing],
  )
  /** The number of a project and where its build-up stands, beside its name in a list. */
  const note = (no: string) => [no, timing.get(no)?.text].filter(Boolean).join(' · ')
  return { own, names, timing, ownHours, ordered, groups, note }
}

export type ProjectList = ReturnType<typeof useProjectList>
