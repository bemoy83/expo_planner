import { ClipboardCopy, Eraser, Maximize2, MousePointer2, Paintbrush, TriangleAlert, X } from 'lucide-react'
import { addDays, dayOfMonth, isoWeek, monthShort, weekdayIndex, type ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { carry, clearSickFrom, freeCapacity, isSick, paintBlock, removeCarried } from '../../domain/staffing'
import { PanelToggle, ToolSwitch, UndoRedoButtons, type ToolChoice } from '../common'
import { competenceColor } from '../dom'
import { ModeSwitch } from '../kalender/KalenderBar'
import { PlanBar } from '../kalender/PlanBar'
import type { PlanMode } from '../kalender/zoom'
import { Toasts } from '../Toasts'
import { useBemanning } from './BemanningScope'
import { DemandRows } from './DemandRows'
import { DayMenu, DemandPopover } from './Popovers'
import { ProjectLines } from './ProjectLines'
import type { Tool } from './tools'
import { EPSILON, hoursText, WEEKDAYS_LONG } from './week'

/** The page header in Bemanning: how far the people cover the demand of the days in view. */
export function BemanningHead() {
  const { persons, totals, panel, setPanel, selected, unfolded } = useBemanning()
  // The panel opens on the person of the selected day, else the one whose hours are open, else the first.
  const subject = selected?.personId ?? unfolded ?? persons[0]?.id
  const meta = [
    `${persons.length} faste`,
    totals.coveredShare !== null ? `${Math.round(totals.coveredShare * 100)} % av behovet dekket` : '',
    totals.remaining > EPSILON ? `${hoursText(totals.remaining)} t gjenstår` : '',
    totals.overtime > EPSILON ? `${hoursText(totals.overtime)} t overtid` : '',
    totals.weekendOpen > EPSILON ? `helg ${hoursText(totals.weekendOpen)} t åpent` : '',
  ].filter(Boolean)
  return (
    <div className="page-head">
      <h2>Kalender</h2>
      <span className="page-meta" title="Behov, overtid og åpne timer gjelder dagene som vises">{meta.join(' · ')}</span>
      <PanelToggle open={!!panel} what="persondetaljer" hint="timer, overtid og fravær. Klikk et navn for å åpne dem for personen." disabled={!subject} onToggle={() => setPanel(panel ? null : subject ? { personId: subject } : null)} />
    </div>
  )
}

/** What is pinned above the people: the projects in view and the demand per competence. */
export function BemanningTop() {
  return (
    <>
      <ProjectLines />
      <DemandRows />
    </>
  )
}

interface ToolbarProps {
  /** The width of the grid as it is seen. */
  width: number
  mode: PlanMode
  onMode: (mode: PlanMode) => void
  /** Every project, as key and name, and the one chosen in the filter. */
  projects: [key: string, name: string][]
  project: string
  onProject: (key: string) => void
  onToday: () => void
  /** Sizes the days so the chosen project fills the grid. */
  onFit: () => void
}

/**
 * The planning bar in Bemanning: the mode, undo, the tools (Velg, the brush with the competence it paints,
 * and Tøm), the project, and where in the period.
 */
export function BemanningToolbar({ width, mode, onMode, projects, project, onProject, onToday, onFit }: ToolbarProps) {
  const { tool, pickTool, brush, styles, lastKey, unresolved, removeOpen, clip, setClip, breaches, overtimeLimit, nameOf, setPanel, onShowDate } = useBemanning()
  const paste = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘V' : 'Ctrl+V'
  const style = brush ? styles.get(brush) : undefined
  const tools: ToolChoice<Tool>[] = [
    { value: 'select', icon: <MousePointer2 size={14} aria-hidden />, name: 'Velg', shortcut: 'V', title: 'Velg dager: klikk en dag, eller dra over flere for å kopiere dem. Dra en blokk til en annen dag eller person for å flytte dagens blokker, med Alt for å kopiere (V).' },
    {
      value: 'paint',
      icon: <Paintbrush size={14} aria-hidden />,
      name: style ? (
        <>
          Pensel <i className="swatch" style={competenceColor(style)} /> {style.label}
        </>
      ) : (
        'Pensel'
      ),
      shortcut: 'B',
      title: 'Mal dager med en kompetanse: klikk for hel dag, Shift for halv dag, dra over flere. Bare ledig tid fylles (B).',
    },
    { value: 'erase', icon: <Eraser size={14} aria-hidden />, name: 'Tøm', shortcut: 'T', title: 'Klikk eller dra over dager for å tømme dem (T, eller hold Alt).' },
  ]
  return (
    <PlanBar width={width} fitKey={`${project}|${tool}|${brush}|${unresolved}|${!!clip}|${breaches.length}`}>
      <div className="bar-zone">
        <ModeSwitch mode={mode} onChange={onMode} />
        <UndoRedoButtons />
        <ToolSwitch tool={tool} tools={tools} onChange={pickTool} />
        {!brush && <span className="bm-hints">Velg kompetanse i behovet{lastKey ? ` (1–${lastKey})` : ''}</span>}
        {breaches.length > 0 && (
          <button
            className="bm-over-limit"
            title={`Overtid over grensen:\n${breaches.flatMap((person) => person.weeks.map((week) => `${nameOf(person.personId)} · uke ${isoWeek(week.monday)} · ${hoursText(week.hours)} t`)).join('\n')}\nKlikk for å se den første.`}
            onClick={() => {
              setPanel({ personId: breaches[0].personId, week: breaches[0].weeks[0].monday })
              onShowDate(breaches[0].weeks[0].monday)
            }}
          >
            <TriangleAlert size={14} aria-hidden /> {breaches.length} over {hoursText(overtimeLimit)} t overtid/uke
          </button>
        )}
        {clip && (
          <span className="bm-clip" title="Dagene som er kopiert. De limes inn for de samme personene, fra dagen under markøren.">
            <ClipboardCopy size={14} aria-hidden /> Kopiert · {paste}
            <button className="row-action" aria-label="Tøm utklippet" title="Tøm utklippet" onClick={() => setClip(null)}>
              <X size={13} aria-hidden />
            </button>
          </span>
        )}
        {unresolved > 0 && (
          <span className="bm-unresolved" title="Blokker der personen er borte eller ikke lenger har kompetansen. Timene er tilbake i behovet.">
            {unresolved === 1 ? '1 uløst' : `${unresolved} uløste`}
            <button onClick={removeOpen}>Fjern</button>
          </span>
        )}
      </div>
      <div className="bar-view">
        <div className="bar-zone bar-zone-end">
          <select className="bar-select" aria-label="Prosjekt" title="Prosjekt: dagene tilpasses prosjektet, og de andre prosjektene dempes" value={project} onChange={(e) => onProject(e.target.value)}>
            <option value="">Alle prosjekter</option>
            {projects.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
          <button className="ghost" onClick={onToday}>
            I dag
          </button>
          <button className="ghost" disabled={!project} title={project ? 'Tilpass dagene til prosjektet' : 'Velg et prosjekt for å tilpasse dagene til det'} onClick={onFit}>
            <Maximize2 size={14} aria-hidden /> Tilpass prosjekt
          </button>
        </div>
      </div>
    </PlanBar>
  )
}

/** What opens over the grid in Bemanning: the menu of a day, the balance of a day of the demand, a person's absence, and the messages. */
export function BemanningOverlays() {
  const bm = useBemanning()
  const { ws, persons, staffed, styles, balance, brush, menu, demandPop, updateStaffing, dayName } = bm
  const menuPerson = menu ? persons.find((p) => p.id === menu.cell.personId) : undefined
  const dayText = (date: ISODate) => `${dayName(date)} ${dayOfMonth(date)}. ${monthShort(date)}`
  return (
    <>
      {menu && menuPerson && (
        <DayMenu
          x={menu.x}
          y={menu.y}
          title={`${menuPerson.name} · ${dayText(menu.cell.date)}`}
          competences={staffed.filter((style) => menuPerson.competences.includes(style.key)).map((style) => ({ style, blocked: paintBlock(ws, menu.cell, style.key) !== null }))}
          hasBlocks={(ws.assignments ?? []).some((a) => a.personId === menu.cell.personId && a.date === menu.cell.date)}
          open={bm.unfolded === menu.cell.personId}
          onToggleOpen={() => bm.toggleUnfolded(menu.cell.personId)}
          sick={dayType(menu.cell.date) === 'arbeidsdag' ? isSick(ws.unavailability ?? [], menu.cell.personId, menu.cell.date) : null}
          dayShort={`${dayName(menu.cell.date).slice(0, 3)} ${dayOfMonth(menu.cell.date)}.`}
          onSick={() => bm.setPanel({ personId: menu.cell.personId, draft: { kind: 'syk', from: menu.cell.date, to: menu.cell.date } })}
          onWell={() => updateStaffing((w) => ({ ...w, unavailability: clearSickFrom(w.unavailability ?? [], menu.cell.personId, menu.cell.date) }))}
          onAbsence={() => bm.setPanel({ personId: menu.cell.personId, draft: { kind: 'ferie', from: menu.cell.date, to: menu.cell.date } })}
          onClose={() => bm.setMenu(null)}
          onPaint={(competence) => bm.paint([menu.cell], competence, false)}
          onClear={() => bm.clear([menu.cell])}
        />
      )}
      {demandPop &&
        styles.get(demandPop.competence) &&
        (() => {
          const cell = balance.get(demandPop.competence, demandPop.date)
          const next = addDays(demandPop.date, 1)
          const nextName = WEEKDAYS_LONG[weekdayIndex(next)]
          return (
            <DemandPopover
              x={demandPop.x}
              y={demandPop.y}
              style={styles.get(demandPop.competence)!}
              dayText={dayText(demandPop.date)}
              demand={cell.demand}
              assigned={cell.assigned}
              remaining={cell.remaining}
              carried={cell.carried}
              free={freeCapacity(ws, demandPop.date, demandPop.competence).hours}
              nextDay={`${nextName}${dayType(next) !== 'arbeidsdag' ? ' (overtid)' : ''}`}
              nextDayShort={nextName.slice(0, 3)}
              painting={brush === demandPop.competence}
              canPaint={staffed.some((style) => style.key === demandPop.competence)}
              onClose={() => bm.setDemandPop(null)}
              onCarry={(hours) => updateStaffing((w) => ({ ...w, demandAdjustments: carry(w, demandPop.competence, demandPop.date, hours) }))}
              onRemoveCarried={() => updateStaffing((w) => ({ ...w, demandAdjustments: removeCarried(w.demandAdjustments ?? [], demandPop.competence, demandPop.date) }))}
              onPaint={() => brush !== demandPop.competence && bm.pickBrush(demandPop.competence)}
            />
          )
        })()}
      <Toasts toasts={bm.toasts} onDismiss={bm.dismissToast} />
    </>
  )
}
