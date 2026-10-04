import { useMemo, useRef, useState } from 'react'
import { addKpiRow, diffKpi, EMPTY_KPI, kpiRows, mergeKpi, removeKpiRow, replaceKpi, setActiveUnit, setCompetence, setRate, type KpiDiff, type NewKpiRow } from '../../domain/kpi'
import type { KpiConfig } from '../../domain/types'
import { NO_PRODUCT_TYPE, workTypeName } from '../../domain/visma'
import { readKpiWorkbook } from '../../import/vismaExport'
import { useWorkspace } from '../../store/workspaceStore'
import { NumberField, TextField } from '../fields'

interface PendingImport {
  files: string[]
  incoming: Partial<KpiConfig>
}

const describeDiff = (label: string, diff: KpiDiff) => `${label}: ${diff.added} nye, ${diff.changed} endret, ${diff.unchanged} like, ${diff.onlyInApp} bare i appen`

/** The KPI setup: work types with unit, competence and rates, edited directly in the app. */
export function Kpi() {
  const { workspace, setKpi, undo, redo, canUndo, canRedo } = useWorkspace()
  const ws = workspace!
  const kpi = ws.kpi ?? EMPTY_KPI
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState<Partial<NewKpiRow> | null>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const rows = useMemo(() => kpiRows(kpi), [kpi])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? rows.filter((row) => `${row.name} ${row.unit} ${row.competence}`.toLowerCase().includes(q)) : rows
  }, [rows, search])
  const competences = useMemo(() => [...new Set(kpi.workTypes.map((rule) => rule.competence).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb')), [kpi.workTypes])

  /** Work types that occur in the Visma exports held in the app but are not set up here. */
  const unknown = useMemo(() => {
    const known = new Set(kpi.workTypes.map((rule) => rule.name.toLowerCase()))
    const names = new Set<string>()
    for (const source of ws.visma ?? []) {
      for (const row of source.rows) {
        const name = workTypeName(row.productType)
        if (name !== NO_PRODUCT_TYPE && !known.has(name.toLowerCase())) names.add(name)
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'nb'))
  }, [kpi.workTypes, ws.visma])

  const onFiles = async (files: File[]) => {
    if (!files.length) return
    try {
      let incoming: Partial<KpiConfig> = {}
      for (const file of files) incoming = { ...incoming, ...readKpiWorkbook(new Uint8Array(await file.arrayBuffer())) }
      const names = files.map((file) => file.name)
      if (!kpi.workTypes.length && !kpi.rates.length) {
        setKpi(replaceKpi(kpi, incoming))
        setMessage({ kind: 'ok', text: `${names.join(' og ')} lest inn.` })
      } else setPending({ files: names, incoming })
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
    }
  }

  const apply = (mode: 'merge' | 'replace') => {
    if (!pending) return
    setKpi(mode === 'merge' ? mergeKpi(kpi, pending.incoming) : replaceKpi(kpi, pending.incoming))
    setMessage({ kind: 'ok', text: `${pending.files.join(' og ')} ${mode === 'merge' ? 'slått sammen med oppsettet' : 'har erstattet oppsettet'}. Kan angres med Ctrl/Cmd+Z.` })
    setPending(null)
  }

  const diff = pending ? diffKpi(kpi, pending.incoming) : null

  return (
    <div className="behov">
      <div className="toolbar">
        <input className="search" type="search" placeholder="Søk arbeidstype" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="muted small">
          {kpi.workTypes.length} arbeidstyper, {kpi.rates.length} satser
        </span>
        <span className="toolbar-gap" />
        <button onClick={undo} disabled={!canUndo} title="Angre (Ctrl/Cmd+Z)">
          ↶ Angre
        </button>
        <button onClick={redo} disabled={!canRedo} title="Gjør om (Ctrl/Cmd+Shift+Z)">
          ↷ Gjør om
        </button>
        <button onClick={() => fileInput.current?.click()}>Importer KPI-filer</button>
        <button className="primary" onClick={() => setAdding({})}>
          + Ny arbeidstype
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            onFiles(files)
          }}
        />
      </div>

      {message && (
        <div className={message.kind === 'ok' ? 'info-banner' : 'error-banner'} role="status">
          {message.text}{' '}
          <button className="link" onClick={() => setMessage(null)}>
            Lukk
          </button>
        </div>
      )}

      <div className="behov-body">
        <p className="hint">
          Timer = antall ÷ sats. Satsen er hvor mange enheter én person gjør på en time. En arbeidstype kan ha satser for flere enheter; «I bruk» velger hvilken enhet Visma-linjene regnes
          med. Endringer her regner om Visma-linjene med én gang.
        </p>

        {unknown.length > 0 && (
          <div className="orphans" role="alert">
            <strong>{unknown.length === 1 ? '1 arbeidstype' : `${unknown.length} arbeidstyper`} i Visma-utskriftene mangler i oppsettet</strong> og gir ingen timer:
            <ul>
              {unknown.map((name) => (
                <li key={name}>
                  <span>{name}</span>
                  <button className="link" onClick={() => setAdding({ name })}>
                    Legg til
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {rows.length ? (
          <table className="ledger kpi">
            <thead>
              <tr>
                <th>Arbeidstype</th>
                <th>Enhet</th>
                <th title="Enheten Visma-linjer av denne arbeidstypen regnes med">I bruk</th>
                <th>Kompetanse (nøkkelområde)</th>
                <th className="num" title="Enheter per persontime">
                  Montering
                </th>
                <th className="num" title="Enheter per persontime. Tomt betyr ingen demontering.">
                  Demontering
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => {
                const first = index === 0 || shown[index - 1].name !== row.name
                return (
                  <tr key={`${row.name}|${row.unit}`} className={`${first ? 'first-of-type' : ''} ${row.active ? '' : 'alt-unit'} ${row.missingRate ? 'has-issue' : ''}`}>
                    <td>{first ? <strong>{row.name}</strong> : ''}</td>
                    <td>{row.unit}</td>
                    <td className="center">
                      <input type="radio" name={`unit-${row.name}`} checked={row.active} onChange={() => setKpi(setActiveUnit(kpi, row.name, row.unit))} aria-label={`Bruk ${row.unit} for ${row.name}`} />
                    </td>
                    <td>{first ? <TextField value={row.competence} onCommit={(value) => setKpi(setCompetence(kpi, row.name, row.unit, value))} /> : ''}</td>
                    <td className="num">
                      <NumberField value={row.assembly} onCommit={(value) => setKpi(setRate(kpi, row.name, row.unit, { assembly: value }))} />
                    </td>
                    <td className="num">
                      <NumberField value={row.dismantle} onCommit={(value) => setKpi(setRate(kpi, row.name, row.unit, { dismantle: value }))} />
                    </td>
                    <td className="actions">
                      {row.missingRate && <span className="issue">Mangler sats </span>}
                      <button className="row-action" title={`Legg til en annen enhet for ${row.name}`} onClick={() => setAdding({ name: row.name, competence: row.competence })}>
                        +
                      </button>
                      <button className="row-action" title="Slett" onClick={() => confirm(`Slette ${row.name} (${row.unit})?`) && setKpi(removeKpiRow(kpi, row.name, row.unit))}>
                        ×
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="notice">
            KPI-oppsettet er tomt. Importer filene du har i dag (<code>Nøkkeltall Visma</code> for arbeidstyper og <code>Kpier.xlsx</code> for satser), eller legg inn arbeidstyper for hånd.
          </p>
        )}
      </div>

      {pending && diff && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <h2>Importer KPI</h2>
            <p className="hint">{pending.files.join(' og ')}</p>
            {pending.incoming.workTypes && <p className="dialog-result">{describeDiff('Arbeidstyper', diff.workTypes)}</p>}
            {pending.incoming.rates && <p className="dialog-result">{describeDiff('Satser', diff.rates)}</p>}
            <p className="hint">
              <strong>Slå sammen:</strong> filen vinner der den har en rad, det som bare finnes i appen beholdes.
              <br />
              <strong>Erstatt alt:</strong> {[pending.incoming.workTypes && 'arbeidstypene', pending.incoming.rates && 'satsene'].filter(Boolean).join(' og ')} i appen byttes helt ut med filen
              {diff.workTypes.onlyInApp + diff.rates.onlyInApp > 0 ? `; ${diff.workTypes.onlyInApp + diff.rates.onlyInApp} rader som bare finnes i appen forsvinner` : ''}.
            </p>
            <div className="dialog-actions">
              <button onClick={() => setPending(null)}>Avbryt</button>
              <button onClick={() => apply('replace')}>Erstatt alt</button>
              <button className="primary" onClick={() => apply('merge')}>
                Slå sammen
              </button>
            </div>
          </div>
        </div>
      )}

      {adding && (
        <AddDialog
          initial={adding}
          competences={competences}
          exists={(name, unit) => rows.some((row) => row.name.toLowerCase() === name.trim().toLowerCase() && row.unit.toLowerCase() === unit.trim().toLowerCase())}
          onClose={() => setAdding(null)}
          onAdd={(row) => {
            setKpi(addKpiRow(kpi, row))
            setAdding(null)
          }}
        />
      )}
    </div>
  )
}

interface AddProps {
  initial: Partial<NewKpiRow>
  competences: string[]
  exists: (name: string, unit: string) => boolean
  onAdd: (row: NewKpiRow) => void
  onClose: () => void
}

const toNumber = (text: string) => (text.trim() === '' ? 0 : Number(text.replace(',', '.')))

function AddDialog({ initial, competences, exists, onAdd, onClose }: AddProps) {
  const [name, setName] = useState(initial.name ?? '')
  const [unit, setUnit] = useState('')
  const [competence, setCompetence] = useState(initial.competence ?? '')
  const [assembly, setAssembly] = useState('')
  const [dismantle, setDismantle] = useState('')
  const duplicate = name.trim() !== '' && unit.trim() !== '' && exists(name, unit)
  const valid = name.trim() !== '' && unit.trim() !== '' && !duplicate && Number.isFinite(toNumber(assembly)) && Number.isFinite(toNumber(dismantle))

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) onAdd({ name, unit, competence, assembly: toNumber(assembly), dismantle: toNumber(dismantle) })
        }}
      >
        <h2>Ny arbeidstype eller enhet</h2>
        <label>
          Arbeidstype
          <input value={name} autoFocus={!initial.name} onChange={(e) => setName(e.target.value)} placeholder="Som i klammene i Visma, f.eks. FOGA-vegger" />
          <span className="hint">Må være lik teksten i klammene i «Produkttype 2» for at Visma-linjer skal treffe.</span>
        </label>
        <div className="field-row">
          <label className="narrow">
            Enhet
            <input value={unit} autoFocus={!!initial.name} onChange={(e) => setUnit(e.target.value)} placeholder="stk, lm, m², ordre" />
          </label>
          <label>
            Kompetanse (nøkkelområde)
            <input list="kpi-competences" value={competence} onChange={(e) => setCompetence(e.target.value)} />
            <datalist id="kpi-competences">
              {competences.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        </div>
        <div className="field-row">
          <label>
            Montering, enheter per time
            <input inputMode="decimal" value={assembly} onChange={(e) => setAssembly(e.target.value)} />
          </label>
          <label>
            Demontering, enheter per time
            <input inputMode="decimal" value={dismantle} onChange={(e) => setDismantle(e.target.value)} />
          </label>
        </div>
        {duplicate && <span className="issue">Denne arbeidstypen har allerede en rad for enheten.</span>}
        <span className="hint">Med enhet «ordre» eller «stands» telles antall stands i stedet for å summere antall.</span>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Avbryt
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            Legg til
          </button>
        </div>
      </form>
    </div>
  )
}
