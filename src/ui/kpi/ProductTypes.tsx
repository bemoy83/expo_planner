import { useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { addKpiRow, EMPTY_KPI, productTypeKey, removeKpiRow, renameUnit, setActiveUnit, setCompetence, setRate, type KpiRow, type KpiType, type Lacking, type NewKpiRow } from '../../domain/kpi'
import { parseDecimal } from '../../domain/numbers'
import { countsStands, setupHours, yieldByType, type TypeYield } from '../../domain/visma'
import { useWorkspace } from '../../store/workspaceStore'
import { usePref } from '../../store/prefs'
import { count } from '../dom'
import { AlertCount, FormDialog, Segmented } from '../common'
import { NumberField, PickField, TextField, type PickItem } from '../fields'
import { NeedButton, SplitPick } from '../behov/SplitPick'
import { useCompetenceColor } from '../behov/format'
import { wholeHours } from '../format'
import { CompetenceStrip } from '../personell/CompetenceStrip'
import { competenceStyles } from '../../domain/competences'
import { competenceKey, type CompetenceKey } from '../../domain/types'
import type { Notify } from '../Toasts'

const LACKING_TEXT: Record<Lacking, string> = {
  new: 'Ny fra Visma',
  'no-unit-in-use': 'Velg enhet i bruk',
  unit: 'Mangler enhet',
  competence: 'Mangler kompetanse',
  rate: 'Mangler sats',
}

type Filter = 'alle' | 'mangler' | 'ferdig'

/** What the page does to the setup, each with what the toast says. */
interface Edits {
  units: string[]
  competences: PickItem[]
  color: (competence: string) => string | undefined
  open: (name: string) => boolean
  toggle: (name: string) => void
  useUnit: (type: KpiType, unit: string) => void
  renameUnit: (type: KpiType, from: string, to: string) => void
  setCompetence: (type: KpiType, competence: string) => void
  setRate: (type: KpiType, row: KpiRow, phase: 'assembly' | 'dismantle', value: number) => void
  remove: (type: KpiType, row: KpiRow) => void
  addUnit: (type: KpiType) => void
  /** What the type's lines give in a unit: the one in use, unless another is named. */
  given: (type: KpiType, unit?: string) => TypeYield | undefined
}

/**
 * How each Visma product type is read, and its rates: the unit it is counted in, the competence it belongs to,
 * and how many units one person does per hour. A line per product type, under what it lacks first and then under
 * its competence; its other units fold out under it. The table fills itself with the product types found in the
 * Visma exports, so nothing has to be imported to get started.
 */
export function ProductTypes({ rows, types, yields, notify }: { rows: KpiRow[]; types: KpiType[]; yields: Map<string, TypeYield>; notify: Notify }) {
  const { workspace, setKpi } = useWorkspace()
  const kpi = workspace!.kpi ?? EMPTY_KPI
  const visma = workspace!.visma
  const bookings = useMemo(() => (visma ?? []).flatMap((source) => source.rows), [visma])
  const color = useCompetenceColor()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = usePref<Filter>('oppsettFilter', 'alle', (stored) => (stored === 'mangler' || stored === 'ferdig' ? stored : 'alle'))
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set())
  const [picked, setPicked] = useState<CompetenceKey | null>(null)
  const styles = useMemo(() => competenceStyles(workspace!), [workspace])
  const [adding, setAdding] = useState<Partial<NewKpiRow> | null>(null)

  const typeNames = useMemo(() => types.map((type) => type.name), [types])
  const competenceNames = useMemo(() => [...new Set(kpi.workTypes.map((rule) => rule.competence).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb')), [kpi.workTypes])
  const units = useMemo(() => [...new Set([...kpi.workTypes.map((rule) => rule.unit), ...kpi.rates.map((rate) => rate.unit)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb')), [kpi])
  const unfinished = types.filter((type) => type.unfinished).length

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return types.filter(
      (type) =>
        (!q || `${type.name} ${type.units.map((row) => row.unit).join(' ')} ${type.competence}`.toLowerCase().includes(q)) &&
        (filter === 'alle' || (filter === 'mangler') === type.unfinished) &&
        (!picked || competenceKey(type.competence) === picked),
    )
  }, [types, search, filter, picked])
  const byCompetence = (key: CompetenceKey) => types.filter((type) => competenceKey(type.competence) === key).length
  // The competences the product types name, in the planner's order.
  const named = styles.filter((style) => byCompetence(style.key) > 0)
  // What lacks something first, the most lines first; then a group per competence.
  const lacking = shown.filter((type) => type.unfinished).sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name, 'nb'))
  const groups = [...new Set(shown.filter((type) => !type.unfinished).map((type) => type.competence))]
    .sort((a, b) => Number(!a) - Number(!b) || a.localeCompare(b, 'nb'))
    .map((competence) => ({ competence, types: shown.filter((type) => !type.unfinished && type.competence === competence).sort((a, b) => a.name.localeCompare(b.name, 'nb')) }))

  /** Says so when rows already planned in the Kalender followed the product type to its new competence. */
  const changeCompetence = ({ name, units }: KpiType, competence: string) => {
    const { rows, replaced } = setKpi(setCompetence(kpi, name, units[0]?.unit ?? '', competence))
    const followed = rows ? ` ${count(rows, 'planlagt rad', 'planlagte rader')} i Kalender fulgte med, med FTE.` : ''
    const people = replaced.length ? ` ${replaced.join(', ')} finnes ikke lenger: de som hadde den har nå ${competence}, og blokkene deres i Bemanning fulgte med.` : ''
    notify(`${name} er nå ${competence}.${followed}${people}`)
  }

  const edits: Edits = {
    units,
    competences: competenceNames.map((competence) => ({ value: competence, dot: color(competence), note: count(types.filter((type) => type.competence === competence).length, 'type', 'typer') })),
    color,
    open: (name) => unfolded.has(name),
    toggle: (name) => setUnfolded((open) => (open.has(name) ? new Set([...open].filter((n) => n !== name)) : new Set([...open, name]))),
    useUnit: ({ name }, unit) => (setKpi(setActiveUnit(kpi, name, unit)), notify(`${name} regnes nå i ${unit}.`)),
    renameUnit: (type, from, to) => {
      if (!to) return
      const there = type.units.some((row) => row.unit.toLowerCase() === to.toLowerCase())
      setKpi(renameUnit(kpi, type.name, from, to))
      notify(!from ? `${type.name} regnes i ${to}.` : there ? `${type.name}: ${to} finnes allerede, den er nå i bruk.` : `${type.name}: ${from} heter nå ${to}.`)
    },
    setCompetence: changeCompetence,
    setRate: ({ name }, row, phase, value) => {
      setKpi(setRate(kpi, name, row.unit, { [phase]: value }))
      notify(`${name}: ${phase === 'assembly' ? 'montering' : 'demontering'} ${value ? `${String(value).replace('.', ',')} ${row.unit} per time` : 'ingen'}.`)
    },
    remove: ({ name }, row) => (setKpi(removeKpiRow(kpi, name, row.unit)), notify(`Slettet ${name} (${row.unit}).`)),
    addUnit: ({ name }) => setAdding({ name }),
    given: ({ name, inUse }, unit = inUse?.unit) =>
      unit === inUse?.unit ? yields.get(productTypeKey(name)) : unit ? yieldByType(bookings, setActiveUnit(kpi, name, unit)).get(productTypeKey(name)) : undefined,
  }
  const total = (types: KpiType[]) => {
    const { assembly, dismantle } = setupHours(types, yields)
    return assembly + dismantle
  }

  return (
    <div className="op">
      <div className="op-zone">
        <div className="op-strip">
          <input className="search" type="search" placeholder="Søk produkttype, enhet eller kompetanse" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Segmented
            label="Vis"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'alle', label: <>Alle <span className="count">{types.length}</span></> },
              { value: 'mangler', label: <>Mangler <AlertCount n={unfinished} /></>, title: 'Produkttyper som ikke er ferdig satt opp' },
              { value: 'ferdig', label: <>Satt opp <span className="count">{types.length - unfinished}</span></> },
            ]}
          />
          <span className="toolbar-gap" />
          <button className="primary" onClick={() => setAdding({})}>
            <Plus size={14} aria-hidden /> Ny produkttype
          </button>
        </div>
        {named.length > 0 && (
          <CompetenceStrip
            label="Produkttyper per kompetanse"
            styles={named}
            count={byCompetence}
            picked={picked}
            onPick={setPicked}
            title={(style) => `Vis produkttypene under ${style.label}`}
          />
        )}
        <p className="op-flow" title="Endringer her regner om Visma-linjene med én gang">
          <span>Ordrelinje</span>
          <ArrowRight size={12} aria-hidden />
          <strong>Produkttype</strong>
          <ArrowRight size={12} aria-hidden />
          <span>
            <strong>enhet i bruk</strong> gir antall
          </span>
          <span className="op-flow-aside">(ordre og stands teller stands, andre summerer «Totalt antall»)</span>
          <ArrowRight size={12} aria-hidden />
          <span>
            antall ÷ <strong>sats</strong> = timer
          </span>
          <ArrowRight size={12} aria-hidden />
          <span>
            under <strong>kompetanse</strong>
          </span>
        </p>
      </div>

      {types.length ? (
        <div className="op-table op-types">
          <div className="op-row op-head">
            <span />
            <span title="Navnet på produkttypen. Det er navnet som kobler en ordrelinje til satsen her.">Produkttype</span>
            <span title="«ordre» og «stands» teller antall stands; andre enheter summerer antall">Enhet i bruk</span>
            <span>Kompetanse</span>
            <span className="num" title="Enheter per persontime">
              Montering
            </span>
            <span className="num" title="Enheter per persontime. Tomt betyr ingen demontering.">
              Demontering
            </span>
            <span className="num" title="Ordrelinjer med denne produkttypen i Visma-utskriftene som er lest inn">
              Linjer
            </span>
            <span title="Timene linjene gir med oppsettet i dag, før effekt: montering og demontering">Gir timer</span>
            <span />
          </div>
          <div className="op-body">
            {lacking.length > 0 && (
              <section className="op-group lacking">
                <div className="op-group-head">
                  <i className="op-attention" aria-hidden />
                  Mangler oppsett <span className="op-group-count">{lacking.length}</span>
                  <span className="op-group-note">Timene for disse linjene er ukjente, ikke 0</span>
                </div>
                {lacking.map((type) => (
                  <TypeRows key={type.name} type={type} edits={edits} />
                ))}
              </section>
            )}
            {groups.map(({ competence, types }) => {
              const hours = total(types)
              return (
                <section key={competence} className="op-group">
                  <div className="op-group-head">
                    <i className="field-dot" style={{ background: color(competence) ?? 'var(--faint)' }} aria-hidden />
                    {competence || 'Uten kompetanse'} <span className="op-group-count">{types.length}</span>
                    {hours > 0 && <span className="op-group-note">{wholeHours(hours)} t</span>}
                  </div>
                  {types.map((type) => (
                    <TypeRows key={type.name} type={type} edits={edits} />
                  ))}
                </section>
              )
            })}
            {!shown.length && <p className="op-empty">Ingen produkttyper passer søket eller filteret.</p>}
          </div>
        </div>
      ) : (
        <p className="op-empty">
          Tabellen er tom. Den fyller seg selv: les inn en Visma-utskrift på Behov, så kommer produkttypene i utskriften opp her, klare til å få enhet, kompetanse og sats. Du kan også legge dem inn
          med «Ny produkttype», eller lese inn en KPI-fil under «Fil».
        </p>
      )}

      {adding && (
        <AddDialog
          initial={adding}
          typeNames={typeNames}
          units={units}
          competences={competenceNames}
          setUp={(name) => kpi.workTypes.find((rule) => productTypeKey(rule.productType) === productTypeKey(name))?.competence}
          exists={(name, unit) => rows.some((row) => row.unit !== '' && productTypeKey(row.name) === productTypeKey(name) && row.unit.toLowerCase() === unit.trim().toLowerCase())}
          onClose={() => setAdding(null)}
          onAdd={(row) => {
            // A type the exports name is set up with its text from Visma.
            const name = rows.find((known) => productTypeKey(known.name) === productTypeKey(row.name))?.name ?? row.name
            setKpi(addKpiRow(kpi, { ...row, name }))
            notify(kpi.workTypes.some((rule) => productTypeKey(rule.productType) === productTypeKey(name)) ? `${name} har nå også ${row.unit}.` : `La til ${name}.`)
            setAdding(null)
          }}
        />
      )}
    </div>
  )
}

/** The hours a type's lines give, montering and demontering, each by the square of its phase. */
function Hours({ given }: { given?: Pick<TypeYield, 'assembly' | 'dismantle'> }) {
  if (!given || given.assembly + given.dismantle === 0) return null
  return (
    <span className="op-hours">
      <span title="Montering">
        <i className="phase-swatch mon" aria-hidden />
        {wholeHours(given.assembly)}
      </span>
      <span title="Demontering">
        <i className="phase-swatch dem" aria-hidden />
        {given.dismantle ? wholeHours(given.dismantle) : '–'}
      </span>
    </span>
  )
}

/** A button that says what is missing, raised, until it is clicked: then the field that fills it in. */
function Want({ missing, label, children }: { missing: string; label: string; children: ReactNode }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <span onBlur={() => setEditing(false)}>{children}</span>
  return <NeedButton missing={missing} label={label} list={false} onClick={() => setEditing(true)} />
}

/** A rate of a unit, edited in place, with the unit per hour after it. */
function Rate({ type, row, phase, want, edits }: { type: KpiType; row: KpiRow; phase: 'assembly' | 'dismantle'; want?: boolean; edits: Edits }) {
  const value = row[phase]
  const what = phase === 'assembly' ? 'Montering' : 'Demontering'
  const field = (autoFocus?: boolean) => (
    <NumberField value={value} autoFocus={autoFocus} placeholder={phase === 'dismantle' ? 'ingen' : '–'} ariaLabel={`${what} for ${type.name}, ${row.unit} per time`} onCommit={(n) => edits.setRate(type, row, phase, n)} />
  )
  if (want && !value)
    return (
      <Want missing="sats" label={`${what} for ${type.name}`}>
        {field(true)}
      </Want>
    )
  return (
    <span className="op-rate">
      {field()}
      {value > 0 && <i className="op-per">{row.unit}/t</i>}
    </span>
  )
}

/** The line of a product type, and the lines of its units under it when it is folded out. */
function TypeRows({ type, edits }: { type: KpiType; edits: Edits }) {
  const { inUse, units } = type
  const several = units.length > 1
  const open = several && edits.open(type.name)
  const needsUnit = type.lacking === 'new' || type.lacking === 'unit'
  return (
    <>
      <div className={open ? 'op-row unfolded' : 'op-row'}>
        <span className="op-fold">
          {several && (
            <button className="icon-button small" aria-expanded={open} title={open ? 'Skjul enhetene' : 'Vis satsene for alle enhetene'} onClick={() => edits.toggle(type.name)}>
              {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
            </button>
          )}
        </span>
        <span className="op-name">
          <strong>{type.name}</strong>
          {type.unfinished && type.lacking && <span className="op-lacking">{LACKING_TEXT[type.lacking]}</span>}
          {!type.unfinished && !type.lines && <span className="op-tag">ikke i utskriftene</span>}
        </span>
        <span className="op-unit">
          {!units.length ? (
            needsUnit ? (
              <Want missing="Sett enhet" label={`Enhet for ${type.name}`}>
                <TextField value="" autoFocus floating options={edits.units} ariaLabel={`Enhet for ${type.name}`} placeholder="stk, m, ordre" onCommit={(unit) => edits.renameUnit(type, '', unit)} />
              </Want>
            ) : null
          ) : several || !inUse ? (
            <span className="op-units">
              <Segmented
                small
                want={!inUse}
                label={`Enheten ${type.name} regnes i`}
                value={inUse?.unit ?? ''}
                onChange={(unit) => unit !== inUse?.unit && edits.useUnit(type, unit)}
                options={units.map((row) => ({ value: row.unit, label: row.unit, title: row.active ? 'Enheten som er i bruk' : `Regn ${type.name} i ${row.unit}` }))}
              />
            </span>
          ) : (
            <TextField value={inUse.unit} floating options={edits.units} ariaLabel={`Enhet for ${type.name}`} onCommit={(unit) => edits.renameUnit(type, inUse.unit, unit)} />
          )}
        </span>
        <span className="op-competence">
          <SplitPick
            value={type.competence}
            dot={type.competence ? edits.color(type.competence) : undefined}
            missing="Velg"
            label={`Kompetanse for ${type.name}`}
            head={`Kompetanse for ${type.name}`}
            groups={[{ items: edits.competences }]}
            free="Ny kompetanse"
            onPick={(competence) => competence !== type.competence && edits.setCompetence(type, competence)}
          />
        </span>
        <span className="num">{inUse && <Rate type={type} row={inUse} phase="assembly" want={type.lacking === 'rate'} edits={edits} />}</span>
        <span className="num">{inUse && <Rate type={type} row={inUse} phase="dismantle" edits={edits} />}</span>
        <span className="num muted">{type.lines || ''}</span>
        <span>{!type.lacking ? <Hours given={edits.given(type)} /> : type.lines > 0 && <span className="op-unknown">ukjent</span>}</span>
        <span className="op-actions">
          <button className="icon-button small" title={`Legg til en annen enhet for ${type.name}`} aria-label={`Ny enhet for ${type.name}`} onClick={() => edits.addUnit(type)}>
            <Plus size={14} aria-hidden />
          </button>
          {units.length === 1 && (
            <button className="icon-button small" title={`Slett ${type.name} (${units[0].unit})`} aria-label={`Slett ${type.name}`} onClick={() => edits.remove(type, units[0])}>
              <Trash2 size={13} aria-hidden />
            </button>
          )}
        </span>
      </div>
      {open &&
        units.map((row) => {
          const given = edits.given(type, row.unit)
          return (
          <div key={row.unit} className="op-row op-sub">
            <span />
            <span>
              {row.active ? (
                <span className="pill ok">I bruk</span>
              ) : (
                <button className="link" onClick={() => edits.useUnit(type, row.unit)}>
                  Bruk denne
                </button>
              )}
            </span>
            <span>
              <TextField value={row.unit} floating options={edits.units} ariaLabel={`Enhet for ${type.name}`} onCommit={(unit) => edits.renameUnit(type, row.unit, unit)} />
            </span>
            <span className="muted">{given && (countsStands(row.unit) ? `teller ${count(given.quantity, 'stand', 'stands')}` : `summerer ${wholeHours(given.quantity)} ${row.unit}`)}</span>
            <span className="num">
              <Rate type={type} row={row} phase="assembly" edits={edits} />
            </span>
            <span className="num">
              <Rate type={type} row={row} phase="dismantle" edits={edits} />
            </span>
            <span />
            <span className={row.active ? undefined : 'muted'}>
              <Hours given={given} />
            </span>
            <span className="op-actions">
              <button className="icon-button small" title={`Slett ${row.unit}`} aria-label={`Slett ${type.name} (${row.unit})`} onClick={() => edits.remove(type, row)}>
                <Trash2 size={13} aria-hidden />
              </button>
            </span>
          </div>
          )
        })}
    </>
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

  const per = `${unit.trim() || 'enheter'} per time`
  return (
    <FormDialog
      title={initial.name ? `Ny enhet for ${initial.name}` : 'Ny produkttype'}
      lead={initial.name ? 'Satsene gjelder bare denne enheten. Enheten i bruk endres ikke.' : 'Navnet må være som i Visma: det er det som kobler ordrelinjene til satsen.'}
      wide
      issue={duplicate && 'Produkttypen har allerede denne enheten.'}
      valid={valid}
      onSubmit={() => onAdd({ name, unit, competence, assembly: toNumber(assembly), dismantle: toNumber(dismantle) })}
      onClose={onClose}
    >
      <div className="op-form">
        <label className="wide">
          Produkttype
          <PickField options={typeNames} value={name} autoFocus={!initial.name} disabled={!!initial.name} onChange={setName} placeholder="Som i Visma, f.eks. FOGA-vegger" />
        </label>
        <label>
          Enhet
          <PickField options={units} value={unit} autoFocus={!!initial.name} onChange={setUnit} placeholder="stk, m, m², ordre" />
        </label>
        <label className="full">
          <span>
            Kompetanse (nøkkelområde){fixed !== undefined && <small> · følger produkttypen</small>}
          </span>
          <PickField options={competences} value={fixed ?? competence} disabled={fixed !== undefined} onChange={setCompetence} />
        </label>
        <label className="half">
          Montering, {per}
          <input inputMode="decimal" value={assembly} onChange={(e) => setAssembly(e.target.value)} />
        </label>
        <label className="half">
          Demontering, {per}
          <input inputMode="decimal" value={dismantle} placeholder="tomt = ingen" onChange={(e) => setDismantle(e.target.value)} />
        </label>
      </div>
    </FormDialog>
  )
}
