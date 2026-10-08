import { useEffect, useRef } from 'react'
import { ChevronDown, ChevronsDownUp, ChevronUp } from 'lucide-react'
import { isoWeek } from '../../domain/dates'
import { moveAssignment, moveTarget, paidHours, personWeek } from '../../domain/staffing'
import { competenceColor } from '../dom'
import { Line } from '../kalender/GridRows'
import { dayClass } from '../kalender/gridTypes'
import { useBemanning, type PersonLine } from './BemanningScope'
import { HOUR_PX, unfoldedHeight } from './layout'
import { TimeTrack } from './TimeTrack'
import { clock, EPSILON, hoursText } from './week'

/**
 * The person whose hours are open: one tall line above the others, with every day as a track of time
 * where blocks are drawn, moved, resized and dragged to another day. One person at a time.
 */
export function UnfoldedPerson() {
  const bm = useBemanning()
  const line = bm.lines.find(({ person }) => person.id === bm.unfolded)
  if (!line) return null
  return <Unfolded key={line.person.id} line={line} />
}

function Unfolded({ line: { person, assignments, week } }: { line: PersonLine }) {
  const bm = useBemanning()
  const { ws, cols, dates, styles, staffed, keyOf, brush, tool, isOk, cross, setCross, selectedBlock, setSelectedBlock, updateStaffing, actions } = bm
  const wd = ws.settings.workday
  const hours = (wd.overtimeLatest - wd.overtimeEarliest) / 60
  const rowRef = useRef<HTMLDivElement>(null)

  // The open hours come into view, as far up as right under what stays pinned above the people.
  useEffect(() => {
    const row = rowRef.current
    const scroll = row?.closest<HTMLElement>('.grid-scroll')
    const head = scroll?.querySelector('.grid-head')
    const top = scroll?.querySelector('.grid-top.pinned')
    const tools = scroll?.querySelector<HTMLElement>('.grid-tools')
    if (!row || !scroll || !head || !tools) return
    const pinned = (top ?? head).getBoundingClientRect().bottom + tools.offsetHeight
    const above = row.getBoundingClientRect().top - pinned
    const under = row.getBoundingClientRect().bottom - scroll.getBoundingClientRect().bottom
    if (above < 0) scroll.scrollTop += above
    else if (under > 0) scroll.scrollTop += Math.min(under, above)
  }, [])

  const period = personWeek(ws, person.id, dates)
  // The person's hours per competence in the period; a block that does not count (a sick day) is left out.
  const worked = new Map<string, number>()
  for (const blocks of assignments?.values() ?? []) for (const a of blocks) if (isOk(a)) worked.set(a.competence, (worked.get(a.competence) ?? 0) + paidHours(a, wd))
  const own = staffed.filter((style) => person.competences.includes(style.key))
  const axis = [...new Set([wd.overtimeEarliest + 60, ...Array.from({ length: hours }, (_, i) => wd.overtimeEarliest + i * 60).filter((m) => m > wd.overtimeEarliest && (m === wd.dayStart || m === wd.dayEnd || (m - wd.dayStart) % 120 === 0))])].filter((m) => m < wd.overtimeLatest)

  const endCross = () => {
    const move = bm.takeCross()
    if (!move) return
    const target = moveTarget(ws, move.id, move.date, move.start)
    if (target === 'overlap') bm.toast(`${person.name} har annet arbeid på den tiden ${bm.dayName(move.date)}.`)
    else if (target === 'away') bm.toast(`${person.name} er borte ${bm.dayName(move.date)}.`)
    else updateStaffing((w) => ({ ...w, assignments: moveAssignment(w, move.id, move.date, move.start) }))
  }

  return (
    <div className="bm-unfolded" ref={rowRef} data-tool={tool} style={{ '--bm-track-h': `${hours * HOUR_PX}px` } as React.CSSProperties}>
      <Line
        className="bm-unfolded-row"
        height={unfoldedHeight(wd)}
        label={
          <div className="bm-unfolded-label">
            <div className="bm-unfolded-info">
              <div className="bm-unfolded-head">
                <button className="bm-unfolded-name" title="Brett sammen (E)" onClick={() => bm.setUnfolded(null)}>
                  <ChevronsDownUp size={14} aria-hidden />
                  <span className="bm-name">{person.name}</span>
                </button>
                <button className="row-action" aria-label="Forrige person" title="Forrige person (↑)" onClick={() => bm.stepUnfolded(-1)}>
                  <ChevronUp size={14} aria-hidden />
                </button>
                <button className="row-action" aria-label="Neste person" title="Neste person (↓)" onClick={() => bm.stepUnfolded(1)}>
                  <ChevronDown size={14} aria-hidden />
                </button>
              </div>
              <div className="stats">
                <div>
                  <span>Uke {bm.week.length ? isoWeek(bm.week[0]) : ''}</span>
                  <b>
                    {hoursText(week.normal)} <em>/ {hoursText(week.capacity)}</em>
                  </b>
                </div>
                <div className={week.overtime > EPSILON ? 'over' : ''}>
                  <span>Overtid uka</span>
                  <b>{hoursText(week.overtime)}</b>
                </div>
                <div>
                  <span>Perioden</span>
                  <b>
                    {hoursText(period.normal)}
                    {period.overtime > EPSILON && <em className="over"> +{hoursText(period.overtime)}</em>}
                  </b>
                </div>
              </div>
              <div className="bm-unfolded-list">
                {own.map((style) => (
                  <button key={style.key} className={style.key === brush ? 'on' : ''} aria-pressed={style.key === brush} style={competenceColor(style)} title={`Tegn med ${style.label}`} onClick={() => (style.key === brush ? bm.clearBrush() : bm.pickBrush(style.key))}>
                    <i className="swatch" />
                    <span className="bm-name">{style.label}</span>
                    {keyOf.has(style.key) && <kbd>{keyOf.get(style.key)}</kbd>}
                    <span className={`bm-unfolded-hours ${worked.has(style.key) ? '' : 'nil'}`}>{worked.has(style.key) ? `${hoursText(worked.get(style.key)!)} t` : '–'}</span>
                  </button>
                ))}
              </div>
              <p className="bm-unfolded-hint">{brush && person.competences.includes(brush) ? `Dra i en dag for å legge til ${bm.labelOf(brush)}. ` : 'Velg en kompetanse for å tegne i en dag. '}Dra en blokk for å flytte, kantene for å endre.</p>
            </div>
            <div className="bm-axis">
              {axis.map((minute) => (
                <span key={minute} className={minute === wd.dayStart || minute === wd.dayEnd ? 'day-edge' : ''} style={{ top: `${((minute - wd.overtimeEarliest) / (wd.overtimeLatest - wd.overtimeEarliest)) * 100}%` }}>
                  {clock(minute).slice(0, 2)}
                </span>
              ))}
            </div>
          </div>
        }
        cols={cols}
        cells={(date) => (
          <div key={date} className={`${dayClass(cols, date)} cell bm-cell bm-editor-cell`} style={{ width: cols.colW }} onContextMenu={(e) => actions.cellMenu(person.id, date, e)}>
            <TimeTrack
              ws={ws}
              person={person}
              date={date}
              colW={cols.colW}
              styles={styles}
              brush={brush}
              tool={tool}
              onChange={(change) => updateStaffing((w) => ({ ...w, assignments: change(w) }))}
              onTouch={(touched) => tool === 'select' && bm.onFocusDate(touched)}
              dateAt={bm.dateAtX}
              cross={cross}
              onCross={setCross}
              onCrossEnd={endCross}
              selectedId={selectedBlock}
              onSelect={setSelectedBlock}
            />
          </div>
        )}
      />
    </div>
  )
}
