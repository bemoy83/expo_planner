import { useMemo, useRef, useState } from 'react'
import { addKpiRow, diffKpi, EMPTY_KPI, kpiRows, mergeKpi, removeKpiRow, replaceKpi, setRate, type KpiDiff, type NewKpiRow } from '../../domain/kpi'
import type { KpiConfig } from '../../domain/types'
import { readKpiWorkbook } from '../../import/vismaExport'
import { useWorkspace } from '../../store/workspaceStore'
import { NumberField } from '../fields'

interface PendingImport {
  files: string[]
  incoming: Partial<KpiConfig>
}

const describeDiff = (label: string, diff: KpiDiff) => `${label}: ${diff.added} nye, ${diff.changed} endret, ${diff.unchanged} like, ${diff.onlyInApp} bare i appen`

/** The KPI rates: how many units one person does per hour, for each product type and unit. */
export function Kpi({ onOpenProductTypes }: { onOpenProductTypes: () => void }) {
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
  const typeNames = useMemo(() => kpi.workTypes.map((rule) => rule.name).sort((a, b) => a.localeCompare(b, 'nb')), [kpi.workTypes])
  const missing = rows.filter((row) => row.missingRate).length

  const onFiles = async (files: File[]) => {
    if (!files.length) return
    try {
      let incoming: Partial<KpiConfig> = {}
      for (const file of files) incoming = { ...incoming, ...readKpiWorkbook(new Uint8Array(await file.arrayBuffer())) }
      const names = files.map((file) => file.name)
      // Nothing to merge with when the parts the files bring are still empty in the app.
      const nothingToReplace = (!incoming.rates || !kpi.rates.length) && (!incoming.workTypes || !kpi.workTypes.length)
      if (nothingToReplace) {
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
          {kpi.rates.length} satser
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
          + Ny sats
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
          Timer = antall ÷ sats. Satsen er hvor mange enheter én person gjør på en time. En produkttype kan ha satser for flere enheter; enheten merket «i bruk» er den som er valgt på{' '}
          <button className="link" onClick={onOpenProductTypes}>
            Produkttyper
          </button>
          . Endringer her regner om Visma-linjene med én gang.
        </p>

        {missing > 0 && (
          <div className="orphans" role="alert">
            <strong>{missing === 1 ? '1 produkttype' : `${missing} produkttyper`} mangler sats for enheten som er i bruk</strong> og gir ingen timer. De står merket i tabellen; skriv inn satsene
            der.
          </div>
        )}

        {rows.length ? (
          <table className="ledger kpi">
            <thead>
              <tr>
                <th>Produkttype</th>
                <th>Enhet</th>
                <th title="Enheten Visma-linjer av denne produkttypen regnes med. Velges på Produkttyper.">I bruk</th>
                <th>Kompetanse</th>
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
                    <td className="center">{row.active ? <span className="badge">i bruk</span> : ''}</td>
                    <td className="muted">{first ? row.competence : ''}</td>
                    <td className="num">
                      <NumberField value={row.assembly} onCommit={(value) => setKpi(setRate(kpi, row.name, row.unit, { assembly: value }))} />
                    </td>
                    <td className="num">
                      <NumberField value={row.dismantle} onCommit={(value) => setKpi(setRate(kpi, row.name, row.unit, { dismantle: value }))} />
                    </td>
                    <td className="actions">
                      {row.missingRate && <span className="issue">Mangler sats </span>}
                      <button className="row-action" title={`Legg til sats for en annen enhet for ${row.name}`} onClick={() => setAdding({ name: row.name })}>
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
Ingen satser ennå. Legg dem inn med «Ny sats», eller les inn <code>Kpier.xlsx</code> én gang med «Importer KPI-filer».
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
          typeNames={typeNames}
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
  typeNames: string[]
  exists: (name: string, unit: string) => boolean
  onAdd: (row: NewKpiRow) => void
  onClose: () => void
}

const toNumber = (text: string) => (text.trim() === '' ? 0 : Number(text.replace(',', '.')))

function AddDialog({ initial, typeNames, exists, onAdd, onClose }: AddProps) {
  const [name, setName] = useState(initial.name ?? '')
  const [unit, setUnit] = useState('')
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
          if (valid) onAdd({ name, unit, competence: '', assembly: toNumber(assembly), dismantle: toNumber(dismantle) })
        }}
      >
        <h2>Ny sats</h2>
        <div className="field-row">
          <label>
            Produkttype
            <input list="kpi-type-names" value={name} autoFocus={!initial.name} onChange={(e) => setName(e.target.value)} />
            <datalist id="kpi-type-names">
              {typeNames.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <label className="narrow">
            Enhet
            <input value={unit} autoFocus={!!initial.name} onChange={(e) => setUnit(e.target.value)} placeholder="stk, lm, m², ordre" />
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
        {duplicate && <span className="issue">Denne produkttypen har allerede en sats for enheten.</span>}
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
