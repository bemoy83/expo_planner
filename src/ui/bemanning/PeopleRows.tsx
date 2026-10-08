import { memo } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ISODate } from '../../domain/dates'
import { paidHours } from '../../domain/staffing'
import type { Assignment, CompetenceStyle, Person, Unavailability, WorkdaySettings } from '../../domain/types'
import type { PersonWeek } from '../../domain/staffing'
import { competenceColor } from '../dom'
import { Line } from '../kalender/GridRows'
import { dayClass, type Columns } from '../kalender/gridTypes'
import { LEFT_W, ROW_H } from '../kalender/layout'
import { useBemanning, type GhostBlock, type PersonActions } from './BemanningScope'
import { dayCell } from './dayCell'
import { DIVIDER_H, PERSON_H } from './layout'
import { FoldedDay, WeekMeter } from './FoldedDay'
import { strokeRange } from './tools'
import { UnfoldedPerson } from './UnfoldedPerson'
import { hoursText } from './week'

const NO_ASSIGNMENTS: Assignment[] = []
const NO_ABSENCE: Unavailability[] = []

interface LineProps {
  person: Person
  assignments: Map<ISODate, Assignment[]> | undefined
  absence: Map<ISODate, Unavailability[]> | undefined
  week: PersonWeek
  cols: Columns
  workday: WorkdaySettings
  /** The competences people have, in order: one dot each in the label. */
  competences: CompetenceStyle[]
  styles: Map<string, CompetenceStyle>
  isOk: (a: Assignment) => boolean
  isOpen: (a: Assignment) => boolean
  /** The competence in focus: blocks of other competences are dimmed. */
  brush: string | null
  /** The person lacks the competence in focus. */
  dim: boolean
  /** The tool the days answer to, for what a day shows that the brush cannot fill. */
  painting: boolean
  /** The columns of the line a stroke covers, and what it does to them. */
  strokeFrom: number
  strokeTo: number
  erasing: boolean
  /** The column of the line where blocks dragged from another day cannot go, or -1. */
  refusedCol: number
  /** Where the brush, a paste or blocks dragged from another day would put time on the line's days. */
  ghost: Map<ISODate, GhostBlock[]> | undefined
  actions: PersonActions
}

/** One person's days, folded: a label with their competences and the week's hours, and a small timeline per day. */
const PersonLine = memo(function PersonLine({ person, assignments, absence, week, cols, workday, competences, styles, isOk, isOpen, brush, dim, painting, strokeFrom, strokeTo, erasing, refusedCol, ghost, actions }: LineProps) {
  const span = workday.dayEnd - workday.dayStart
  return (
    <Line
      className={`bm-person ${dim ? 'dim' : ''}`}
      height={PERSON_H}
      label={
        <>
          <button className="row-action" aria-expanded={false} aria-label="Brett ut timer" title="Brett ut timer (E)" onClick={() => actions.unfold(person.id)}>
            <ChevronRight size={14} aria-hidden />
          </button>
          <span className="bm-person-name" title="Vis timer, overtid og fravær" onClick={() => actions.openPanel(person.id)}>
            <span className="bm-name">{person.name}</span>
            <span className="bm-dots">
              {competences.map((style) => (
                <i key={style.key} className={`${person.competences.includes(style.key) ? 'has' : ''} ${style.key === brush ? 'focused' : ''}`} style={competenceColor(style)} title={person.competences.includes(style.key) ? style.label : undefined} />
              ))}
            </span>
          </span>
          <WeekMeter week={week} />
        </>
      }
      cols={cols}
      cells={(date, col) => {
        const cell = dayCell(date, assignments?.get(date) ?? NO_ASSIGNMENTS, absence?.get(date) ?? NO_ABSENCE, isOk, workday, isOpen)
        const inStroke = col >= strokeFrom && col <= strokeTo
        const gaps = ghost?.get(date)
        // A day the brush cannot fill says so under the pointer, and inside a stroke.
        const blocked = painting && !gaps && (cell.offDay || cell.away !== null || dim)
        const refused = refusedCol === col || (painting && !gaps && inStroke && !erasing)
        return (
          <div
            key={date}
            className={`${dayClass(cols, date)} cell bm-cell ${cell.offDay ? 'off-day' : ''} ${cell.away === 'syk' ? 'sick' : cell.away ? 'away' : ''} ${blocked ? 'blocked' : ''} ${refused ? 'refused' : ''} ${inStroke && erasing ? 'erasing' : ''}`}
            style={{ width: cols.colW }}
            onMouseDown={actions.cellDown}
            onContextMenu={(e) => actions.cellMenu(person.id, date, e)}
            onDoubleClick={() => actions.unfold(person.id)}
          >
            <FoldedDay cell={cell} styles={styles} brush={brush} width={cols.colW} />
            {gaps && (
              <span className="bm-timeline bm-ghosts">
                {gaps.map((gap) => (
                  <i key={gap.start} style={{ left: `${(Math.max(0, gap.start - workday.dayStart) / span) * 100}%`, width: `${((Math.min(gap.end, workday.dayEnd) - Math.max(gap.start, workday.dayStart)) / span) * 100}%`, ...(gap.competence ? competenceColor(styles.get(gap.competence)) : undefined) }}>
                    +{hoursText(paidHours(gap, workday))}
                  </i>
                ))}
              </span>
            )}
          </div>
        )
      }}
    />
  )
})

/** The heading over the people, at the foot of the planning bar. */
export function PeopleHeading() {
  const { persons, brush, able, labelOf } = useBemanning()
  return (
    <div className="grid-row col-head bm-people-head" style={{ height: ROW_H }}>
      <div className="grid-label" style={{ width: LEFT_W }}>
        <span className="lbl-desc">Personell</span>
        <span className="bm-label-note">{brush ? `${able} med ${labelOf(brush)}` : `${persons.length} faste`}</span>
        <span className="bm-label-note bm-label-end">uke · normal/kap.</span>
      </div>
      <span className="phase-legend" style={{ left: LEFT_W }}>
        <span>Klikk et navn for detaljer · dobbeltklikk en dag for å brette ut timer (E) · høyreklikk en dag for fravær</span>
      </span>
    </div>
  )
}

/** The people, one line each, with what a stroke under way covers laid over them. */
export function PeopleRows({ onOpenPersonell }: { onOpenPersonell: () => void }) {
  const bm = useBemanning()
  const { ws, cols, listed, listedAble, staffed, styles, isOk, isOpen, brush, tool, stroke, selection, clip, refused, ghost, info, actions, bodyRef, dates, shift } = bm
  const gap = listedAble < listed.length && brush ? DIVIDER_H : 0
  const topOf = (row: number) => row * PERSON_H + (row >= listedAble ? gap : 0)
  // A stroke that moves a day's blocks has no outline: the blocks show where they would land.
  const range = stroke && stroke.mode !== 'move' ? strokeRange(stroke) : null
  const chosen = !stroke && selection ? strokeRange({ mode: 'select', half: false, ...selection }) : null
  const refusedCol = refused ? dates.indexOf(refused.date) : -1
  const shortcut = (key: string) => (/Mac|iPhone|iPad/.test(navigator.platform) ? `⌘${key}` : `Ctrl+${key}`)
  const box = (r: { rowFrom: number; rowTo: number; colFrom: number; colTo: number }) => ({ left: LEFT_W + r.colFrom * cols.colW, width: (r.colTo - r.colFrom + 1) * cols.colW, top: topOf(r.rowFrom), height: topOf(Math.min(r.rowTo, listed.length - 1)) + PERSON_H - topOf(r.rowFrom) })
  const pillStyle = brush ? competenceColor(styles.get(brush)) : undefined
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  return (
    <>
    <UnfoldedPerson />
    <div
      className="bm-people"
      ref={bodyRef}
      data-tool={tool}
      data-half={tool === 'paint' && (stroke ? stroke.half : shift) ? '' : undefined}
      style={pillStyle}
      onMouseMove={actions.bodyMove}
      onMouseLeave={actions.bodyLeave}
    >
      {listed.map(({ person, assignments, absence, week, dim }, row) => {
        const inStroke = range !== null && row >= range.rowFrom && row <= range.rowTo
        return (
          <div key={person.id}>
            {row === listedAble && gap > 0 && (
              <div className="bm-divider" style={{ height: DIVIDER_H }}>
                <span style={{ width: LEFT_W }}>
                  Uten {bm.labelOf(brush!)} · {listed.length - listedAble}
                </span>
              </div>
            )}
            <PersonLine
              person={person}
              assignments={assignments}
              absence={absence}
              week={week}
              cols={cols}
              workday={ws.settings.workday}
              competences={staffed}
              styles={styles}
              isOk={isOk}
              isOpen={isOpen}
              brush={brush}
              dim={dim}
              painting={tool === 'paint'}
              strokeFrom={inStroke ? range.colFrom : -1}
              strokeTo={inStroke ? range.colTo : -1}
              erasing={inStroke && stroke!.mode === 'erase'}
              refusedCol={refused?.personId === person.id ? refusedCol : -1}
              ghost={ghost.get(person.id)}
              actions={actions}
            />
          </div>
        )
      })}
      {range && (
        // One outline over all the days of the stroke, and what it will do on a pill above it.
        <div className={`bm-stroke ${stroke!.mode}`} style={box(range)}>
          {info && (
            <span className={`bm-pill ${topOf(range.rowFrom) < 34 ? 'below' : ''}`}>
              {info.mode === 'select' ? null : info.mode === 'erase' ? (
                <b>Tøm</b>
              ) : (
                <b>
                  <i className="swatch" /> {bm.labelOf(brush!)}
                </b>
              )}
              {info.mode === 'select' ? (
                <span>
                  {plural(info.days, 'dag', 'dager')} × {plural(info.people, 'rad', 'rader')}
                </span>
              ) : (
                <span>
                  {plural(info.days, 'dag', 'dager')} · {info.mode === 'paint' ? '+' : ''}
                  {hoursText(info.hours)} t{info.mode === 'paint' ? ` · ${info.people} pers.` : ''}
                </span>
              )}
              {info.half && <span>halv dag</span>}
              {info.skipped > 0 && <span>{info.skipped} hoppes over</span>}
            </span>
          )}
        </div>
      )}
      {chosen && (
        // The days that are selected: a tint with no outline, and what can be done with them.
        <div className="bm-selection" style={box(chosen)}>
          {(chosen.rowFrom !== chosen.rowTo || chosen.colFrom !== chosen.colTo || clip) && (
            <span className={`bm-pill ${topOf(chosen.rowFrom) < 34 ? 'below' : ''}`}>
              {clip ? (
                <span>Kopiert · {shortcut('V')} limer inn ved markøren</span>
              ) : (
                <>
                  <span>
                    {plural(chosen.colTo - chosen.colFrom + 1, 'dag', 'dager')} × {chosen.rowTo - chosen.rowFrom + 1} pers.
                  </span>
                  <span>{shortcut('C')} kopier</span>
                  <span>Esc fjern</span>
                </>
              )}
            </span>
          )}
        </div>
      )}
      {!bm.persons.length && (
        <div className="bm-empty">
          <strong>Ingen faste registrert.</strong> Legg inn de ansatte og kompetansene deres, så kan de tildeles arbeidet som er planlagt.
          <button onClick={onOpenPersonell}>Åpne Personell</button>
        </div>
      )}
    </div>
    </>
  )
}
