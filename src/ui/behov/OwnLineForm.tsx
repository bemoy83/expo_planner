import { useRef, useState, type Ref, type RefObject } from 'react'
import { CornerDownLeft, History, X } from 'lucide-react'
import { competenceKey, DRAFT_BASIS, OWN_SOURCE, PLANNED_BASIS, type DemandLine, type KpiConfig } from '../../domain/types'
import { productTypeKey, typeAndRate } from '../../domain/kpi'
import { decimalText } from '../../domain/numbers'
import { parseHours, parseQuantity, spanText, workdays, type HallSpans } from '../../domain/ownDemand'
import { useWorkspace } from '../../store/workspaceStore'
import { Segmented } from '../common'
import { PickField, type PickGroup } from '../fields'
import { SplitPick } from './SplitPick'
import { EMPTY_DRAFT, NO_HALL, SPLIT_HALLS, type OwnContext, type OwnDraft } from './ownDraft'
import { kpiTypeItem, useCompetenceColor } from './format'
import { formatFte, hours } from '../format'


interface Props {
  ctx: OwnContext
  onContext: (ctx: OwnContext) => void
  draft: OwnDraft
  onDraft: (draft: OwnDraft) => void
  /** The projects to pick from, as [number, name]. */
  projects: [string, string][]
  /** The same in groups by their build-up, for the list. */
  projectGroups: PickGroup[]
  /** The halls the project of the context has booked, with their days. */
  booked: Map<string, HallSpans>
  /** Every place a line can be put under, from the hall ledger and the rules. */
  places: string[]
  /** The departments to offer, the project's own first. */
  avdelinger: { value: string; note: string }[]
  /** The work types the planner has typed before that are not on KPI, with the competence they had. */
  usedBefore: Map<string, string>
  competences: string[]
  kpi: KpiConfig
  hoursPerDay: number
  /** The hall or place a Hall/Sted text counts under in a project, as the rules place it. */
  placeIn: (hall: string, projectNo: string) => string
  /** The fields the page puts the focus in: Hall, Arbeid, and Montering. */
  hallRef: RefObject<HTMLInputElement | null>
  workRef: RefObject<HTMLInputElement | null>
  assemblyRef: RefObject<HTMLInputElement | null>
  onAdd: (lines: DemandLine[]) => void
  /** Picks the project of the context, and with it the hall and avd. it starts on. */
  onProject: (projectNo: string) => void
}

/**
 * The form of Egen registrering: the project above, the line's hall and avd., which stay between lines, the work with
 * its amount and hours, and what the line does to the Kalender. Enter adds the line from any field, Esc empties it.
 */
export function OwnLineForm({ ctx, onContext, draft, onDraft, projects, projectGroups, booked, places, avdelinger, usedBefore, competences, kpi, hoursPerDay, placeIn, hallRef, workRef, assemblyRef, onAdd, onProject }: Props) {
  const { locatedDemand } = useWorkspace()
  const competenceColor = useCompetenceColor()
  const projectName = projects.find(([no]) => no === ctx.projectNo)?.[1] ?? ''
  const bookedHalls = [...booked.keys()]
  const split = ctx.hall === SPLIT_HALLS
  const targetHalls = split ? bookedHalls : [ctx.hall]
  const set = (patch: Partial<OwnDraft>) => onDraft({ ...draft, ...patch })
  const qtyRef = useRef<HTMLInputElement>(null)
  const compRef = useRef<HTMLInputElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const avdRef = useRef<HTMLInputElement>(null)

  const { type, rate } = typeAndRate(kpi, draft.work)
  // The quantity can be typed with its unit, «1stk»: on a type of KPI the unit is the type's, and another one is an error.
  const typedQuantity = parseQuantity(draft.quantity, type?.unit)
  const quantity = typedQuantity?.quantity ?? null
  const typedUnit = typedQuantity?.unit
  const wrongUnit = !!typedQuantity?.wrongUnit
  const unit = type?.unit ?? typedUnit ?? draft.unit.trim()
  const auto = (perHour: number | undefined) => (quantity && perHour ? quantity / perHour : null)
  const autoAssembly = auto(rate?.assembly)
  const autoDismantle = auto(rate?.dismantle)
  const typedAssembly = parseHours(draft.assembly, hoursPerDay, quantity)
  const typedDismantle = parseHours(draft.dismantle, hoursPerDay, quantity)
  const assembly = typedAssembly ? typedAssembly.hours : (autoAssembly ?? 0)
  const dismantle = typedDismantle ? typedDismantle.hours : (autoDismantle ?? 0)

  const missing = [
    !ctx.projectNo && 'prosjekt',
    !draft.work.trim() && 'arbeid',
    !draft.competence.trim() && 'kompetanse',
    Number.isNaN(quantity) && 'mengde som kan leses',
    wrongUnit && `mengde i ${type!.unit}`,
    !(assembly > 0) && !(dismantle > 0) && 'timer',
    (Number.isNaN(assembly) || Number.isNaN(dismantle)) && 'timer som kan leses',
  ].filter((what): what is string => !!what)

  const add = () => {
    if (missing.length) {
      ;(!draft.work.trim() ? workRef : !draft.competence.trim() ? compRef : assemblyRef).current?.focus()
      return
    }
    const n = targetHalls.length
    onAdd(
      targetHalls.map((hall, index) => ({
        id: `manual-${crypto.randomUUID()}`,
        projectNo: ctx.projectNo,
        projectName,
        source: OWN_SOURCE,
        workType: draft.work.trim(),
        quantity: quantity === null ? null : quantity / n,
        unit,
        stand: '',
        hall,
        competence: draft.competence.trim(),
        basis: draft.planned ? PLANNED_BASIS : DRAFT_BASIS,
        assemblyHours: assembly / n,
        dismantleHours: dismantle / n,
        comment: draft.comment.trim(),
        avdeling: ctx.avdeling,
        origin: 'manual' as const,
        ...(index === 0 && draft.replaces ? { replaces: draft.replaces } : {}),
        // A team stays whole on one line; shared out on several halls, the line has its hours only.
        ...(n === 1 && typedAssembly?.crew ? { assemblyCrew: typedAssembly.crew } : {}),
        ...(n === 1 && typedDismantle?.crew ? { dismantleCrew: typedDismantle.crew } : {}),
      })),
    )
  }

  // What the line does to the Kalender: the row of its phase, hall, competence and avd., before and after, and its FTE a day over the hall's days.
  const preview = (() => {
    if (!ctx.projectNo || !draft.competence.trim() || !draft.planned) return []
    return targetHalls.flatMap((hall) =>
      (
        [
          ['Montering', assembly, 'assemblyHours', 'assembly'],
          ['Demontering', dismantle, 'dismantleHours', 'dismantle'],
        ] as const
      )
        .filter(([, added]) => added > 0)
        .map(([phase, added, field, span]) => {
          const place = placeIn(hall, ctx.projectNo)
          const before = locatedDemand
            .filter((l) => l.projectNo === ctx.projectNo && l.basis === PLANNED_BASIS && l.hall === place && competenceKey(l.competence) === competenceKey(draft.competence) && (l.avdeling ?? '') === ctx.avdeling)
            .reduce((sum, l) => sum + l[field], 0)
          const days = booked.get(hall)?.[span]
          const share = added / targetHalls.length
          const wd = days ? workdays(days) : null
          return { key: `${hall}|${phase}`, phase, place, share, before, wd, fte: wd ? (before + share) / (wd * hoursPerDay) : null }
        }),
    )
  })()

  const hallShown = split ? `Fordelt på ${bookedHalls.length}` : ctx.hall === '' ? 'Uten hall' : ctx.hall
  const spans = !split && booked.get(ctx.hall)
  const pickWork = (work: string) => {
    const picked = kpi.workTypes.find((t) => t.productType === work)
    if (picked) {
      onDraft({ ...draft, work, unit: picked.unit, competence: picked.competence || draft.competence, assembly: '', dismantle: '' })
      requestAnimationFrame(() => qtyRef.current?.focus())
    } else {
      onDraft({ ...draft, work, competence: usedBefore.get(work) ?? draft.competence })
      requestAnimationFrame(() => assemblyRef.current?.focus())
    }
  }
  const hint = (typed: ReturnType<typeof parseHours>, fromKpi: number | null) =>
    typed?.read ? (Number.isNaN(typed.hours) ? (typed.noQuantity ? 'mengde?' : '?') : `= ${hours(typed.hours)} t`) : !typed && fromKpi !== null ? 'KPI' : ''

  return (
    <section
      className="own-form"
      aria-label="Ny linje"
      onKeyDown={(e) => {
        const target = e.target as HTMLElement
        // A key a field's list took is the field's own: Enter on a value picks it, and Esc closes the list before it empties the form.
        if (e.defaultPrevented || target.tagName !== 'INPUT') return
        if (e.key === 'Enter') {
          e.preventDefault()
          add()
        } else if (e.key === 'Escape' && target.getAttribute('aria-expanded') !== 'true') onDraft({ ...EMPTY_DRAFT, planned: draft.planned })
      }}
    >
      <div className="own-context">
        <div className="crumbs">
          <SplitPick
            className="crumb"
            label="Prosjekt"
            value={projectName || undefined}
            missing="Velg prosjekt"
            head="Prosjekt · etter oppbygging"
            groups={projectGroups}
            onPick={(no) => {
              onProject(no)
              requestAnimationFrame(() => hallRef.current?.focus())
            }}
          />
        </div>
        <div className="own-window">
          {spans && (
            <>
              {spans.assembly && (
                <span>
                  <i className="phase-swatch mon" aria-hidden />
                  Opp {spanText(spans.assembly)} <small>{workdays(spans.assembly)} d</small>
                </span>
              )}
              {spans.dismantle && (
                <span>
                  <i className="phase-swatch dem" aria-hidden />
                  Ned {spanText(spans.dismantle)} <small>{workdays(spans.dismantle)} d</small>
                </span>
              )}
            </>
          )}
          {ctx.projectNo && split && <span className="muted">Deles likt på {bookedHalls.join(', ')}, én linje per hall</span>}
          {ctx.projectNo && ctx.hall === '' && <span className="warn-text">Teller ikke i Kalender før linjen har en hall</span>}
          {ctx.projectNo && ctx.hall && !split && !spans && <span className="muted">{ctx.hall} er ikke booket av prosjektet</span>}
          {!ctx.projectNo && <span className="muted">Prosjekt, hall og avdeling blir stående mellom linjene</span>}
        </div>
      </div>
      <div className="own-work">
        <label className="own-field hall">
          <span>Hall</span>
          <ChoiceField
            ref={hallRef}
            shown={ctx.projectNo ? hallShown : ''}
            current={split ? SPLIT_HALLS : ctx.hall === '' ? NO_HALL : ctx.hall}
            disabled={!ctx.projectNo}
            head={`Hall · ${projectName}`}
            groups={[
              {
                label: bookedHalls.length ? `Booket av ${projectName}` : `${projectName} har ingen booking`,
                items: bookedHalls.map((hall) => {
                  const days = booked.get(hall)!
                  return { value: hall, note: [days.assembly && `Opp ${spanText(days.assembly)}`, days.dismantle && `Ned ${spanText(days.dismantle)}`].filter(Boolean).join(' · ') }
                }),
              },
              ...(bookedHalls.length > 1 ? [{ items: [{ value: SPLIT_HALLS, label: `Fordel på ${bookedHalls.join(', ')}`, note: 'deler timene likt' }] }] : []),
              { label: 'Andre steder', hint: 'ikke booket', items: places.filter((place) => !booked.has(place)).map((place) => ({ value: place })) },
              { items: [{ value: NO_HALL, label: 'Uten hall', note: 'teller ikke før den har en hall' }] },
            ]}
            onPick={(value) => {
              onContext({ ...ctx, hall: value === NO_HALL ? '' : value })
              requestAnimationFrame(() => avdRef.current?.focus())
            }}
          />
        </label>
        <label className="own-field avdeling">
          <span>Avd.</span>
          <ChoiceField
            ref={avdRef}
            shown={ctx.avdeling}
            current={ctx.avdeling}
            disabled={!ctx.projectNo}
            groups={[
              { label: 'Brukt i prosjektets Visma-linjer', items: avdelinger.filter((a) => a.note).map((a) => ({ value: a.value, note: a.note })) },
              { label: 'Andre', items: avdelinger.filter((a) => !a.note).map((a) => ({ value: a.value })) },
            ]}
            onPick={(avdeling) => {
              onContext({ ...ctx, avdeling })
              requestAnimationFrame(() => workRef.current?.focus())
            }}
          />
        </label>
        <label className="own-field work">
          <span>Arbeid</span>
          <PickField
            ref={workRef}
            value={draft.work}
            onChange={(work) => set({ work })}
            onPick={pickWork}
            groups={[
              { label: 'Arbeidstyper fra KPI', hint: 'timer regnes fra mengde', items: kpi.workTypes.map((t) => kpiTypeItem(t, competenceColor)) },
              {
                label: 'Brukt før',
                items: [...usedBefore].filter(([work]) => !kpi.workTypes.some((t) => productTypeKey(t.productType) === productTypeKey(work))).map(([work, competence]) => ({ value: work, note: competence, dot: competenceColor(competence) })),
              },
            ]}
            placeholder="Hva skal gjøres?"
          />
        </label>
        <label className="own-field quantity">
          <span>Mengde</span>
          <span className="own-pair">
            <input
              ref={qtyRef}
              value={draft.quantity}
              placeholder="–"
              onChange={(e) => set({ quantity: e.target.value })}
              // A unit typed after the number goes to its own field once the field is left.
              onBlur={() => typedUnit && !wrongUnit && !Number.isNaN(quantity) && set({ quantity: decimalText(quantity!), ...(type ? {} : { unit: typedUnit }) })}
            />
            {(wrongUnit || Number.isNaN(quantity)) && <em className="bad">{wrongUnit ? type!.unit : '?'}</em>}
            <input className="unit" value={type?.unit ?? typedUnit ?? draft.unit} placeholder="enh." readOnly={!!type} tabIndex={type ? -1 : 0} aria-label="Enhet" onChange={(e) => set({ unit: e.target.value })} />
          </span>
        </label>
        <label className="own-field hours">
          <span>
            <i className="phase-swatch mon" aria-hidden />
            Montering
          </span>
          <span className="own-pair">
            <input ref={assemblyRef} value={draft.assembly} placeholder={autoAssembly !== null ? hours(autoAssembly) : 't'} onChange={(e) => set({ assembly: e.target.value })} />
            <em className={typedAssembly && Number.isNaN(typedAssembly.hours) ? 'bad' : ''}>{hint(typedAssembly, autoAssembly)}</em>
          </span>
        </label>
        <label className="own-field hours">
          <span>
            <i className="phase-swatch dem" aria-hidden />
            Demontering
          </span>
          <span className="own-pair">
            <input value={draft.dismantle} placeholder={autoDismantle !== null ? hours(autoDismantle) : 't'} onChange={(e) => set({ dismantle: e.target.value })} />
            <em className={typedDismantle && Number.isNaN(typedDismantle.hours) ? 'bad' : ''}>{hint(typedDismantle, autoDismantle)}</em>
          </span>
        </label>
        <label className="own-field competence">
          <span>Kompetanse</span>
          <PickField
            ref={compRef}
            value={draft.competence}
            onChange={(competence) => set({ competence })}
            // A competence picked from the list is the last of the line: the focus goes to «Legg til», so Enter saves it.
            onPick={(competence) => (set({ competence }), requestAnimationFrame(() => addRef.current?.focus()))}
            // So does Tab, with a competence picked or already there: Grunnlag stays as it is between lines, and is reached with Shift+Tab.
            onKeyDown={(e) => {
              if (e.key !== 'Tab' || e.shiftKey) return
              e.preventDefault()
              addRef.current?.focus()
            }}
            options={competences}
            placeholder="–"
          />
        </label>
        <span className="own-field basis">
          <span>Grunnlag</span>
          <Segmented
            label="Grunnlag"
            value={draft.planned ? 'planned' : 'draft'}
            onChange={(value) => set({ planned: value === 'planned' })}
            options={[
              { value: 'planned', label: PLANNED_BASIS, title: 'Teller i behovet og gir rader i Kalender' },
              { value: 'draft', label: DRAFT_BASIS, title: 'Lagres, men teller ikke i Kalender ennå' },
            ]}
          />
        </span>
        <button ref={addRef} className="primary own-add" title={missing.length ? `Mangler ${missing.join(', ')}` : 'Legg til (Enter)'} onClick={add}>
          {split && bookedHalls.length > 1 ? `Legg til ${bookedHalls.length}` : 'Legg til'} <CornerDownLeft size={13} aria-hidden />
        </button>
      </div>
      <div className="own-foot">
        <input className="own-comment" placeholder="Kommentar (valgfri)" aria-label="Kommentar" value={draft.comment} onChange={(e) => set({ comment: e.target.value })} />
        <div className="own-preview">
          {draft.from && (
            <span className="own-from">
              <History size={13} aria-hidden />
              {draft.from}
              {draft.replaces && (
                <button className="ghost icon-button" title="Ikke koble linjen til Visma-linjen" aria-label="Ikke koble til Visma-linjen" onClick={() => set({ replaces: undefined, from: undefined })}>
                  <X size={12} aria-hidden />
                </button>
              )}
            </span>
          )}
          {!draft.planned && draft.competence ? (
            <span className="muted">{DRAFT_BASIS}: lagres på prosjektet, men gir ingen timer i Kalender før du setter den til {PLANNED_BASIS}.</span>
          ) : preview.length > 0 ? (
            preview.map((p) => (
              <span key={p.key} className="own-preview-item">
                <i className={`phase-swatch ${p.phase === 'Montering' ? 'mon' : 'dem'}`} aria-hidden />
                <b>
                  {p.phase} · {p.place} · {draft.competence}
                  {ctx.avdeling ? ` · avd. ${ctx.avdeling}` : ''}
                </b>
                <span className="num">+{hours(p.share)} t</span>
                <span className="muted">
                  {p.before ? `raden ${hours(p.before)} → ${hours(p.before + p.share)} t` : 'ny rad'}
                  {p.fte !== null && ` · ≈ ${formatFte(p.fte, 1)} FTE/dag over ${p.wd} d`}
                </span>
              </span>
            ))
          ) : (
            <span className="muted">
              Timer kan skrives som <code>12</code> <code>3p 2d</code> <code>2p 6t</code> <code>4d</code> <code>10/t</code>
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

interface ChoiceProps {
  /** What the field shows while nothing is typed in it. */
  shown: string
  /** The value in bold in the list. */
  current: string
  groups: PickGroup[]
  head?: string
  disabled?: boolean
  onPick: (value: string) => void
  ref?: Ref<HTMLInputElement>
}

/** A field of the line that takes one of its values only: what is typed searches the list, and is dropped when the field is left. */
function ChoiceField({ shown, current, groups, head, disabled, onPick, ref }: ChoiceProps) {
  const [text, setText] = useState<string | null>(null)
  return (
    <PickField
      ref={ref}
      value={text ?? shown}
      current={current}
      onChange={setText}
      onPick={(value) => (setText(null), onPick(value))}
      onBlur={() => setText(null)}
      onCancel={() => setText(null)}
      groups={groups}
      head={head}
      disabled={disabled}
      placeholder="–"
    />
  )
}
