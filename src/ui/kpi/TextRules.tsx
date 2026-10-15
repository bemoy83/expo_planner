import { useMemo } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { EMPTY_KPI, linesWithoutProductType, withTextType } from '../../domain/kpi'
import { useWorkspace } from '../../store/workspaceStore'
import { DataTable } from '../DataTable'
import { useTable, type Column } from '../useTable'
import { count } from '../dom'
import type { Notify } from './Oppsett'

type TextRule = { text: string; productType: string }

/** The product types the planner gave the article texts of lines without one, on Behov: they hold for the next export too. */
export function TextRules({ notify, onOpenBehov }: { notify: Notify; onOpenBehov: () => void }) {
  const { workspace, setKpi } = useWorkspace()
  const ws = workspace!
  const kpi = ws.kpi ?? EMPTY_KPI
  const rules = kpi.byText ?? []
  // Lines that still have no product type, with the rules applied: they wait for one on Behov.
  const untyped = useMemo(() => linesWithoutProductType(ws.visma ?? [], kpi), [ws.visma, kpi])

  const columns: Column<TextRule>[] = [
    { key: 'text', head: 'Artikkeltekst i Visma', text: (rule) => rule.text, cell: (rule) => <span className="op-quote">«{rule.text}»</span> },
    { key: 'arrow', className: 'op-arrow', cell: () => <ArrowRight size={13} aria-hidden /> },
    { key: 'type', head: 'Regnes som', text: (rule) => rule.productType, cell: (rule) => rule.productType },
    {
      key: 'actions',
      className: 'actions',
      cell: (rule) => (
        <button className="row-action" title="Glem regelen: linjene med teksten mangler arbeidstype igjen" onClick={() => (setKpi(withTextType(kpi, rule.text, undefined)), notify(`Glemte regelen for «${rule.text}».`))}>
          <X size={13} aria-hidden />
        </button>
      ),
    },
  ]
  const table = useTable(rules, columns)

  return (
    <div className="op">
      <div className="op-bar">
        <p className="op-lead">
          Linjer <strong>uten produkttype</strong> i Visma med en av disse artikkeltekstene regnes som typen, også i neste utskrift. Reglene lages under «Avklar» på Behov.
        </p>
        <span className="toolbar-gap" />
        {untyped > 0 && (
          <button className="need-button" onClick={onOpenBehov} title="Gi linjene en arbeidstype under «Avklar» på Behov">
            {count(untyped, 'linje', 'linjer')} venter på Behov <ArrowRight size={13} aria-hidden />
          </button>
        )}
      </div>
      <div className="op-scroll">
        {rules.length ? (
          <DataTable table={table} className="op-rules" rowKey={(rule) => rule.text.toLowerCase()} />
        ) : (
          <p className="notice">Ingen tekstregler ennå. De lages når du gir linjer uten produkttype en arbeidstype under «Avklar» på Behov.</p>
        )}
      </div>
    </div>
  )
}
