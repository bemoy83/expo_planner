import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { VENUE_PHASES } from '../../domain/types'
import { PHASE_CODES, PHASE_LABELS } from '../../domain/venue'
import { Line } from '../kalender/GridRows'
import { dayClass } from '../kalender/gridTypes'
import { LEFT_W } from '../kalender/layout'
import { useBemanning } from './BemanningScope'
import { DensityToggle } from './DensityToggle'
import { PHASE_NAME_MIN_W, PROJECT_COMPACT_H, PROJECT_H, PROJECT_MAX_LINES } from './layout'
import { phaseBars, projectSlots, projectsInView, type ProjectSpan } from './projectsInView'

/** How long a project that leaves the list takes to fade out. */
const LEAVE_MS = 260

/**
 * The projects in view that have planned FTE, for context: one line per project with its phases as the
 * hall calendar draws them and its halls in the label. The block keeps its height while the days scroll
 * (R37), and is never taller than six lines: projects that do not fit are counted beside the heading.
 */
export function ProjectLines() {
  const { projects, phases, chosenProject, cols, dates, viewFrom, viewTo, room, projectsOpen: open, setProjectsOpen, projectDensity, setProjectDensity } = useBemanning()
  const compact = projectDensity === 'compact'
  const rowH = compact ? PROJECT_COMPACT_H : PROJECT_H
  const { colW, c0 } = cols
  const c1 = c0 + cols.dates.length - 1

  // A project that is listed stays until it is two days out of view, so the list is told what it held.
  const [listedKeys, setListedKeys] = useState<string[]>([])
  const listed = useMemo(() => projectsInView(projects, viewFrom, viewTo, new Set(listedKeys)), [projects, viewFrom, viewTo, listedKeys])
  const keys = listed.map((project) => project.key)
  // The projects that have just left keep their line while they fade out.
  const [leaving, setLeaving] = useState<{ project: ProjectSpan; slot: number }[]>([])
  if (keys.join('|') !== listedKeys.join('|')) {
    const gone = projects.filter((project) => listedKeys.includes(project.key) && !keys.includes(project.key)).map((project) => ({ project, slot: listedKeys.indexOf(project.key) }))
    setListedKeys(keys)
    setLeaving((was) => [...was.filter(({ project }) => !keys.includes(project.key) && !gone.some((g) => g.project.key === project.key)), ...gone])
  }
  useEffect(() => {
    if (!leaving.length) return
    const timer = setTimeout(() => setLeaving([]), LEAVE_MS)
    return () => clearTimeout(timer)
  }, [leaving])

  // As many lines as the fullest stretch of days needs; it changes with the column width and the room, not with the scrolling.
  const visible = Math.ceil(room / colW) + 1
  const slots = Math.min(PROJECT_MAX_LINES, useMemo(() => projectSlots(projects, visible, dates.length), [projects, visible, dates.length]))
  // The first of them by the start of the event have a line; no project is left out without being counted.
  const hidden = listed.slice(slots)
  const bars = useMemo(() => new Map(projects.map((project) => [project.key, phaseBars(phases.get(project.key) ?? new Map(), dates[0])])), [projects, phases, dates])

  const line = (project: ProjectSpan, slot: number, gone: boolean) => (
    <div key={project.key} className={`bm-project-line ${gone ? 'leaving' : ''} ${chosenProject && chosenProject !== project.key ? 'dim' : ''}`} style={{ top: slot * rowH, height: rowH }}>
      <div className="grid-label" style={{ width: LEFT_W }}>
        <span className="bm-project-name">{project.name}</span>
        <span className="bm-project-halls">{project.halls.join(' · ')}</span>
      </div>
      {(bars.get(project.key) ?? [])
        .filter((bar) => bar.col <= c1 && bar.col + bar.span > c0)
        .map((bar) => {
          const width = bar.span * colW - 2
          // The event's bar carries the project's name; the others their phase, in full where there is room.
          const text = compact ? null : bar.phase === 'event' ? project.name : width >= PHASE_NAME_MIN_W ? PHASE_LABELS[bar.phase] : PHASE_CODES[bar.phase]
          return (
            <span key={`${bar.phase}:${bar.col}`} className={`hall-bar ph-${bar.phase}`} style={{ left: LEFT_W + bar.col * colW + 1, width }} title={`${project.name} · ${PHASE_LABELS[bar.phase]}`}>
              {text}
            </span>
          )
        })}
    </div>
  )

  return (
    <div className={`top-section bm-projects ${open ? 'open' : ''} ${compact ? 'compact' : ''}`}>
      <div className="section-line">
        <div className="section-head" style={{ width: LEFT_W }}>
          <button className="twisty" aria-expanded={open} aria-label={open ? 'Skjul prosjektene' : 'Vis prosjektene'} onClick={() => setProjectsOpen(!open)}>
            {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
          </button>
          Prosjekter
          {open && <DensityToggle compact={compact} onChange={(next) => setProjectDensity(next ? 'compact' : 'detail')} />}
          <span className="section-meta" title={hidden.length ? `Vises ikke, fordi listen har plass til ${slots}:\n${hidden.map((project) => project.name).join('\n')}` : 'Prosjekter med planlagt FTE i dagene som vises, av alle med planlagt FTE'}>
            {listed.length - hidden.length} av {projects.length}
            {hidden.length > 0 && <b className="bm-more"> · +{hidden.length}</b>}
          </span>
        </div>
        {open && (
          <span className="phase-legend" style={{ left: LEFT_W }}>
            {VENUE_PHASES.map((phase) => (
              <span key={phase}>
                <i className={`ph-${phase}`} /> {PHASE_LABELS[phase]}
              </span>
            ))}
          </span>
        )}
      </div>
      {open && (
        <div className="bm-project-block" style={{ height: slots * rowH }}>
          {/* The days behind the lines, so the weekends run through the empty lines too. */}
          <Line className="bm-project-days" height={slots * rowH} label={null} cols={cols} cells={(date) => <div key={date} className={`${dayClass(cols, date)} cell hall`} style={{ width: colW }} />} />
          {listed.slice(0, slots).map((project, slot) => line(project, slot, false))}
          {leaving.filter(({ slot }) => slot < slots).map(({ project, slot }) => line(project, slot, true))}
        </div>
      )}
    </div>
  )
}
