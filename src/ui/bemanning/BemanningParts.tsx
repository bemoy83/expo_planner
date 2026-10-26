import type { ReactNode } from 'react'
import { ClipboardCopy, Maximize2, TriangleAlert, X } from 'lucide-react'
import { addDays, dayOfMonth, isoWeek, monthShort, weekdayName, type ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { freeCapacity, removeCarried } from '../../domain/staffing/balance'
import { paintBlock } from '../../domain/staffing/edit'
import { carry } from '../../domain/staffing/projectBalance'
import { backFrom, isAway } from '../../domain/staffing/time'
import { placeName } from '../../domain/workPlace'
import { PanelToggle } from '../common'
import { count, modKey } from '../dom'
import type { CrewPart, PlanMode } from '../kalender/zoom'
import { Toasts } from '../Toasts'
import { useBemanning } from './BemanningScope'
import { DemandRows } from './DemandRows'
import { CarryWork, DayMenu, DemandPopover } from './Popovers'
import { EPSILON } from './week'
import { hoursText } from '../format'
import { CrewBar, CrewHead, CrewTop } from './CrewFrame'
import { crewTools } from './crewTools'

/** The page header in Bemanning: how far the people cover the demand of the days in view. */
export function BemanningHead({ places, onDayPlan }: { /** The button «Steder», as in the plan's header. */ places: ReactNode; /** Opens the day plan of the day in focus. */ onDayPlan: () => void }) {
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
    <CrewHead
      part="faste"
      meta={meta}
      metaTitle="Behov, overtid og åpne timer gjelder dagene som vises"
      places={places}
      onDayPlan={onDayPlan}
      dayPlanTitle="Arbeidsplan til utskrift: dagsplanen for dagen du står på, og ukeplanen. Høyreklikk en dato for dagsplanen."
      panel={<PanelToggle open={!!panel} what="persondetaljer" hint="timer, overtid og fravær. Klikk et navn for å åpne dem for personen." disabled={!subject} onToggle={() => setPanel(panel ? null : subject ? { personId: subject } : null)} />}
    />
  )
}

/** What is pinned above the people: the projects in view, the Avvik of each day as Innleid has it, and the demand per competence. */
export const BemanningTop = () => <CrewTop demand={<DemandRows />} />

interface ToolbarProps {
  /** The width of the grid as it is seen. */
  width: number
  mode: PlanMode
  onMode: (mode: PlanMode) => void
  /** Every project, as key and name, and the one chosen in the filter. */
  projects: [key: string, name: string][]
  project: string
  onProject: (key: string) => void
  /** Goes to Innleid, the other part of Bemanning. */
  onPart: (part: CrewPart) => void
  onToday: () => void
  /** Sizes the days so the chosen project fills the grid. */
  onFit: () => void
}

/**
 * The planning bar in Bemanning: the mode, undo, the tools (Velg, the brush with the competence it paints,
 * and Tøm), the project, and where in the period.
 */
export function BemanningToolbar({ width, mode, onMode, onPart, projects, project, onProject, onToday, onFit }: ToolbarProps) {
  const { tool, pickTool, brush, brushProject, brushHall, projectName, styles, lastKey, unresolved, removeOpen, clip, setClip, breaches, overtimeLimit, nameOf, setPanel, onShowDate } = useBemanning()
  const tools = crewTools(brush ? styles.get(brush) : undefined, brushProject && `${projectName(brushProject)}${brushHall !== null ? ` · ${placeName(brushHall)}` : ''}`, {
    select: 'Velg dager: klikk en dag, eller dra over flere for å kopiere dem. Dra en blokk til en annen dag eller person for å flytte dagens blokker, med Alt for å kopiere (V).',
    paint: 'Mal dager med en kompetanse: klikk for hel dag, dra over flere, kort innenfor en dag for en del av den, Shift for å stoppe der behovet er dekket. Bare ledig tid fylles. Velg et prosjekt under kompetansen i behovet for å male for det (B).',
    erase: 'Klikk eller dra over dager for å tømme dem (T, eller hold Alt).',
  })
  return (
    <CrewBar
      width={width}
      fitKey={`${project}|${tool}|${brush}|${brushProject}|${brushHall}|${unresolved}|${!!clip}|${breaches.length}`}
      mode={mode}
      onMode={onMode}
      part="faste"
      onPart={onPart}
      tool={tool}
      tools={tools}
      pickTool={pickTool}
      pickKeys={brush ? null : lastKey}
      onToday={onToday}
      before={
        <select className="bar-select" aria-label="Prosjekt" title="Prosjekt: dagene tilpasses prosjektet, og de andre prosjektene dempes" value={project} onChange={(e) => onProject(e.target.value)}>
          <option value="">Alle prosjekter</option>
          {projects.map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
      }
      after={
        <button className="ghost" disabled={!project} title={project ? 'Tilpass dagene til prosjektet' : 'Velg et prosjekt for å tilpasse dagene til det'} onClick={onFit}>
          <Maximize2 size={14} aria-hidden /> Tilpass prosjekt
        </button>
      }
    >
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
        <span className="bm-clip" title="Dagene som er kopiert. De limes inn fra dagen og linjen under markøren.">
          <ClipboardCopy size={14} aria-hidden /> Kopiert · {modKey('V')}
          <button className="row-action" aria-label="Tøm utklippet" title="Tøm utklippet" onClick={() => setClip(null)}>
            <X size={13} aria-hidden />
          </button>
        </span>
      )}
      {unresolved > 0 && (
        <span className="bm-unresolved" title="Blokker der personen er borte eller ikke lenger har kompetansen. Timene er tilbake i behovet.">
          {count(unresolved, 'uløst', 'uløste')}
          <button onClick={removeOpen}>Fjern</button>
        </span>
      )}
    </CrewBar>
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
          competences={staffed.filter((style) => menuPerson.competences.includes(style.key)).map((style) => ({ style, blocked: paintBlock(ws, menu.cell, style.key, true) !== null }))}
          hasBlocks={(ws.assignments ?? []).some((a) => a.personId === menu.cell.personId && a.date === menu.cell.date)}
          open={bm.unfolded === menu.cell.personId}
          onToggleOpen={() => bm.toggleUnfolded(menu.cell.personId)}
          away={dayType(menu.cell.date) === 'arbeidsdag' && isAway(ws.unavailability ?? [], menu.cell.personId, menu.cell.date)}
          dayShort={`${dayName(menu.cell.date).slice(0, 3)} ${dayOfMonth(menu.cell.date)}.`}
          onBack={() => updateStaffing((w) => ({ ...w, unavailability: backFrom(w.unavailability ?? [], menu.cell.personId, menu.cell.date) }))}
          onAbsence={() => bm.setPanel({ personId: menu.cell.personId, draft: { from: menu.cell.date, to: menu.cell.date } })}
          onClose={() => bm.setMenu(null)}
          onPaint={(competence) => bm.paint([menu.cell], competence)}
          onClear={() => bm.clear([menu.cell])}
        />
      )}
      {demandPop &&
        styles.get(demandPop.competence) &&
        (() => {
          const cell = balance.get(demandPop.competence, demandPop.date)
          const next = addDays(demandPop.date, 1)
          const nextName = weekdayName(next)
          return (
            <DemandPopover
              x={demandPop.x}
              y={demandPop.y}
              style={styles.get(demandPop.competence)!}
              dayText={dayText(demandPop.date)}
              stats={[
                { label: 'Behov', hours: cell.demand },
                { label: 'Tildelt', hours: cell.assigned },
                { label: 'Gjenstår', hours: Math.max(0, cell.remaining) },
              ]}
              paintText={brush === demandPop.competence ? `Maler med ${styles.get(demandPop.competence)!.label}` : `Mal med ${styles.get(demandPop.competence)!.label}`}
              canPaint={staffed.some((style) => style.key === demandPop.competence)}
              onClose={() => bm.setDemandPop(null)}
              onPaint={() => brush !== demandPop.competence && bm.pickBrush(demandPop.competence)}
            >
              <CarryWork
                style={styles.get(demandPop.competence)!}
                carried={cell.carried}
                free={freeCapacity(ws, demandPop.date, demandPop.competence).hours}
                nextDay={`${nextName}${dayType(next) !== 'arbeidsdag' ? ' (overtid)' : ''}`}
                nextDayShort={nextName.slice(0, 3)}
                onClose={() => bm.setDemandPop(null)}
                onCarry={(hours) => updateStaffing((w) => ({ ...w, demandAdjustments: carry(w, demandPop.competence, demandPop.date, hours) }))}
                onRemoveCarried={() => updateStaffing((w) => ({ ...w, demandAdjustments: removeCarried(w.demandAdjustments ?? [], demandPop.competence, demandPop.date) }))}
              />
            </DemandPopover>
          )
        })()}
      <Toasts toasts={bm.toasts} onDismiss={bm.dismissToast} />
    </>
  )
}
