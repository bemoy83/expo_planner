import { ClipboardCopy, Eraser, MousePointer2, Paintbrush, PanelRight, X } from 'lucide-react'
import { addDays, dayOfMonth, monthShort, weekdayIndex, type ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { carry, clearSickFrom, freeCapacity, isSick, paintBlock, removeCarried } from '../../domain/staffing'
import { ToolSwitch, type ToolChoice } from '../common'
import { competenceColor } from '../dom'
import type { PlanMode } from '../kalender/zoom'
import { Toasts } from '../Toasts'
import { BemanningBar } from './BemanningBar'
import { useBemanning } from './BemanningScope'
import { DemandRows } from './DemandRows'
import { DayMenu, DemandPopover } from './Popovers'
import { ProjectLines } from './ProjectLines'
import type { Tool } from './tools'
import { EPSILON, hoursText, WEEKDAYS_LONG } from './week'

/** The page header in Bemanning: how far the people cover the demand of the period. */
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
      <span className="page-meta">{meta.join(' · ')}</span>
      <button
        className={`ghost icon-button ${panel ? 'active' : ''}`}
        aria-pressed={!!panel}
        disabled={!subject}
        aria-label={panel ? 'Skjul persondetaljer' : 'Vis persondetaljer'}
        title={panel ? 'Skjul persondetaljer' : 'Vis persondetaljer: timer, overtid og fravær. Klikk et navn for å åpne dem for personen.'}
        onClick={() => setPanel(panel ? null : subject ? { personId: subject } : null)}
      >
        <PanelRight size={16} aria-hidden />
      </button>
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
  width: number
  mode: PlanMode
  onMode: (mode: PlanMode) => void
  projects: [key: string, name: string][]
  project: string
  onProject: (key: string) => void
  onToday: () => void
  onFit: () => void
}

/** The planning bar in Bemanning, with its tools: Velg, the brush with the competence it paints, and Tøm. */
export function BemanningToolbar(props: ToolbarProps) {
  const { tool, pickTool, brush, styles, lastKey, unresolved, removeOpen, clip, setClip } = useBemanning()
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
    <BemanningBar {...props} fitKey={`${tool}|${brush}|${unresolved}|${!!clip}`}>
      <ToolSwitch tool={tool} tools={tools} onChange={pickTool} />
      {!brush && <span className="bm-hints">Velg kompetanse i behovet{lastKey ? ` (1–${lastKey})` : ''}</span>}
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
    </BemanningBar>
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
