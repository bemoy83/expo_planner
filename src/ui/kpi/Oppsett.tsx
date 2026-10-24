import { useMemo } from 'react'
import { diffKpi, EMPTY_KPI, excludedLines, kpiRows, kpiTypes, linesByText, mergeKpi, replaceKpi, type KpiFile } from '../../domain/kpi'
import { setupHours, yieldByType } from '../../domain/visma'
import { readKpiWorkbook, writeKpiWorkbook } from '../../import/kpiFile'
import { todayIso } from '../../domain/dates'
import { useWorkspace } from '../../store/workspaceStore'
import { count } from '../dom'
import { wholeHours } from '../format'
import { BandFigures, Figure } from '../BandFigures'
import { MergeReplaceDialog } from '../common'
import { download, XLSX_TYPE } from '../files'
import { TableFileMenu } from '../TableFile'
import { describeDiff, useTableFile } from '../useTableFile'
import { Toasts, useUndoToasts } from '../Toasts'
import { RegisterHead, type PageCount, type RegisterPage } from '../RegisterHead'
import { ProductTypes } from './ProductTypes'
import { TextRules } from './TextRules'
import { ExcludedArticles } from './ExcludedArticles'

export type OppsettPage = 'kpi' | 'tekstregler' | 'utelatte'

interface Props {
  page: OppsettPage
  pages: RegisterPage<OppsettPage>[]
  onPage: (page: OppsettPage) => void
  onOpenBehov: () => void
}

/**
 * How the orders are read: the product types with their units, competences and rates, the product types given to
 * article texts, and the article numbers that are not read. A page each, switched in the page header; the file of
 * the setup holds all of it, so it is read and written from the header.
 */
export function Oppsett({ page, pages, onPage, onOpenBehov }: Props) {
  const { workspace, setKpi } = useWorkspace()
  const ws = workspace!
  const kpi = ws.kpi ?? EMPTY_KPI
  const { toasts, show, dismiss, notify } = useUndoToasts()

  const rows = useMemo(() => kpiRows(kpi, ws.visma ?? []), [kpi, ws.visma])
  const types = useMemo(() => kpiTypes(rows), [rows])
  const unfinished = types.filter((type) => type.unfinished).length
  const yields = useMemo(() => yieldByType((ws.visma ?? []).flatMap((source) => source.rows), kpi), [ws.visma, kpi])

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

  const counts: Record<OppsettPage, PageCount> = {
    kpi: { rows: types.length, issues: unfinished, issueText: (n) => `${count(n, 'produkttype', 'produkttyper')} er ikke ferdig satt opp` },
    tekstregler: { rows: kpi.byText?.length ?? 0 },
    utelatte: { rows: kpi.excludedArticles?.length ?? 0 },
  }

  // The page's key figures, on the band; none where its list is empty.
  const lines = (n: number) => (n === 1 ? 'ordrelinje' : 'ordrelinjer')
  const figures = (() => {
    if (page === 'kpi') {
      if (!types.length) return null
      const { assembly, dismantle } = setupHours(types, yields)
      return (
        <BandFigures>
          <Figure label="Produkttyper" value={types.length} unit="" sub={unfinished ? `${unfinished} mangler oppsett` : 'Alle er satt opp'} />
          <Figure label="Montering" value={<><i className="phase-swatch mon" aria-hidden />{wholeHours(assembly)}</>} sub={unfinished ? 'Uten typene som mangler' : undefined} />
          <Figure label="Demontering" value={<><i className="phase-swatch dem" aria-hidden />{wholeHours(dismantle)}</>} />
        </BandFigures>
      )
    }
    if (page === 'tekstregler') {
      const rules = kpi.byText ?? []
      if (!rules.length) return null
      const given = [...linesByText(ws.visma ?? [], kpi).values()].reduce((sum, n) => sum + n, 0)
      return (
        <BandFigures>
          <Figure label="Tekstregler" value={rules.length} unit="" />
          <Figure label="Gir produkttype til" value={given} unit={lines(given)} />
        </BandFigures>
      )
    }
    const excluded = kpi.excludedArticles ?? []
    if (!excluded.length) return null
    const out = excludedLines(ws.visma ?? [], kpi)
    return (
      <BandFigures>
        <Figure label="Utelatte artikler" value={excluded.length} unit="" />
        <Figure label="Holdes utenfor" value={out} unit={lines(out)} />
      </BandFigures>
    )
  })()

  return (
    <div className="register-page">
      <RegisterHead title="Oppsett" pages={pages} page={page} counts={counts} onPage={onPage}>
        <TableFileMenu
          exportTitle="Last ned oppsettet som en Excel-fil: produkttypene med enheter, enhet i bruk, kompetanse og satser, og de utelatte artiklene."
          importTitle="Les inn en KPI-fil: en som er eksportert herfra, eller en med kolonnene Produkttype, Enhet, Montering og Demontering."
          canExport={kpi.workTypes.length + kpi.rates.length > 0}
          onExport={() => download(`expo-planner-kpi-${todayIso()}.xlsx`, writeKpiWorkbook(kpi, ws.visma ?? []), XLSX_TYPE)}
          onFile={onFile}
        />
      </RegisterHead>
      {figures}

      {page === 'kpi' && <ProductTypes rows={rows} types={types} yields={yields} notify={notify} />}
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
