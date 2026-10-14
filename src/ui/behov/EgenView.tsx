import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { formatFte } from '../../domain/calc'
import { competenceStyles } from '../../domain/competences'
import { todayIso } from '../../domain/dates'
import { EMPTY_KPI, productTypeKey } from '../../domain/kpi'
import { placeNames } from '../../domain/locations'
import { projectHallSpans, projectTiming, usualAvdeling, type HallSpans } from '../../domain/ownDemand'
import { competenceKey, DRAFT_BASIS, PLANNED_BASIS, type DemandLine } from '../../domain/types'
import { isVismaLine } from '../../domain/visma'
import { hallNames } from '../../domain/venue'
import { useWorkspace } from '../../store/workspaceStore'
import { Menu, type Message } from '../common'
import { count, isTyping } from '../dom'
import { OwnLineForm } from './OwnLineForm'
import { EMPTY_DRAFT, SPLIT_HALLS, type OwnContext, type OwnDraft } from './ownDraft'
import { OwnLines } from './OwnLines'
import { ProjectRail, type RailSection } from './ProjectRail'

const hours = (value: number) => formatFte(value, 1)
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
export function EgenView({ projectNo, onProjectChange, seed, onSeedUsed, onMessage }: Props) {
  const { workspace, saveDemandLine, removeDemandLine } = useWorkspace()
  const ws = workspace!
  const kpi = ws.kpi ?? EMPTY_KPI
  const hoursPerDay = ws.settings.hoursPerDay
  const today = todayIso()
  const own = useMemo(() => ws.demand.filter((line) => !isVismaLine(line)), [ws.demand])
  const spans = useMemo(() => projectHallSpans(ws.venue, ws.projects), [ws.venue, ws.projects])
  const halls = useMemo(() => hallNames(ws.venue), [ws.venue])
  const places = useMemo(() => placeNames(halls, ws.hallRules), [halls, ws.hallRules])
  const styles = useMemo(() => competenceStyles(ws), [ws])
  const color = (competence: string) => {
    const style = styles.find((s) => s.key === competenceKey(competence))
    return style && `var(--${style.color})`
  }

  /** Every project a line can be made for: those of the project table, of Visma and of the own lines, by name. */
  const names = useMemo(() => {
    const names = new Map<string, string>()
    for (const p of ws.projects) if (p.projectNo.trim() && !names.has(p.projectNo)) names.set(p.projectNo, p.name)
    for (const v of ws.visma ?? []) if (!names.has(v.projectNo)) names.set(v.projectNo, v.eventName)
    for (const l of own) if (!names.has(l.projectNo)) names.set(l.projectNo, l.projectName)
    return names
  }, [ws.projects, ws.visma, own])
  const timing = useMemo(() => new Map([...names.keys()].map((no) => [no, projectTiming(spans.get(no), today)] as const)), [names, spans, today])
  const ownHours = useMemo(() => {
    const sums = new Map<string, { lines: number; hours: number }>()
    for (const l of own) {
      const sum = sums.get(l.projectNo) ?? { lines: 0, hours: 0 }
      sums.set(l.projectNo, { lines: sum.lines + 1, hours: sum.hours + l.assemblyHours + l.dismantleHours })
    }
    return sums
  }, [own])
  // The projects in order of their build-up: what is being built now and in the next three weeks, later, and done.
  const ordered = useMemo(
    () =>
      [...names]
        .filter(([no]) => timing.get(no) || ownHours.has(no) || (ws.visma ?? []).some((v) => v.projectNo === no))
        .sort(([a, an], [b, bn]) => (timing.get(a)?.start ?? '9999').localeCompare(timing.get(b)?.start ?? '9999') || an.localeCompare(bn, 'nb')),
    [names, timing, ownHours, ws.visma],
  )
  const sections: RailSection[] = (
    [
      ['now', 'Nå og neste 3 uker'],
      ['later', 'Senere'],
      ['done', 'Ferdig'],
      ['', 'Uten hallbooking'],
    ] as const
  ).map(([group, heading]) => ({
    heading,
    // What is done is listed from the last one back.
    items: (group === 'done' ? [...ordered].reverse() : ordered)
      .filter(([no]) => (timing.get(no)?.group ?? '') === group)
      .map(([no, name]) => {
        const t = timing.get(no)
        const sum = ownHours.get(no)
        return {
          projectNo: no,
          name,
          aside: sum ? <span className="count">{hours(sum.hours)} t</span> : undefined,
          sub: t && <span className={`timing ${t.tone}`}>{t.text}</span>,
        }
      }),
  }))
  const projectNote = (no: string) => [no, timing.get(no)?.text].filter(Boolean).join(' · ')

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
  const [draft, setDraft] = useState<OwnDraft>(EMPTY_DRAFT)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [flash, setFlash] = useState<Set<string>>(new Set())
  const refs = { work: useRef<HTMLInputElement>(null), assembly: useRef<HTMLInputElement>(null) }
  const focus = (ref: { current: HTMLInputElement | null }) => requestAnimationFrame(() => ref.current?.focus())

  /** A line in the form from one that exists: its work, amount, hours and competence, in its project, hall and avd. */
  const fromLine = (line: Pick<DemandLine, 'projectNo' | 'hall' | 'avdeling' | 'workType' | 'quantity' | 'unit' | 'competence' | 'assemblyHours' | 'dismantleHours' | 'comment'>, patch: Partial<OwnDraft>) => {
    onProjectChange(line.projectNo)
    setContext({ projectNo: line.projectNo, hall: line.hall, avdeling: line.avdeling ?? '' })
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
    setTimeout(() => setFlash(new Set()), FLASH_MS)
    focus(refs.work)
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
  keys.current = { picked, remove }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'n' || e.key === '/') {
        e.preventDefault()
        refs.work.current?.focus()
      } else if (e.key === 'Escape') setSelected(new Set())
      else if ((e.key === 'Delete' || e.key === 'Backspace') && keys.current.picked.length) keys.current.remove(keys.current.picked)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // The refs are stable.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  const planned = scoped.filter((line) => line.basis === PLANNED_BASIS)
  const drafts = scoped.length - planned.length
  const projectName = names.get(projectNo) ?? projectNo
  const pickedHours = picked.reduce((sum, line) => sum + line.assemblyHours + line.dismantleHours, 0)
  const moveHalls = projectNo ? [...(spans.get(projectNo)?.keys() ?? [])] : places

  return (
    <div className="behov-split">
      <ProjectRail all={{ label: 'Alle prosjekter', aside: <span className="count">{own.length}</span> }} sections={sections} projectNo={projectNo} onPick={pickProject} search />
      <div className="behov-main own-main">
        <div className="behov-intro">
          <h2>
            {projectNo ? projectName : 'Alle prosjekter'} {projectNo && <span className="project-no">{projectNo}</span>}
          </h2>
          <span className="toolbar-gap" />
          <span className="intro-meta">
            {count(scoped.length, 'linje', 'linjer')} · <i className="phase-swatch assembly" aria-hidden /> {hours(planned.reduce((s, l) => s + l.assemblyHours, 0))} t ·{' '}
            <i className="phase-swatch dismantle" aria-hidden /> {hours(planned.reduce((s, l) => s + l.dismantleHours, 0))} t{drafts > 0 && ` · ${count(drafts, 'utkast', 'utkast')}`}
          </span>
        </div>
        <div className="own-top">
          <OwnLineForm
            ctx={ctx}
            onContext={setContext}
            draft={draft}
            onDraft={setDraft}
            projects={ordered}
            projectNote={projectNote}
            booked={spans.get(ctx.projectNo) ?? new Map<string, HallSpans>()}
            places={places}
            avdelinger={avdelinger}
            usedBefore={usedBefore}
            competences={styles.map((style) => style.label)}
            kpi={kpi}
            hoursPerDay={hoursPerDay}
            workRef={refs.work}
            assemblyRef={refs.assembly}
            onAdd={add}
            onProject={pickProject}
          />
        </div>
        <div className="behov-table">
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
            competenceColor={color}
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
    </div>
  )
}
