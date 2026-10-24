import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { competenceStyles } from '../../domain/competences'
import { EMPTY_KPI, productTypeKey } from '../../domain/kpi'
import { fromLastYear, usualAvdeling, type HallSpans } from '../../domain/ownDemand'
import { DRAFT_BASIS, PLANNED_BASIS, type DemandLine } from '../../domain/types'
import { useWorkspace } from '../../store/workspaceStore'
import { Menu, type Message } from '../common'
import { count, isTyping } from '../dom'
import { OwnLineForm } from './OwnLineForm'
import { EMPTY_DRAFT, SPLIT_HALLS, type OwnContext, type OwnDraft } from './ownDraft'
import { FromLastYear } from './FromLastYear'
import { OwnLines } from './OwnLines'
import type { Placing } from './usePlacing'
import type { ProjectList } from './useProjectList'
import { formatFte, hours } from '../format'

/** How long a line just added stays lit. */
const FLASH_MS = 1600

/** A Visma line handed to Egen registrering to be replaced by an own line. */
export interface ReplaceSeed {
  key: string
  projectNo: string
  hall: string
  avdeling: string
  workType: string
  quantity: number
  unit: string
  competence: string
  assemblyHours: number
  dismantleHours: number
}

interface Props {
  placing: Placing
  /** The projects of Behov, in the order of the rail. */
  projects: ProjectList
  projectNo: string
  onProjectChange: (projectNo: string) => void
  seed: ReplaceSeed | null
  onSeedUsed: () => void
  onMessage: (message: Message) => void
}

/**
 * Egen registrering: the planner's own demand lines, for work that is not sold through Visma but follows the build-up
 * and tear-down of an event. A form on top where project › hall › avd. stays set, and the lines under it by project and hall.
 */
export function EgenView({ placing, projects, projectNo, onProjectChange, seed, onSeedUsed, onMessage }: Props) {
  const { workspace, saveDemandLine, removeDemandLine } = useWorkspace()
  const ws = workspace!
  const kpi = ws.kpi ?? EMPTY_KPI
  const hoursPerDay = ws.settings.hoursPerDay
  const { spans, places, placeOfLine } = placing
  const styles = useMemo(() => competenceStyles(ws), [ws])

  const { own, names, timing, ordered, groups, note } = projects

  // Where new lines go. A project that is picked starts on the hall last used in it, else its first booked hall, and the department most of its Visma lines have.
  const lastHall = useRef(new Map<string, string>())
  const contextFor = (no: string, hall?: string): OwnContext => {
    const booked = [...(spans.get(no)?.keys() ?? [])]
    const rows = (ws.visma ?? []).filter((v) => v.projectNo === no).flatMap((v) => v.rows)
    return { projectNo: no, hall: hall ?? lastHall.current.get(no) ?? booked[0] ?? '', avdeling: usualAvdeling(rows) }
  }
  const [ctx, setCtx] = useState<OwnContext>(() => (projectNo ? contextFor(projectNo) : { projectNo: '', hall: '', avdeling: '' }))
  const setContext = (next: OwnContext) => {
    if (next.projectNo && next.hall !== SPLIT_HALLS) lastHall.current.set(next.projectNo, next.hall)
    setCtx(next)
  }
  const pickProject = (no: string) => {
    onProjectChange(no)
    if (no && no !== ctx.projectNo) setContext(contextFor(no))
  }
  // A project opened from the rail is where new lines go.
  const [contextOf, setContextOf] = useState(projectNo)
  if (contextOf !== projectNo) {
    setContextOf(projectNo)
    if (projectNo && projectNo !== ctx.projectNo) setContext(contextFor(projectNo))
  }
  const [draft, setDraft] = useState<OwnDraft>(EMPTY_DRAFT)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [flash, setFlash] = useState<Set<string>>(new Set())
  // The timer that puts out the lines just added; it is stopped if the page closes first.
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(flashTimer.current), [])
  const refs = { hall: useRef<HTMLInputElement>(null), work: useRef<HTMLInputElement>(null), assembly: useRef<HTMLInputElement>(null) }
  const focus = (ref: { current: HTMLInputElement | null }) => requestAnimationFrame(() => ref.current?.focus())

  /** A line in the form from one that exists: its work, amount, hours and competence, in its project, hall and avd. */
  const fromLine = (
    line: Pick<DemandLine, 'projectNo' | 'hall' | 'avdeling' | 'workType' | 'quantity' | 'unit' | 'competence' | 'assemblyHours' | 'dismantleHours' | 'comment'>,
    patch: Partial<OwnDraft>,
    into = line.projectNo,
  ) => {
    onProjectChange(into)
    setContext({ projectNo: into, hall: line.hall, avdeling: line.avdeling ?? '' })
    const onKpi = kpi.workTypes.some((t) => productTypeKey(t.productType) === productTypeKey(line.workType))
    const typed = (h: number) => (onKpi && line.quantity ? '' : h ? formatFte(h, 2) : '')
    setDraft({
      ...EMPTY_DRAFT,
      planned: draft.planned,
      work: line.workType,
      quantity: line.quantity === null ? '' : formatFte(line.quantity, 3),
      unit: line.unit,
      assembly: typed(line.assemblyHours),
      dismantle: typed(line.dismantleHours),
      competence: line.competence,
      comment: line.comment,
      ...patch,
    })
    focus(refs.assembly)
  }

  // A Visma line handed over to be replaced fills the form once.
  useEffect(() => {
    if (!seed) return
    fromLine(
      { ...seed, comment: '' },
      { replaces: seed.key, from: `Erstatter Visma: ${seed.workType} · ${seed.hall.trim() || 'uten hall'} · ${hours(seed.assemblyHours)} / ${hours(seed.dismantleHours)} t` },
    )
    onSeedUsed()
    // The seed is the one thing this answers to.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])

  const add = (lines: DemandLine[]) => {
    for (const line of lines) saveDemandLine(line)
    setDraft({ ...EMPTY_DRAFT, planned: draft.planned })
    if (projectNo && projectNo !== lines[0].projectNo) onProjectChange(lines[0].projectNo)
    setFlash(new Set(lines.map((line) => line.id)))
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(new Set()), FLASH_MS)
    // The next line starts at its hall, which Tab passes as it is.
    focus(refs.hall)
  }
  const update = (line: DemandLine, patch: Partial<DemandLine>) => saveDemandLine({ ...line, ...patch })
  const remove = (lines: DemandLine[]) => {
    for (const line of lines) removeDemandLine(line.id)
    setSelected(new Set())
    onMessage({ kind: 'ok', text: `Slettet ${count(lines.length, 'linje', 'linjer')}. Kan angres med Ctrl/Cmd+Z.` })
  }
  const scoped = useMemo(() => own.filter((line) => !projectNo || line.projectNo === projectNo), [own, projectNo])
  const picked = scoped.filter((line) => selected.has(line.id))
  const each = (patch: (line: DemandLine) => Partial<DemandLine>) => {
    for (const line of picked) update(line, patch(line))
  }
  const copyTo = (no: string) => {
    const booked = [...(spans.get(no)?.keys() ?? [])]
    const copies = picked.map((line) => ({
      ...line,
      id: `manual-${crypto.randomUUID()}`,
      projectNo: no,
      projectName: names.get(no) ?? no,
      hall: booked.includes(line.hall) ? line.hall : booked.length === 1 ? booked[0] : '',
      replaces: undefined,
    }))
    add(copies)
    setSelected(new Set())
    onProjectChange(no)
    onMessage({ kind: 'ok', text: `Kopierte ${count(copies.length, 'linje', 'linjer')} til ${names.get(no) ?? no}. Kan angres med Ctrl/Cmd+Z.` })
  }

  // N or / goes to Arbeid; Esc lets go of the selection; Delete removes what is selected.
  const keys = useRef({ picked, remove })
  useEffect(() => {
    keys.current = { picked, remove }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'n' || e.key === '/') {
        e.preventDefault()
        refs.hall.current?.focus()
      } else if (e.key === 'Escape') setSelected(new Set())
      else if ((e.key === 'Delete' || e.key === 'Backspace') && keys.current.picked.length) keys.current.remove(keys.current.picked)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // The refs are stable.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // «Fra i fjor»: last year's own lines of the open project that are not registered this year.
  const lastYear = useMemo(() => (projectNo ? fromLastYear(own, projectNo) : null), [own, projectNo])
  const bookedNow = new Set(spans.get(projectNo)?.keys() ?? [])
  const fetchLastYear = (lines: DemandLine[]) => {
    add(lines.map((line) => ({ ...line, id: `manual-${crypto.randomUUID()}`, projectNo, projectName: names.get(projectNo) ?? projectNo, hall: !line.hall || bookedNow.has(line.hall) ? line.hall : '', replaces: undefined, notIn: undefined })))
    onMessage({ kind: 'ok', text: `Hentet ${count(lines.length, 'linje', 'linjer')} fra i fjor. Kan angres med Ctrl/Cmd+Z.` })
  }

  const avdelinger = useMemo(() => {
    const counts = new Map<string, number>()
    for (const v of ws.visma ?? []) if (v.projectNo === ctx.projectNo) for (const row of v.rows) if (row.avdeling.trim()) counts.set(row.avdeling.trim(), (counts.get(row.avdeling.trim()) ?? 0) + 1)
    const others = new Set((ws.visma ?? []).flatMap((v) => v.rows.map((row) => row.avdeling.trim())).filter((a) => a && !counts.has(a)))
    for (const l of own) if (l.avdeling && !counts.has(l.avdeling)) others.add(l.avdeling)
    return [...[...counts].sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, note: count(n, 'Visma-linje', 'Visma-linjer') })), ...[...others].sort().map((value) => ({ value, note: '' }))]
  }, [ws.visma, own, ctx.projectNo])
  const usedBefore = useMemo(() => {
    const used = new Map<string, string>()
    for (const l of own) if (l.workType.trim() && !kpi.workTypes.some((t) => productTypeKey(t.productType) === productTypeKey(l.workType))) used.set(l.workType, l.competence)
    return used
  }, [own, kpi])
  const shownProjects = projectNo ? ordered.filter(([no]) => no === projectNo) : ordered
  const projectName = names.get(projectNo) ?? projectNo
  const pickedHours = picked.reduce((sum, line) => sum + line.assemblyHours + line.dismantleHours, 0)
  const moveHalls = projectNo ? [...(spans.get(projectNo)?.keys() ?? [])] : places

  return (
    <div className="behov-main own-main">
      <div className="behov-zone">
        <OwnLineForm
          ctx={ctx}
          onContext={setContext}
          draft={draft}
          onDraft={setDraft}
          projects={ordered}
          projectGroups={groups.map((group) => ({ label: group.heading, items: group.projects.map(([no, name]) => ({ value: no, label: name, note: note(no) })) }))}
          booked={spans.get(ctx.projectNo) ?? new Map<string, HallSpans>()}
          places={places}
          avdelinger={avdelinger}
          usedBefore={usedBefore}
          competences={styles.map((style) => style.label)}
          kpi={kpi}
          hoursPerDay={hoursPerDay}
          placeIn={(hall, no) => placeOfLine({ hall, projectNo: no }).hall}
          hallRef={refs.hall}
          workRef={refs.work}
          assemblyRef={refs.assembly}
          onAdd={add}
          onProject={pickProject}
        />
        {lastYear && lastYear.missing.length > 0 && (
          <FromLastYear
            previousName={names.get(lastYear.previous) ?? lastYear.previous}
            missing={lastYear.missing}
            present={lastYear.present}
            booked={bookedNow}
            onFetch={fetchLastYear}
            onAdjust={(line) => fromLine({ ...line, hall: !line.hall || bookedNow.has(line.hall) ? line.hall : ctx.hall }, { from: `Fra i fjor: ${names.get(line.projectNo) ?? line.projectNo}` }, projectNo)}
            onDismiss={(line) => update(line, { notIn: [...(line.notIn ?? []), projectNo] })}
          />
        )}
        <div className="behov-head">
          <h2 className="behov-title">
            {projectNo ? projectName : 'Alle prosjekter'} {projectNo && <span className="project-no">{projectNo}</span>}
          </h2>
          {projectNo && <span className="muted">{[timing.get(projectNo)?.text, ...(spans.get(projectNo)?.keys() ?? [])].filter(Boolean).join(' · ')}</span>}
        </div>
      </div>
      <div className="behov-body">
        <OwnLines
          lines={scoped}
          projects={shownProjects}
          spans={spans}
          single={!!projectNo}
          selected={selected}
          onSelect={setSelected}
          flash={flash}
          kpi={kpi}
          hoursPerDay={hoursPerDay}
          onUpdate={update}
          onRemove={remove}
          onAddHere={(no, hall) => {
            setContext(no === ctx.projectNo ? { ...ctx, hall } : contextFor(no, hall))
            focus(refs.work)
          }}
          onTemplate={(line) => fromLine(line, { from: `Mal: ${line.workType}` })}
        />
      </div>
      {picked.length > 0 && (
        <div className="bulk-bar" role="toolbar" aria-label="Valgte linjer">
          <span>
            <b>{picked.length}</b> valgt · {hours(pickedHours)} t
          </span>
          <span className="bulk-sep" />
          <Menu label="Flytt til hall" className="ghost">
            {(close) => (
              <>
                {[...moveHalls, ''].map((hall) => (
                  <button key={hall || '-'} onClick={() => (each(() => ({ hall })), close())}>
                    {hall || 'Uten hall'}
                  </button>
                ))}
              </>
            )}
          </Menu>
          <Menu label="Avdeling" className="ghost">
            {(close) => (
              <>
                {avdelinger.map((a) => (
                  <button key={a.value} onClick={() => (each(() => ({ avdeling: a.value })), close())}>
                    {a.value}
                  </button>
                ))}
              </>
            )}
          </Menu>
          <button className="ghost" onClick={() => each(() => ({ basis: PLANNED_BASIS }))}>
            {PLANNED_BASIS}
          </button>
          <button className="ghost" onClick={() => each(() => ({ basis: DRAFT_BASIS }))}>
            {DRAFT_BASIS}
          </button>
          <Menu label="Kopier til" className="ghost">
            {(close) => (
              <>
                {ordered
                  .filter(([no]) => !picked.some((line) => line.projectNo === no))
                  .map(([no, name]) => (
                    <button key={no} onClick={() => (copyTo(no), close())}>
                      {name} <small className="muted">{no}</small>
                    </button>
                  ))}
              </>
            )}
          </Menu>
          <button className="ghost" onClick={() => remove(picked)}>
            <Trash2 size={13} aria-hidden /> Slett
          </button>
          <button className="ghost icon-button" aria-label="Fjern valget" title="Fjern valget (Esc)" onClick={() => setSelected(new Set())}>
            <X size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}
