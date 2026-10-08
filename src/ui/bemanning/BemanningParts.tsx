import { Eraser, MousePointer2, Paintbrush, PanelRight } from 'lucide-react'
import { addDays, dayOfMonth, monthShort, weekdayIndex, type ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { carry, clearSick, freeCapacity, isSick, markSick, paintBlock, removeCarried } from '../../domain/staffing'
import { ToolSwitch, type ToolChoice } from '../common'
import { competenceColor } from '../dom'
import type { PlanMode } from '../kalender/zoom'
import { Toasts } from '../Toasts'
import { AbsenceDialog } from './AbsenceDialog'
import { BemanningBar } from './BemanningBar'
import { useBemanning } from './BemanningScope'
import { DemandRows } from './DemandRows'
import { DayMenu, DemandPopover } from './Popovers'
import { ProjectLines } from './ProjectLines'
import type { Tool } from './tools'
import { EPSILON, hoursText, weekDates, WEEKDAYS_LONG } from './week'

/** The page header in Bemanning: how far the people cover the demand of the period. */
export function BemanningHead() {
  const { persons, totals } = useBemanning()
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
      <button className="ghost icon-button" disabled aria-label="Vis persondetaljer" title="Klikk et navn for detaljer om personen">
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
  const { tool, pickTool, brush, styles, lastKey, unresolved, removeOpen } = useBemanning()
  const style = brush ? styles.get(brush) : undefined
  const tools: ToolChoice<Tool>[] = [
    { value: 'select', icon: <MousePointer2 size={14} aria-hidden />, name: 'Velg', shortcut: 'V', title: 'Velg en dag (V).' },
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
    <BemanningBar {...props} fitKey={`${tool}|${brush}|${unresolved}`}>
      <ToolSwitch tool={tool} tools={tools} onChange={pickTool} />
      {!brush && <span className="bm-hints">Velg kompetanse i behovet{lastKey ? ` (1–${lastKey})` : ''}</span>}
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
  const { ws, persons, staffed, styles, balance, brush, menu, demandPop, absenceFor, updateStaffing, dayName } = bm
  const menuPerson = menu ? persons.find((p) => p.id === menu.cell.personId) : undefined
  /** The workdays of the week from a day on, for «ut uka». */
  const restOfWeek = (date: ISODate) => weekDates(date).filter((d) => d >= date && dayType(d) === 'arbeidsdag')
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
          dayName={dayName(menu.cell.date)}
          sick={dayType(menu.cell.date) === 'arbeidsdag' ? isSick(ws.unavailability ?? [], menu.cell.personId, menu.cell.date) : null}
          moreDays={restOfWeek(menu.cell.date).length > 1}
          onSick={(rest) => updateStaffing((w) => ({ ...w, unavailability: markSick(w.unavailability ?? [], menu.cell.personId, rest ? restOfWeek(menu.cell.date) : [menu.cell.date]) }))}
          onWell={(rest) => updateStaffing((w) => ({ ...w, unavailability: clearSick(w.unavailability ?? [], menu.cell.personId, rest ? restOfWeek(menu.cell.date) : [menu.cell.date]) }))}
          onAbsence={() => bm.setAbsenceFor(menu.cell)}
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
      {absenceFor && persons.some((p) => p.id === absenceFor.personId) && (
        <AbsenceDialog
          person={persons.find((p) => p.id === absenceFor.personId)!}
          unavailability={ws.unavailability ?? []}
          workday={ws.settings.workday}
          date={absenceFor.date}
          onChange={(change) => updateStaffing((w) => ({ ...w, unavailability: change(w.unavailability ?? []) }))}
          onClose={() => bm.setAbsenceFor(null)}
        />
      )}
      <Toasts toasts={bm.toasts} onDismiss={bm.dismissToast} />
    </>
  )
}
