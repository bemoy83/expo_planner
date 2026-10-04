import { useMemo, useState } from 'react'
import { availableYears, demandScopes, formatFte, referenceProjectNo, requiredHours } from '../domain/calc'
import type { AllocationRow, WorkPhase } from '../domain/types'
import { useWorkspace } from '../store/workspaceStore'

interface Props {
  row?: AllocationRow
  projectName?: string
  /** The project's number where the caller knows it (a Venyou event may not be in the project list). */
  projectNo?: string
  /** Projects to choose from: the Venyou events and any other projects with rows. */
  projects?: { name: string; projectNo: string }[]
  onClose: () => void
  onSaved?: (row: AllocationRow) => void
}

/**
 * Adds or edits an allocation row. The choices cascade like the workbook's dropdowns:
 * project → year whose demand to use → competence → data basis, and the hours follow automatically.
 * Hall and department narrow the row to part of that demand; left open, the row covers all of it.
 */

/** Select value for «all»; an empty value is demand that has no hall or department. */
const ALL = '*'
const fromChoice = (choice: string): string | undefined => (choice === ALL ? undefined : choice)
export function AllocationDialog({ row, projectName, projectNo: knownProjectNo, projects, onClose, onSaved }: Props) {
  const { workspace, demandIndex, addAllocation, updateAllocation } = useWorkspace()
  const ws = workspace!
  const [project, setProject] = useState(row?.projectName ?? projectName ?? '')
  const [refYear, setRefYear] = useState(row?.refYear ?? '')
  const [competence, setCompetence] = useState(row?.competence ?? '')
  const [phase, setPhase] = useState<WorkPhase>(row?.phase || 'Montering')
  const [basis, setBasis] = useState(row?.basis ?? '')
  const [hall, setHall] = useState(row?.hall ?? ALL)
  const [avdeling, setAvdeling] = useState(row?.avdeling ?? ALL)

  const projectNames = useMemo(() => {
    const names = new Set([...(projects ?? []).map((p) => p.name), ...ws.projects.map((p) => p.name), ...ws.allocations.map((r) => r.projectName)])
    return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b, 'nb'))
  }, [projects, ws.projects, ws.allocations])

  const projectNo = useMemo(() => {
    const key = project.trim().toLowerCase()
    if (row && key === row.projectName.trim().toLowerCase()) return row.projectNo
    if (knownProjectNo !== undefined && key === (projectName ?? '').trim().toLowerCase()) return knownProjectNo
    return (
      projects?.find((p) => p.name.trim().toLowerCase() === key)?.projectNo ??
      ws.projects.find((p) => p.name.trim().toLowerCase() === key)?.projectNo ??
      ws.allocations.find((r) => r.projectName === project)?.projectNo ??
      ''
    )
  }, [project, row, knownProjectNo, projectName, projects, ws.projects, ws.allocations])

  const years = useMemo(() => (projectNo ? availableYears(demandIndex, projectNo) : []), [demandIndex, projectNo])
  const ref = referenceProjectNo(projectNo, refYear)
  // Competences with demand for the chosen year come first; without demand, any known competence can be planned.
  const competences = useMemo(() => {
    const withDemand = [...(demandIndex.options.get(ref)?.keys() ?? [])]
    const known = withDemand.length ? withDemand : [...(ws.kpi?.workTypes ?? []).map((t) => t.competence), ...ws.allocations.map((r) => r.competence)]
    return [...new Set(known)].filter(Boolean).sort((a, b) => a.localeCompare(b, 'nb'))
  }, [demandIndex, ref, ws.kpi, ws.allocations])
  const bases = useMemo(() => {
    const byCompetence = demandIndex.options.get(ref)
    const match = [...(byCompetence?.entries() ?? [])].find(([c]) => c.toLowerCase() === competence.trim().toLowerCase())
    return [...(match?.[1] ?? [])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'nb'))
  }, [demandIndex, ref, competence])

  const scopes = useMemo(() => demandScopes(demandIndex, { projectNo, refYear, competence, basis }), [demandIndex, projectNo, refYear, competence, basis])
  const withCurrent = (values: string[], current: string) => (current === ALL || values.includes(current) ? values : [...values, current])

  const hours = requiredHours(demandIndex, { projectNo, refYear, competence, basis, phase, hall: fromChoice(hall), avdeling: fromChoice(avdeling) })
  // A row can be planned before any demand exists, so the year is only required when there is demand to pick from.
  const valid = project.trim() !== '' && competence.trim() !== '' && (refYear !== '' || years.length === 0)

  const save = () => {
    const fields = { projectName: project.trim(), projectNo, refYear, competence: competence.trim(), phase, basis: basis.trim(), hall: fromChoice(hall), avdeling: fromChoice(avdeling) }
    const saved = row ? { ...row, ...fields } : addAllocation(fields)
    if (row) updateAllocation(saved)
    onSaved?.(saved)
    onClose()
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) save()
        }}
      >
        <h2>{row ? 'Endre rad' : 'Ny planleggingsrad'}</h2>

        <label>
          Prosjekt
          <input list="project-names" value={project} autoFocus={!row && !projectName} onChange={(e) => setProject(e.target.value)} placeholder="Skriv for å søke" />
          <datalist id="project-names">
            {projectNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <span className="hint">{projectNo ? `Prosjektnummer ${projectNo}` : project ? 'Uten prosjektnummer. Sett nummeret på Haller-fanen for å hente behov fra Visma og tidligere år.' : ''}</span>
        </label>

        <label>
          Data fra år
          <select value={refYear} onChange={(e) => setRefYear(e.target.value)}>
            <option value="">Velg år</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
            {refYear && !years.includes(refYear) && <option>{refYear}</option>}
          </select>
          <span className="hint">{!years.length ? 'Ingen behov registrert ennå. Raden kan planlegges nå og få behov senere.' : ref ? `Henter behov fra ${ref}` : ''}</span>
        </label>

        <label>
          Kompetanse (nøkkelområde)
          <input list="competences" value={competence} onChange={(e) => setCompetence(e.target.value)} />
          <datalist id="competences">
            {competences.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <fieldset>
          <legend>Fase</legend>
          {(['Montering', 'Demontering'] as const).map((p) => (
            <label key={p} className="radio">
              <input type="radio" name="phase" checked={phase === p} onChange={() => setPhase(p)} /> {p}
            </label>
          ))}
        </fieldset>

        <label>
          Datagrunnlag
          <input list="bases" value={basis} onChange={(e) => setBasis(e.target.value)} />
          <datalist id="bases">
            {bases.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>

        <label>
          Hall/Sted
          <select value={hall} onChange={(e) => setHall(e.target.value)}>
            <option value={ALL}>Alle haller</option>
            {withCurrent(scopes.halls, hall).map((h) => (
              <option key={h} value={h}>
                {h || 'Uten hall'}
              </option>
            ))}
          </select>
        </label>

        <label>
          Avd.
          <select value={avdeling} onChange={(e) => setAvdeling(e.target.value)}>
            <option value={ALL}>Alle avdelinger</option>
            {withCurrent(scopes.avdelinger, avdeling).map((a) => (
              <option key={a} value={a}>
                {a || 'Uten avd.'}
              </option>
            ))}
          </select>
          <span className="hint">Uten valg her gjelder raden hele behovet for kompetansen i prosjektet.</span>
        </label>

        <p className="dialog-result">
          Behov: <strong>{hours === null ? '–' : `${formatFte(hours, 1)} timer`}</strong>
          {hours !== null && <> = {formatFte(hours / ws.settings.hoursPerDay, 2)} FTE-dager</>}
        </p>

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Avbryt
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            {row ? 'Lagre' : 'Legg til'}
          </button>
        </div>
      </form>
    </div>
  )
}
