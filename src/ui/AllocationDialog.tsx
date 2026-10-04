import { useMemo, useState } from 'react'
import { availableYears, formatFte, referenceProjectNo, requiredHours } from '../domain/calc'
import type { AllocationRow, WorkPhase } from '../domain/types'
import { useWorkspace } from '../store/workspaceStore'

interface Props {
  row?: AllocationRow
  projectName?: string
  onClose: () => void
  onSaved?: (row: AllocationRow) => void
}

/**
 * Adds or edits an allocation row. The choices cascade like the workbook's dropdowns:
 * project → year whose demand to use → competence → data basis, and the hours follow automatically.
 */
export function AllocationDialog({ row, projectName, onClose, onSaved }: Props) {
  const { workspace, demandIndex, addAllocation, updateAllocation } = useWorkspace()
  const ws = workspace!
  const [project, setProject] = useState(row?.projectName ?? projectName ?? '')
  const [refYear, setRefYear] = useState(row?.refYear ?? '')
  const [competence, setCompetence] = useState(row?.competence ?? '')
  const [phase, setPhase] = useState<WorkPhase>(row?.phase || 'Montering')
  const [basis, setBasis] = useState(row?.basis ?? '')

  const projectNames = useMemo(() => {
    const names = new Set([...ws.projects.map((p) => p.name), ...ws.allocations.map((r) => r.projectName)])
    return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b, 'nb'))
  }, [ws.projects, ws.allocations])

  const projectNo = useMemo(() => {
    const key = project.trim().toLowerCase()
    return ws.projects.find((p) => p.name.trim().toLowerCase() === key)?.projectNo ?? ws.allocations.find((r) => r.projectName === project)?.projectNo ?? ''
  }, [project, ws.projects, ws.allocations])

  const years = useMemo(() => (projectNo ? availableYears(demandIndex, projectNo) : []), [demandIndex, projectNo])
  const ref = referenceProjectNo(projectNo, refYear)
  const competences = useMemo(() => [...(demandIndex.options.get(ref)?.keys() ?? [])].sort((a, b) => a.localeCompare(b, 'nb')), [demandIndex, ref])
  const bases = useMemo(() => {
    const byCompetence = demandIndex.options.get(ref)
    const match = [...(byCompetence?.entries() ?? [])].find(([c]) => c.toLowerCase() === competence.trim().toLowerCase())
    return [...(match?.[1] ?? [])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'nb'))
  }, [demandIndex, ref, competence])

  const hours = requiredHours(demandIndex, { projectNo, refYear, competence, basis, phase })
  const valid = project.trim() !== '' && competence.trim() !== '' && refYear !== ''

  const save = () => {
    const fields = { projectName: project.trim(), projectNo, refYear, competence: competence.trim(), phase, basis: basis.trim() }
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
          <span className="hint">{projectNo ? `Prosjektnummer ${projectNo}` : project ? 'Fant ikke prosjektnummer i prosjektlisten' : ''}</span>
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
          <span className="hint">{projectNo && !years.length ? 'Ingen behovsdata registrert for denne prosjektserien' : ref ? `Henter behov fra ${ref}` : ''}</span>
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
