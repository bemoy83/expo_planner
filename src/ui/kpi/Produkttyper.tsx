import { useMemo, useRef, useState } from 'react'
import { addWorkType, diffKpi, EMPTY_KPI, linesWithoutProductType, mergeKpi, removeWorkType, replaceKpi, setActiveUnit, setCompetence, workTypeRows, type WorkTypeRow } from '../../domain/kpi'
import type { KpiConfig } from '../../domain/types'
import { readKpiWorkbook } from '../../import/vismaExport'
import { useWorkspace } from '../../store/workspaceStore'
import { DataTable } from '../DataTable'
import { useTable, type Column } from '../useTable'
import { MergeReplaceDialog, MessageBanner, UndoRedoButtons, type Message } from '../common'
import { errorText, takeFile } from '../files'
import { TextField } from '../fields'
import { X } from 'lucide-react'

/**
 * How each Visma product type is read: which unit it is counted in and which competence it belongs to.
 * This is the planner's own parser setup. It fills itself with the product types found in the Visma
 * exports, so nothing has to be imported to get started.
 */
export function Produkttyper({ onOpenKpi }: { onOpenKpi: () => void }) {
  const { workspace, setKpi } = useWorkspace()
  const ws = workspace!
  const kpi = ws.kpi ?? EMPTY_KPI
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [pending, setPending] = useState<{ file: string; incoming: Partial<KpiConfig> } | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const rows = useMemo(() => workTypeRows(kpi, ws.visma ?? []), [kpi, ws.visma])
  const found = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? rows.filter((row) => `${row.name} ${row.productType} ${row.unit} ${row.competence}`.toLowerCase().includes(q)) : rows
  }, [rows, search])
  const competences = useMemo(() => [...new Set(kpi.workTypes.map((rule) => rule.competence).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb')), [kpi.workTypes])
  const units = useMemo(() => [...new Set([...kpi.workTypes.map((rule) => rule.unit), ...kpi.rates.map((rate) => rate.unit)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb')), [kpi])
  const fresh = rows.filter((row) => !row.configured).length
  const untyped = useMemo(() => linesWithoutProductType(ws.visma ?? []), [ws.visma])

  const onFile = async (file: File) => {
    try {
      const { workTypes } = readKpiWorkbook(new Uint8Array(await file.arrayBuffer()))
      if (!workTypes) throw new Error('Filen har ingen tabell med «Produkttype 2», «Enhet» og «Nøkkelområder».')
      if (!kpi.workTypes.length) {
        setKpi(replaceKpi(kpi, { workTypes }))
        setMessage({ kind: 'ok', text: `${file.name}: ${workTypes.length} produkttyper lest inn.` })
      } else setPending({ file: file.name, incoming: { workTypes } })
    } catch (e) {
      setMessage({ kind: 'error', text: errorText(e) })
    }
  }

  /** Says so when rows already planned in the Kalender followed the product type to its new competence. */
  const changeCompetence = (name: string, unit: string, competence: string) => {
    const { rows, replaced } = setKpi(setCompetence(kpi, name, unit, competence))
    if (!rows && !replaced.length) return
    const followed = rows ? ` ${rows === 1 ? '1 planlagt rad' : `${rows} planlagte rader`} i Kalender fulgte med til ${competence}, med FTE.` : ''
    const people = replaced.length ? ` ${replaced.join(', ')} finnes ikke lenger: de som hadde den har nå ${competence}, og blokkene deres i Bemanning fulgte med.` : ''
    setMessage({ kind: 'ok', text: `${name} er nå ${competence}.${followed}${people} Kan angres med Ctrl/Cmd+Z.` })
  }

  const diff = pending ? diffKpi(kpi, pending.incoming).workTypes : null
  const apply = (mode: 'merge' | 'replace') => {
    if (!pending) return
    setKpi(mode === 'merge' ? mergeKpi(kpi, pending.incoming) : replaceKpi(kpi, pending.incoming))
    setMessage({ kind: 'ok', text: `${pending.file} ${mode === 'merge' ? 'slått sammen med tabellen' : 'har erstattet tabellen'}. Kan angres med Ctrl/Cmd+Z.` })
    setPending(null)
  }

  /** What a product type still lacks before its lines give hours. */
  const lacking = (row: WorkTypeRow) => (!row.configured ? 'Ny fra Visma' : !row.unit ? 'Mangler enhet' : !row.competence ? 'Mangler kompetanse' : !row.hasRate ? 'Mangler sats' : '')
  const columns: Column<WorkTypeRow>[] = [
    { key: 'name', head: 'Produkttype', text: (row) => row.name, cell: (row) => <strong>{row.name}</strong> },
    { key: 'productType', head: 'I Visma', title: 'Produkttype 2 slik den står i Visma', text: (row) => row.productType, cell: (row) => row.productType, cellProps: () => ({ className: 'muted' }) },
    {
      key: 'unit',
      head: 'Enhet',
      title: '«ordre» og «stands» teller antall stands; andre enheter summerer antall',
      text: (row) => row.unit,
      cell: (row) => <TextField value={row.unit} list="unit-options" onCommit={(value) => setKpi(setActiveUnit(kpi, row.name, value))} />,
    },
    {
      key: 'competence',
      head: 'Kompetanse (nøkkelområde)',
      text: (row) => row.competence,
      cell: (row) => <TextField value={row.competence} list="competence-options" onCommit={(value) => changeCompetence(row.name, row.unit, value)} />,
    },
    {
      key: 'lines',
      head: 'Linjer',
      title: 'Ordrelinjer med denne produkttypen i Visma-utskriftene som er lest inn',
      className: 'num',
      text: (row) => (row.lines ? String(row.lines) : ''),
      sort: (row) => row.lines,
      cell: (row) => row.lines || '',
    },
    {
      key: 'lacking',
      head: 'Mangler',
      title: 'Det som gjenstår før linjene av produkttypen gir timer',
      className: 'actions',
      text: lacking,
      cell: (row) => (
        <>
          {lacking(row) === 'Mangler sats' ? (
            <button className="link issue" onClick={onOpenKpi} title="Åpne KPI for å legge inn sats">
              Mangler sats
            </button>
          ) : (
            lacking(row) && <span className="issue">{lacking(row)} </span>
          )}
          {row.configured && (
            <button className="row-action" title="Fjern fra oppsettet" onClick={() => confirm(`Fjerne ${row.name} fra oppsettet?`) && setKpi(removeWorkType(kpi, row.name))}>
              <X size={13} aria-hidden />
            </button>
          )}
        </>
      ),
    },
  ]
  const table = useTable(found, columns)

  return (
    <div className="behov">
      <div className="toolbar">
        <input className="search" type="search" placeholder="Søk produkttype" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="muted small">{kpi.workTypes.length} produkttyper satt opp</span>
        <span className="toolbar-gap" />
        <UndoRedoButtons />
        <button onClick={() => fileInput.current?.click()} title="Valgfritt: hent tabellen fra Nøkkeltall Visma-arbeidsboken én gang">
          Hent fra fil
        </button>
        <button className="primary" onClick={() => setAdding(true)}>
          + Ny produkttype
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(e) => takeFile(e, onFile)}
        />
      </div>

      <MessageBanner message={message} onClose={() => setMessage(null)} />

      <div className="behov-body">
        <p className="hint">
          Slik leses Visma-utskriften: ordrelinjene grupperes per prosjekt, avdeling, produkttype og hall. <strong>Enhet</strong> bestemmer hvordan antallet regnes: «ordre» og «stands» teller
          antall stands, alle andre enheter summerer «Totalt antall». <strong>Kompetanse</strong> er nøkkelområdet timene havner under. Satsene ligger på{' '}
          <button className="link" onClick={onOpenKpi}>
            KPI
          </button>
          .
        </p>

        {fresh > 0 && (
          <div className="orphans" role="alert">
            <strong>{fresh === 1 ? '1 produkttype' : `${fresh} produkttyper`} fra Visma-utskriftene er ikke satt opp ennå.</strong> De står øverst i tabellen. Fyll inn enhet og kompetanse, så
            regnes linjene med.
          </div>
        )}

        {rows.length ? (
          <DataTable table={table} className="kpi" rowKey={(row) => row.name} rowProps={(row) => ({ className: row.configured ? undefined : 'has-issue' })} empty="Ingen produkttyper passer søket eller filteret." />
        ) : (
          <p className="notice">
            Tabellen er tom. Den fyller seg selv: les inn en Visma-utskrift på Behov-fanen, så kommer produkttypene i utskriften opp her, klare til å få enhet og kompetanse. Du kan også legge
            inn produkttyper for hånd.
          </p>
        )}

        {untyped > 0 && (
          <p className="hint">
            {untyped} ordrelinjer i utskriftene har ingen produkttype i Visma. De får arbeidstype én og én på Behov-fanen.
          </p>
        )}
        <datalist id="unit-options">
          {units.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <datalist id="competence-options">
          {competences.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {pending && diff && (
        <MergeReplaceDialog
          title="Hent produkttyper fra fil"
          source={pending.file}
          results={[`${diff.added} nye, ${diff.changed} endret, ${diff.unchanged} like, ${diff.onlyInApp} bare i appen`]}
          replaceText={`tabellen byttes helt ut med filen${diff.onlyInApp > 0 ? `; ${diff.onlyInApp} rader som bare finnes i appen forsvinner` : ''}`}
          onCancel={() => setPending(null)}
          onApply={apply}
        />
      )}

      {adding && (
        <AddDialog
          units={units}
          competences={competences}
          exists={(name) => rows.some((row) => row.name.toLowerCase() === name.trim().toLowerCase())}
          onClose={() => setAdding(false)}
          onAdd={(row) => {
            setKpi(addWorkType(kpi, row))
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}

interface AddProps {
  units: string[]
  competences: string[]
  exists: (name: string) => boolean
  onAdd: (row: { name: string; unit: string; competence: string }) => void
  onClose: () => void
}

function AddDialog({ units, competences, exists, onAdd, onClose }: AddProps) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [competence, setCompetence] = useState('')
  const duplicate = name.trim() !== '' && exists(name)
  const valid = name.trim() !== '' && !duplicate

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) onAdd({ name, unit, competence })
        }}
      >
        <h2>Ny produkttype</h2>
        <label>
          Produkttype
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Som i klammene i Visma, f.eks. FOGA-vegger" />
          <span className="hint">Må være lik teksten i klammene i «Produkttype 2» for at Visma-linjer skal treffe.</span>
        </label>
        <div className="field-row">
          <label className="narrow">
            Enhet
            <input list="add-units" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="stk, lm, m², ordre" />
            <datalist id="add-units">
              {units.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </label>
          <label>
            Kompetanse (nøkkelområde)
            <input list="add-competences" value={competence} onChange={(e) => setCompetence(e.target.value)} />
            <datalist id="add-competences">
              {competences.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        </div>
        {duplicate && <span className="issue">Produkttypen finnes allerede i tabellen.</span>}
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
