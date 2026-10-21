import { memo } from 'react'
import { ChevronRight } from 'lucide-react'
import { daysBetween, type ISODate } from '../../domain/dates'
import { paidHours } from '../../domain/staffing'
import type { Assignment, CompetenceStyle, Person, Unavailability, WorkdaySettings } from '../../domain/types'
import type { PersonWeek } from '../../domain/staffing'
import { competenceColor, count, modKey } from '../dom'
import { Line } from '../kalender/GridRows'
import { dayClass, type Columns } from '../kalender/gridTypes'
import { daysWide, LEFT_W, ROW_H } from '../kalender/layout'
import { useBemanning, type PersonActions, type StretchPlan } from './BemanningScope'
import { dayCell, runLabel, spanOf, type BlockNames, type Span } from './dayCell'
import { DAY_INSET, DIVIDER_H, joinedClass, joinedPlace, PERSON_H } from './layout'
import { PILL_ROOM, StrokeBox } from '../kalender/StrokeBox'
import { endShape, runLink, runOf, type BlocksOn, type EndShape, type Piece, type PiecesOn, type RunLink } from './runs'
import { FoldedDay, WeekMeter } from './FoldedDay'
import { strokeRange } from './tools'
import { UnfoldedPerson } from './UnfoldedPerson'
import { hoursText } from './week'

const NO_ASSIGNMENTS: Assignment[] = []
const NO_ABSENCE: Unavailability[] = []
const NO_PREVIEW: Piece[] = []

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
  /** The week's overtime is above the limit. */
  overLimit: boolean
  /** The setting «Navn på blokker». */
  names: BlockNames
  /** The name of a project, by its number: for what a block tagged with one says under the pointer. */
  projectName: (projectNo: string) => string
  /** The tool the days answer to, for what a day shows that the brush cannot fill. */
  painting: boolean
  /** The columns of the line a stroke covers, and what it does to them. */
  strokeFrom: number
  strokeTo: number
  erasing: boolean
  /** The block on the line that a pulled end of a run is cut back into: the day it is on, and where in the block the time that goes lies. */
  cut: (Span & { col: number; blockId: string }) | undefined
  /** The column of the line whose blocks are being dragged to another day, or -1. */
  movingCol: number
  /** The column of the line where blocks dragged from another day cannot go, or -1. */
  refusedCol: number
  /** Where the brush, a paste or blocks dragged from another day would put time on the line's days. */
  ghost: Map<ISODate, Piece[]> | undefined
  actions: PersonActions
}

/** One person's days, folded: a label with their competences and the week's hours, and a small timeline per day. */
const PersonLine = memo(function PersonLine({ person, assignments, absence, week, cols, workday, competences, styles, isOk, isOpen, brush, dim, overLimit, names, projectName, painting, strokeFrom, strokeTo, erasing, cut, movingCol, refusedCol, ghost, actions }: LineProps) {
  const day = { start: workday.dayStart, end: workday.dayEnd }
  const blocksOn: BlocksOn = (date) => assignments?.get(date)
  const previewsOn: PiecesOn = (date) => ghost?.get(date)
  // A run of days has one name, on the run: where it starts, or at the first day drawn when it started before it.
  const runs = cols.dates.flatMap((date, i) =>
    (assignments?.get(date) ?? NO_ASSIGNMENTS).flatMap((block) => {
      const link = runLink(blocksOn, date, block, workday)
      if (!link.next || (link.prev && i > 0)) return []
      const run = runOf(blocksOn, date, block, workday)
      const style = styles.get(run.competence)
      const from = cols.c0 + i - daysBetween(run.from, date) + run.startShare
      const length = run.days - 1 + run.endShare - run.startShare
      const text = runLabel(length * cols.colW - 2 * DAY_INSET, style?.label ?? run.competence, style?.shortLabel ?? '', names, run.days)
      if (!text) return []
      return [{ key: block.id, from, length, text: `${from < cols.first ? '‹ ' : ''}${text}`, style, other: brush !== null && brush !== run.competence }]
    }),
  )
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
          <WeekMeter week={week} overLimit={overLimit} />
        </>
      }
      cols={cols}
      cells={(date, col) => {
        const blocks = assignments?.get(date) ?? NO_ASSIGNMENTS
        const cell = dayCell(date, blocks, absence?.get(date) ?? NO_ABSENCE, isOk, workday, isOpen)
        const gaps = ghost?.get(date) ?? NO_PREVIEW
        // A block is joined to its run, which has the name; it is drawn joined to what a stroke would put beside it too, see `endShape`.
        const links = new Map<string, RunLink>()
        const shapes = new Map<string, EndShape>()
        for (const block of blocks) {
          const link = runLink(blocksOn, date, block, workday)
          if (link.prev || link.next) links.set(block.id, link)
          shapes.set(block.id, endShape(block, date, gaps, blocksOn, previewsOn, workday))
        }
        // What a stroke would put down is drawn as it will lie, joined in the same way.
        const previews = gaps.map((gap) => ({ gap, shape: endShape(gap, date, blocks, blocksOn, previewsOn, workday) }))
        const runOn = [...shapes.values(), ...previews.map((preview) => preview.shape)].some((shape) => shape.next)
        const inStroke = col >= strokeFrom && col <= strokeTo
        // A day the brush cannot fill says so under the pointer, and inside a stroke. A weekend or a holiday does not:
        // the brush fills it when it is picked by itself, and passes over it without a mark when it is drawn across.
        const unfilled = painting && !gaps.length && !cell.offDay
        const blocked = unfilled && (cell.away !== null || dim)
        const refused = refusedCol === col || (unfilled && inStroke && !erasing)
        return (
          <div
            key={date}
            className={`${dayClass(cols, date)} cell bm-cell ${cell.offDay ? 'off-day' : ''} ${runOn ? 'run-on' : ''} ${movingCol === col ? 'moving' : ''} ${blocked ? 'blocked' : ''} ${refused ? 'refused' : ''} ${inStroke && erasing && cut?.col !== col ? 'erasing' : ''}`}
            onMouseDown={actions.cellDown}
            onContextMenu={(e) => actions.cellMenu(person.id, date, e)}
            onDoubleClick={() => actions.unfold(person.id)}
          >
            <FoldedDay cell={cell} styles={styles} brush={brush} width={cols.colW} names={names} links={links} shapes={shapes} cut={cut?.col === col ? cut : undefined} projectName={projectName} />
            {previews.length > 0 && (
              <span className="bm-timeline bm-ghosts">
                {previews.map(({ gap, shape }) => (
                  <i key={gap.start} className={joinedClass(shape)} style={{ ...joinedPlace(spanOf(gap, day), shape), ...competenceColor(styles.get(gap.competence)) }}>
                    +{hoursText(paidHours(gap, workday))}
                  </i>
                ))}
              </span>
            )}
          </div>
        )
      }}
      overlay={runs.map((run) => (
        // As the name of an event in the hall calendar: it starts with its run and stays at the left edge of the days while the run is in view.
        <span key={run.key} className="bm-run" style={{ left: daysWide(run.from, LEFT_W + DAY_INSET), width: daysWide(run.length, -2 * DAY_INSET), ...competenceColor(run.style) }}>
          <span className={`bm-run-name ${run.other ? 'other' : ''}`} style={{ left: LEFT_W + DAY_INSET }}>
            {run.text}
          </span>
        </span>
      ))}
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
  const { ws, cols, listed, listedAble, staffed, styles, isOk, isOpen, brush, tool, stroke, stretch, paintReach, selection, clip, refused, ghost, info, actions, bodyRef, dates, shift } = bm
  const gap = listedAble < listed.length && brush ? DIVIDER_H : 0
  const topOf = (row: number) => row * PERSON_H + (row >= listedAble ? gap : 0)
  // A stroke that moves a day's blocks has no outline: the blocks show where they would land. A pulled end of a run has the pill of one over the days it changes, without the outline.
  // A brush stroke that stops where the demand is met covers the days it reaches, and none where nothing is lacking.
  const range =
    !stroke || stroke.mode === 'move' ? null : stroke.mode === 'stretch' ? stretch && { rowFrom: stretch.row, rowTo: stretch.row, colFrom: stretch.colFrom, colTo: stretch.colTo } : paintReach === null ? null : { ...strokeRange(stroke), ...paintReach }
  const erasing = stroke?.mode === 'erase' || (stroke?.mode === 'stretch' && stretch?.erase === true)
  const chosen = !stroke && selection ? strokeRange({ mode: 'select', half: false, ...selection }) : null
  const refusedCol = refused ? dates.indexOf(refused.date) : -1
  /** Of a block a pulled end is cut back into, where the time that goes lies in what is drawn of it: what the block has now and will not have. */
  const cutOf = (trim: NonNullable<StretchPlan['trim']>) => {
    const block = listed[stretch!.row].assignments?.get(trim.date)?.find((a) => a.id === trim.blockId)
    if (!block) return undefined
    const wd = ws.settings.workday
    const drawn = { start: Math.max(block.start, wd.dayStart), end: Math.min(block.end, wd.dayEnd) }
    const gone = trim.start > block.start ? { start: block.start, end: trim.start } : { start: trim.end, end: block.end }
    return { col: dates.indexOf(trim.date), blockId: trim.blockId, ...spanOf(gone, drawn) }
  }
  const box = (r: { rowFrom: number; rowTo: number; colFrom: number; colTo: number }) => ({ left: daysWide(r.colFrom, LEFT_W), width: daysWide(r.colTo - r.colFrom + 1), top: topOf(r.rowFrom), height: topOf(Math.min(r.rowTo, listed.length - 1)) + PERSON_H - topOf(r.rowFrom) })
  const pillStyle = brush ? competenceColor(styles.get(brush)) : undefined
  const pillBelow = (r: { rowFrom: number }) => topOf(r.rowFrom) < PILL_ROOM
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
              overLimit={bm.overLimit.has(person.id)}
              names={bm.blockNames}
              projectName={bm.projectName}
              painting={tool === 'paint'}
              strokeFrom={inStroke ? range.colFrom : -1}
              strokeTo={inStroke ? range.colTo : -1}
              erasing={inStroke && erasing}
              cut={inStroke && stretch?.trim ? cutOf(stretch.trim) : undefined}
              movingCol={stroke?.mode === 'move' && stroke.row0 === row && (stroke.row1 !== row || stroke.col1 !== stroke.col0) ? stroke.col0 : -1}
              refusedCol={refused?.personId === person.id ? refusedCol : -1}
              ghost={ghost.get(person.id)}
              actions={actions}
            />
          </div>
        )
      })}
      {range && (
        // One outline over all the days of the stroke, and what it will do on a pill above it.
        <StrokeBox kind={stroke!.mode === 'stretch' ? `bare ${erasing ? 'erase' : 'paint'}` : stroke!.mode} style={stretch && !erasing ? { ...box(range), ...competenceColor(styles.get(stretch.competence)) } : box(range)} below={pillBelow(range)}>
          {info && (
            <>
              {info.mode === 'select' ? null : info.mode === 'erase' ? (
                <b>Tøm</b>
              ) : (
                <b>
                  <i className="swatch" /> {bm.labelOf(info.competence ?? brush!)}
                </b>
              )}
              {info.mode === 'select' ? (
                <span>
                  {count(info.days, 'dag', 'dager')} × {count(info.people, 'rad', 'rader')}
                </span>
              ) : (
                <span>
                  {count(info.days, 'dag', 'dager')} · {info.mode === 'paint' ? '+' : ''}
                  {hoursText(info.hours)} t{info.mode === 'paint' ? ` · ${info.people} pers.` : ''}
                </span>
              )}
              {info.half && <span>halv dag</span>}
              {info.toDemand && <span>til behovet er dekket</span>}
              {info.skipped > 0 && <span>{info.skipped} hoppes over</span>}
            </>
          )}
        </StrokeBox>
      )}
      {chosen && (
        // The days that are selected, one or many: a tint with no outline, and what can be done with them.
        <StrokeBox kind="bare chosen" style={box(chosen)} below={pillBelow(chosen)}>
          {clip ? (
            <span>Kopiert · {modKey('V')} limer inn ved markøren</span>
          ) : (
            <>
              <span>
                {count(chosen.colTo - chosen.colFrom + 1, 'dag', 'dager')} × {chosen.rowTo - chosen.rowFrom + 1} pers.
              </span>
              <span>{modKey('C')} kopier</span>
              <span>Esc fjern</span>
            </>
          )}
        </StrokeBox>
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
