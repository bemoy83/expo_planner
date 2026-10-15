import { useMemo, useState } from 'react'
import { addKpiRow, EMPTY_KPI, productTypeKey, removeKpiRow, renameUnit, setActiveUnit, setCompetence, setRate, type KpiRow, type Lacking, type NewKpiRow } from '../../domain/kpi'
import { decimalText, parseDecimal } from '../../domain/numbers'
import { useWorkspace } from '../../store/workspaceStore'
import { DataTable } from '../DataTable'
import { useTable, type Column } from '../useTable'
import { NumberField, PickField, TextField } from '../fields'
import { X } from 'lucide-react'
import type { Notify } from './Oppsett'


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
export function ProductTypes({ rows, notify }: { rows: KpiRow[]; notify: Notify }) {
  const { workspace, setKpi } = useWorkspace()
  const kpi = workspace!.kpi ?? EMPTY_KPI
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState<Partial<NewKpiRow> | null>(null)

  const found = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? rows.filter((row) => `${row.name} ${row.unit} ${row.competence}`.toLowerCase().includes(q)) : rows
  }, [rows, search])
  const typeNames = useMemo(() => [...new Set(rows.map((row) => row.name))], [rows])
  const competences = useMemo(() => [...new Set(kpi.workTypes.map((rule) => rule.competence).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb')), [kpi.workTypes])
  const units = useMemo(() => [...new Set([...kpi.workTypes.map((rule) => rule.unit), ...kpi.rates.map((rate) => rate.unit)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb')), [kpi])

  /** Says so when rows already planned in the Kalender followed the product type to its new competence. */
  const changeCompetence = ({ name, unit }: KpiRow, competence: string) => {
    const { rows, replaced } = setKpi(setCompetence(kpi, name, unit, competence))
    const followed = rows ? ` ${rows === 1 ? '1 planlagt rad' : `${rows} planlagte rader`} i Kalender fulgte med til ${competence}, med FTE.` : ''
    const people = replaced.length ? ` ${replaced.join(', ')} finnes ikke lenger: de som hadde den har nå ${competence}, og blokkene deres i Bemanning fulgte med.` : ''
    notify(`${name} er nå ${competence}.${followed}${people}`)
  }

  const columns: Column<KpiRow>[] = [
    {
      key: 'name',
      head: 'Produkttype',
      title: 'Navnet på produkttypen. Det er navnet som kobler en ordrelinje til satsen her.',
      text: (row) => row.name,
      cell: (row, index, shown) => (firstOfType(row, index, shown) ? <strong>{row.name}</strong> : row.name),
    },
    {
      key: 'unit',
      head: 'Enhet',
      title: '«ordre» og «stands» teller antall stands; andre enheter summerer antall',
      text: (row) => row.unit,
      // An emptied field is left as it was: a rate cannot be without a unit.
      cell: (row) => <TextField value={row.unit} options={units} ariaLabel={`Enhet for ${row.name}`} onCommit={(value) => value && setKpi(renameUnit(kpi, row.name, row.unit, value))} />,
    },
    {
      key: 'active',
      head: 'I bruk',
      title: 'Enheten Visma-linjer av denne produkttypen regnes med',
      className: 'center',
      text: (row) => (row.active ? 'Ja' : 'Nei'),
      cell: (row) =>
        row.unit ? <input type="radio" checked={row.active} aria-label={`Regn ${row.name} i ${row.unit}`} onChange={() => setKpi(setActiveUnit(kpi, row.name, row.unit))} /> : '',
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
      cell: (row) => (row.unit ? <NumberField value={row.assembly} onCommit={(value) => setKpi(setRate(kpi, row.name, row.unit, { assembly: value }))} /> : ''),
    },
    {
      key: 'dismantle',
      head: 'Demontering',
      title: 'Enheter per persontime. Tomt betyr ingen demontering.',
      className: 'num',
      text: (row) => (row.dismantle ? decimalText(row.dismantle) : ''),
      sort: (row) => row.dismantle,
      cell: (row) => (row.unit ? <NumberField value={row.dismantle} onCommit={(value) => setKpi(setRate(kpi, row.name, row.unit, { dismantle: value }))} /> : ''),
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
            <button className="row-action" title="Slett" onClick={() => (setKpi(removeKpiRow(kpi, row.name, row.unit)), notify(`Slettet ${row.name}${row.unit ? ` (${row.unit})` : ''}.`))}>
              <X size={13} aria-hidden />
            </button>
          )}
        </>
      ),
    },
  ]
  const table = useTable(found, columns)
  return (
    <div className="op">
      <div className="op-bar">
        <input className="search" type="search" placeholder="Søk produkttype, enhet eller kompetanse" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="toolbar-gap" />
        <button className="primary" onClick={() => setAdding({})}>
          + Ny produkttype
        </button>
      </div>
      <p className="hint">
        Slik leses Visma-utskriften: ordrelinjene grupperes per prosjekt, avdeling, produkttype og hall, og timer = antall ÷ sats. <strong>Enhet</strong> bestemmer hvordan antallet regnes: «ordre»
        og «stands» teller antall stands, alle andre enheter summerer «Totalt antall». En produkttype kan ha satser for flere enheter; den som er merket <strong>i bruk</strong> regnes det med.{' '}
        <strong>Kompetanse</strong> er nøkkelområdet timene havner under. Satsen er hvor mange enheter én person gjør på en time. Endringer her regner om Visma-linjene med én gang.
      </p>
      <div className="op-scroll">
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
            legge dem inn med «Ny produkttype», eller lese inn en KPI-fil med «Importer fra fil»: en du har eksportert herfra, eller en med kolonnene Produkttype, Enhet, Montering og
            Demontering. Har en produkttype flere enheter i filen og ingen er merket «I bruk», velger du selv hvilken som er i bruk.
          </p>
        )}
      </div>

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
            const name = rows.find((known) => productTypeKey(known.name) === productTypeKey(row.name))?.name ?? row.name
            setKpi(addKpiRow(kpi, { ...row, name }))
            notify(kpi.workTypes.some((rule) => productTypeKey(rule.productType) === productTypeKey(name)) ?`${name} har nå også ${row.unit}.` : `La til ${name}.`)
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
