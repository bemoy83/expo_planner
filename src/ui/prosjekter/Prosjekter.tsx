import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { todayIso } from '../../domain/dates'
import { diffProjectList, mergeProjectList, normalizeName, projectRows, replaceProjectList, suggestProjectNo, withoutProject, withoutProjectName, withProjectName, withProjectNo, withProjectYear, type ProjectLacking, type ProjectRow } from '../../domain/projects'
import type { ProjectRef } from '../../domain/types'
import { readProsjekterWorkbook, writeProsjekterWorkbook } from '../../import/prosjekterFile'
import { useWorkspace } from '../../store/workspaceStore'
import { DataTable } from '../DataTable'
import { useTable, type Column } from '../useTable'
import { MergeReplaceDialog, MessageBanner, UndoRedoButtons, type Message } from '../common'
import { download, errorText, XLSX_TYPE } from '../files'
import { TableFileButtons } from '../TableFile'
import { PickField, TextField } from '../fields'

interface PendingImport {
  file: string
  incoming: ProjectRef[]
}

const LACKING_TEXT: Record<ProjectLacking, string> = {
  number: 'Mangler prosjekt',
  ambiguous: 'Flere prosjekter har navnet',
  new: 'Ikke i tabellen',
}

const day = (date: string) => `${date.slice(8)}.${date.slice(5, 7)}.${date.slice(0, 4)}`
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const isYear = (text: string) => text === '' || /^(19|20)\d\d$/.test(text)

/** Where the number is in use: orders read in, demand lines, planning rows. */
const usedIn = (row: ProjectRow): string[] => [row.orders ? 'Ordre' : '', row.lines ? count(row.lines, 'behovslinje', 'behovslinjer') : '', row.rows ? count(row.rows, 'rad i Kalender', 'rader i Kalender') : ''].filter(Boolean)

/**
 * The projects: a number each, and every name a project goes by in the sources. The number is what demand, orders and
 * planning rows point at, and an event in Venyou gets the number of the project that carries its name in its year.
 * Events without a project are listed first, each with a number it can be given.
 */
export function Prosjekter({ onOpenBehov }: { onOpenBehov: (projectNo: string) => void }) {
  const { workspace, setProjects } = useWorkspace()
  const ws = workspace!
  const projects = ws.projects
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [message, setMessage] = useState<Message | null>(null)

  const rows = useMemo(() => projectRows(ws), [ws.venue, ws.projects, ws.visma, ws.demand, ws.allocations]) // eslint-disable-line react-hooks/exhaustive-deps
  const found = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? rows.filter((row) => `${row.projectNo} ${row.names.join(' ')}`.toLowerCase().includes(q)) : rows
  }, [rows, search])
  const inTable = useMemo(() => rows.filter((row) => row.projectNo && row.lacking !== 'new'), [rows])
  const numbers = useMemo(() => rows.filter((row) => row.projectNo).map((row) => row.projectNo), [rows])
  const withoutProjectCount = rows.filter((row) => row.lacking === 'number' || row.lacking === 'ambiguous').length
  const openCount = rows.filter((row) => row.lacking === 'number').length
  const outside = rows.filter((row) => row.lacking === 'new').length
  /** The names of the events that have no project: what a project is most often given as a name. */
  const openNames = useMemo(() => rows.filter((row) => !row.projectNo).map((row) => row.names[0]), [rows])

  /** Saves the table, and says so when planning rows or demand lines followed a number. */
  const save = (next: ProjectRef[], text?: string, renumbered?: { from: string; to: string }) => {
    const { rows: followed, lines } = setProjects(next, renumbered)
    const parts = [followed ? `${count(followed, 'planlagt rad', 'planlagte rader')} i Kalender` : '', lines ? `${count(lines, 'behovslinje', 'behovslinjer')}` : ''].filter(Boolean)
    if (text || parts.length) setMessage({ kind: 'ok', text: `${text ?? ''}${parts.length ? ` ${parts.join(' og ')} fulgte med til nummeret.` : ''} Kan angres med Ctrl/Cmd+Z.`.trim() })
  }

  /** The event gets a project: a new one under the number, or the one that has it already. */
  const link = (row: ProjectRow, projectNo: string) => {
    if (!projectNo.trim()) return
    const existing = numbers.some((no) => no.toLowerCase() === projectNo.trim().toLowerCase())
    // A name several projects carry is taken from the others: a name and a year point at one project.
    save(withProjectName(projects, projectNo, row.names[0], row.year), existing ? `${row.names[0]} er lagt til som navn på ${projectNo.trim()}.` : `${row.names[0]} er nå prosjekt ${projectNo.trim()}.`)
  }

  const suggestAll = () => {
    const open = table.rows.filter((row) => row.lacking === 'number')
    save(open.reduce((list, row) => withProjectName(list, row.suggestion, row.names[0], row.year), projects), `${count(open.length, 'arrangement', 'arrangementer')} har fått foreslått nummer.`)
  }

  const renumber = (row: ProjectRow, to: string) => {
    if (!to) return
    const other = rows.find((r) => r !== row && r.projectNo.toLowerCase() === to.toLowerCase())
    if (other && !confirm(`${to} er allerede ${other.names[0] ?? 'et prosjekt'}. Slå ${row.projectNo} sammen med det?`)) return
    save(withProjectNo(projects, row.projectNo, to), `${row.projectNo} er nå ${to}.`, { from: row.projectNo, to: other?.projectNo ?? to })
  }

  const removeName = (row: ProjectRow, name: string) => {
    if (row.names.length === 1 && !confirm(`${name} er det eneste navnet på ${row.projectNo}. Slette prosjektet fra tabellen?`)) return
    save(withoutProjectName(projects, row.projectNo, name))
  }

  const onFile = async (file: File) => {
    try {
      const incoming = readProsjekterWorkbook(new Uint8Array(await file.arrayBuffer()))
      // Nothing to merge with while the table is empty.
      if (!projects.length) {
        const next = replaceProjectList(incoming)
        save(next, `${file.name} lest inn: ${new Set(next.map((ref) => ref.projectNo.toLowerCase())).size} prosjekter med ${next.length} navn.`)
      } else setPending({ file: file.name, incoming })
    } catch (e) {
      setMessage({ kind: 'error', text: errorText(e) })
    }
  }

  const apply = (mode: 'merge' | 'replace') => {
    if (!pending) return
    save(mode === 'merge' ? mergeProjectList(projects, pending.incoming) : replaceProjectList(pending.incoming), `${pending.file} ${mode === 'merge' ? 'slått sammen med tabellen' : 'har erstattet tabellen'}.`)
    setPending(null)
  }

  const diff = pending ? diffProjectList(projects, pending.incoming) : null

  const columns: Column<ProjectRow>[] = [
    {
      key: 'projectNo',
      head: 'Prosjektnr.',
      title: 'Nummeret behov, ordre og planlagte rader peker på. Et prosjekt uten nummer fra Visma får et eget: året og tre bokstaver. Bytter du nummer, følger radene i Kalender og dine egne behovslinjer med.',
      className: 'project-no',
      text: (row) => row.projectNo,
      cell: (row) =>
        row.lacking === 'new' ? (
          row.projectNo
        ) : row.projectNo ? (
          <TextField className="project-no-input" ariaLabel={`Prosjektnummer for ${row.names[0]}`} value={row.projectNo} onCommit={(value) => renumber(row, value)} />
        ) : (
          // The number it is offered, or one of the projects that carry the name; another number can be typed, also that of a project in the table.
          <TextField className="project-no-input missing" placeholder={row.suggestion} options={[...row.candidates, row.suggestion]} ariaLabel={`Prosjektnummer for ${row.names[0]}`} value="" onCommit={(value) => link(row, value)} />
        ),
    },
    {
      key: 'year',
      head: 'År',
      title: 'Året prosjektets navn gjelder for. Det følger av nummeret; skriv et annet der arrangementet går et annet år enn nummeret sier.',
      className: 'num',
      text: (row) => row.year,
      cell: (row) =>
        row.projectNo && row.lacking !== 'new' ? <TextField className="num" ariaLabel={`År for ${row.projectNo}`} value={row.year} onCommit={(value) => isYear(value) && save(withProjectYear(projects, row.projectNo, value))} /> : row.year,
    },
    {
      key: 'names',
      head: 'Navn',
      title: 'Alle navnene prosjektet har i kildene. Et arrangement i Venyou får nummeret til prosjektet som har navnet dets i samme år.',
      text: (row) => row.names,
      cell: (row) =>
        row.projectNo && row.lacking !== 'new' ? (
          <span className="comp-toggles">
            {row.names.map((name) => (
              <button key={name} className="comp-toggle" title={`Fjern navnet ${name} fra ${row.projectNo}`} onClick={() => removeName(row, name)}>
                {name} <X size={12} aria-hidden />
              </button>
            ))}
            <TextField className="name-add" placeholder="+ navn" options={openNames} ariaLabel={`Nytt navn på ${row.projectNo}`} value="" onCommit={(value) => value && save(withProjectName(projects, row.projectNo, value, row.year))} />
          </span>
        ) : (
          <strong>{row.names[0]}</strong>
        ),
    },
    {
      key: 'venyou',
      head: 'I Venyou',
      title: 'Arrangementene i Venyou som har fått prosjektets nummer, med første dag.',
      className: 'date',
      text: (row) => (row.events.length ? 'Ja' : 'Nei'),
      sort: (row) => row.events[0]?.start ?? '',
      cell: (row) => row.events.map((event) => day(event.start)).join(', '),
      cellProps: (row) => (row.events.length ? { title: row.events.map((event) => `${event.name}: ${event.halls.join(', ')}`).join('\n') } : {}),
    },
    {
      key: 'used',
      head: 'I bruk',
      title: 'Det som peker på nummeret: ordre som er lest inn, behovslinjer og planlagte rader i Kalender.',
      text: (row) => (usedIn(row).length ? usedIn(row).map((part) => part.replace(/^\d+ /, '')) : ''),
      sort: (row) => row.lines + row.rows + Number(row.orders),
      cell: (row) =>
        row.orders || row.lines ? (
          <button className="link" title={`Åpne ${row.projectNo} på Behov`} onClick={() => onOpenBehov(row.projectNo)}>
            {usedIn(row).join(' · ')}
          </button>
        ) : (
          usedIn(row).join(' · ')
        ),
    },
    {
      key: 'lacking',
      head: 'Mangler',
      title: 'Det som gjenstår før behov og plan kan knyttes til prosjektet.',
      className: 'actions',
      text: (row) => (row.lacking ? LACKING_TEXT[row.lacking] : ''),
      cell: (row) => (
        <>
          {row.lacking && <span className="issue">{LACKING_TEXT[row.lacking]} </span>}
          {row.lacking === 'number' && (
            <button className="link" title={`Opprett prosjektet ${row.suggestion} for ${row.names[0]}`} onClick={() => link(row, row.suggestion)}>
              Bruk {row.suggestion}
            </button>
          )}
          {row.lacking === 'new' && (
            <button className="link" title={`Ta ${row.projectNo} inn i tabellen${row.names[0] ? ` med navnet ${row.names[0]}` : ''}`} disabled={!row.names[0]} onClick={() => save(withProjectName(projects, row.projectNo, row.names[0]))}>
              Legg til
            </button>
          )}
          {row.projectNo && !row.lacking && (
            <button className="row-action" title="Slett prosjektet fra tabellen" onClick={() => confirm(`Slette ${row.projectNo} med ${count(row.names.length, 'navn', 'navn')} fra tabellen?`) && save(withoutProject(projects, row.projectNo))}>
              <X size={13} aria-hidden />
            </button>
          )}
        </>
      ),
    },
  ]
  const table = useTable(found, columns)
  const openShown = table.rows.filter((row) => row.lacking === 'number').length

  return (
    <div className="behov">
      <div className="toolbar">
        <input className="search" type="search" placeholder="Søk nummer eller navn" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="muted small">
          {count(inTable.length, 'prosjekt', 'prosjekter')} · {projects.length} navn
        </span>
        {table.filtered > 0 && (
          <button className="ghost" onClick={table.clearFilters} title="Fjerner filtrene i kolonnene">
            Nullstill filtre
          </button>
        )}
        <span className="toolbar-gap" />
        <UndoRedoButtons />
        <TableFileButtons
          exportTitle="Last ned tabellen som en Excel-fil: en rad per navn, med prosjektnummer og år."
          importTitle="Les inn en prosjektfil: en som er eksportert herfra, eller en med kolonnene Prosjektnr. og Navn."
          canExport={projects.length > 0}
          onExport={() => download(`expo-planner-prosjekter-${todayIso()}.xlsx`, writeProsjekterWorkbook(projects), XLSX_TYPE)}
          onFile={onFile}
        />
        <button className="primary" onClick={() => setAdding(true)}>
          + Nytt prosjekt
        </button>
      </div>

      <MessageBanner message={message} onClose={() => setMessage(null)} />

      <div className="behov-body">
        <p className="hint">
          Et prosjekt er <strong>nummeret</strong>: det er det behov, ordre og planlagte rader peker på. Kildene kaller det samme prosjektet forskjellige ting, så hvert prosjekt har alle{' '}
          <strong>navnene</strong> det går under. Et arrangement i Venyou får nummeret til prosjektet som har navnet dets i samme år. Arrangementer uten prosjekt står øverst med et forslag til
          nummer, året og tre bokstaver; bruk forslaget, eller skriv nummeret til prosjektet det hører til.
        </p>

        {withoutProjectCount > 0 && (
          <div className="orphans" role="alert">
            <strong>{count(withoutProjectCount, 'arrangement har', 'arrangementer har')} ikke prosjekt.</strong> Uten nummer kan ikke behov og plan knyttes til dem.{' '}
            {openShown > 0 && (
              <button onClick={suggestAll} title="Oppretter et prosjekt med det foreslåtte nummeret for hvert arrangement i listen som mangler prosjekt. Kan angres.">
                Bruk forslaget for {openShown === openCount ? `alle ${openCount}` : `de ${openShown} i listen`}
              </button>
            )}
          </div>
        )}

        {rows.length ? (
          <DataTable table={table} className="prosjekter" rowKey={(row) => row.key} rowProps={(row) => ({ className: row.lacking && row.lacking !== 'new' ? 'has-issue' : '' })} empty="Ingen prosjekter passer søket eller filteret." />
        ) : (
          <p className="notice">
            Tabellen er tom. Den fyller seg selv: les inn Venyou-filen, så kommer arrangementene opp her med et forslag til nummer, og prosjektene i Visma-utskriftene kommer opp med nummeret
            sitt. Du kan også legge inn prosjekter med «Nytt prosjekt», eller lese inn en fil med kolonnene Prosjektnr. og Navn med «Importer fra fil».
          </p>
        )}

        {outside > 0 && <p className="hint">{count(outside, 'nummer', 'numre')} er i bruk i ordre, behov eller plan uten å stå i tabellen. De står nederst blant prosjektene; «Legg til» tar dem inn.</p>}
      </div>

      {pending && diff && (
        <MergeReplaceDialog
          title="Importer prosjekter"
          source={pending.file}
          results={[`Navn: ${diff.added} nye, ${diff.changed} til et annet prosjekt, ${diff.unchanged} like, ${diff.onlyInApp} bare i appen`]}
          replaceText={`tabellen byttes helt ut med filen${diff.onlyInApp > 0 ? `; ${diff.onlyInApp} navn som bare finnes i appen forsvinner` : ''}`}
          onCancel={() => setPending(null)}
          onApply={apply}
        />
      )}

      {adding && (
        <AddDialog
          names={openNames}
          yearOf={(name) => rows.find((row) => !row.projectNo && normalizeName(row.names[0]) === normalizeName(name))?.year}
          suggest={(name, year) => suggestProjectNo(name, year, numbers)}
          onClose={() => setAdding(false)}
          onAdd={(projectNo, name, year) => {
            save(withProjectName(projects, projectNo, name, year))
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}

interface AddProps {
  /** The names of the events that have no project. */
  names: string[]
  /** The year of the event with the name, where there is one. */
  yearOf: (name: string) => string | undefined
  suggest: (name: string, year: string) => string
  onAdd: (projectNo: string, name: string, year: string) => void
  onClose: () => void
}

/** A new project: a name, and a number that is offered from the name and the year until one is typed. */
function AddDialog({ names, yearOf, suggest, onAdd, onClose }: AddProps) {
  const [name, setName] = useState('')
  const [typedYear, setTypedYear] = useState<string | null>(null)
  const [typedNo, setTypedNo] = useState('')
  const year = typedYear ?? yearOf(name) ?? todayIso().slice(0, 4)
  const suggestion = name.trim() && isYear(year) && year ? suggest(name, year) : ''
  const projectNo = typedNo.trim() || suggestion
  const valid = name.trim() !== '' && projectNo !== '' && isYear(year)
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) onAdd(projectNo, name, year)
        }}
      >
        <h2>Nytt prosjekt</h2>
        <label>
          Navn
          <PickField options={names} value={name} autoFocus onChange={setName} placeholder="Som i Venyou eller Visma" />
        </label>
        <div className="field-row">
          <label className="narrow">
            År
            <input inputMode="numeric" value={year} onChange={(e) => setTypedYear(e.target.value.trim())} />
          </label>
          <label>
            Prosjektnr.
            <input value={typedNo} placeholder={suggestion} onChange={(e) => setTypedNo(e.target.value)} />
          </label>
        </div>
        <p className="hint">Har prosjektet et nummer i Visma, skriver du det. Ellers brukes forslaget: året og tre bokstaver fra navnet.</p>
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
