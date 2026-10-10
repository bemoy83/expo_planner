import { useMemo, useState } from 'react'
import { addPerson, competenceStyles, diffPersons, isNameTaken, mergePersons, removePerson, replacePersons, togglePersonCompetence, updatePerson, type FilePerson } from '../../domain/competences'
import { todayIso } from '../../domain/dates'
import type { Person } from '../../domain/types'
import { useWorkspace } from '../../store/workspaceStore'
import { readPersonellWorkbook, writePersonellWorkbook } from '../../import/personellFile'
import { Menu, MergeReplaceDialog, MessageBanner, UndoRedoButtons, type Message } from '../common'
import { download, errorText, XLSX_TYPE } from '../files'
import { TableFileButtons } from '../TableFile'
import { DataTable } from '../DataTable'
import { competenceColor } from '../dom'
import { TextField } from '../fields'
import { useTable, type Column } from '../useTable'
import { AddDialog } from './AddDialog'
import { Plus, X } from 'lucide-react'

/** The permanent staff and what each of them can do. How the competences are shown is on Kompetanser. */
export function Personell({ onOpenCompetences }: { onOpenCompetences: () => void }) {
  const { workspace, updateStaffing } = useWorkspace()
  const ws = workspace!
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [pending, setPending] = useState<{ file: string; people: FilePerson[] } | null>(null)
  const [message, setMessage] = useState<Message | null>(null)

  const persons = useMemo(() => ws.persons ?? [], [ws.persons])
  const styles = useMemo(() => competenceStyles(ws), [ws])
  const found = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? persons.filter((p) => `${p.name} ${p.note ?? ''}`.toLowerCase().includes(q)) : persons
  }, [persons, search])
  const active = persons.filter((p) => p.active).length

  const setPersons = (change: (persons: Person[]) => Person[]) => updateStaffing((w) => ({ ...w, persons: change(w.persons ?? []) }))

  /** People are told apart by their names in a file, so no two have the same. */
  const rename = (person: Person, name: string) => {
    if (isNameTaken(persons, name, person.id)) return setMessage({ kind: 'error', text: `${name} finnes allerede. To personer kan ikke ha samme navn.` })
    setPersons((list) => updatePerson(list, person.id, { name }))
  }

  const onFile = async (file: File) => {
    try {
      const people = readPersonellWorkbook(new Uint8Array(await file.arrayBuffer()))
      // Nothing to merge with while there are no people.
      if (!persons.length) {
        updateStaffing((w) => mergePersons(w, people))
        setMessage({ kind: 'ok', text: `${file.name} lest inn: ${people.length === 1 ? '1 person' : `${people.length} personer`}.` })
      } else setPending({ file: file.name, people })
    } catch (e) {
      setMessage({ kind: 'error', text: errorText(e) })
    }
  }

  const apply = (mode: 'merge' | 'replace') => {
    if (!pending) return
    updateStaffing((w) => (mode === 'merge' ? mergePersons(w, pending.people) : replacePersons(w, pending.people)))
    setMessage({ kind: 'ok', text: `${pending.file} ${mode === 'merge' ? 'slått sammen med personene' : 'har erstattet personene'}. Kan angres med Ctrl/Cmd+Z.` })
    setPending(null)
  }

  const diff = pending ? diffPersons(ws, pending.people) : null

  const remove = (person: Person) => {
    const blocks = (ws.assignments ?? []).filter((a) => a.personId === person.id).length
    const question = blocks ? `Slette ${person.name}? ${blocks === 1 ? '1 tildeling' : `${blocks} tildelinger`} i Bemanning slettes også. Sett heller personen som ikke aktiv for å beholde historikken.` : `Slette ${person.name}?`
    if (confirm(question)) updateStaffing((w) => removePerson(w, person.id))
  }

  const columns: Column<Person>[] = [
    {
      key: 'name',
      head: 'Navn',
      text: (person) => person.name,
      cell: (person) => <TextField value={person.name} ariaLabel="Navn" onCommit={(name) => name && rename(person, name)} />,
    },
    {
      key: 'competences',
      head: 'Kompetanser',
      text: (person) => styles.filter((style) => person.competences.includes(style.key)).map((style) => style.label),
      cell: (person) => (
        <span className="comp-toggles">
          {styles
            .filter((style) => person.competences.includes(style.key))
            .map((style) => (
              <button key={style.key} className="comp-toggle" title={`Ta bort ${style.label}`} onClick={() => setPersons((list) => togglePersonCompetence(list, person.id, style.key))}>
                <i className="swatch" style={competenceColor(style)} />
                {style.label}
                <X size={11} aria-hidden />
              </button>
            ))}
          {styles.some((style) => !person.competences.includes(style.key)) && (
            <Menu label={<Plus size={13} aria-hidden />} ariaLabel={`Gi ${person.name} en kompetanse`} title="Legg til kompetanse" className="comp-add">
              {() =>
                styles
                  .filter((style) => !person.competences.includes(style.key))
                  .map((style) => (
                    <button key={style.key} role="menuitem" onClick={() => setPersons((list) => togglePersonCompetence(list, person.id, style.key))}>
                      <i className="swatch" style={competenceColor(style)} />
                      {style.label}
                    </button>
                  ))
              }
            </Menu>
          )}
        </span>
      ),
    },
    {
      key: 'active',
      head: 'Aktiv',
      className: 'center',
      text: (person) => (person.active ? 'Ja' : 'Nei'),
      cell: (person) => <input type="checkbox" checked={person.active} aria-label={`${person.name} er aktiv`} onChange={(e) => setPersons((list) => updatePerson(list, person.id, { active: e.target.checked }))} />,
    },
    {
      key: 'note',
      head: 'Notat',
      text: (person) => person.note ?? '',
      cell: (person) => <TextField value={person.note ?? ''} ariaLabel="Notat" onCommit={(note) => setPersons((list) => updatePerson(list, person.id, { note: note || undefined }))} />,
    },
    {
      key: 'actions',
      className: 'actions',
      cell: (person) => (
        <button className="row-action" title={`Slett ${person.name}`} onClick={() => remove(person)}>
          <X size={13} aria-hidden />
        </button>
      ),
    },
  ]
  const table = useTable(found, columns)

  return (
    <div className="behov">
      <div className="toolbar">
        <input className="search" type="search" placeholder="Søk navn" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="muted small">
          {persons.length} faste{active < persons.length ? ` · ${active} aktive` : ''}
        </span>
        <span className="toolbar-gap" />
        <UndoRedoButtons />
        <TableFileButtons
          exportTitle="Last ned de faste som en Excel-fil: en rad per person og en kolonne per kompetanse, med x der personen har den."
          importTitle="Les inn en fil med de faste: en som er eksportert herfra, eller en med kolonnen Navn og en kolonne per kompetanse."
          canExport={persons.length > 0}
          onExport={() => download(`expo-planner-personell-${todayIso()}.xlsx`, writePersonellWorkbook(ws), XLSX_TYPE)}
          onFile={onFile}
        />
        <button className="primary" onClick={() => setAdding(true)}>
          + Ny person
        </button>
      </div>

      <MessageBanner message={message} onClose={() => setMessage(null)} />

      <div className="behov-body">
        <p className="hint">
          De faste ansatte som kan tildeles arbeid i Bemanning. <strong>Kompetanser</strong> bestemmer hvilket arbeid en person kan få: legg til med +, og klikk en kompetanse for å ta den bort. Navn,
          farge og rekkefølge på kompetansene settes på{' '}
          <button className="link" onClick={onOpenCompetences}>
            Kompetanser
          </button>
          . En person som ikke er <strong>aktiv</strong>, skjules i Bemanning, men beholder historikken sin.
        </p>
        {persons.length ? (
          <DataTable table={table} className="personell" rowKey={(person) => person.id} rowProps={(person) => ({ className: person.active ? undefined : 'inactive-row' })} empty="Ingen personer passer søket eller filteret." />
        ) : (
          <p className="notice">Ingen faste registrert ennå. Legg inn de ansatte med «+ Ny person», og gi hver av dem kompetansene sine.</p>
        )}
      </div>

      {pending && diff && (
        <MergeReplaceDialog
          title="Importer personell"
          source={pending.file}
          results={[
            `Personer: ${diff.added} nye, ${diff.changed} endret, ${diff.unchanged} like, ${diff.onlyInApp} bare i appen`,
            ...(diff.newCompetences.length ? [`Nye kompetanser: ${diff.newCompetences.join(', ')}`] : []),
          ]}
          replaceText={`personene i appen byttes ut med dem i filen, i filens rekkefølge${
            diff.onlyInApp ? `; ${diff.onlyInApp === 1 ? '1 person' : `${diff.onlyInApp} personer`} som bare finnes i appen slettes${diff.lostBlocks ? `, med ${diff.lostBlocks} tildelinger og fravær i Bemanning` : ''}` : ''
          }`}
          onCancel={() => setPending(null)}
          onApply={apply}
        />
      )}

      {adding && (
        <AddDialog
          title="Ny person"
          label="Navn"
          taken={(name) => isNameTaken(persons, name)}
          onClose={() => setAdding(false)}
          onAdd={(name) => {
            setPersons((list) => addPerson(list, name))
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}
