import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical, Plus, X } from 'lucide-react'
import { competenceUse, type CompetenceUse, addCompetence, competenceStyles, diffCompetenceStyles, mergeCompetenceStyles, staffedCompetences, isUnusedCompetence, moveCompetence, removeCompetence, setCompetenceStyle, unstaffedCompetences, type FileCompetence } from '../../domain/competences'
import { todayIso } from '../../domain/dates'
import { LINE_COLORS, type CompetenceStyle, type LineColor } from '../../domain/types'
import { COLOR_NAMES, readKompetanserWorkbook, writeKompetanserWorkbook } from '../../import/kompetanserFile'
import { useWorkspace } from '../../store/workspaceStore'
import { Menu, MergeReplaceDialog } from '../common'
import { download, XLSX_TYPE } from '../files'
import { TableFileMenu } from '../TableFile'
import { describeDiff, useTableFile } from '../useTableFile'
import { competenceColor } from '../dom'
import { TextField } from '../fields'
import { AddDialog } from './AddDialog'
import type { TablePage } from '../RegisterHead'

/** The highest number a competence can be picked with on the keyboard in Bemanning. */
const LAST_KEY = 9

/** What names a competence, in words: the reason it cannot be removed. Empty when nothing does. */
const usedBy = (use: CompetenceUse): string[] => {
  const part = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : '')
  return [
    part(use.productTypes, 'produkttype', 'produkttyper'),
    part(use.demandLines, 'behovslinje', 'behovslinjer'),
    part(use.rows, 'rad i Kalender', 'rader i Kalender'),
    part(use.people, 'person', 'personer'),
    part(use.suppliers, 'leverandør', 'leverandører'),
    part(use.blocks, 'blokk i Bemanning', 'blokker i Bemanning'),
  ].filter(Boolean)
}

/** The colour of a competence, picked from the colours of the lines in a grid under its swatch. */
function ColorPick({ style, onPick }: { style: CompetenceStyle; onPick: (color: LineColor) => void }) {
  return (
    <Menu
      label={
        <>
          <i className="mk-swatch" style={competenceColor(style)} />
          <ChevronDown size={11} aria-hidden />
        </>
      }
      ariaLabel={`Farge for ${style.label}`}
      title={`${COLOR_NAMES[style.color]} · endre farge`}
      className="mk-color"
    >
      {(close) => (
        <div className="mk-colors" role="radiogroup" aria-label={`Farge for ${style.label}`}>
          <span className="field-head">Farge for {style.label}</span>
          <div className="mk-color-grid">
            {LINE_COLORS.map((color) => (
              <button key={color} role="radio" aria-checked={style.color === color} className={style.color === color ? 'on' : ''} onClick={() => (onPick(color), close())}>
                <i style={competenceColor({ color })} />
                {COLOR_NAMES[color]}
              </button>
            ))}
          </div>
        </div>
      )}
    </Menu>
  )
}

/**
 * The competences: their names, and how they are shown in Bemanning: short name, colour and order. The list fills
 * itself from the product types, the demand, the planning rows and the people. A competence has one name, so
 * a name changed here is changed everywhere.
 */
export function Kompetanser({ head, notify, show }: TablePage) {
  const { workspace, updateStaffing, renameCompetence } = useWorkspace()
  const ws = workspace!
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [dragged, setDragged] = useState<string | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const styles = useMemo(() => competenceStyles(ws), [ws])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? styles.filter((style) => `${style.label} ${style.shortLabel}`.toLowerCase().includes(q)) : styles
  }, [styles, search])
  // The order is the planner's, so it is changed only where every competence is in view.
  const movable = shown.length === styles.length
  // The keys follow the competences people have, as in Bemanning.
  const keys = useMemo(() => new Map(staffedCompetences(ws).slice(0, LAST_KEY).map((style, index) => [style.key, index + 1])), [ws])
  const unstaffed = useMemo(() => new Set(unstaffedCompetences(ws).map((style) => style.key)), [ws])
  const holders = (key: string) => (ws.persons ?? []).filter((p) => p.active && p.competences.includes(key)).length
  const hired = (key: string) => (ws.suppliers ?? []).filter((s) => s.competences.includes(key)).length

  const setStyle = (style: CompetenceStyle, patch: Partial<Pick<CompetenceStyle, 'shortLabel' | 'color'>>, text: string) => {
    updateStaffing((w) => ({ ...w, competenceStyles: setCompetenceStyle(w, style.key, patch) }))
    notify(text)
  }
  const move = (style: CompetenceStyle, toIndex: number) => {
    if (toIndex < 0 || toIndex >= styles.length || styles[toIndex] === style) return
    updateStaffing((w) => ({ ...w, competenceStyles: moveCompetence(w, style.key, toIndex) }))
    notify(`${style.label} flyttet til plass ${toIndex + 1}`)
  }
  const rename = (style: CompetenceStyle, label: string) => {
    if (!label || label === style.label) return
    if (!renameCompetence(style.key, label)) return show(`${label} finnes allerede. To kompetanser kan ikke ha samme navn.`)
    notify(`${style.label} heter nå ${label}, overalt: KPI, Behov, Kalender, Faste og Bemanning`)
  }

  // The competences come from the product types and the people, so there is always a list for the file to be held against.
  const { pending, onFile, done } = useTableFile<FileCompetence[]>({ read: readKompetanserWorkbook, empty: false, takeIn: () => {}, onError: show })
  const apply = (mode: 'merge' | 'replace') => {
    if (!pending) return
    updateStaffing((w) => ({ ...w, competenceStyles: mergeCompetenceStyles(w, pending.incoming, mode === 'replace') }))
    notify(`${pending.file} ${mode === 'merge' ? 'slått sammen med kompetansene' : 'har erstattet kompetansene'}`)
    done()
  }
  const diff = pending ? diffCompetenceStyles(ws, pending.incoming) : null

  return (
    <>
      {head(
        <TableFileMenu
          exportTitle="Last ned kompetansene som en Excel-fil: navn, kortnavn og farge, i rekkefølgen her."
          importTitle="Les inn en fil med kompetanser: en som er eksportert herfra, eller en med kolonnen Kompetanse, og gjerne Kort og Farge."
          canExport={styles.length > 0}
          onExport={() => download(`expo-planner-kompetanser-${todayIso()}.xlsx`, writeKompetanserWorkbook(ws), XLSX_TYPE)}
          onFile={onFile}
        />,
      )}
      <div className="op">
        <div className="op-bar">
          <input className="search" type="search" placeholder="Søk kompetanse" value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="muted small mk-bar-note">{movable ? 'Dra en rad for å endre rekkefølgen i Bemanning.' : 'Rekkefølgen kan endres når søket er tomt.'}</span>
          <span className="toolbar-gap" />
          <button className="primary" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden /> Ny kompetanse
          </button>
        </div>
        <p className="op-flow">
          <span>
            Én kompetanse har <strong>ett navn</strong>: endres det her, endres det overalt.
          </span>
          <span>
            <strong>Kort</strong> (opptil 4 tegn) og <strong>farge</strong> brukes i Bemanning.
          </span>
          <span className="op-flow-aside">
            Tastene <kbd>1</kbd>–<kbd>9</kbd> velger de ni første som noen faste har.
          </span>
        </p>

        {styles.length ? (
          <div className="op-table mk-competences">
            <div className="op-row op-head">
              <span />
              <span className="mk-center" title="Tasten kompetansen velges med i Bemanning">
                Tast
              </span>
              <span>Navn</span>
              <span title="Opptil fire tegn, brukes der blokkene er smale">Kort</span>
              <span>Farge</span>
              <span>I Bemanning</span>
              <span className="num" title="Aktive faste som har kompetansen">
                Faste
              </span>
              <span className="num" title="Leverandører som stiller med den">
                Innleid
              </span>
              <span title="Det som nevner kompetansen. Den kan fjernes først når ingenting gjør det.">Brukes av</span>
              <span />
            </div>
            <div className="op-body">
              {shown.map((style, index) => {
                const n = holders(style.key)
                const s = hired(style.key)
                const used = usedBy(competenceUse(ws, style.key))
                const needed = unstaffed.has(style.key)
                return (
                  <div
                    key={style.key}
                    className={`op-row ${dragged === style.key ? 'mk-dragged' : ''} ${over === index && dragged && dragged !== style.key ? 'mk-over' : ''}`}
                    onDragOver={(e) => {
                      if (!dragged || !movable) return
                      e.preventDefault()
                      setOver(index)
                    }}
                    onDrop={() => {
                      const from = styles.find((other) => other.key === dragged)
                      if (from && movable) move(from, index)
                      setDragged(null)
                      setOver(null)
                    }}
                  >
                    <span className="mk-order">
                      <span
                        className={`mk-grip ${movable ? '' : 'off'}`}
                        draggable={movable}
                        title={movable ? 'Dra for å flytte' : 'Rekkefølgen endres når søket er tomt'}
                        onDragStart={() => setDragged(style.key)}
                        onDragEnd={() => (setDragged(null), setOver(null))}
                      >
                        <GripVertical size={14} aria-hidden />
                      </span>
                      <span className="mk-arrows">
                        <button className="icon-button" title="Flytt opp" disabled={!movable || index === 0} onClick={() => move(style, index - 1)}>
                          <ChevronUp size={12} aria-hidden />
                        </button>
                        <button className="icon-button" title="Flytt ned" disabled={!movable || index === shown.length - 1} onClick={() => move(style, index + 1)}>
                          <ChevronDown size={12} aria-hidden />
                        </button>
                      </span>
                    </span>
                    <span className="mk-center">{keys.has(style.key) && <kbd>{keys.get(style.key)}</kbd>}</span>
                    <span className="mk-name">
                      <TextField value={style.label} ariaLabel="Navn" onCommit={(label) => rename(style, label)} />
                    </span>
                    <span className="mk-short">
                      <TextField
                        className="short-label"
                        value={style.shortLabel}
                        ariaLabel={`Kortnavn for ${style.label}`}
                        onCommit={(text) => {
                          const shortLabel = text.trim().slice(0, 4).toUpperCase()
                          if (shortLabel && shortLabel !== style.shortLabel) setStyle(style, { shortLabel }, `${style.label} vises som ${shortLabel} i smale blokker`)
                        }}
                      />
                    </span>
                    <span>
                      <ColorPick style={style} onPick={(color) => color !== style.color && setStyle(style, { color }, `${style.label} er nå ${COLOR_NAMES[color].toLowerCase()}`)} />
                    </span>
                    <span className="mk-preview" aria-hidden>
                      <i className="mk-block" style={competenceColor(style)}>
                        {style.label}
                      </i>
                      <i className="mk-block short" style={competenceColor(style)}>
                        {style.shortLabel}
                      </i>
                    </span>
                    <span className={`num ${needed ? 'mk-unstaffed' : 'muted'}`} title={needed ? `Behovet nevner ${style.label}, men ingen aktive faste har den` : undefined}>
                      {needed && <i className="op-attention" aria-hidden />}
                      {n || (needed ? '0' : '')}
                    </span>
                    <span className="num muted">{s || ''}</span>
                    <span className="muted small ellipsis" title={used.join(' · ')}>
                      {used.length ? used.join(' · ') : <span className="faint">ingen · kan fjernes</span>}
                    </span>
                    <span className="op-actions">
                      {isUnusedCompetence(ws, style.key) && !used.length && (
                        <button
                          className="icon-button"
                          title={`Fjern ${style.label}. Ingen bruker den.`}
                          onClick={() => {
                            updateStaffing((w) => ({ ...w, competenceStyles: removeCompetence(w, style.key) }))
                            notify(`Fjernet ${style.label}`)
                          }}
                        >
                          <X size={13} aria-hidden />
                        </button>
                      )}
                    </span>
                  </div>
                )
              })}
              {!shown.length && <p className="op-empty">Ingen kompetanser passer søket.</p>}
            </div>
          </div>
        ) : (
          <p className="op-empty">Ingen kompetanser ennå. De kommer av seg selv fra produkttypene og behovet, eller legges inn med «Ny kompetanse».</p>
        )}
      </div>

      {pending && diff && (
        <MergeReplaceDialog
          title="Importer kompetanser"
          source={pending.file}
          results={[describeDiff('Kompetanser', diff), 'Kompetansene i filen kommer først, i filens rekkefølge. Et navn appen ikke kjenner, blir en ny kompetanse; gi nytt navn i appen, ikke i filen.']}
          replaceText={`kompetanser som bare finnes i appen mister kortnavn, farge og plass${diff.onlyInApp - diff.inUse ? `; ${diff.onlyInApp - diff.inUse} som ingen bruker forsvinner` : ''}${diff.inUse ? `; ${diff.inUse} som er i bruk blir stående, sist i listen` : ''}`}
          onCancel={done}
          onApply={apply}
        />
      )}

      {adding && (
        <AddDialog
          title="Ny kompetanse"
          label="Kompetanse"
          lead="Kompetanser kommer også av seg selv fra produkttypene og behovet."
          taken={(name) => addCompetence(ws, name) === null}
          onClose={() => setAdding(false)}
          onAdd={(name) => {
            updateStaffing((w) => ({ ...w, competenceStyles: addCompetence(w, name) ?? w.competenceStyles }))
            notify(`La til ${name}`)
            setAdding(false)
          }}
        />
      )}
    </>
  )
}
