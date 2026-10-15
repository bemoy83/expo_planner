import { useCallback, useMemo, type ReactNode } from 'react'
import { diffKpi, EMPTY_KPI, kpiRows, mergeKpi, replaceKpi, unfinishedTypes, type KpiFile } from '../../domain/kpi'
import { readKpiWorkbook, writeKpiWorkbook } from '../../import/kpiFile'
import { todayIso } from '../../domain/dates'
import { useWorkspace } from '../../store/workspaceStore'
import { count } from '../dom'
import { MergeReplaceDialog, Segmented, UndoRedoButtons } from '../common'
import { download, XLSX_TYPE } from '../files'
import { TableFileMenu } from '../TableFile'
import { describeDiff, useTableFile } from '../useTableFile'
import { Toasts, useToasts } from '../Toasts'
import { ProductTypes } from './ProductTypes'
import { TextRules } from './TextRules'
import { ExcludedArticles } from './ExcludedArticles'

export type OppsettPage = 'kpi' | 'tekstregler' | 'utelatte'

/** Says what a change did, with «Angre» to take it back. */
export type Notify = (text: string) => void

interface Props {
  page: OppsettPage
  pages: { view: OppsettPage; label: string; title?: string }[]
  onPage: (page: OppsettPage) => void
  onOpenBehov: () => void
}

/**
 * How the orders are read: the product types with their units, competences and rates, the product types given to
 * article texts, and the article numbers that are not read. A page each, switched in the page header; the file of
 * the setup holds all of it, so it is read and written from the header.
 */
export function Oppsett({ page, pages, onPage, onOpenBehov }: Props) {
  const { workspace, setKpi, undo } = useWorkspace()
  const ws = workspace!
  const kpi = ws.kpi ?? EMPTY_KPI
  const { toasts, show, dismiss } = useToasts()
  const notify = useCallback<Notify>((text) => show(text, { label: 'Angre', run: undo }), [show, undo])

  const rows = useMemo(() => kpiRows(kpi, ws.visma ?? []), [kpi, ws.visma])
  const unfinished = useMemo(() => unfinishedTypes(rows), [rows])
  const types = useMemo(() => new Set(rows.map((row) => row.name)).size, [rows])

  const { pending, onFile, done } = useTableFile<KpiFile>({
    read: readKpiWorkbook,
    empty: !kpi.rates.length && !kpi.workTypes.length,
    takeIn: (incoming, file) => {
      setKpi(replaceKpi(kpi, incoming))
      const toChoose = incoming.workTypes.filter((rule) => !rule.unit).length
      notify(
        `${file} lest inn: ${incoming.workTypes.length} produkttyper og ${incoming.rates.length} satser${incoming.excludedArticles?.length ? `, ${count(incoming.excludedArticles.length, 'utelatt artikkel', 'utelatte artikler')}` : ''}.${toChoose ? ` ${toChoose} produkttyper har flere enheter; velg hvilken som er i bruk.` : ''}`,
      )
    },
    onError: (text) => show(text),
  })
  const apply = (mode: 'merge' | 'replace') => {
    if (!pending) return
    setKpi(mode === 'merge' ? mergeKpi(kpi, pending.incoming) : replaceKpi(kpi, pending.incoming))
    notify(`${pending.file} ${mode === 'merge' ? 'slått sammen med oppsettet' : 'har erstattet oppsettet'}.`)
    done()
  }
  const diff = pending ? diffKpi(kpi, pending.incoming) : null

  const counted: Record<OppsettPage, ReactNode> = {
    kpi: unfinished ? (
      <span className="count-chip alert" title={`${count(unfinished, 'produkttype', 'produkttyper')} er ikke ferdig satt opp`}>
        {unfinished}
      </span>
    ) : (
      <span className="count">{types}</span>
    ),
    tekstregler: <span className="count">{kpi.byText?.length ?? 0}</span>,
    utelatte: <span className="count">{kpi.excludedArticles?.length ?? 0}</span>,
  }

  return (
    <div className="oppsett-page">
      <div className="page-head mode-band">
        <h2>Oppsett</h2>
        <Segmented
          label="Del av Oppsett"
          value={page}
          onChange={onPage}
          options={pages.map(({ view, label, title }) => ({
            value: view,
            title,
            label: (
              <>
                {label} {counted[view]}
              </>
            ),
          }))}
        />
        <span className="toolbar-gap" />
        <UndoRedoButtons />
        <TableFileMenu
          exportTitle="Last ned oppsettet som en Excel-fil: produkttypene med enheter, enhet i bruk, kompetanse og satser, og de utelatte artiklene."
          importTitle="Les inn en KPI-fil: en som er eksportert herfra, eller en med kolonnene Produkttype, Enhet, Montering og Demontering."
          canExport={kpi.workTypes.length + kpi.rates.length > 0}
          onExport={() => download(`expo-planner-kpi-${todayIso()}.xlsx`, writeKpiWorkbook(kpi, ws.visma ?? []), XLSX_TYPE)}
          onFile={onFile}
        />
      </div>

      {page === 'kpi' && <ProductTypes rows={rows} notify={notify} />}
      {page === 'tekstregler' && <TextRules notify={notify} onOpenBehov={onOpenBehov} />}
      {page === 'utelatte' && <ExcludedArticles notify={notify} />}

      {pending && diff && (
        <MergeReplaceDialog
          title="Importer KPI"
          source={pending.file}
          results={[describeDiff('Produkttyper', diff.workTypes), describeDiff('Satser', diff.rates), ...(pending.incoming.excludedArticles ? [describeDiff('Utelatte artikler', diff.excludedArticles)] : [])]}
          replaceText={`produkttypene og satsene i appen byttes helt ut med filen; ${pending.incoming.unitsInUse ? 'enheten i bruk er den filen merker, og ellers den du har valgt' : 'enheten du har valgt for en produkttype beholdes så lenge den har sats'}${
            diff.workTypes.onlyInApp + diff.rates.onlyInApp > 0 ? `; ${diff.workTypes.onlyInApp + diff.rates.onlyInApp} rader som bare finnes i appen forsvinner` : ''
          }`}
          onCancel={done}
          onApply={apply}
        />
      )}
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
