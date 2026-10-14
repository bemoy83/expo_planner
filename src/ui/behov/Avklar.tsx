import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, CornerDownLeft } from 'lucide-react'
import { formatFte } from '../../domain/calc'
import { EMPTY_KPI, setRate, withTextType } from '../../domain/kpi'
import { PROJECT_HALLS, withPhrase } from '../../domain/locations'
import { parseDecimal } from '../../domain/numbers'
import { causeGroups, type CauseGroup, type ReviewedLine } from '../../domain/vismaReview'
import { useWorkspace } from '../../store/workspaceStore'
import { Segmented, SidePanel } from '../common'
import { count, isTyping } from '../dom'
import { SplitPick } from './SplitPick'
import { usePlacing } from './usePlacing'

type Tab = 'hall' | 'type' | 'rate'
type Scope = 'text' | 'project' | 'rule'

interface Props {
  /** The Visma lines in scope: the project's, or every project's. */
  lines: ReviewedLine[]
  names: Map<string, string>
  /** The lines of the group in focus, which the table lights while the rest are dimmed; null for none. */
  onFocusLines: (keys: Set<string> | null) => void
  /** The offers of the whole scope, taken in one go, and how many there are. */
  offerCount: number
  onTakeOffers: () => void
  onClose: () => void
}

/**
 * «Avklar»: the lines that need the planner resolved by cause, not line by line. One card per Hall/Sted text, per article
 * text without a product type and per product type without a rate; the card in focus lights its lines in the table.
 * ↑ and ↓ (or j and k) move between the cards, Enter takes what the card offers, Esc closes.
 */
export function Avklar({ lines, names, onFocusLines, offerCount, onTakeOffers, onClose }: Props) {
  const groups = causeGroups(lines)
  const tabs = (
    [
      ['hall', 'Plassering', groups.hall],
      ['type', 'Arbeidstype', groups.type],
      ['rate', 'Sats', groups.rate],
    ] as const
  ).filter(([, , found]) => found.length > 0)
  const [tab, setTab] = useState<Tab>(tabs[0]?.[0] ?? 'hall')
  const shown = tabs.find(([key]) => key === tab) ?? tabs[0]
  const cards: CauseGroup[] = shown ? [...shown[2]] : []
  const [active, setActive] = useState<string | null>(null)
  const activeKey = cards.some((card) => card.key === active) ? active : (cards[0]?.key ?? null)
  const left = lines.filter((line) => line.status === 'need').length
  const [atStart] = useState(left)
  const done = Math.max(0, atStart - left)

  // The table lights the lines of the card in focus.
  // Line keys hold «|», so they are joined by a line break.
  const lit = cards.find((card) => card.key === activeKey)?.lines.map((line) => line.key).join('\n') ?? ''
  useEffect(() => {
    onFocusLines(lit ? new Set(lit.split('\n')) : null)
  }, [lit, onFocusLines])
  useEffect(() => () => onFocusLines(null), [onFocusLines])

  const keys = useRef({ cards, activeKey, onClose })
  useEffect(() => {
    keys.current = { cards, activeKey, onClose }
  })
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const { cards, activeKey, onClose } = keys.current
      const at = cards.findIndex((card) => card.key === activeKey)
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        if (cards[at + 1]) setActive(cards[at + 1].key)
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        if (cards[at - 1]) setActive(cards[at - 1].key)
      } else if (e.key === 'Enter') {
        const accept = document.querySelector<HTMLButtonElement>('.cause.active .cause-accept:not(:disabled)')
        if (accept) {
          e.preventDefault()
          accept.click()
        }
      } else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const projectNames = (card: CauseGroup) => card.projects.map((no) => names.get(no) ?? no).join(', ')
  return (
    <SidePanel
      label="Avklar"
      className="avklar"
      closeTitle="Lukk (Esc)"
      onClose={onClose}
      head={
        <>
          <div className="insp-title">Avklar</div>
          <div className="insp-sub">
            {left ? `${count(left, 'linje gjenstår', 'linjer gjenstår')}` : 'Alt er avklart'}
            {done > 0 && ` · ${done} avklart nå`}
          </div>
          <span className="rail-bar avklar-progress" aria-hidden>
            <i style={{ width: `${atStart ? Math.round((done / atStart) * 100) : 100}%` }} />
          </span>
        </>
      }
    >
      {tabs.length > 0 ? (
        <>
          <div className="avklar-tabs">
            <Segmented
              label="Hva som mangler"
              value={shown![0]}
              onChange={(next) => (setTab(next), setActive(null))}
              options={tabs.map(([key, label, found]) => ({ value: key, label: <>{label} <span className="count-chip alert">{found.length}</span></> }))}
            />
          </div>
          <div className="insp-body avklar-list">
            {cards.map((card) => {
              const props = { card, active: card.key === activeKey, onFocus: () => setActive(card.key), projects: projectNames(card) }
              return shown![0] === 'hall' ? <HallCard key={card.key} {...props} /> : shown![0] === 'type' ? <TypeCard key={card.key} {...props} /> : <RateCard key={card.key} {...props} />
            })}
          </div>
          <div className="avklar-foot">
            <span className="muted small">
              <kbd>↑</kbd>
              <kbd>↓</kbd> neste · <kbd>↵</kbd> bruk
            </span>
            <span className="toolbar-gap" />
            {offerCount > 0 && (
              <button className="ghost" onClick={onTakeOffers}>
                <Check size={14} aria-hidden /> Bruk alle {count(offerCount, 'forslag', 'forslag')}
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="insp-body avklar-done">
          <span className="avklar-ok">
            <Check size={18} aria-hidden />
          </span>
          <b>Ingenting å avklare</b>
          <span className="muted">Alle linjer har arbeidstype, sats og plassering, og er med i behovet.</span>
          <button onClick={onClose}>Lukk</button>
        </div>
      )}
    </SidePanel>
  )
}

interface CardProps {
  card: CauseGroup
  active: boolean
  onFocus: () => void
  /** The names of its projects. */
  projects: string
}

/** The frame of a card: its title and figures, what it is, and when it is in focus, how to resolve it. */
function Card({ active, onFocus, title, figures, sub, children }: { active: boolean; onFocus: () => void; title: string; figures: string; sub: string; children: ReactNode }) {
  return (
    <div className={`cause ${active ? 'active' : ''}`} onClick={onFocus} onFocus={onFocus}>
      <div className="cause-head">
        <b>{title}</b>
        <span className="cause-figures">{figures}</span>
      </div>
      <div className="cause-sub">{sub}</div>
      {active && (
        <div className="cause-body" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  )
}

/** One Hall/Sted text: a hall for the text, for each project apart, or a rule for words that places the next export too. */
function HallCard({ card, active, onFocus, projects }: CardProps) {
  const { workspace, setHallChoice, setHallRules } = useWorkspace()
  const { booked, places, offersFor } = usePlacing()
  const [scope, setScope] = useState<Scope>('text')
  const [phrase, setPhrase] = useState(card.text.toLowerCase())
  const offers = offersFor(card.lines)
  const offer = offers.length === 1 ? offers[0] : null
  const multi = card.projects.length > 1
  const halls = (nos: string[]) => [...new Set(nos.flatMap((no) => booked.get(no) ?? []))]
  const apply = (hall: string, projectNo?: string) => {
    if (card.blank) for (const no of projectNo ? [projectNo] : card.projects) setHallChoice('', hall, no)
    else if (scope === 'rule') setHallRules(withPhrase(workspace!.hallRules, phrase, hall))
    else setHallChoice(card.text, hall, scope === 'project' ? projectNo : undefined)
  }
  const chips = (projectNo?: string) => {
    const own = halls(projectNo ? [projectNo] : card.projects)
    return (
      <div className="cause-chips">
        {own.length > 0 && (
          <span className="split">
            {own.map((hall) => (
              <button key={hall} onClick={() => apply(hall, projectNo)}>
                {offer?.hall === hall && !projectNo && <Check size={12} aria-hidden />}
                {hall}
              </button>
            ))}
          </span>
        )}
        <SplitPick label="Annen plassering" missing="Annen" className="cause-more" plain options={places} onPick={(hall) => apply(hall, projectNo)} />
      </div>
    )
  }
  const reason = offer ? (offer.projectNo ? `prosjektet har bare ${offer.hall}` : offer.hall === PROJECT_HALLS ? 'teksten nevner flere haller' : `teksten nevner ${offer.hall}`) : 'ingen regel passer'
  return (
    <Card active={active} onFocus={onFocus} title={card.blank ? 'Uten Hall/sted' : `«${card.text}»`} figures={count(card.lines.length, 'linje', 'linjer')} sub={`${projects} · ${offer ? `forslag: ${reason}` : reason}`}>
      {offer && (
        <button className="primary cause-accept" onClick={() => setHallChoice(offer.text, offer.hall, offer.projectNo)}>
          <Check size={13} aria-hidden /> Bruk {offer.hall} <CornerDownLeft size={12} aria-hidden />
        </button>
      )}
      {!card.blank && (
        <Segmented
          label="Gjelder"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'text', label: 'Teksten', title: `Alle linjer med «${card.text}», i alle prosjekter` },
            ...(multi ? [{ value: 'project' as const, label: 'Per prosjekt', title: 'Hvert prosjekt får sitt eget valg' }] : []),
            { value: 'rule', label: 'Lag regel', title: 'En regel for ord under Hallregler: plasserer også neste utskrift' },
          ]}
        />
      )}
      {scope === 'rule' && !card.blank && (
        <label className="cause-rule">
          <span>Tekster som inneholder</span>
          <input value={phrase} onChange={(e) => setPhrase(e.target.value)} />
          <small className="muted">Gjelder også neste utskrift og andre tekster med ordene.</small>
        </label>
      )}
      {scope === 'project' && multi
        ? card.projects.map((no) => (
            <div key={no} className="cause-project">
              <span>
                {projects.split(', ')[card.projects.indexOf(no)]} <small className="muted">{count(card.lines.filter((line) => line.projectNo === no).length, 'linje', 'linjer')}</small>
              </span>
              {chips(no)}
            </div>
          ))
        : chips()}
      <div className="cause-hint muted">
        {card.blank ? 'Gjelder linjene uten Hall/sted i prosjektet.' : scope === 'text' ? `Gjelder alle linjer med «${card.text}», i alle prosjekter.` : scope === 'project' ? 'Hvert prosjekt får sitt eget valg.' : 'Blir en regel under Hallregler.'}
      </div>
    </Card>
  )
}

/** One article text without a product type: the KPI type its lines are counted as. */
function TypeCard({ card, active, onFocus, projects }: CardProps) {
  const { workspace, setLineOverrides, setKpi } = useWorkspace()
  const kpi = workspace!.kpi ?? EMPTY_KPI
  // A type can be remembered for a text where the lines have one text: then the next export is read with it.
  const texts = [...new Set(card.lines.flatMap((line) => line.texts))]
  const [remember, setRemember] = useState(true)
  const offered = card.lines.every((line) => line.suggestedType && line.suggestedType === card.lines[0].suggestedType) ? card.lines[0].suggestedType : undefined
  const competence = (type: string) => kpi.workTypes.find((t) => t.productType === type)?.competence ?? ''
  const apply = (workType: string) =>
    texts.length === 1 && remember
      ? setKpi(withTextType(kpi, texts[0], workType))
      : setLineOverrides(
          card.projects,
          card.lines.map((line) => ({ key: line.key, patch: { workType, ref: { avdeling: line.avdeling, workType: line.sourceWorkType, hall: line.hall } } })),
        )
  return (
    <Card active={active} onFocus={onFocus} title={card.text ? `«${card.text}»` : 'Uten tekst'} figures={count(card.lines.length, 'linje', 'linjer')} sub={`${projects} · uten produkttype i Visma`}>
      {offered && (
        <button className="primary cause-accept" onClick={() => apply(offered)}>
          <Check size={13} aria-hidden /> Bruk {offered} <small>{competence(offered)}</small> <CornerDownLeft size={12} aria-hidden />
        </button>
      )}
      <div className="cause-chips">
        <SplitPick
          label="Arbeidstype"
          missing="Velg arbeidstype"
          className="cause-more"
          plain
          options={kpi.workTypes.map((t) => t.productType)}
          note={(type) => {
            const t = kpi.workTypes.find((w) => w.productType === type)
            return t ? [t.unit, t.competence].filter(Boolean).join(' · ') : ''
          }}
          onPick={apply}
        />
      </div>
      {texts.length === 1 && (
        <label className="check cause-remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Husk for «{texts[0]}» i neste utskrift
        </label>
      )}
      <div className="cause-hint muted">{texts.length === 1 && remember ? 'Blir en regel under KPI: linjer med teksten regnes som typen, også i neste utskrift.' : 'Timene regnes fra antall og KPI-sats når typen er valgt.'}</div>
    </Card>
  )
}

/** One product type and unit without a rate: the rate written to KPI, which counts every line of it. */
function RateCard({ card, active, onFocus, projects }: CardProps) {
  const { workspace, setKpi } = useWorkspace()
  const [assembly, setAssembly] = useState('')
  const [dismantle, setDismantle] = useState('')
  const a = parseDecimal(assembly) ?? 0
  const d = parseDecimal(dismantle) ?? 0
  const ok = a > 0 || d > 0
  const hours = (a ? card.quantity / a : 0) + (d ? card.quantity / d : 0)
  const save = () => ok && setKpi(setRate(workspace!.kpi ?? EMPTY_KPI, card.workType, card.unit, { assembly: a, dismantle: d }))
  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && save()
  return (
    <Card active={active} onFocus={onFocus} title={`${card.workType} · ${card.unit}`} figures={`${count(card.lines.length, 'linje', 'linjer')} · ${formatFte(card.quantity, 1)} ${card.unit}`} sub={`${projects} · KPI mangler sats for enheten`}>
      <div className="cause-rates">
        <label>
          <span>
            <i className="phase-swatch assembly" aria-hidden />
            Montering
          </span>
          <input inputMode="decimal" placeholder="–" value={assembly} onChange={(e) => setAssembly(e.target.value)} onKeyDown={onEnter} />
          <small className="muted">{card.unit} per time</small>
        </label>
        <label>
          <span>
            <i className="phase-swatch dismantle" aria-hidden />
            Demontering
          </span>
          <input inputMode="decimal" placeholder="–" value={dismantle} onChange={(e) => setDismantle(e.target.value)} onKeyDown={onEnter} />
          <small className="muted">{card.unit} per time</small>
        </label>
        <div className="cause-calc">
          <b>{ok ? formatFte(hours, 1) : '–'} t</b>
          <small className="muted">gir linjene</small>
        </div>
      </div>
      <button className="primary cause-accept" disabled={!ok} onClick={save}>
        <Check size={13} aria-hidden /> Lagre sats på KPI <CornerDownLeft size={12} aria-hidden />
      </button>
    </Card>
  )
}
