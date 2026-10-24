import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { addPerson, competenceStyles, diffPersons, isNameTaken, mergePersons, removePerson, replacePersons, togglePersonCompetence, updatePerson, type FilePerson } from '../../domain/competences'
import { todayIso } from '../../domain/dates'
import type { CompetenceKey, Person } from '../../domain/types'
import { useWorkspace } from '../../store/workspaceStore'
import { readPersonellWorkbook, writePersonellWorkbook } from '../../import/personellFile'
import { ConfirmDialog, MergeReplaceDialog } from '../common'
import { count } from '../dom'
import { download, XLSX_TYPE } from '../files'
import { TextField } from '../fields'
import { TableFileMenu } from '../TableFile'
import { describeDiff, useTableFile } from '../useTableFile'
import { AddDialog } from './AddDialog'
import { CompetenceChips } from './CompetenceChips'
import { CompetenceStrip } from './CompetenceStrip'
import type { TablePage } from '../RegisterHead'

const people = (n: number) => count(n, 'person', 'personer')

/**
 * The permanent staff and what each of them can do. Over the table, how many people have each competence, to filter by.
 */
export function Personell({ head, notify, show, onOpenSuppliers }: TablePage & { onOpenSuppliers: () => void }) {
  const { workspace, updateStaffing } = useWorkspace()
  const ws = workspace!
  const [search, setSearch] = useState('')
  const [competence, setCompetence] = useState<CompetenceKey | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<{ person: Person; blocks: number } | null>(null)

  const persons = useMemo(() => ws.persons ?? [], [ws.persons])
  const styles = useMemo(() => competenceStyles(ws), [ws])
  const label = (key: CompetenceKey) => styles.find((style) => style.key === key)?.label ?? key
  const holders = (key: CompetenceKey) => persons.filter((p) => p.competences.includes(key)).length
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return persons.filter(
      (p) =>
        (!q || `${p.name} ${p.note ?? ''}`.toLowerCase().includes(q)) &&
        (!competence || p.competences.includes(competence)),
    )
  }, [persons, search, competence])

  const setPersons = (change: (persons: Person[]) => Person[], text: string) => {
    updateStaffing((w) => ({ ...w, persons: change(w.persons ?? []) }))
    notify(text)
  }

  /** People are told apart by their names in a file, so no two have the same. */
  const rename = (person: Person, name: string) => {
    if (!name || name === person.name) return
    if (isNameTaken(persons, name, person.id)) return show(`${name} finnes allerede. To personer kan ikke ha samme navn.`)
    setPersons((list) => updatePerson(list, person.id, { name }), `${person.name} heter nå ${name}`)
  }

  const remove = (person: Person) => {
    const blocks = (ws.assignments ?? []).filter((a) => a.personId === person.id).length
    if (blocks) return setRemoving({ person, blocks })
    updateStaffing((w) => removePerson(w, person.id))
    notify(`Slettet ${person.name}`)
  }

  const { pending, onFile, done } = useTableFile<FilePerson[]>({
    read: readPersonellWorkbook,
    empty: !persons.length,
    takeIn: (incoming, file) => {
      updateStaffing((w) => mergePersons(w, incoming))
      notify(`${file} lest inn: ${people(incoming.length)}`)
    },
    onError: show,
  })
  const apply = (mode: 'merge' | 'replace') => {
    if (!pending) return
    updateStaffing((w) => (mode === 'merge' ? mergePersons(w, pending.incoming) : replacePersons(w, pending.incoming)))
    notify(`${pending.file} ${mode === 'merge' ? 'slått sammen med de faste' : 'har erstattet de faste'}`)
    done()
  }
  const diff = pending ? diffPersons(ws, pending.incoming) : null

  const row = (person: Person) => (
    <div key={person.id} className="op-row">
      <span className="mk-name">
        <TextField value={person.name} ariaLabel="Navn" onCommit={(name) => rename(person, name)} />
      </span>
      <CompetenceChips
        styles={styles}
        held={person.competences}
        owner={person.name}
        onToggle={(key, on) => setPersons((list) => togglePersonCompetence(list, person.id, key), `${person.name} ${on ? 'har nå' : 'har ikke lenger'} ${label(key)}`)}
      />
      <span className="mk-note">
        <TextField value={person.note ?? ''} ariaLabel={`Notat for ${person.name}`} placeholder="Notat" onCommit={(note) => setPersons((list) => updatePerson(list, person.id, { note: note || undefined }), `Notat for ${person.name}`)} />
      </span>
      <span className="op-actions">
        <button className="icon-button" title={`Slett ${person.name}`} onClick={() => remove(person)}>
          <Trash2 size={13} aria-hidden />
        </button>
      </span>
    </div>
  )

  return (
    <>
      {head(
        <TableFileMenu
          exportTitle="Last ned de faste som en Excel-fil: en rad per person og en kolonne per kompetanse, med x der personen har den."
          importTitle="Les inn en fil med de faste: en som er eksportert herfra, eller en med kolonnen Navn og en kolonne per kompetanse."
          canExport={persons.length > 0}
          onExport={() => download(`expo-planner-personell-${todayIso()}.xlsx`, writePersonellWorkbook(ws), XLSX_TYPE)}
          onFile={onFile}
        />,
      )}
      <div className="op">
        <div className="op-zone">
          <div className="op-strip">
            <input className="search" type="search" placeholder="Søk navn eller notat" value={search} onChange={(e) => setSearch(e.target.value)} />
            <span className="toolbar-gap" />
            <button className="primary" onClick={() => setAdding(true)}>
              <Plus size={14} aria-hidden /> Ny person
            </button>
          </div>

          {styles.length > 0 && persons.length > 0 && (
            <CompetenceStrip
              label="Faste med kompetansen"
              styles={styles}
              count={holders}
              picked={competence}
              onPick={setCompetence}
              alertZero
              title={(style, n) => (n ? `Vis de som har ${style.label}` : `Ingen faste har ${style.label}`)}
            />
          )}
        </div>

        {persons.length ? (
          <div className="op-table mk-people">
            <div className="op-row op-head">
              <span>Navn</span>
              <span>Kompetanser</span>
              <span>Notat</span>
              <span />
            </div>
            <div className="op-body">
              {shown.map(row)}
              {!shown.length && (
                <p className="op-empty">
                  {competence && !search.trim() ? (
                    <>
                      Ingen faste har {label(competence)}. Gi noen kompetansen med + i raden, eller lei inn på{' '}
                      <button className="link" onClick={onOpenSuppliers}>
                        Innleid
                      </button>
                      .
                    </>
                  ) : (
                    'Ingen personer passer søket.'
                  )}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="op-empty">Ingen faste registrert ennå. Legg inn de ansatte med «Ny person», og gi hver av dem kompetansene sine.</p>
        )}
      </div>

      {pending && diff && (
        <MergeReplaceDialog
          title="Importer de faste"
          source={pending.file}
          results={[describeDiff('Personer', diff), ...(diff.newCompetences.length ? [`Nye kompetanser: ${diff.newCompetences.join(', ')}`] : [])]}
          replaceText={`personene i appen byttes ut med dem i filen, i filens rekkefølge${
            diff.onlyInApp ? `; ${people(diff.onlyInApp)} som bare finnes i appen slettes${diff.lostBlocks ? `, med ${diff.lostBlocks} tildelinger og fravær i Bemanning` : ''}` : ''
          }`}
          onCancel={done}
          onApply={apply}
        />
      )}

      {adding && (
        <AddDialog
          title="Ny person"
          label="Navn"
          styles={styles}
          taken={(name) => isNameTaken(persons, name)}
          onClose={() => setAdding(false)}
          onAdd={(name, competences) => {
            setPersons((list) => addPerson(list, name, undefined, competences), `La til ${name}`)
            setAdding(false)
          }}
        />
      )}

      {removing && (
        <ConfirmDialog
          title={`Slette ${removing.person.name}?`}
          onCancel={() => setRemoving(null)}
          actions={
            <button
              className="danger"
              onClick={() => {
                updateStaffing((w) => removePerson(w, removing.person.id))
                notify(`Slettet ${removing.person.name} og ${count(removing.blocks, 'tildeling', 'tildelinger')} i Bemanning`)
                setRemoving(null)
              }}
            >
              Slett
            </button>
          }
        >
          {count(removing.blocks, 'tildeling', 'tildelinger')} og fraværet til {removing.person.name} i Bemanning slettes også. Timene går tilbake til behovet. Det kan angres.
        </ConfirmDialog>
      )}
    </>
  )
}
