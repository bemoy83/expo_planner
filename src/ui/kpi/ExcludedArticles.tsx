import { useMemo, useState } from 'react'
import { Ban, X } from 'lucide-react'
import { articleKey, articlesSeen, EMPTY_KPI, withExcludedArticle, withoutExcludedArticle } from '../../domain/kpi'
import { useWorkspace } from '../../store/workspaceStore'
import { DataTable } from '../DataTable'
import { useTable, type Column } from '../useTable'
import { count } from '../dom'
import { PickField, TextField } from '../fields'
import type { ExcludedArticle } from '../../domain/types'
import type { Notify } from '../Toasts'

/**
 * The article numbers whose booking lines are not read: they give no lines, no quantity and no hours, in any project.
 * For what is ordered but is no work for the crew, as freight or a fee.
 */
export function ExcludedArticles({ notify }: { notify: Notify }) {
  const { workspace, setKpi } = useWorkspace()
  const ws = workspace!
  const kpi = ws.kpi ?? EMPTY_KPI
  const visma = ws.visma
  const [number, setNumber] = useState('')
  const [note, setNote] = useState('')
  const seen = useMemo(() => new Map(articlesSeen(visma ?? []).map((article) => [articleKey(article.articleNo), article])), [visma])
  const listed = kpi.excludedArticles ?? []
  const out = new Set(listed.map((article) => articleKey(article.articleNo)))
  const offered = [...seen.values()].filter((article) => !out.has(articleKey(article.articleNo)))
  const known = out.has(articleKey(number))
  /** The article typed, as the exports have it. */
  const typed = seen.get(articleKey(number))
  const add = () => {
    if (!number.trim() || known) return
    // The text of its lines is the note when none is written.
    setKpi(withExcludedArticle(kpi, number, note.trim() || typed?.texts[0] || ''))
    const lines = typed?.lines
    notify(`Utelot art.nr ${number.trim()}${lines ? `: ${count(lines, 'ordrelinje', 'ordrelinjer')} holdes utenfor` : ''}.`)
    setNumber('')
    setNote('')
  }
  const seenOf = (article: ExcludedArticle) => seen.get(articleKey(article.articleNo))
  const columns: Column<ExcludedArticle>[] = [
    {
      key: 'articleNo',
      head: 'Art.nr',
      text: (article) => article.articleNo,
      cell: (article) => <strong className="op-number">{article.articleNo}</strong>,
    },
    {
      key: 'note',
      head: 'Merknad',
      text: (article) => article.note,
      cell: (article) => <TextField value={article.note} ariaLabel={`Merknad for ${article.articleNo}`} placeholder="Hva artikkelen er" onCommit={(value) => setKpi(withExcludedArticle(kpi, article.articleNo, value))} />,
    },
    {
      key: 'texts',
      head: 'Tekst i ordrene',
      text: (article) => seenOf(article)?.texts.join(' · ') ?? '',
      cell: (article) => <span className="muted">{seenOf(article)?.texts.join(' · ')}</span>,
    },
    {
      key: 'lines',
      head: 'Linjer',
      title: 'Ordrelinjer med artikkelen i Visma-utskriftene som er lest inn',
      className: 'num',
      text: (article) => String(seenOf(article)?.lines ?? ''),
      sort: (article) => seenOf(article)?.lines ?? 0,
      cell: (article) => seenOf(article)?.lines || '',
    },
    {
      key: 'actions',
      className: 'actions',
      cell: (article) => (
        <button className="row-action" title="Regn med artikkelen igjen" onClick={() => (setKpi(withoutExcludedArticle(kpi, article.articleNo)), notify(`Art.nr ${article.articleNo} regnes med igjen.`))}>
          <X size={13} aria-hidden />
        </button>
      ),
    },
  ]
  const table = useTable(listed, columns)
  return (
    <div className="op">
      <div className="op-zone">
        <div className="op-strip">
          <p className="op-lead">
            Ordrelinjer med disse artikkelnumrene <strong>leses ikke</strong>: ingen linjer, ingen timer, i noe prosjekt. For det som er bestilt, men ikke er arbeid for mannskapet, som frakt og gebyrer.
          </p>
        </div>
        <form
          className="op-add"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <PickField
            value={number}
            onChange={setNumber}
            floating
            options={offered.map((article) => article.articleNo)}
            note={(option) => {
              const article = seen.get(articleKey(option))
              return article ? `${article.texts.slice(0, 2).join(' · ')} · ${count(article.lines, 'linje', 'linjer')}` : undefined
            }}
            placeholder="Art.nr"
            aria-label="Artikkelnummer som skal utelates"
            className="op-add-no"
          />
          <input className="op-add-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={typed?.texts[0] ? `Merknad (blir «${typed.texts[0]}»)` : 'Merknad (valgfri)'} aria-label="Merknad" />
          <button type="submit" className="primary">
            <Ban size={14} aria-hidden /> Utelat
          </button>
          {known ? <span className="op-warn">Artikkelen er allerede utelatt.</span> : typed && <span className="muted small">{count(typed.lines, 'ordrelinje', 'ordrelinjer')} holdes utenfor</span>}
        </form>
      </div>
      <div className="op-body">
        {listed.length ? (
          <DataTable table={table} className="canvas-table op-excluded" rowKey={(article) => articleKey(article.articleNo)} />
        ) : (
          <p className="op-empty">Ingen artikler er utelatt. Alle ordrelinjer regnes med.</p>
        )}
      </div>
    </div>
  )
}
