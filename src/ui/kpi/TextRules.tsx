import { useMemo } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { EMPTY_KPI, linesByText, linesWithoutProductType, withTextType } from '../../domain/kpi'
import { useWorkspace } from '../../store/workspaceStore'
import { DataTable } from '../DataTable'
import { useTable, type Column } from '../useTable'
import { count } from '../dom'
import { SplitPick } from '../behov/SplitPick'
import { kpiTypeItem, useCompetenceColor } from '../behov/format'
import type { Notify } from '../Toasts'

type TextRule = { text: string; productType: string }

/** The product types the planner gave the article texts of lines without one, on Behov: they hold for the next export too. */
export function TextRules({ notify, onOpenBehov }: { notify: Notify; onOpenBehov: () => void }) {
  const { workspace, setKpi } = useWorkspace()
  const ws = workspace!
  const kpi = ws.kpi ?? EMPTY_KPI
  const rules = kpi.byText ?? []
  // Lines that still have no product type, with the rules applied: they wait for one on Behov.
  const untyped = useMemo(() => linesWithoutProductType(ws.visma ?? [], kpi), [ws.visma, kpi])
  const lines = useMemo(() => linesByText(ws.visma ?? [], kpi), [ws.visma, kpi])
  const linesOf = (rule: TextRule) => lines.get(rule.text.trim().toLowerCase()) ?? 0
  const color = useCompetenceColor()
  // A text can be read as a type that has a unit in use: one its lines give hours by.
  const types = kpi.workTypes.filter((rule) => rule.unit).sort((a, b) => a.productType.localeCompare(b.productType, 'nb'))
  const items = types.map((type) => kpiTypeItem(type, color))
  const competenceOf = (name: string) => types.find((type) => type.productType.toLowerCase() === name.toLowerCase())?.competence ?? ''

  const columns: Column<TextRule>[] = [
    {
      key: 'text',
      head: 'Artikkeltekst i Visma',
      text: (rule) => rule.text,
      cell: (rule) => <span className="op-quote">«{rule.text}»</span>,
      foot: () => (
        <span className="sum-lead">
          <span className="muted">
            {count(rules.length, 'regel', 'regler')} gir produkttype til {count(rules.reduce((sum, rule) => sum + linesOf(rule), 0), 'ordrelinje', 'ordrelinjer')}
          </span>
        </span>
      ),
      footSpan: 5,
    },
    { key: 'arrow', className: 'op-arrow', cell: () => <ArrowRight size={13} aria-hidden /> },
    {
      key: 'type',
      head: 'Regnes som',
      text: (rule) => rule.productType,
      cell: (rule) => (
        <SplitPick
          value={rule.productType}
          dot={color(competenceOf(rule.productType))}
          missing="Velg type"
          label={`Produkttypen «${rule.text}» regnes som`}
          head={`«${rule.text}» regnes som`}
          groups={[{ items }]}
          onPick={(type) => type !== rule.productType && (setKpi(withTextType(kpi, rule.text, type)), notify(`«${rule.text}» regnes nå som ${type}.`))}
        />
      ),
    },
    {
      key: 'lines',
      head: 'Linjer',
      title: 'Ordrelinjer uten produkttype med teksten i Visma-utskriftene som er lest inn',
      className: 'num',
      text: (rule) => String(linesOf(rule) || ''),
      sort: linesOf,
      cell: (rule) => linesOf(rule) || '',
    },
    {
      key: 'actions',
      className: 'actions',
      cell: (rule) => (
        <button
          className="row-action"
          title="Glem regelen: linjene med teksten mangler arbeidstype igjen"
          onClick={() => (setKpi(withTextType(kpi, rule.text, undefined)), notify(`Glemte regelen for «${rule.text}»${linesOf(rule) ? `: ${count(linesOf(rule), 'linje', 'linjer')} mangler arbeidstype igjen` : ''}.`))}
        >
          <X size={13} aria-hidden />
        </button>
      ),
    },
  ]
  const table = useTable(rules, columns)

  return (
    <div className="op card">
      <div className="card-head">
        <p className="op-lead">
          Linjer <strong>uten produkttype</strong> i Visma med en av disse artikkeltekstene regnes som typen, også i neste utskrift. Reglene lages under «Avklar» på Behov.
        </p>
        {untyped > 0 && (
          <button className="need-button" onClick={onOpenBehov} title="Gi linjene en arbeidstype under «Avklar» på Behov">
            {count(untyped, 'linje', 'linjer')} venter på Behov <ArrowRight size={13} aria-hidden />
          </button>
        )}
      </div>
      <div className="op-body">
        {rules.length ? (
          <DataTable table={table} className="card-table op-rules" rowKey={(rule) => rule.text.toLowerCase()} />
        ) : (
          <p className="op-empty">Ingen tekstregler ennå. De lages når du gir linjer uten produkttype en arbeidstype under «Avklar» på Behov.</p>
        )}
      </div>
    </div>
  )
}
