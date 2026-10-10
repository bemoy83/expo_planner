import { useMemo, useRef, useState } from 'react'
import { addKpiRow, diffKpi, EMPTY_KPI, kpiRows, linesWithoutProductType, mergeKpi, removeKpiRow, renameUnit, replaceKpi, setActiveUnit, setCompetence, setRate, type KpiDiff, type KpiRow, type Lacking, type NewKpiRow } from '../../domain/kpi'
import { decimalText, parseDecimal } from '../../domain/numbers'
import type { KpiConfig } from '../../domain/types'
import { productTypeKey } from '../../domain/visma'
import { readKpiWorkbook } from '../../import/vismaExport'
import { useWorkspace } from '../../store/workspaceStore'
import { DataTable } from '../DataTable'
import { useTable, type Column } from '../useTable'
import { MergeReplaceDialog, MessageBanner, UndoRedoButtons, type Message } from '../common'
import { errorText, takeFile } from '../files'
import { NumberField, PickField, TextField } from '../fields'
import { X } from 'lucide-react'

interface PendingImport {
  file: string
  incoming: KpiConfig
}

const describeDiff = (label: string, diff: KpiDiff) => `${label}: ${diff.added} nye, ${diff.changed} endret, ${diff.unchanged} like, ${diff.onlyInApp} bare i appen`

/** Whether the row is the first of its product type among the rows shown: its name is in bold, and a line is drawn above it. */
const firstOfType = (row: KpiRow, index: number, rows: KpiRow[]) => index === 0 || rows[index - 1].name !== row.name

const LACKING_TEXT: Record<Lacking, string> = {
  new: 'Ny fra Visma',
  'no-unit-in-use': 'Velg enhet i bruk',
  unit: 'Mangler enhet',
  competence: 'Mangler kompetanse',
  rate: 'Mangler sats',
}

/**
 * How each Visma product type is read, and its rates: the unit it is counted in, the competence it belongs to,
 * and how many units one person does per hour. The table fills itself with the product types found in the
 * Visma exports, so nothing has to be imported to get started.
 */
export function Kpi() {
  const { workspace, setKpi } = useWorkspace()
  const ws = workspace!
  const kpi = ws.kpi ?? EMPTY_KPI
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState<Partial<NewKpiRow> | null>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const rows = useMemo(() => kpiRows(kpi, ws.visma ?? []), [kpi, ws.visma])
  const found = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? rows.filter((row) => `${row.name} ${row.productType} ${row.unit} ${row.competence}`.toLowerCase().includes(q)) : rows
  }, [rows, search])
  const typeNames = useMemo(() => [...new Set(rows.map((row) => row.name))], [rows])
  const competences = useMemo(() => [...new Set(kpi.workTypes.map((rule) => rule.competence).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb')), [kpi.workTypes])
  const units = useMemo(() => [...new Set([...kpi.workTypes.map((rule) => rule.unit), ...kpi.rates.map((rate) => rate.unit)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb')), [kpi])
  // Rates read in for a product type that no export names yet lack nothing the planner has to act on.
  const unfinished = useMemo(() => new Set(rows.filter((row) => row.lacking && (row.configured || row.lines > 0)).map((row) => row.name)).size, [rows])
  const untyped = useMemo(() => linesWithoutProductType(ws.visma ?? []), [ws.visma])

  const onFile = async (file: File) => {
    try {
      const incoming = readKpiWorkbook(new Uint8Array(await file.arrayBuffer()))
      // Nothing to merge with while the table is empty.
      if (!kpi.rates.length && !kpi.workTypes.length) {
        setKpi(replaceKpi(kpi, incoming))
        const toChoose = incoming.workTypes.filter((rule) => !rule.unit).length
        setMessage({ kind: 'ok', text: `${file.name} lest inn: ${incoming.workTypes.length} produkttyper og ${incoming.rates.length} satser.${toChoose ? ` ${toChoose} produkttyper har flere enheter; velg hvilken som er i bruk.` : ''}` })
      } else setPending({ file: file.name, incoming })
    } catch (e) {
      setMessage({ kind: 'error', text: errorText(e) })
    }
  }

  const apply = (mode: 'merge' | 'replace') => {
    if (!pending) return
    setKpi(mode === 'merge' ? mergeKpi(kpi, pending.incoming) : replaceKpi(kpi, pending.incoming))
    setMessage({ kind: 'ok', text: `${pending.file} ${mode === 'merge' ? 'slått sammen med oppsettet' : 'har erstattet oppsettet'}. Kan angres med Ctrl/Cmd+Z.` })
    setPending(null)
  }

  /** Says so when rows already planned in the Kalender followed the product type to its new competence. */
  const changeCompetence = ({ name, productType, unit }: KpiRow, competence: string) => {
    const { rows, replaced } = setKpi(setCompetence(kpi, productType, unit, competence))
    if (!rows && !replaced.length) return
    const followed = rows ? ` ${rows === 1 ? '1 planlagt rad' : `${rows} planlagte rader`} i Kalender fulgte med til ${competence}, med FTE.` : ''
    const people = replaced.length ? ` ${replaced.join(', ')} finnes ikke lenger: de som hadde den har nå ${competence}, og blokkene deres i Bemanning fulgte med.` : ''
    setMessage({ kind: 'ok', text: `${name} er nå ${competence}.${followed}${people} Kan angres med Ctrl/Cmd+Z.` })
  }

  const diff = pending ? diffKpi(kpi, pending.incoming) : null

  const columns: Column<KpiRow>[] = [
    {
      key: 'name',
      head: 'Produkttype',
      title: 'Navnet fra «Produkttype 2» i Visma. Hold pekeren over et navn for å se teksten slik den står i Visma.',
      text: (row) => row.name,
      cell: (row, index, shown) => (firstOfType(row, index, shown) ? <strong>{row.name}</strong> : row.name),
      cellProps: (row) => (row.productType === row.name ? {} : { title: `I Visma: ${row.productType}` }),
    },
    {
      key: 'unit',
      head: 'Enhet',
      title: '«ordre» og «stands» teller antall stands; andre enheter summerer antall',
      text: (row) => row.unit,
      // An emptied field is left as it was: a rate cannot be without a unit.
      cell: (row) => <TextField value={row.unit} options={units} ariaLabel={`Enhet for ${row.name}`} onCommit={(value) => value && setKpi(renameUnit(kpi, row.productType, row.unit, value))} />,
    },
    {
      key: 'active',
      head: 'I bruk',
      title: 'Enheten Visma-linjer av denne produkttypen regnes med',
      className: 'center',
      text: (row) => (row.active ? 'Ja' : 'Nei'),
      cell: (row) =>
        row.unit ? <input type="radio" checked={row.active} aria-label={`Regn ${row.name} i ${row.unit}`} onChange={() => setKpi(setActiveUnit(kpi, row.productType, row.unit))} /> : '',
    },
    {
      key: 'competence',
      head: 'Kompetanse (nøkkelområde)',
      text: (row) => row.competence,
      // The competence is that of the product type: changed on one row, it changes on all its units.
      cell: (row) => <TextField value={row.competence} options={competences} ariaLabel={`Kompetanse for ${row.name}`} onCommit={(value) => changeCompetence(row, value)} />,
    },
    {
      key: 'assembly',
      head: 'Montering',
      title: 'Enheter per persontime',
      className: 'num',
      text: (row) => (row.assembly ? decimalText(row.assembly) : ''),
      sort: (row) => row.assembly,
      cell: (row) => (row.unit ? <NumberField value={row.assembly} onCommit={(value) => setKpi(setRate(kpi, row.productType, row.unit, { assembly: value }))} /> : ''),
    },
    {
      key: 'dismantle',
      head: 'Demontering',
      title: 'Enheter per persontime. Tomt betyr ingen demontering.',
      className: 'num',
      text: (row) => (row.dismantle ? decimalText(row.dismantle) : ''),
      sort: (row) => row.dismantle,
      cell: (row) => (row.unit ? <NumberField value={row.dismantle} onCommit={(value) => setKpi(setRate(kpi, row.productType, row.unit, { dismantle: value }))} /> : ''),
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
      title: 'Det som gjenstår før linjene av produkttypen gir timer. Til da er timene ukjente, ikke 0.',
      className: 'actions',
      text: (row) => (row.lacking ? LACKING_TEXT[row.lacking] : ''),
      cell: (row) => (
        <>
          {row.lacking && <span className="issue">{LACKING_TEXT[row.lacking]} </span>}
          <button className="row-action" title={`Legg til en annen enhet for ${row.name}`} onClick={() => setAdding({ name: row.name })}>
            +
          </button>
          {row.lacking !== 'new' && (
            <button className="row-action" title="Slett" onClick={() => confirm(`Slette ${row.name}${row.unit ? ` (${row.unit})` : ''}?`) && setKpi(removeKpiRow(kpi, row.productType, row.unit))}>
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
        <span className="muted small">
          {kpi.workTypes.length} produkttyper satt opp · {kpi.rates.length} satser
        </span>
        <span className="toolbar-gap" />
        <UndoRedoButtons />
        <button onClick={() => fileInput.current?.click()} title="Valgfritt: les inn Kpier.xlsx én gang. Den gir produkttypene med enheter, kompetanse og satser.">
          Importer fra fil
        </button>
        <button className="primary" onClick={() => setAdding({})}>
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
          Slik leses Visma-utskriften: ordrelinjene grupperes per prosjekt, avdeling, produkttype og hall, og timer = antall ÷ sats. <strong>Enhet</strong> bestemmer hvordan antallet regnes: «ordre»
          og «stands» teller antall stands, alle andre enheter summerer «Totalt antall». En produkttype kan ha satser for flere enheter; den som er merket <strong>i bruk</strong> regnes det med.{' '}
          <strong>Kompetanse</strong> er nøkkelområdet timene havner under. Satsen er hvor mange enheter én person gjør på en time. Endringer her regner om Visma-linjene med én gang.
        </p>

        {unfinished > 0 && (
          <div className="orphans" role="alert">
            <strong>{unfinished === 1 ? '1 produkttype' : `${unfinished} produkttyper`} er ikke ferdig satt opp.</strong> Det som gjenstår står i kolonnen «Mangler». Uten enhet og sats er timene
            for linjene ukjente, ikke 0.
          </div>
        )}

        {rows.length ? (
          <DataTable
            table={table}
            className="kpi"
            rowKey={(row) => `${row.name}|${row.unit}`}
            rowProps={(row, index, shown) => ({ className: `${firstOfType(row, index, shown) ? 'first-of-type' : ''} ${row.active || !row.configured ? '' : 'alt-unit'} ${row.lacking && (row.configured || row.lines > 0) ? 'has-issue' : ''}` })}
            empty="Ingen produkttyper passer søket eller filteret."
          />
        ) : (
          <p className="notice">
            Tabellen er tom. Den fyller seg selv: les inn en Visma-utskrift på Behov-fanen, så kommer produkttypene i utskriften opp her, klare til å få enhet, kompetanse og sats. Du kan også
            legge dem inn med «Ny produkttype», eller lese inn <code>Kpier.xlsx</code> én gang med «Importer fra fil».
            Har en produkttype flere enheter i filen, velger du selv hvilken som er i bruk.
          </p>
        )}

        {untyped > 0 && <p className="hint">{untyped} ordrelinjer i utskriftene har ingen produkttype i Visma. De får arbeidstype én og én på Behov-fanen.</p>}
      </div>

      {pending && diff && (
        <MergeReplaceDialog
          title="Importer KPI"
          source={pending.file}
          results={[describeDiff('Produkttyper', diff.workTypes), describeDiff('Satser', diff.rates)]}
          replaceText={`produkttypene og satsene i appen byttes helt ut med filen; enheten du har valgt for en produkttype beholdes så lenge den har sats${
            diff.workTypes.onlyInApp + diff.rates.onlyInApp > 0 ? `; ${diff.workTypes.onlyInApp + diff.rates.onlyInApp} rader som bare finnes i appen forsvinner` : ''
          }`}
          onCancel={() => setPending(null)}
          onApply={apply}
        />
      )}

      {adding && (
        <AddDialog
          initial={adding}
          typeNames={typeNames}
          units={units}
          competences={competences}
          setUp={(name) => kpi.workTypes.find((rule) => productTypeKey(rule.productType) === productTypeKey(name))?.competence}
          exists={(name, unit) => rows.some((row) => row.unit !== '' && productTypeKey(row.name) === productTypeKey(name) && row.unit.toLowerCase() === unit.trim().toLowerCase())}
          onClose={() => setAdding(null)}
          onAdd={(row) => {
            // A type the exports name is set up with its text from Visma.
            setKpi(addKpiRow(kpi, { ...row, name: rows.find((known) => productTypeKey(known.name) === productTypeKey(row.name))?.productType ?? row.name }))
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
  units: string[]
  competences: string[]
  /** The competence of a product type that is set up already, where it cannot be given another here. */
  setUp: (name: string) => string | undefined
  exists: (name: string, unit: string) => boolean
  onAdd: (row: NewKpiRow) => void
  onClose: () => void
}

/** An empty rate is 0; text that is no number is NaN. */
const toNumber = (text: string) => {
  const n = parseDecimal(text)
  return n === undefined ? NaN : (n ?? 0)
}

function AddDialog({ initial, typeNames, units, competences, setUp, exists, onAdd, onClose }: AddProps) {
  const [name, setName] = useState(initial.name ?? '')
  const [unit, setUnit] = useState('')
  const [competence, setCompetence] = useState('')
  const fixed = setUp(name)
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
        <h2>{initial.name ? `Ny enhet for ${initial.name}` : 'Ny produkttype'}</h2>
        <div className="field-row">
          <label>
            Produkttype
            <PickField options={typeNames} value={name} autoFocus={!initial.name} onChange={setName} placeholder="Som i Visma, f.eks. FOGA-vegger" />
          </label>
          <label className="narrow">
            Enhet
            <PickField options={units} value={unit} autoFocus={!!initial.name} onChange={setUnit} placeholder="stk, lm, m², ordre" />
          </label>
        </div>
        <label>
          Kompetanse (nøkkelområde)
          <PickField options={competences} value={fixed ?? competence} disabled={fixed !== undefined} onChange={setCompetence} />
        </label>
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
        {duplicate && <span className="issue">Produkttypen har allerede denne enheten.</span>}
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
