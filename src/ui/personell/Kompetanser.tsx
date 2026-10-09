import { useMemo, useState } from 'react'
import { competenceUse, type CompetenceUse, addCompetence, competenceStyles, staffedCompetences, isUnusedCompetence, moveCompetence, removeCompetence, setCompetenceStyle } from '../../domain/competences'
import { LINE_COLORS, type CompetenceStyle, type LineColor } from '../../domain/types'
import { useWorkspace } from '../../store/workspaceStore'
import { UndoRedoButtons } from '../common'
import { DataTable } from '../DataTable'
import { competenceColor } from '../dom'
import { TextField } from '../fields'
import { useTable, type Column } from '../useTable'
import { AddDialog } from './AddDialog'
import { ChevronDown, ChevronUp, GripVertical, X } from 'lucide-react'

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

/** What names a competence, in words: the reason it cannot be removed. */
const usedByText = (use: CompetenceUse): string => {
  const part = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : '')
  return (
    [
      part(use.productTypes, 'produkttype', 'produkttyper'),
      part(use.demandLines, 'behovslinje', 'behovslinjer'),
      part(use.rows, 'rad i Kalender', 'rader i Kalender'),
      part(use.people, 'person', 'personer'),
      part(use.blocks, 'blokk i Bemanning', 'blokker i Bemanning'),
    ]
      .filter(Boolean)
      .join(' · ') || 'ingen – kan fjernes'
  )
}

const MOVE_ONLY_IN_OWN_ORDER = 'Rekkefølgen endres når tabellen ikke er sortert eller filtrert'

/**
 * How the competences are shown in Bemanning: name, short name, colour and order. The list fills
 * itself from the product types, the demand, the planning rows and the people.
 */
export function Kompetanser({ onOpenPersonell }: { onOpenPersonell: () => void }) {
  const { workspace, updateStaffing } = useWorkspace()
  const ws = workspace!
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [dragged, setDragged] = useState<string | null>(null)

  const styles = useMemo(() => competenceStyles(ws), [ws])
  const found = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? styles.filter((style) => `${style.label} ${style.shortLabel} ${style.key}`.toLowerCase().includes(q)) : styles
  }, [styles, search])
  // The keys follow the competences people have, as in Bemanning.
  const keys = useMemo(() => new Map(staffedCompetences(ws).slice(0, LAST_KEY).map((style, index) => [style.key, index + 1])), [ws])
  const holders = (key: string) => (ws.persons ?? []).filter((p) => p.active && p.competences.includes(key)).length

  const setStyle = (key: string, patch: Partial<Pick<CompetenceStyle, 'label' | 'shortLabel' | 'color'>>) => updateStaffing((w) => ({ ...w, competenceStyles: setCompetenceStyle(w, key, patch) }))
  const move = (key: string, toIndex: number) => updateStaffing((w) => ({ ...w, competenceStyles: moveCompetence(w, key, toIndex) }))
  /** Whether the rows shown are all the competences in their own order: only then can they be moved. */
  const inOwnOrder = (rows: CompetenceStyle[]) => rows.length === styles.length && rows.every((row, index) => row === styles[index])

  const columns: Column<CompetenceStyle>[] = [
    {
      key: 'order',
      className: 'actions',
      cell: (style, index, rows) => {
        const movable = inOwnOrder(rows)
        return (
          <span className="reorder">
            <span className="grip" draggable={movable} title={movable ? 'Dra for å flytte' : MOVE_ONLY_IN_OWN_ORDER} onDragStart={() => setDragged(style.key)} onDragEnd={() => setDragged(null)}>
              <GripVertical size={14} aria-hidden />
            </span>
            <button className="row-action" title={movable ? 'Flytt opp' : MOVE_ONLY_IN_OWN_ORDER} disabled={!movable || index === 0} onClick={() => move(style.key, index - 1)}>
              <ChevronUp size={13} aria-hidden />
            </button>
            <button className="row-action" title={movable ? 'Flytt ned' : MOVE_ONLY_IN_OWN_ORDER} disabled={!movable || index === rows.length - 1} onClick={() => move(style.key, index + 1)}>
              <ChevronDown size={13} aria-hidden />
            </button>
            {/* Removing sits here, at the start of the line, so it is in view however narrow the window is. */}
            {isUnusedCompetence(ws, style.key) && (
              <button className="row-action" title={`Fjern ${style.label}. Ingen bruker den.`} onClick={() => updateStaffing((w) => ({ ...w, competenceStyles: removeCompetence(w, style.key) }))}>
                <X size={13} aria-hidden />
              </button>
            )}
          </span>
        )
      },
    },
    {
      key: 'key',
      head: 'Tast',
      title: 'Tasten kompetansen velges med i Bemanning',
      className: 'center',
      text: (style) => String(keys.get(style.key) ?? ''),
      sort: (style) => keys.get(style.key) ?? NaN,
      cell: (style) => (keys.has(style.key) ? <kbd>{keys.get(style.key)}</kbd> : ''),
    },
    {
      key: 'label',
      head: 'Navn',
      text: (style) => style.label,
      cell: (style) => <TextField value={style.label} ariaLabel="Navn" onCommit={(label) => label && setStyle(style.key, { label })} />,
    },
    {
      key: 'short',
      head: 'Kort',
      title: 'Opptil fire tegn, brukes der blokkene er smale',
      text: (style) => style.shortLabel,
      cell: (style) => <TextField value={style.shortLabel} className="short-label" ariaLabel="Kortnavn" onCommit={(shortLabel) => shortLabel && setStyle(style.key, { shortLabel })} />,
    },
    {
      key: 'color',
      head: 'Farge',
      text: (style) => COLOR_NAMES[style.color],
      cell: (style) => (
        <span className="color-choice" role="radiogroup" aria-label={`Farge for ${style.label}`}>
          {LINE_COLORS.map((color) => (
            <button key={color} role="radio" aria-checked={style.color === color} title={COLOR_NAMES[color]} className={style.color === color ? 'chosen' : ''} onClick={() => setStyle(style.key, { color })}>
              <i className="swatch" style={competenceColor({ color })} />
            </button>
          ))}
        </span>
      ),
    },
    {
      key: 'holders',
      head: 'Faste',
      title: 'Aktive faste som har kompetansen',
      className: 'num',
      text: (style) => String(holders(style.key) || ''),
      sort: (style) => holders(style.key),
      cell: (style) => holders(style.key) || '',
    },
    {
      key: 'used',
      head: 'Brukes av',
      title: 'Det som nevner kompetansen. Den kan fjernes først når ingenting gjør det.',
      text: (style) => usedByText(competenceUse(ws, style.key)),
      cell: (style) => usedByText(competenceUse(ws, style.key)),
      cellProps: () => ({ className: 'muted used-by' }),
    },
  ]
  const table = useTable(found, columns)
  const movable = inOwnOrder(table.rows)

  return (
    <div className="behov">
      <div className="toolbar">
        <input className="search" type="search" placeholder="Søk kompetanse" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="muted small">{styles.length} kompetanser</span>
        <span className="toolbar-gap" />
        <UndoRedoButtons />
        <button className="primary" onClick={() => setAdding(true)}>
          + Ny kompetanse
        </button>
      </div>

      <div className="behov-body">
        <p className="hint">
          Listen fyller seg selv fra produkttypene, behovet og radene i Kalender. Her bestemmer du navnet, kortnavnet og fargen kompetansen vises med i Bemanning, og rekkefølgen: dra en rad, eller
          bruk pilene. De ni første som noen av de faste har, velges med tastene 1–9. Hvem som har hvilken kompetanse, settes på{' '}
          <button className="link" onClick={onOpenPersonell}>
            Personell
          </button>
          .
        </p>
        {styles.length ? (
          <DataTable
            table={table}
            className="personell"
            rowKey={(style) => style.key}
            empty="Ingen kompetanser passer søket eller filteret."
            rowProps={(style, index) => ({
              className: dragged === style.key ? 'dragging' : undefined,
              onDragOver: (e) => dragged && movable && e.preventDefault(),
              onDrop: () => {
                if (dragged && movable) move(dragged, index)
                setDragged(null)
              },
            })}
          />
        ) : (
          <p className="notice">Ingen kompetanser ennå. De kommer av seg selv fra produkttypene og behovet, eller legges inn med «+ Ny kompetanse».</p>
        )}
      </div>

      {adding && (
        <AddDialog
          title="Ny kompetanse"
          label="Kompetanse"
          taken={(name) => addCompetence(ws, name) === null}
          onClose={() => setAdding(false)}
          onAdd={(name) => {
            updateStaffing((w) => ({ ...w, competenceStyles: addCompetence(w, name) ?? w.competenceStyles }))
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}
