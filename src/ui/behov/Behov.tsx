import { useMemo, useRef, useState } from 'react'
import { EMPTY_KPI } from '../../domain/kpi'
import { isVismaLine } from '../../domain/visma'
import { reviewVisma } from '../../domain/vismaReview'
import { readVismaExport } from '../../import/vismaExport'
import { usePref } from '../../store/prefs'
import { useWorkspace } from '../../store/workspaceStore'
import { MessageBanner, Segmented, UndoRedoButtons, type Message } from '../common'
import { errorText, takeFiles } from '../files'
import { EgenView } from './EgenView'
import { usePlacing } from './usePlacing'
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
  const { workspace, importVisma } = useWorkspace()
  const ws = workspace!
  const [view, setView] = usePref<View>('behovView', 'visma', (stored) => (stored === 'egen' ? 'egen' : 'visma'))
  const [message, setMessage] = useState<Message | null>(null)
  const vismaInput = useRef<HTMLInputElement>(null)
  const { halls, rules } = usePlacing()

  /** The projects that have demand or planning rows, by name. */
  const projects = useMemo(() => {
    const names = new Map<string, string>()
    for (const p of ws.projects) if (!names.has(p.projectNo)) names.set(p.projectNo, p.name)
    for (const r of ws.allocations) if (r.projectNo) names.set(r.projectNo, r.projectName)
    for (const v of ws.visma ?? []) if (!names.has(v.projectNo)) names.set(v.projectNo, v.eventName)
    const withData = new Set([...ws.demand.map((l) => l.projectNo), ...ws.allocations.map((r) => r.projectNo)])
    return [...names].filter(([no]) => withData.has(no)).sort((a, b) => a[1].localeCompare(b[1], 'nb'))
  }, [ws.projects, ws.allocations, ws.visma, ws.demand])
  const names = useMemo(() => {
    const names = new Map(projects)
    for (const v of ws.visma ?? []) if (!names.has(v.projectNo)) names.set(v.projectNo, v.eventName)
    return names
  }, [projects, ws.visma])
  // Every project's Visma lines, with where each stands: the rail, the filter and the count in the switch read from this.
  const review = useMemo(() => reviewVisma(ws.visma ?? [], ws.kpi ?? EMPTY_KPI, ws.overrides ?? {}, halls, rules), [ws.visma, ws.kpi, ws.overrides, halls, rules])
  const need = useMemo(() => [...review.values()].reduce((n, project) => n + project.need, 0), [review])
  const ownCount = useMemo(() => ws.demand.filter((line) => !isVismaLine(line)).length, [ws.demand])

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
          onChange={setView}
          options={[
            {
              value: 'visma',
              label: <>Visma · gjennomgang {need > 0 && <span className="count-chip alert">{need}</span>}</>,
              title: 'Behovet regnet fra ordrelinjene i Visma: avklar det som mangler, eller utelat linjer',
            },
            { value: 'egen', label: <>Egen registrering <span className="count">{ownCount}</span></>, title: 'Arbeid som ikke er solgt gjennom Visma' },
          ]}
        />
        <span className="toolbar-gap" />
        <UndoRedoButtons />
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
      {view === 'visma' ? (
        <VismaView projectNo={projectNo} onProjectChange={onProjectChange} onOpenSetup={onOpenSetup} review={review} names={names} onMessage={setMessage} />
      ) : (
        <EgenView projectNo={projectNo} onProjectChange={onProjectChange} projects={projects} />
      )}
    </div>
  )
}
