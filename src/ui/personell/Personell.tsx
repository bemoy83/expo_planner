import { useMemo, useState } from 'react'
import { addCompetence, addPerson, competenceStyles, staffedCompetences, isUnusedCompetence, moveCompetence, removeCompetence, removePerson, setCompetenceStyle, togglePersonCompetence, updatePerson } from '../../domain/competences'
import { LINE_COLORS, type CompetenceStyle, type LineColor, type Person } from '../../domain/types'
import { useWorkspace } from '../../store/workspaceStore'
import { Menu, UndoRedoButtons } from '../common'
import { competenceColor } from '../dom'
import { TextField } from '../fields'
import { ChevronDown, ChevronUp, GripVertical, Plus, X } from 'lucide-react'

const COLOR_NAMES: Record<LineColor, string> = {
  'line-blue': 'Blå',
  'line-teal': 'Turkis',
  'line-green': 'Grønn',
  'line-amber': 'Gul',
  'line-rose': 'Rød',
  'line-violet': 'Fiolett',
  'line-slate': 'Grå',
  'line-orange': 'Oransje',
}

/** The highest number a competence can be picked with on the keyboard in Bemanning. */
const LAST_KEY = 9

/**
 * The permanent staff and what each of them can do, and how the competences are shown in Bemanning.
 * The list of competences fills itself from the product types, the demand and the planning rows.
 */
export function Personell() {
  const { workspace, updateStaffing } = useWorkspace()
  const ws = workspace!
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState<'person' | 'competence' | null>(null)
  const [dragged, setDragged] = useState<string | null>(null)

  const persons = useMemo(() => ws.persons ?? [], [ws.persons])
  const styles = useMemo(() => competenceStyles(ws), [ws])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? persons.filter((p) => `${p.name} ${p.note ?? ''}`.toLowerCase().includes(q)) : persons
  }, [persons, search])
  // The keys follow the competences people have, as in Bemanning.
  const keys = useMemo(() => new Map(staffedCompetences(ws).slice(0, LAST_KEY).map((style, index) => [style.key, index + 1])), [ws])
  const active = persons.filter((p) => p.active).length
  const holders = (key: string) => persons.filter((p) => p.active && p.competences.includes(key)).length

  const setPersons = (change: (persons: Person[]) => Person[]) => updateStaffing((w) => ({ ...w, persons: change(w.persons ?? []) }))
  const setStyle = (key: string, patch: Partial<Pick<CompetenceStyle, 'label' | 'shortLabel' | 'color'>>) => updateStaffing((w) => ({ ...w, competenceStyles: setCompetenceStyle(w, key, patch) }))
  const move = (key: string, toIndex: number) => updateStaffing((w) => ({ ...w, competenceStyles: moveCompetence(w, key, toIndex) }))

  const remove = (person: Person) => {
    const blocks = (ws.assignments ?? []).filter((a) => a.personId === person.id).length
    const question = blocks ? `Slette ${person.name}? ${blocks === 1 ? '1 tildeling' : `${blocks} tildelinger`} i Bemanning slettes også. Sett heller personen som ikke aktiv for å beholde historikken.` : `Slette ${person.name}?`
    if (confirm(question)) updateStaffing((w) => removePerson(w, person.id))
  }

  return (
    <div className="behov">
      <div className="toolbar">
        <input className="search" type="search" placeholder="Søk navn" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="muted small">
          {persons.length} faste{active < persons.length ? ` · ${active} aktive` : ''}
        </span>
        <span className="toolbar-gap" />
        <UndoRedoButtons />
        <button className="primary" onClick={() => setAdding('person')}>
          + Ny person
        </button>
      </div>

      <div className="behov-body">
        <section>
          <p className="hint">
            De faste ansatte som kan tildeles arbeid i Bemanning. <strong>Kompetanser</strong> bestemmer hvilket arbeid en person kan få: legg til med +, og klikk en kompetanse for å ta den bort. En person
            som ikke er <strong>aktiv</strong>, skjules i Bemanning, men beholder historikken sin.
          </p>
          {persons.length ? (
            <table className="ledger personell">
              <thead>
                <tr>
                  <th>Navn</th>
                  <th>Kompetanser</th>
                  <th className="center">Aktiv</th>
                  <th>Notat</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((person) => (
                  <tr key={person.id} className={person.active ? '' : 'inactive-row'}>
                    <td>
                      <TextField value={person.name} ariaLabel="Navn" onCommit={(name) => name && setPersons((list) => updatePerson(list, person.id, { name }))} />
                    </td>
                    <td>
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
                    </td>
                    <td className="center">
                      <input type="checkbox" checked={person.active} aria-label={`${person.name} er aktiv`} onChange={(e) => setPersons((list) => updatePerson(list, person.id, { active: e.target.checked }))} />
                    </td>
                    <td>
                      <TextField value={person.note ?? ''} ariaLabel="Notat" onCommit={(note) => setPersons((list) => updatePerson(list, person.id, { note: note || undefined }))} />
                    </td>
                    <td className="actions">
                      <button className="row-action" title={`Slett ${person.name}`} onClick={() => remove(person)}>
                        <X size={13} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="notice">Ingen faste registrert ennå. Legg inn de ansatte med «+ Ny person», og gi hver av dem kompetansene sine.</p>
          )}
        </section>

        <section>
          <div className="section-title">
            <h3>Kompetanser</h3>
            <span className="muted small">{styles.length} i bruk</span>
            <button onClick={() => setAdding('competence')}>+ Ny kompetanse</button>
          </div>
          <p className="hint">
            Listen fyller seg selv fra produkttypene, behovet og radene i Kalender. Her bestemmer du navnet, kortnavnet og fargen kompetansen vises med i Bemanning, og rekkefølgen: dra en rad,
            eller bruk pilene. De ni første som noen av de faste har, velges med tastene 1–9.
          </p>
          {styles.length > 0 && (
            <table className="ledger personell competences">
              <thead>
                <tr>
                  <th />
                  <th className="center" title="Tasten kompetansen velges med i Bemanning">
                    Tast
                  </th>
                  <th>Navn</th>
                  <th title="Opptil fire tegn, brukes der blokkene er smale">Kort</th>
                  <th>Farge</th>
                  <th className="num" title="Aktive faste som har kompetansen">
                    Faste
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {styles.map((style, index) => (
                  <tr
                    key={style.key}
                    className={dragged === style.key ? 'dragging' : ''}
                    onDragOver={(e) => dragged && e.preventDefault()}
                    onDrop={() => {
                      if (dragged) move(dragged, index)
                      setDragged(null)
                    }}
                  >
                    <td className="actions">
                      <span className="reorder">
                        <span className="grip" draggable title="Dra for å flytte" onDragStart={() => setDragged(style.key)} onDragEnd={() => setDragged(null)}>
                          <GripVertical size={14} aria-hidden />
                        </span>
                        <button className="row-action" title="Flytt opp" disabled={index === 0} onClick={() => move(style.key, index - 1)}>
                          <ChevronUp size={13} aria-hidden />
                        </button>
                        <button className="row-action" title="Flytt ned" disabled={index === styles.length - 1} onClick={() => move(style.key, index + 1)}>
                          <ChevronDown size={13} aria-hidden />
                        </button>
                      </span>
                    </td>
                    <td className="center">{keys.has(style.key) ? <kbd>{keys.get(style.key)}</kbd> : ''}</td>
                    <td>
                      <TextField value={style.label} ariaLabel="Navn" onCommit={(label) => label && setStyle(style.key, { label })} />
                    </td>
                    <td>
                      <TextField value={style.shortLabel} className="short-label" ariaLabel="Kortnavn" onCommit={(shortLabel) => shortLabel && setStyle(style.key, { shortLabel })} />
                    </td>
                    <td>
                      <span className="color-choice" role="radiogroup" aria-label={`Farge for ${style.label}`}>
                        {LINE_COLORS.map((color) => (
                          <button key={color} role="radio" aria-checked={style.color === color} title={COLOR_NAMES[color]} className={style.color === color ? 'chosen' : ''} onClick={() => setStyle(style.key, { color })}>
                            <i className="swatch" style={competenceColor({ color })} />
                          </button>
                        ))}
                      </span>
                    </td>
                    <td className="num">{holders(style.key) || ''}</td>
                    <td className="actions">
                      {isUnusedCompetence(ws, style.key) && (
                        <button className="row-action" title={`Fjern ${style.label}. Ingen bruker den.`} onClick={() => updateStaffing((w) => ({ ...w, competenceStyles: removeCompetence(w, style.key) }))}>
                          <X size={13} aria-hidden />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {adding && (
        <AddDialog
          title={adding === 'person' ? 'Ny person' : 'Ny kompetanse'}
          label={adding === 'person' ? 'Navn' : 'Kompetanse'}
          taken={adding === 'competence' ? (name) => addCompetence(ws, name) === null : () => false}
          onClose={() => setAdding(null)}
          onAdd={(name) => {
            if (adding === 'person') setPersons((list) => addPerson(list, name))
            else updateStaffing((w) => ({ ...w, competenceStyles: addCompetence(w, name) ?? w.competenceStyles }))
            setAdding(null)
          }}
        />
      )}
    </div>
  )
}

interface AddProps {
  title: string
  label: string
  /** Whether the name cannot be used because it is there already. */
  taken: (name: string) => boolean
  onAdd: (name: string) => void
  onClose: () => void
}

function AddDialog({ title, label, taken, onAdd, onClose }: AddProps) {
  const [name, setName] = useState('')
  const duplicate = name.trim() !== '' && taken(name)
  const valid = name.trim() !== '' && !duplicate
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) onAdd(name)
        }}
      >
        <h2>{title}</h2>
        <label>
          {label}
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        {duplicate && <span className="issue">Finnes allerede i listen.</span>}
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
