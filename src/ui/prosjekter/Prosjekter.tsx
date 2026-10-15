import { useMemo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { todayIso } from '../../domain/dates'
import { diffProjectList, mergeProjectList, normalizeName, projectRows, replaceProjectList, suggestProjectNo, withoutProject, withoutProjectName, withNumberTakingOver, withProjectName, withProjectNo, withProjectYear, type ProjectLacking, type ProjectRow } from '../../domain/projects'
import type { ProjectRef } from '../../domain/types'
import { readProsjekterWorkbook, writeProsjekterWorkbook } from '../../import/prosjekterFile'
import { useWorkspace } from '../../store/workspaceStore'
import { MergeReplaceDialog } from '../common'
import { download, XLSX_TYPE } from '../files'
import { TableFileMenu } from '../TableFile'
import { describeDiff, useTableFile } from '../useTableFile'
import { PickField, TextField } from '../fields'
import { count } from '../dom'
import { SplitPick } from '../behov/SplitPick'
import type { TablePage } from '../RegisterHead'

const LACKING_TEXT: Record<ProjectLacking, string> = {
  number: 'Mangler prosjekt',
  ambiguous: 'Flere prosjekter har navnet',
  new: 'Ikke i tabellen',
}

const day = (date: string) => `${date.slice(8)}.${date.slice(5, 7)}.${date.slice(0, 4)}`
const isYear = (text: string) => text === '' || /^(19|20)\d\d$/.test(text)

/** Where the number is in use: orders read in, demand lines, planning rows. */
const usedIn = (row: ProjectRow): string[] => [row.orders ? 'Ordre' : '', row.lines ? count(row.lines, 'behovslinje', 'behovslinjer') : '', row.rows ? count(row.rows, 'rad i Kalender', 'rader i Kalender') : ''].filter(Boolean)

/**
 * The projects: a number each, and every name a project goes by in the sources. The number is what demand, orders and
 * planning rows point at, and an event in Venyou gets the number of the project that carries its name in its year.
 * Events without a project are listed first, each with a number it can be given.
 */
export function Prosjekter({ head, notify, show, onOpenBehov }: TablePage & { onOpenBehov: (projectNo: string) => void }) {
  const { workspace, setProjects } = useWorkspace()
  const ws = workspace!
  const projects = ws.projects
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)

  const rows = useMemo(() => projectRows(ws), [ws.venue, ws.projects, ws.visma, ws.demand, ws.allocations]) // eslint-disable-line react-hooks/exhaustive-deps
  const found = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? rows.filter((row) => `${row.projectNo} ${row.names.join(' ')}`.toLowerCase().includes(q)) : rows
  }, [rows, search])
  const inTable = useMemo(() => rows.filter((row) => row.projectNo && row.lacking !== 'new'), [rows])
  const numbers = useMemo(() => rows.filter((row) => row.projectNo).map((row) => row.projectNo), [rows])
  const openCount = rows.filter((row) => row.lacking === 'number').length
  /** The names of the events that have no project: what a project is most often given as a name. */
  const openNames = useMemo(() => rows.filter((row) => !row.projectNo).map((row) => row.names[0]), [rows])

  /** Saves the table, and says so when planning rows or demand lines followed a number. */
  const save = (next: ProjectRef[], text?: string, renumbered?: { from: string; to: string }) => {
    const { rows: followed, lines } = setProjects(next, renumbered)
    const parts = [followed ? `${count(followed, 'planlagt rad', 'planlagte rader')} i Kalender` : '', lines ? `${count(lines, 'behovslinje', 'behovslinjer')}` : ''].filter(Boolean)
    if (text || parts.length) notify(`${text ?? ''}${parts.length ? ` ${parts.join(' og ')} fulgte med til nummeret.` : ''}`.trim())
  }

  /** The event gets a project: a new one under the number, or the one that has it already. */
  const link = (row: ProjectRow, projectNo: string) => {
    if (!projectNo.trim()) return
    const existing = numbers.some((no) => no.toLowerCase() === projectNo.trim().toLowerCase())
    // A name several projects carry is taken from the others: a name and a year point at one project.
    save(withProjectName(projects, projectNo, row.names[0], row.year), existing ? `${row.names[0]} er lagt til som navn på ${projectNo.trim()}.` : `${row.names[0]} er nå prosjekt ${projectNo.trim()}.`)
  }

  /** Every event listed without a project gets what it is offered: the project it is like, else a number of its own. */
  const suggestAll = () => {
    const open = found.filter((row) => row.lacking === 'number')
    const matched = open.filter((row) => row.match).length
    save(
      open.reduce((list, row) => withProjectName(list, row.match?.projectNo ?? row.series?.projectNo ?? row.suggestion, row.names[0], row.year), projects),
      `${[matched ? `${matched} lagt til prosjekter som fantes` : '', open.length - matched ? `${open.length - matched} har fått eget nummer` : ''].filter(Boolean).join(', ')}.`,
    )
  }

  /** A number that came with orders takes over the name another project has carried, or the whole project where its number was made up. */
  const takeOver = (row: ProjectRow) => {
    const { projects: next, renumbered } = withNumberTakingOver(projects, row.projectNo, row.names[0], row.replaces!)
    save(next, renumbered ? `${renumbered.from} er nå ${row.projectNo}.` : `${row.replaces!.name} er flyttet fra ${row.replaces!.projectNo} til ${row.projectNo}.`, renumbered)
  }

  const renumber = (row: ProjectRow, to: string) => {
    if (!to) return
    const other = rows.find((r) => r !== row && r.projectNo.toLowerCase() === to.toLowerCase())
    if (other && !confirm(`${to} er allerede ${other.names[0] ?? 'et prosjekt'}. Slå ${row.projectNo} sammen med det?`)) return
    save(withProjectNo(projects, row.projectNo, to), `${row.projectNo} er nå ${to}.`, { from: row.projectNo, to: other?.projectNo ?? to })
  }

  const removeName = (row: ProjectRow, name: string) => {
    // The last name goes with the project; «Angre» brings both back.
    save(withoutProjectName(projects, row.projectNo, name), row.names.length === 1 ? `Slettet ${row.projectNo}` : `${name} er ikke lenger navn på ${row.projectNo}`)
  }

  const { pending, onFile, done } = useTableFile<ProjectRef[]>({
    read: readProsjekterWorkbook,
    empty: !projects.length,
    takeIn: (incoming, file) => {
      const next = replaceProjectList(incoming)
      save(next, `${file} lest inn: ${new Set(next.map((ref) => ref.projectNo.toLowerCase())).size} prosjekter med ${next.length} navn.`)
    },
    onError: show,
  })

  const apply = (mode: 'merge' | 'replace') => {
    if (!pending) return
    save(mode === 'merge' ? mergeProjectList(projects, pending.incoming) : replaceProjectList(pending.incoming), `${pending.file} ${mode === 'merge' ? 'slått sammen med tabellen' : 'har erstattet tabellen'}.`)
    done()
  }

  const diff = pending ? diffProjectList(projects, pending.incoming) : null

  const openShown = found.filter((row) => row.lacking === 'number').length
  const open = found.filter((row) => row.lacking === 'number' || row.lacking === 'ambiguous')
  const listed = found.filter((row) => row.projectNo && !row.lacking)
  const outsideRows = found.filter((row) => row.lacking === 'new')
  const offerOf = (row: ProjectRow) => row.match?.projectNo ?? row.series?.projectNo
  const numberItems = (row: ProjectRow) => [
    ...(offerOf(row) ? [{ value: row.suggestion, note: 'eget nummer' }] : []),
    ...row.candidates.map((no) => ({ value: no, note: 'har navnet' })),
    ...inTable.filter((other) => !row.candidates.includes(other.projectNo)).map((other) => ({ value: other.projectNo, note: other.names[0] })),
  ]

  return (
    <>
      {head(
        <TableFileMenu
          exportTitle="Last ned tabellen som en Excel-fil: en rad per navn, med prosjektnummer og år."
          importTitle="Les inn en prosjektfil: en som er eksportert herfra, eller en med kolonnene Prosjektnr. og Navn."
          canExport={projects.length > 0}
          onExport={() => download(`expo-planner-prosjekter-${todayIso()}.xlsx`, writeProsjekterWorkbook(projects), XLSX_TYPE)}
          onFile={onFile}
        />,
      )}
      <div className="op">
        <div className="op-bar">
          <input className="search" type="search" placeholder="Søk nummer eller navn" value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="muted small">
            {count(inTable.length, 'prosjekt', 'prosjekter')} · {projects.length} navn
          </span>
          <span className="toolbar-gap" />
          <button className="primary" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden /> Nytt prosjekt
          </button>
        </div>
        <p className="op-flow">
          <span>
            Et prosjekt er <strong>nummeret</strong> behov, ordre og planlagte rader peker på.
          </span>
          <span>
            Kildene kaller det ulike ting, så det har alle <strong>navnene</strong> det går under.
          </span>
          <span className="op-flow-aside">Et arrangement i Venyou får nummeret til prosjektet med samme navn i samme år.</span>
        </p>

        {rows.length ? (
          <div className="op-table hl-projects">
            <div className="op-row op-head">
              <span title="Nummeret behov, ordre og planlagte rader peker på. Bytter du nummer, følger radene i Kalender og dine egne behovslinjer med.">Prosjektnr.</span>
              <span className="num" title="Året prosjektets navn gjelder for. Det følger av nummeret; skriv et annet der arrangementet går et annet år enn nummeret sier.">
                År
              </span>
              <span title="Alle navnene prosjektet har i kildene">Navn</span>
              <span title="Arrangementene i Venyou med prosjektets nummer, med første dag">I Venyou</span>
              <span title="Det som peker på nummeret: ordre som er lest inn, behovslinjer og planlagte rader i Kalender">I bruk</span>
              <span />
            </div>
            <div className="op-body">
              {open.length > 0 && (
                <section className="op-group lacking">
                  <div className="op-group-head">
                    <i className="op-attention" aria-hidden />
                    Uten prosjekt <span className="op-group-count">{open.length}</span>
                    <span className="op-group-note">Behov og plan kan ikke knyttes til dem</span>
                    {open.some((row) => row.lacking === 'number') && (
                      <button className="hl-all" onClick={suggestAll} title="Gir hvert arrangement i listen forslaget: prosjektet det ligner på, ellers et eget nummer. Kan angres.">
                        Bruk forslagene for {openShown === openCount ? `alle ${openCount}` : `de ${openShown} i listen`}
                      </button>
                    )}
                  </div>
                  {open.map((row) => {
                    const offer = offerOf(row)
                    const like = row.match ?? row.series
                    return (
                      <div key={row.key} className="op-row">
                        <span className="hl-offer">
                          {offer ? (
                            <button
                              className="primary small"
                              title={row.match ? `Navnet ligner «${row.match.name}», prosjekt ${row.match.projectNo} i samme år. Legger navnet til der.` : `Navnet ligner «${row.series!.name}» (${row.series!.after}). ${row.series!.projectNo} er samme nummer i år, og ledig.`}
                              onClick={() => link(row, offer)}
                            >
                              Bruk {offer}
                            </button>
                          ) : (
                            row.lacking === 'number' && (
                              <button className="primary small" title="Året og tre bokstaver fra navnet" onClick={() => link(row, row.suggestion)}>
                                Bruk {row.suggestion}
                              </button>
                            )
                          )}
                          <SplitPick
                            plain
                            missing={row.lacking === 'ambiguous' ? 'Velg' : offer ? 'Annet' : ''}
                            label={`Nummer for ${row.names[0]}`}
                            head={`Nummer for ${row.names[0]}`}
                            title="Velg et annet nummer, eller skriv et nytt"
                            groups={[{ items: numberItems(row) }]}
                            free="Nytt prosjekt"
                            onPick={(no) => link(row, no)}
                          />
                        </span>
                        <span className="num muted">{row.year}</span>
                        <span className="op-name">
                          <span>{row.names[0]}</span>
                          {row.lacking === 'ambiguous' && <span className="op-lacking">{LACKING_TEXT.ambiguous}</span>}
                          {like && (
                            <span className="op-tag">
                              ligner {like.name} ({row.match ? row.match.projectNo : row.series!.after})
                            </span>
                          )}
                        </span>
                        <span className="num muted">{row.events.map((event) => day(event.start)).join(', ')}</span>
                        <span />
                        <span />
                      </div>
                    )
                  })}
                </section>
              )}
              <section className="op-group">
                <div className="op-group-head">
                  Prosjekter <span className="op-group-count">{listed.length}</span>
                </div>
                {listed.map((row) => (
                  <div key={row.key} className="op-row">
                    <span className="hl-number">
                      <TextField className="project-no-input" ariaLabel={`Prosjektnummer for ${row.names[0]}`} value={row.projectNo} onCommit={(value) => value !== row.projectNo && renumber(row, value)} />
                    </span>
                    <span className="num">
                      <TextField className="num" ariaLabel={`År for ${row.projectNo}`} value={row.year} onCommit={(value) => value !== row.year && isYear(value) && save(withProjectYear(projects, row.projectNo, value), value ? `${row.projectNo} gjelder ${value}` : `${row.projectNo} følger året i nummeret`)} />
                    </span>
                    <span className="mk-chips">
                      {row.names.map((name) => (
                        <button key={name} className="mk-chip" title={`Fjern navnet ${name} fra ${row.projectNo}`} onClick={() => removeName(row, name)}>
                          {name}
                          <X size={11} aria-hidden />
                        </button>
                      ))}
                      <NameAdd projectNo={row.projectNo} names={openNames} onAdd={(name) => save(withProjectName(projects, row.projectNo, name, row.year), `${name} er nå et navn på ${row.projectNo}`)} />
                    </span>
                    <span className="num muted" title={row.events.map((event) => `${event.name}: ${event.halls.join(', ')}`).join('\n')}>
                      {row.events.map((event) => day(event.start)).join(', ')}
                    </span>
                    <span className="small ellipsis" title={usedIn(row).join(' · ')}>
                      {row.orders || row.lines ? (
                        <button className="link" title={`Åpne ${row.projectNo} på Behov`} onClick={() => onOpenBehov(row.projectNo)}>
                          {usedIn(row).join(' · ')}
                        </button>
                      ) : (
                        <span className="muted">{usedIn(row).join(' · ')}</span>
                      )}
                    </span>
                    <span className="op-actions">
                      {!usedIn(row).length && (
                        <button className="icon-button" title="Slett prosjektet fra tabellen" onClick={() => save(withoutProject(projects, row.projectNo), `Slettet ${row.projectNo}`)}>
                          <Trash2 size={13} aria-hidden />
                        </button>
                      )}
                    </span>
                  </div>
                ))}
                {!found.length && <p className="op-empty">Ingen prosjekter passer søket.</p>}
              </section>
              {outsideRows.length > 0 && (
                <section className="op-group">
                  <div className="op-group-head">
                    Ikke i tabellen <span className="op-group-count">{outsideRows.length}</span>
                    <span className="op-group-note">I bruk i ordre eller behov uten å stå i tabellen</span>
                  </div>
                  {outsideRows.map((row) => (
                    <div key={row.key} className="op-row">
                      <span className="num">
                        <strong>{row.projectNo}</strong>
                      </span>
                      <span />
                      <span className="op-name">
                        {row.names[0] && <span>{row.names[0]}</span>}
                        {row.replaces && <span className="op-tag">ligner {row.replaces.name} ({row.replaces.projectNo})</span>}
                      </span>
                      <span />
                      <span className="small muted ellipsis">{usedIn(row).join(' · ')}</span>
                      <span className="hl-add">
                        {row.replaces && (
                          <button
                            className="small"
                            title={`Navnet ligner «${row.replaces.name}», som nå er prosjekt ${row.replaces.projectNo}. Lar ${row.projectNo} ta over: navnet flyttes hit, og er ${row.replaces.projectNo} et nummer du har laget selv, følger rader og behov med.`}
                            onClick={() => takeOver(row)}
                          >
                            I stedet for {row.replaces.projectNo}
                          </button>
                        )}
                        <button
                          className="small"
                          title={`Ta ${row.projectNo} inn i tabellen${row.names[0] ? ` med navnet ${row.names[0]}` : ''}`}
                          disabled={!row.names[0]}
                          onClick={() => save(withProjectName(projects, row.projectNo, row.names[0]), `${row.projectNo} er lagt inn i tabellen`)}
                        >
                          Legg til
                        </button>
                      </span>
                    </div>
                  ))}
                </section>
              )}
            </div>
          </div>
        ) : (
          <p className="op-empty">
            Tabellen er tom. Den fyller seg selv: les inn Venyou-filen, så kommer arrangementene opp her med et forslag til nummer, og prosjektene i Visma-utskriftene kommer opp med nummeret
            sitt. Du kan også legge inn prosjekter med «Nytt prosjekt», eller lese inn en fil under «Fil».
          </p>
        )}
      </div>

      {pending && diff && (
        <MergeReplaceDialog
          title="Importer prosjekter"
          source={pending.file}
          results={[describeDiff('Navn', diff, 'til et annet prosjekt')]}
          replaceText={`tabellen byttes helt ut med filen${diff.onlyInApp > 0 ? `; ${diff.onlyInApp} navn som bare finnes i appen forsvinner` : ''}`}
          onCancel={done}
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
            save(withProjectName(projects, projectNo, name, year), `${name} er nå prosjekt ${projectNo}`)
            setAdding(false)
          }}
        />
      )}
    </>
  )
}

/** A name for a project: picked from the events without one, or typed. */
function NameAdd({ projectNo, names, onAdd }: { projectNo: string; names: string[]; onAdd: (name: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const done = () => (setAdding(false), setText(''))
  if (!adding)
    return (
      <button className="mk-add" title="Legg til et navn" aria-label={`Nytt navn på ${projectNo}`} onClick={() => setAdding(true)}>
        <Plus size={13} aria-hidden />
      </button>
    )
  return (
    <span className="mk-pick">
      <PickField
        autoFocus
        floating
        value={text}
        onChange={setText}
        head={`Nytt navn på ${projectNo}`}
        groups={[{ label: 'Uten prosjekt', items: names.map((name) => ({ value: name })) }]}
        aria-label={`Nytt navn på ${projectNo}`}
        placeholder="Skriv et navn"
        onPick={(name) => (done(), onAdd(name))}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !text.trim()) return
          e.preventDefault()
          onAdd(text.trim())
          done()
        }}
        onCancel={done}
        onBlur={done}
      />
    </span>
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
