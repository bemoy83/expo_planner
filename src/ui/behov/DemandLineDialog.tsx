import { useMemo, useState } from 'react'
import { decimalText, parseDecimal } from '../../domain/numbers'
import { PLANNED_BASIS, type DemandLine } from '../../domain/types'
import { productTypeKey, productTypeLabel } from '../../domain/visma'
import { useWorkspace } from '../../store/workspaceStore'
import { PickField } from '../fields'

interface Props {
  line?: DemandLine
  projectNo: string
  projectName: string
  onClose: () => void
}

const toNumber = (text: string): number | null => parseDecimal(text) ?? null
const show = (value: number | null | undefined) => (value === null || value === undefined ? '' : decimalText(Math.round(value * 1000) / 1000))

/**
 * Adds or edits a ledger line that is the planner's own: a count from the hall map, hours not in Visma, and so on.
 * With a work type and quantity the hours follow from the KPI rates; they can also be typed directly.
 */
export function DemandLineDialog({ line, projectNo, projectName, onClose }: Props) {
  const { workspace, saveDemandLine } = useWorkspace()
  const ws = workspace!
  const [basis, setBasis] = useState(line?.basis ?? PLANNED_BASIS)
  const [competence, setCompetence] = useState(line?.competence ?? '')
  const [workType, setWorkType] = useState(line?.workType ?? '')
  const [quantity, setQuantity] = useState(show(line?.quantity))
  const [unit, setUnit] = useState(line?.unit ?? '')
  const [hall, setHall] = useState(line?.hall ?? '')
  const [assembly, setAssembly] = useState(show(line?.assemblyHours))
  const [dismantle, setDismantle] = useState(show(line?.dismantleHours))
  const [comment, setComment] = useState(line?.comment ?? '')

  const workTypes = useMemo(() => ws.kpi?.workTypes ?? [], [ws.kpi])
  const workTypeNames = useMemo(() => workTypes.map((t) => productTypeLabel(t.productType)), [workTypes])
  const workTypeNote = (name: string) => {
    const rule = workTypes.find((t) => productTypeKey(t.productType) === productTypeKey(name))
    return rule && [rule.unit, rule.competence].filter(Boolean).join(' · ')
  }
  const bases = useMemo(() => [...new Set([PLANNED_BASIS, ...ws.demand.map((l) => l.basis)])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'nb')), [ws.demand])
  const competences = useMemo(
    () => [...new Set([...workTypes.map((t) => t.competence), ...ws.allocations.map((r) => r.competence)])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'nb')),
    [workTypes, ws.allocations],
  )

  /** Fills unit, competence and hours from the KPI setup when the work type or quantity changes. */
  const recalc = (nextType: string, nextQuantity: string) => {
    const rule = workTypes.find((t) => productTypeKey(t.productType) === productTypeKey(nextType))
    if (!rule) return
    setUnit(rule.unit)
    setCompetence(rule.competence)
    const rate = ws.kpi?.rates.find((r) => productTypeKey(r.name) === productTypeKey(rule.productType) && r.unit.toLowerCase() === rule.unit.toLowerCase())
    const q = toNumber(nextQuantity)
    if (!rate || q === null) return
    setAssembly(show(rate.assembly ? q / rate.assembly : 0))
    setDismantle(show(rate.dismantle ? q / rate.dismantle : 0))
  }

  const valid = competence.trim() !== '' && basis.trim() !== ''

  const save = () => {
    saveDemandLine({
      ...(line ?? {
        projectNo,
        projectName,
        eventYear: `20${projectNo.slice(0, 2)}`,
        source: 'Egen registrering',
        stand: '',
      }),
      id: line?.id,
      origin: 'manual',
      basis: basis.trim(),
      competence: competence.trim(),
      workType: workType.trim(),
      quantity: toNumber(quantity),
      unit: unit.trim(),
      hall: hall.trim(),
      assemblyHours: toNumber(assembly) ?? 0,
      dismantleHours: toNumber(dismantle) ?? 0,
      comment: comment.trim(),
    } as DemandLine)
    onClose()
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog wide"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) save()
        }}
      >
        <h2>{line ? 'Endre linje' : 'Ny linje'}</h2>
        <p className="hint">
          {projectName} ({projectNo})
        </p>

        <div className="field-row">
          <label>
            Arbeidstype
            <PickField
              options={workTypeNames}
              note={workTypeNote}
              value={workType}
              autoFocus={!line}
              onChange={(text) => {
                setWorkType(text)
                recalc(text, quantity)
              }}
              placeholder="f.eks. FOGA-vegger, eller fri tekst"
            />
          </label>
          <label className="narrow">
            Antall
            <input
              inputMode="decimal"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value)
                recalc(workType, e.target.value)
              }}
            />
          </label>
          <label className="narrow">
            Enhet
            <input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </label>
        </div>

        <div className="field-row">
          <label>
            Kompetanse (nøkkelområde)
            <PickField options={competences} value={competence} onChange={setCompetence} />
          </label>
          <label>
            Hall / sted
            <input value={hall} onChange={(e) => setHall(e.target.value)} />
          </label>
        </div>

        <div className="field-row">
          <label className="narrow">
            Montering, timer
            <input inputMode="decimal" value={assembly} onChange={(e) => setAssembly(e.target.value)} />
          </label>
          <label className="narrow">
            Demontering, timer
            <input inputMode="decimal" value={dismantle} onChange={(e) => setDismantle(e.target.value)} />
          </label>
          <label>
            Grunnlag
            <PickField options={bases} value={basis} onChange={setBasis} />
          </label>
        </div>
        <span className="hint">Timene regnes ut fra antall og KPI-sats når arbeidstypen er kjent. Du kan også skrive timer direkte.</span>

        <label>
          Kommentar
          <input value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Avbryt
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            {line ? 'Lagre' : 'Legg til'}
          </button>
        </div>
      </form>
    </div>
  )
}
