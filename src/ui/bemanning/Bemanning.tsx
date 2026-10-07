import { useMemo } from 'react'
import { competenceStyles, staffedCompetences } from '../../domain/competences'
import { addDays, type ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { buildBalance, freeCapacity, okAssignments, personWeek, weekTotals } from '../../domain/staffing'
import type { Assignment, Unavailability } from '../../domain/types'
import { usePref } from '../../store/prefs'
import { useWorkspace } from '../../store/workspaceStore'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { dayCell } from './dayCell'
import { DemandStrip } from './DemandStrip'
import { PersonRow } from './PersonRow'
import { hoursText, todayIso, weekDates, weekLabel, weekRange } from './week'

const EPSILON = 0.05
/** The highest number a competence can be picked with on the keyboard. */
const LAST_KEY = 9
/** Under this window height the demand strip starts folded, to leave room for the people. */
const FOLD_STRIP_UNDER = 640

const NO_ASSIGNMENTS: Assignment[] = []
const NO_ABSENCE: Unavailability[] = []

/**
 * Who does the work the Kalender has planned: the permanent staff by name, one week at a time,
 * against the hours that remain per competence and day.
 */
export function Bemanning({ onOpenPersonell }: { onOpenPersonell: () => void }) {
  const { workspace } = useWorkspace()
  const ws = workspace!
  // The day in focus is shared with the Kalender, so both open on the same week.
  const [focus, setFocus] = usePref<{ date: ISODate } | null>('planningFocus', null)
  const [folded, setFolded] = usePref('bemanningStripFolded', window.innerHeight < FOLD_STRIP_UNDER)
  const focusDate = focus?.date ?? todayIso()
  const monday = weekDates(focusDate)[0]
  const dates = useMemo(() => weekDates(monday), [monday])

  const persons = useMemo(() => (ws.persons ?? []).filter((p) => p.active), [ws.persons])
  const balance = useMemo(() => buildBalance(ws, dates), [ws, dates])
  const totals = useMemo(() => weekTotals(ws, dates), [ws, dates])
  const staffed = useMemo(() => staffedCompetences(ws), [ws])
  const styles = useMemo(() => new Map(competenceStyles(ws).map((style) => [style.key, style])), [ws])
  // The strip shows the competences people have, and any other with demand or assigned hours this week.
  const stripRows = useMemo(() => {
    const keys = new Map(staffed.slice(0, LAST_KEY).map((style, index) => [style.key, index + 1]))
    const inWeek = new Set(balance.competences)
    const held = new Set(staffed.map((style) => style.key))
    return [...styles.values()].filter((style) => held.has(style.key) || inWeek.has(style.key)).map((style) => ({ style, key: keys.get(style.key) ?? 0 }))
  }, [staffed, styles, balance])
  const capacity = useMemo(() => dates.map((date) => freeCapacity(ws, date)), [ws, dates])
  const uncoverable = useMemo(() => {
    const hours = new Map<string, number>()
    for (const { style } of stripRows) {
      for (const date of dates) {
        const remaining = balance.get(style.key, date).remaining
        if (remaining > EPSILON && dayType(date) === 'arbeidsdag') hours.set(`${style.key}|${date}`, Math.max(0, remaining - freeCapacity(ws, date, style.key).hours))
      }
    }
    return hours
  }, [ws, balance, stripRows, dates])

  const rows = useMemo(() => {
    const ok = new Set(okAssignments(ws))
    const isOk = (a: Assignment) => ok.has(a)
    const byDay = <T extends { personId: string; date: ISODate }>(list: T[]) => {
      const map = new Map<string, T[]>()
      for (const item of list) map.set(`${item.personId}|${item.date}`, [...(map.get(`${item.personId}|${item.date}`) ?? []), item])
      return map
    }
    const assignments = byDay(ws.assignments ?? [])
    const absence = byDay(ws.unavailability ?? [])
    return persons.map((person) => ({
      person,
      week: personWeek(ws, person.id, dates),
      cells: dates.map((date) => dayCell(date, assignments.get(`${person.id}|${date}`) ?? NO_ASSIGNMENTS, absence.get(`${person.id}|${date}`) ?? NO_ABSENCE, isOk, ws.settings.workday)),
    }))
  }, [ws, persons, dates])

  const meta = [
    `${persons.length} faste`,
    totals.coveredShare !== null ? `${Math.round(totals.coveredShare * 100)} % dekket` : '',
    totals.remaining > EPSILON ? `${hoursText(totals.remaining)} t gjenstår` : '',
    totals.overtime > EPSILON ? `${hoursText(totals.overtime)} t overtid` : '',
    totals.weekendOpen > EPSILON ? `helg ${hoursText(totals.weekendOpen)} t åpent` : '',
  ].filter(Boolean)
  const crewDiffers = persons.length > 0 && persons.length !== ws.settings.baseCrew

  return (
    <div className="bemanning">
      <div className="page-head">
        <h2>Bemanning</h2>
        <span className="page-meta">
          {meta.join(' · ')}
          {crewDiffers && <span className="bm-crew-hint" title="Antallet faste i Kalender settes under Innstillinger → Bemanning og normaltid."> · Kalender regner med {ws.settings.baseCrew} faste</span>}
        </span>
        <span className="bm-week-picker">
          <button className="ghost icon-button" aria-label="Forrige uke" title="Forrige uke" onClick={() => setFocus({ date: addDays(focusDate, -7) })}>
            <ChevronLeft size={16} aria-hidden />
          </button>
          <b>
            {weekLabel(dates)} <span>{weekRange(dates)}</span>
          </b>
          <button className="ghost icon-button" aria-label="Neste uke" title="Neste uke" onClick={() => setFocus({ date: addDays(focusDate, 7) })}>
            <ChevronRight size={16} aria-hidden />
          </button>
          <button className="ghost" onClick={() => setFocus({ date: todayIso() })}>
            I dag
          </button>
        </span>
      </div>

      <div className="bm-scroll">
        <div className="bm-grid">
          <DemandStrip dates={dates} competences={stripRows} balance={balance} uncoverable={uncoverable} capacity={capacity} focusDate={focusDate} onFocusDate={(date) => setFocus({ date })} folded={folded} onToggleFolded={() => setFolded(!folded)} />
          <div className="bm-row bm-section">
            <div className="bm-label">
              <span className="bm-eyebrow">Personell</span>
              <span className="bm-label-note">{persons.length} faste</span>
              <span className="bm-label-note bm-label-end">uke · t</span>
            </div>
            <span />
          </div>
          {rows.map(({ person, week, cells }) => (
            <PersonRow key={person.id} person={person} dates={dates} cells={cells} week={week} competences={staffed} styles={styles} focusDate={focusDate} />
          ))}
          {!persons.length && (
            <div className="bm-empty">
              <strong>Ingen faste registrert.</strong> Legg inn de ansatte og kompetansene deres, så kan de tildeles arbeidet som er planlagt i Kalender.
              <button onClick={onOpenPersonell}>Åpne Personell</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
