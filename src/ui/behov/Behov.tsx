import { useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { EMPTY_KPI } from '../../domain/kpi'
import { lineRef } from '../../domain/visma'
import { reviewVisma, type ReviewedLine } from '../../domain/vismaReview'
import { readVismaExport } from '../../import/vismaExport'
import { usePref } from '../../store/prefs'
import { useWorkspace } from '../../store/workspaceStore'
import { MessageBanner, PanelToggle, Segmented, UndoRedoButtons, type Message } from '../common'
import { count } from '../dom'
import { hours } from '../format'
import { errorText, takeFiles } from '../files'
import { EgenView, type ReplaceSeed } from './EgenView'
import { HoursSummary } from './HoursSummary'
import { ProjectRail, type RailSection } from './ProjectRail'
import { usePlacing } from './usePlacing'
import { useProjectList } from './useProjectList'
import { VismaView } from './VismaView'

/** The two sources of demand Behov governs, a view each. */
type View = 'visma' | 'egen'

interface Props {
  projectNo: string
  onProjectChange: (projectNo: string) => void
  onOpenSetup: () => void
  /** Opens the page of the rules that place Hall/Sted in a hall. */
  onOpenRules: () => void
}

/** The demand: the Visma lines to go through, and the planner's own lines, behind one switch in the page header. */
export function Behov({ projectNo, onProjectChange, onOpenSetup, onOpenRules }: Props) {
  const { workspace, importVisma, setLineOverride } = useWorkspace()
  const ws = workspace!
  const [view, setView] = usePref<View>('behovView', 'visma', (stored) => (stored === 'egen' ? 'egen' : 'visma'))
  const [message, setMessage] = useState<Message | null>(null)
  const [seed, setSeed] = useState<ReplaceSeed | null>(null)
  // The panel that slides in from the right: «Avklar» in the Visma view, or the hours per competence and basis.
  const [panel, setPanel] = useState<'avklar' | 'summary' | null>(null)
  const vismaInput = useRef<HTMLInputElement>(null)
  const placing = usePlacing()
  const { halls, rules } = placing
  const list = useProjectList(placing.spans)
  const names = list.names

  // Every project's Visma lines, with where each stands: the rail, the filter and the count in the switch read from this.
  const review = useMemo(() => reviewVisma(ws.visma ?? [], ws.kpi ?? EMPTY_KPI, ws.overrides ?? {}, halls, rules), [ws.visma, ws.kpi, ws.overrides, halls, rules])
  const need = useMemo(() => [...review.values()].reduce((n, project) => n + project.need, 0), [review])

  // The projects down the left, the same in both views: in Visma what needs the planner, in Egen registrering the own hours.
  const needMark = (n: number) =>
    n ? (
      <span className="count-chip alert" title={`${count(n, 'linje', 'linjer')} trenger avklaring`}>
        {n}
      </span>
    ) : (
      <Check size={14} className="rail-done" aria-label="Ingenting å avklare" />
    )
  const sections: RailSection[] = list.groups.map((group) => ({
    heading: group.heading,
    items: group.projects.map(([no, name]) => {
      const t = list.timing.get(no)
      const visma = review.get(no)
      const own = list.ownHours.get(no)
      const none = view === 'visma' && !visma
      return {
        projectNo: no,
        name,
        off: none,
        aside: view === 'visma' ? visma && needMark(visma.need) : own && <span className="count">{hours(own.hours)} t</span>,
        sub: (t || none) && (
          <>
            {t && <span className={`timing ${t.tone}`}>{t.text}</span>}
            {none && `${t ? ' · ' : ''}ingen utskrift`}
          </>
        ),
      }
    }),
  }))

  /** Erstatt: the Visma line is left out, and Egen registrering opens with a line filled in from it. */
  const replace = (line: ReviewedLine) => {
    setLineOverride(line.projectNo, line.key, { excluded: true, ref: lineRef(line) })
    setSeed({ key: line.key, projectNo: line.projectNo, hall: line.place, avdeling: line.avdeling, workType: line.workType, quantity: line.quantity, unit: line.unit, competence: line.competence, assemblyHours: line.assemblyHours, dismantleHours: line.dismantleHours })
    setView('egen')
    setMessage({ kind: 'ok', text: `${line.workType} i ${line.place} er utelatt. Fyll ut linjen som erstatter den. Kan angres med Ctrl/Cmd+Z.` })
  }

  const onVismaFiles = async (files: File[]) => {
    if (!files.length) return
    try {
      const done: string[] = []
      for (const file of files) {
        const imported = importVisma(readVismaExport(new Uint8Array(await file.arrayBuffer())), file.name)
        // One project is opened; an export with several lands on the list of them all.
        if (imported.length) onProjectChange(imported.length === 1 ? imported[0] : '')
        done.push(`Visma-linjene for ${imported.join(', ')} er erstattet med ${file.name}. Kan angres med Ctrl/Cmd+Z.`)
      }
      setView('visma')
      setMessage({ kind: 'ok', text: done.join(' ') })
    } catch (e) {
      setMessage({ kind: 'error', text: errorText(e) })
    }
  }

  return (
    <div className="behov behov-page">
      <div className="page-head mode-band">
        <h2>Behov</h2>
        <Segmented
          label="Kilde"
          value={view}
          onChange={(next) => (setView(next), setPanel(panel === 'avklar' ? null : panel))}
          options={[
            {
              value: 'visma',
              label: <>Visma · gjennomgang {need > 0 && <span className="count-chip alert">{need}</span>}</>,
              title: 'Behovet regnet fra ordrelinjene i Visma: avklar det som mangler, eller utelat linjer',
            },
            { value: 'egen', label: <>Egen registrering <span className="count">{list.own.length}</span></>, title: 'Arbeid som ikke er solgt gjennom Visma' },
          ]}
        />
        <span className="toolbar-gap" />
        <UndoRedoButtons />
        <PanelToggle open={panel === 'summary'} what="timer per kompetanse" hint="timene til prosjektet per kompetanse og grunnlag, som radene i Kalender henter behov fra" disabled={!projectNo} onToggle={() => setPanel(panel === 'summary' ? null : 'summary')} />
        <button className="ghost" onClick={onOpenRules} title="Reglene som plasserer Hall/sted i en hall: steder som står for flere haller, ord som betyr en hall, og valgene du har gjort for enkelte tekster.">
          Hallregler
        </button>
        {view === 'visma' && (
          <button className="primary" onClick={() => vismaInput.current?.click()}>
            Importer Visma-utskrift
          </button>
        )}
        <input ref={vismaInput} type="file" accept=".xlsx" hidden onChange={(e) => takeFiles(e, onVismaFiles)} />
      </div>
      <MessageBanner message={message} onClose={() => setMessage(null)} />
      <div className="behov-stage">
        <div className="behov-split">
          <ProjectRail
            all={{ label: 'Alle prosjekter', aside: view === 'visma' ? review.size > 0 && needMark(need) : <span className="count">{list.own.length}</span> }}
            sections={sections}
            projectNo={projectNo}
            onPick={onProjectChange}
          />
          {view === 'visma' ? (
            <VismaView projectNo={projectNo} onProjectChange={onProjectChange} onOpenSetup={onOpenSetup} review={review} names={names} onMessage={setMessage} onReplace={replace} placing={placing} avklar={panel === 'avklar'} onAvklar={(open) => setPanel(open ? 'avklar' : null)} />
          ) : (
            <EgenView placing={placing} projects={list} projectNo={projectNo} onProjectChange={onProjectChange} seed={seed} onSeedUsed={() => setSeed(null)} onMessage={setMessage} />
          )}
        </div>
        {panel === 'summary' && projectNo && <HoursSummary projectNo={projectNo} projectName={names.get(projectNo) ?? projectNo} onClose={() => setPanel(null)} />}
      </div>
    </div>
  )
}
