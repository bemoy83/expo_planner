import { useEffect, useMemo, useRef, useState } from 'react'
import { competenceStyles, staffedCompetences } from '../../domain/competences'
import { addDays, MONTHS_NB, type ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { assignmentStatus, openUnresolved, buildBalance, carry, clearDays, clearSick, freeCapacity, isSick, markSick, removeCarried, okAssignments, paidHours, paintBlock, paintConflicts, paintDays, personWeek, weekTotals, type DayCell as Day, type PaintOptions } from '../../domain/staffing'
import type { Assignment, Unavailability, Workspace } from '../../domain/types'
import { usePref, usePrefSet } from '../../store/prefs'
import { useWorkspace } from '../../store/workspaceStore'
import { useStableActions } from '../kalender/useStableActions'
import { Toasts, useToasts } from '../Toasts'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { BemanningTools, type ExpandMode } from './BemanningTools'
import { ABSENCE_LABELS, dayCell } from './dayCell'
import { DemandStrip } from './DemandStrip'
import { TimelineRow, WeekEditor, type EditorActions } from './PersonEditor'
import { PersonRow, type RowActions } from './PersonRow'
import { AbsenceDialog } from './AbsenceDialog'
import { DayMenu, DemandPopover, PaintAsk } from './Popovers'
import { strokeRange, TOOL_KEYS, type Stroke, type Tool } from './tools'
import { hoursText, todayIso, weekDates, weekLabel, weekRange, WEEKDAYS_LONG } from './week'

const EPSILON = 0.05
/** The highest number a competence can be picked with on the keyboard. */
const LAST_KEY = 9
/** Under this window height the demand strip starts folded, to leave room for the people. */
const FOLD_STRIP_UNDER = 640

const NO_ASSIGNMENTS: Assignment[] = []
const NO_ABSENCE: Unavailability[] = []
const NO_PREVIEW = new Map<ISODate, number>()

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

/** The assigned hours of one competence per date. */
const hoursByDate = (assignments: Assignment[], competence: string, ws: Workspace) => {
  const hours = new Map<ISODate, number>()
  for (const a of assignments) if (a.competence === competence) hours.set(a.date, (hours.get(a.date) ?? 0) + paidHours(a, ws.settings.workday))
  return hours
}

/**
 * Who does the work the Kalender has planned: the permanent staff by name, one week at a time,
 * against the hours that remain per competence and day.
 */
export function Bemanning({ onOpenPersonell }: { onOpenPersonell: () => void }) {
  const { workspace, updateStaffing, undo } = useWorkspace()
  const ws = workspace!
  // The day in focus is shared with the Kalender, so both open on the same week.
  const [focus, setFocus] = usePref<{ date: ISODate } | null>('planningFocus', null)
  const [folded, setFolded] = usePref('bemanningStripFolded', window.innerHeight < FOLD_STRIP_UNDER)
  const [tool, setTool] = useState<Tool>('select')
  /** The competence in focus, which is also what the brush paints. */
  const [brush, setBrush] = useState<string | null>(null)
  const [selected, setSelected] = useState<Day | null>(null)
  const [stroke, setStroke] = useState<Stroke | null>(null)
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null)
  const [shift, setShift] = useState(false)
  const [ask, setAsk] = useState<{ cells: Day[]; competence: string; count: number; x: number; y: number } | null>(null)
  const [menu, setMenu] = useState<{ cell: Day; x: number; y: number } | null>(null)
  const [demandPop, setDemandPop] = useState<{ competence: string; date: ISODate; x: number; y: number } | null>(null)
  const [absenceFor, setAbsenceFor] = useState<Day | null>(null)
  // A person opens for editing hours as the week editor, one at a time and pinned at the top, or as a row timeline, several at once.
  const [expand, setExpand] = usePref<ExpandMode>('bemanningExpand', 'week')
  const [openWeek, setOpenWeek] = useState<string | null>(null)
  const [openRows, setOpenRows] = usePrefSet('bemanningOpenRows')
  const { toasts, show: toast, dismiss: dismissToast } = useToasts()
  const scrollRef = useRef<HTMLDivElement>(null)

  const focusDate = focus?.date ?? todayIso()
  const monday = weekDates(focusDate)[0]
  const dates = useMemo(() => weekDates(monday), [monday])

  const persons = useMemo(() => (ws.persons ?? []).filter((p) => p.active), [ws.persons])
  const balance = useMemo(() => buildBalance(ws, dates), [ws, dates])
  const totals = useMemo(() => weekTotals(ws, dates), [ws, dates])
  const staffed = useMemo(() => staffedCompetences(ws), [ws])
  const styles = useMemo(() => new Map(competenceStyles(ws).map((style) => [style.key, style])), [ws])
  // A brush whose competence nobody has any more is no brush.
  const activeBrush = brush && staffed.some((style) => style.key === brush) ? brush : null
  const activeTool: Tool = tool === 'paint' && !activeBrush ? 'select' : tool
  // The strip shows the competences people have, and any other with demand or assigned hours this week.
  const stripRows = useMemo(() => {
    const keys = new Map(staffed.slice(0, LAST_KEY).map((style, index) => [style.key, index + 1]))
    const held = new Set(staffed.map((style) => style.key))
    const inWeek = new Set(balance.competences)
    return [...styles.values()].filter((style) => held.has(style.key) || inWeek.has(style.key)).map((style) => ({ style, key: keys.get(style.key) ?? 0 }))
  }, [staffed, styles, balance])
  const capacity = useMemo(() => dates.map((date) => freeCapacity(ws, date, activeBrush ?? undefined)), [ws, dates, activeBrush])
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

  // Blocks that do not count and still leave a gap. One whose day is covered by others is no longer something to solve.
  const openIds = useMemo(() => new Set(openUnresolved(ws).map((a) => a.id)), [ws])
  const allRows = useMemo(() => {
    const ok = new Set(okAssignments(ws))
    const isOk = (a: Assignment) => ok.has(a)
    const isOpen = (a: Assignment) => openIds.has(a.id)
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
      cells: dates.map((date) => dayCell(date, assignments.get(`${person.id}|${date}`) ?? NO_ASSIGNMENTS, absence.get(`${person.id}|${date}`) ?? NO_ABSENCE, isOk, ws.settings.workday, isOpen)),
    }))
  }, [ws, persons, dates, openIds])
  // With a competence in focus, only the people who have it are shown.
  const rows = useMemo(() => (activeBrush ? allRows.filter(({ person }) => person.competences.includes(activeBrush)) : allRows), [allRows, activeBrush])
  const blocked = useMemo(
    () => (activeTool === 'paint' && activeBrush ? rows.map(({ person }) => dates.map((date) => (paintBlock(ws, { personId: person.id, date }, activeBrush) ? 'x' : '-')).join('')) : null),
    [ws, rows, dates, activeTool, activeBrush],
  )

  const isOpen = (personId: string) => (expand === 'week' ? openWeek === personId : openRows.has(personId))
  const toggleOpen = (personId: string) => {
    if (expand === 'week') {
      setOpenWeek(openWeek === personId ? null : personId)
      if (openWeek !== personId) scrollRef.current?.scrollTo({ top: 0 })
    } else {
      setOpenRows((open) => {
        const next = new Set(open)
        if (!next.delete(personId)) next.add(personId)
        return next
      })
    }
  }
  const foldAll = () => {
    setOpenWeek(null)
    setOpenRows(new Set())
  }
  /** Moves the week editor to the person before or after in the list. */
  const stepOpen = (delta: number) => {
    const at = rows.findIndex(({ person }) => person.id === openWeek)
    const next = rows[Math.min(Math.max(at + delta, 0), rows.length - 1)]
    if (next) setOpenWeek(next.person.id)
  }

  const dayAt = (row: number, col: number): Day => ({ personId: rows[row].person.id, date: dates[col] })
  const strokeCells = (s: Stroke): Day[] => {
    const { rowFrom, rowTo, colFrom, colTo } = strokeRange(s)
    const cells: Day[] = []
    for (let row = rowFrom; row <= rowTo && row < rows.length; row++) for (let col = colFrom; col <= colTo; col++) cells.push(dayAt(row, col))
    return cells
  }

  // What the stroke, or the day under the pointer, would add for the brush: shown in the strip before the click.
  const preview = useMemo(() => {
    if (activeTool !== 'paint' || !activeBrush || ask) return NO_PREVIEW
    const cells = stroke ? (stroke.mode === 'paint' ? strokeCells(stroke) : []) : hover && hover.row < rows.length ? [dayAt(hover.row, hover.col)] : []
    if (!cells.length) return NO_PREVIEW
    const half = stroke ? stroke.half : shift
    const after = paintDays(ws, cells, activeBrush, { span: half ? 'half' : 'full', mode: 'fill' }, () => 'preview')
    if (after === ws.assignments) return NO_PREVIEW
    const before = hoursByDate(ws.assignments ?? [], activeBrush, ws)
    const added = new Map<ISODate, number>()
    for (const [date, hours] of hoursByDate(after, activeBrush, ws)) if (hours - (before.get(date) ?? 0) > EPSILON) added.set(date, hours - (before.get(date) ?? 0))
    return added
    // `strokeCells` and `dayAt` read `rows` and `dates`.
  }, [ws, rows, dates, activeTool, activeBrush, stroke, hover, shift, ask]) // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = (personId: string) => persons.find((p) => p.id === personId)?.name ?? ''
  const labelOf = (competence: string) => styles.get(competence)?.label ?? competence
  const dayName = (date: ISODate) => WEEKDAYS_LONG[dates.indexOf(date)] ?? date

  /** Why a day cannot be painted, for the one day a click hit. */
  const blockText = (cell: Day, competence: string): string => {
    if (paintBlock(ws, cell, competence) === 'ineligible') return `${nameOf(cell.personId)} har ikke ${labelOf(competence)}.`
    const kind = dayType(cell.date)
    const away = (ws.unavailability ?? []).find((u) => u.personId === cell.personId && u.date === cell.date)
    const why = kind !== 'arbeidsdag' ? `${kind}. Overtid legges inn i ukevisningen` : away ? ABSENCE_LABELS[away.kind].toLowerCase() : ''
    return `${nameOf(cell.personId)} er ikke tilgjengelig ${dayName(cell.date)}${why ? ` (${why})` : ''}.`
  }

  const applyPaint = (cells: Day[], competence: string, opts: PaintOptions) => updateStaffing((w) => ({ ...w, assignments: paintDays(w, cells, competence, opts) }))

  /** Paints the days, after asking when a full-day paint meets other work. */
  const paint = (cells: Day[], competence: string, half: boolean, x: number, y: number) => {
    if (cells.every((cell) => paintBlock(ws, cell, competence))) {
      toast(cells.length === 1 ? blockText(cells[0], competence) : `Ingen av dagene kan males med ${labelOf(competence)}.`)
      return
    }
    const conflicts = half ? [] : paintConflicts(ws, cells, competence)
    if (conflicts.length) setAsk({ cells, competence, count: conflicts.length, x, y })
    else applyPaint(cells, competence, { span: half ? 'half' : 'full', mode: 'fill' })
  }

  /** The workdays of the week from a day on, for «ut uka». */
  const restOfWeek = (date: ISODate) => dates.filter((d) => d >= date && dayType(d) === 'arbeidsdag')

  const reportSick = (cell: Day, rest: boolean) => {
    const days = (rest ? restOfWeek(cell.date) : [cell.date]).filter((date) => !isSick(ws.unavailability ?? [], cell.personId, date))
    const after = markSick(ws.unavailability ?? [], cell.personId, days)
    if (after === ws.unavailability) return
    const sickDays = days.filter((date) => isSick(after, cell.personId, date))
    const hit = (ws.assignments ?? []).filter((a) => a.personId === cell.personId && sickDays.includes(a.date) && assignmentStatus(a, ws) === 'ok')
    const hours = hit.reduce((sum, a) => sum + paidHours(a, ws.settings.workday), 0)
    updateStaffing((w) => ({ ...w, unavailability: markSick(w.unavailability ?? [], cell.personId, days) }))
    const span = sickDays.length > 1 ? `${dayName(sickDays[0])}–${dayName(sickDays[sickDays.length - 1])}` : dayName(sickDays[0])
    const blocks = hit.length ? ` ${hit.length === 1 ? '1 blokk' : `${hit.length} blokker`} (${hoursText(hours)} t) er tilbake i behovet og merket uløst.` : ''
    toast(`${nameOf(cell.personId)} meldt syk ${span}.${blocks}`, { label: 'Angre', run: undo })
  }
  const reportWell = (cell: Day, rest: boolean) => updateStaffing((w) => ({ ...w, unavailability: clearSick(w.unavailability ?? [], cell.personId, rest ? restOfWeek(cell.date) : [cell.date]) }))

  const unresolved = useMemo(() => {
    const inWeek = new Set(dates)
    return (ws.assignments ?? []).filter((a) => inWeek.has(a.date) && openIds.has(a.id))
  }, [ws, dates, openIds])
  const removeUnresolved = () => {
    const gone = new Set(unresolved.map((a) => a.id))
    updateStaffing((w) => ({ ...w, assignments: (w.assignments ?? []).filter((a) => !gone.has(a.id)) }))
  }

  const clear = (cells: Day[]) => updateStaffing((w) => ({ ...w, assignments: clearDays(w.assignments ?? [], cells) }))

  const finishStroke = (s: Stroke, x: number, y: number) => {
    setStroke(null)
    const cells = strokeCells(s)
    if (s.mode === 'erase') clear(cells)
    else if (activeBrush) paint(cells, activeBrush, s.half, x, y)
  }

  const actions = useStableActions<RowActions>({
    cellDown: (row, col, event) => {
      if (event.button !== 0) return
      const mode = event.altKey || activeTool === 'erase' ? 'erase' : activeTool === 'paint' ? 'paint' : null
      if (!mode) {
        setSelected(dayAt(row, col))
        setFocus({ date: dates[col] })
        return
      }
      event.preventDefault()
      setSelected(null)
      setStroke({ mode, half: mode === 'paint' && event.shiftKey, row0: row, col0: col, row1: row, col1: col })
    },
    cellEnter: (row, col) => {
      setHover({ row, col })
      setStroke((s) => (s && (s.row1 !== row || s.col1 !== col) ? { ...s, row1: row, col1: col } : s))
    },
    cellMenu: (row, col, event) => {
      event.preventDefault()
      setStroke(null)
      setSelected(dayAt(row, col))
      setMenu({ cell: dayAt(row, col), x: event.clientX, y: event.clientY })
    },
    open: toggleOpen,
  })
  const editorActions = useStableActions<EditorActions>({
    change: (change) => updateStaffing((w) => ({ ...w, assignments: change(w) })),
    // A pick from an open person keeps the person open.
    pickBrush: (competence) => (competence === activeBrush ? clearBrush() : pickBrush(competence)),
    fold: toggleOpen,
    step: stepOpen,
    focusDate: (date) => setFocus({ date }),
    dayMenu: (personId, date, event) => {
      event.preventDefault()
      setMenu({ cell: { personId, date }, x: event.clientX, y: event.clientY })
    },
    enter: () => setHover(null),
  })

  // A stroke ends where the button is let go, also outside the grid.
  const strokeEnd = useStableActions({ finish: (x: number, y: number) => stroke && finishStroke(stroke, x, y) })
  const stroking = stroke !== null
  useEffect(() => {
    if (!stroking) return
    const onUp = (e: MouseEvent) => strokeEnd.finish(e.clientX, e.clientY)
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [stroking, strokeEnd])

  /** The competence the brush starts with: the one people have with the most hours left on the day in focus. */
  const defaultBrush = () => {
    let best = staffed[0]?.key ?? null
    for (const style of staffed) if (best && balance.get(style.key, focusDate).remaining > balance.get(best, focusDate).remaining) best = style.key
    return best
  }

  const pickTool = (next: Tool) => {
    if (next === 'paint' && !activeBrush) {
      const competence = defaultBrush()
      if (!competence) return toast('Ingen av de faste har en kompetanse ennå. Legg dem inn på Personell.')
      setBrush(competence)
    }
    setTool(next)
  }
  const pickBrush = (competence: string) => {
    setBrush(competence)
    setTool('paint')
    setSelected(null)
  }
  const clearBrush = () => {
    setBrush(null)
    setTool('select')
  }
  /** A pick in the demand strip is a step back to the whole week: open people fold, and the list goes to the top. */
  const pickFromStrip = (competence: string) => {
    if (competence === activeBrush) return clearBrush()
    pickBrush(competence)
    foldAll()
    scrollRef.current?.scrollTo({ top: 0 })
  }

  const keys = useStableActions({
    down: (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShift(true)
      if (isTyping(e.target) || e.metaKey || e.ctrlKey) return
      const key = e.key.toLowerCase()
      if (key === 'escape') {
        // A menu or a question that is open takes the key first, and closes itself.
        if (ask || menu || demandPop || absenceFor) return
        if (stroke) setStroke(null)
        else if (activeBrush || tool !== 'select') clearBrush()
        else setSelected(null)
      } else if (TOOL_KEYS[key] && !e.altKey) pickTool(TOOL_KEYS[key])
      else if (/^[1-9]$/.test(key) && staffed[Number(key) - 1]) pickBrush(staffed[Number(key) - 1].key)
      else if (key === 'e' && !e.altKey) {
        const personId = selected?.personId ?? (expand === 'week' ? openWeek : null)
        if (personId) toggleOpen(personId)
      } else if ((key === 'arrowup' || key === 'arrowdown') && expand === 'week' && openWeek) {
        e.preventDefault()
        stepOpen(key === 'arrowup' ? -1 : 1)
      } else if ((key === 'delete' || key === 'backspace') && selected) {
        e.preventDefault()
        clear([selected])
      }
    },
    up: (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShift(false)
    },
  })
  useEffect(() => {
    const lost = () => setShift(false)
    // In the capture phase, so Escape is seen while a menu that closes on it is still open.
    window.addEventListener('keydown', keys.down, true)
    window.addEventListener('keyup', keys.up)
    window.addEventListener('blur', lost)
    return () => {
      window.removeEventListener('keydown', keys.down, true)
      window.removeEventListener('keyup', keys.up)
      window.removeEventListener('blur', lost)
    }
  }, [keys])

  const meta = [
    `${persons.length} faste`,
    totals.coveredShare !== null ? `${Math.round(totals.coveredShare * 100)} % dekket` : '',
    totals.remaining > EPSILON ? `${hoursText(totals.remaining)} t gjenstår` : '',
    totals.overtime > EPSILON ? `${hoursText(totals.overtime)} t overtid` : '',
    totals.weekendOpen > EPSILON ? `helg ${hoursText(totals.weekendOpen)} t åpent` : '',
  ].filter(Boolean)
  const crewDiffers = persons.length > 0 && persons.length !== ws.settings.baseCrew
  const range = stroke ? strokeRange(stroke) : null
  const strokeMode = stroke ? (stroke.mode === 'erase' ? 'erase' : stroke.half ? 'paint-half' : 'paint') : ''
  const pinned = expand === 'week' && openWeek ? allRows.find(({ person }) => person.id === openWeek) : undefined
  const keyOf = new Map(staffed.slice(0, LAST_KEY).map((style, index) => [style.key, index + 1]))
  const competencesOf = (personId: string) => {
    const person = persons.find((p) => p.id === personId)
    return staffed.filter((style) => person?.competences.includes(style.key)).map((style) => ({ style, key: keyOf.get(style.key) ?? 0 }))
  }
  const menuPerson = menu ? persons.find((p) => p.id === menu.cell.personId) : undefined

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

      <BemanningTools tool={activeTool} onTool={pickTool} brush={activeBrush ? styles.get(activeBrush) : undefined} onClearBrush={clearBrush} keyCount={Math.min(staffed.length, LAST_KEY)}
        expand={expand}
        onExpand={(mode) => {
          foldAll()
          setExpand(mode)
        }}
        anyOpen={rows.some(({ person }) => openRows.has(person.id))}
        onToggleAll={() => setOpenRows(rows.some(({ person }) => openRows.has(person.id)) ? new Set() : new Set(rows.map(({ person }) => person.id)))}
        unresolved={unresolved.length}
        onRemoveUnresolved={removeUnresolved}
      />

      <div
        className="bm-scroll"
        ref={scrollRef}
        data-tool={activeTool}
        data-half={activeTool === 'paint' && shift ? '' : undefined}
        style={activeBrush ? ({ '--bc': `var(--${styles.get(activeBrush)!.color})` } as React.CSSProperties) : undefined}
        onMouseLeave={() => setHover(null)}
      >
        <div className="bm-grid">
          <DemandStrip
            dates={dates}
            competences={stripRows}
            balance={balance}
            uncoverable={uncoverable}
            capacity={capacity}
            focusDate={focusDate}
            onFocusDate={(date) => setFocus({ date })}
            folded={folded}
            onToggleFolded={() => setFolded(!folded)}
            brush={activeBrush}
            onPick={pickFromStrip}
            preview={preview}
            onDay={(competence, date, event) => setDemandPop({ competence, date, x: event.clientX, y: event.clientY })}
          />
          <div className="bm-row bm-section" onMouseEnter={() => setHover(null)}>
            <div className="bm-label">
              <span className="bm-eyebrow">Personell</span>
              <span className="bm-label-note">{activeBrush ? `${rows.length} med ${labelOf(activeBrush)}` : `${persons.length} faste`}</span>
              <span className="bm-label-note bm-label-end">uke · t</span>
            </div>
            <span className="bm-section-hint">{expand === 'week' ? 'Dobbeltklikk en dag for ukevisning med overtid' : 'Dobbeltklikk en dag for timer'}</span>
          </div>
          {pinned && (
            <div className="bm-pinned">
              <WeekEditor ws={ws} person={pinned.person} dates={dates} week={pinned.week} competences={competencesOf(pinned.person.id)} styles={styles} brush={activeBrush} tool={activeTool} focusDate={focusDate} actions={editorActions} />
            </div>
          )}
          {rows.map(({ person, week, cells }, index) => {
            const inStroke = range !== null && index >= range.rowFrom && index <= range.rowTo
            if (pinned?.person.id === person.id) {
              return (
                <div key={person.id} className="bm-row bm-ghost" title="Fold sammen (E)" onClick={() => toggleOpen(person.id)} onMouseEnter={() => setHover(null)}>
                  <div className="bm-label">
                    <ChevronDown size={14} aria-hidden />
                    <span className="bm-name">{person.name}</span>
                  </div>
                  <span>Redigeres øverst · klikk for å folde sammen</span>
                </div>
              )
            }
            if (expand === 'row' && openRows.has(person.id)) {
              return <TimelineRow key={person.id} ws={ws} person={person} dates={dates} week={week} competences={competencesOf(person.id)} styles={styles} brush={activeBrush} tool={activeTool} focusDate={focusDate} actions={editorActions} />
            }
            return (
              <PersonRow
                key={person.id}
                person={person}
                dates={dates}
                cells={cells}
                week={week}
                competences={staffed}
                styles={styles}
                focusDate={focusDate}
                rowIndex={index}
                brush={activeBrush}
                blocked={blocked?.[index] ?? ''}
                strokeFrom={inStroke ? range.colFrom : -1}
                strokeTo={inStroke ? range.colTo : -1}
                strokeMode={inStroke ? strokeMode : ''}
                selected={selected?.personId === person.id ? dates.indexOf(selected.date) : -1}
                actions={actions}
              />
            )
          })}
          {!persons.length && (
            <div className="bm-empty">
              <strong>Ingen faste registrert.</strong> Legg inn de ansatte og kompetansene deres, så kan de tildeles arbeidet som er planlagt i Kalender.
              <button onClick={onOpenPersonell}>Åpne Personell</button>
            </div>
          )}
        </div>
      </div>

      {ask && (
        <PaintAsk
          x={ask.x}
          y={ask.y}
          count={ask.count}
          onCancel={() => setAsk(null)}
          onFill={() => {
            applyPaint(ask.cells, ask.competence, { span: 'full', mode: 'fill' })
            setAsk(null)
          }}
          onReplace={() => {
            applyPaint(ask.cells, ask.competence, { span: 'full', mode: 'replace' })
            setAsk(null)
          }}
        />
      )}
      {menu && menuPerson && (
        <DayMenu
          x={menu.x}
          y={menu.y}
          title={`${menuPerson.name} · ${dayName(menu.cell.date)} ${Number(menu.cell.date.slice(8))}.`}
          competences={staffed.filter((style) => menuPerson.competences.includes(style.key)).map((style) => ({ style, blocked: paintBlock(ws, menu.cell, style.key) !== null }))}
          hasBlocks={(ws.assignments ?? []).some((a) => a.personId === menu.cell.personId && a.date === menu.cell.date)}
          open={isOpen(menu.cell.personId)}
          onToggleOpen={() => toggleOpen(menu.cell.personId)}
          dayName={dayName(menu.cell.date)}
          sick={dayType(menu.cell.date) === 'arbeidsdag' ? isSick(ws.unavailability ?? [], menu.cell.personId, menu.cell.date) : null}
          moreDays={restOfWeek(menu.cell.date).length > 1}
          onSick={(rest) => reportSick(menu.cell, rest)}
          onWell={(rest) => reportWell(menu.cell, rest)}
          onAbsence={() => setAbsenceFor(menu.cell)}
          onClose={() => setMenu(null)}
          onPaint={(competence) => paint([menu.cell], competence, false, menu.x, menu.y)}
          onClear={() => clear([menu.cell])}
        />
      )}
      {demandPop && styles.get(demandPop.competence) && (() => {
        const cell = balance.get(demandPop.competence, demandPop.date)
        const next = addDays(demandPop.date, 1)
        const nextName = WEEKDAYS_LONG[(dates.indexOf(demandPop.date) + 1) % 7]
        const canPaint = staffed.some((style) => style.key === demandPop.competence)
        return (
          <DemandPopover
            x={demandPop.x}
            y={demandPop.y}
            style={styles.get(demandPop.competence)!}
            dayText={`${dayName(demandPop.date)} ${Number(demandPop.date.slice(8))}. ${MONTHS_NB[Number(demandPop.date.slice(5, 7)) - 1].toLowerCase()}`}
            demand={cell.demand}
            assigned={cell.assigned}
            remaining={cell.remaining}
            carried={cell.carried}
            free={freeCapacity(ws, demandPop.date, demandPop.competence).hours}
            nextDay={`${nextName}${dayType(next) !== 'arbeidsdag' ? ' (overtid)' : ''}`}
            nextDayShort={nextName.slice(0, 3)}
            painting={activeBrush === demandPop.competence}
            canPaint={canPaint}
            onClose={() => setDemandPop(null)}
            onCarry={(hours) => updateStaffing((w) => ({ ...w, demandAdjustments: carry(w, demandPop.competence, demandPop.date, hours) }))}
            onRemoveCarried={() => updateStaffing((w) => ({ ...w, demandAdjustments: removeCarried(w.demandAdjustments ?? [], demandPop.competence, demandPop.date) }))}
            onPaint={() => activeBrush !== demandPop.competence && pickFromStrip(demandPop.competence)}
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
          onClose={() => setAbsenceFor(null)}
        />
      )}
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
