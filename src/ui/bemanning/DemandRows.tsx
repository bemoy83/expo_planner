import { memo } from 'react'
import { Check } from 'lucide-react'
import type { ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import type { Balance, FreeCapacity } from '../../domain/staffing'
import { Twisty } from '../common'
import { competenceColor } from '../dom'
import { Line } from '../kalender/GridRows'
import { dayClass, type Columns } from '../kalender/gridTypes'
import { fmtDay } from '../kalender/labels'
import { LEFT_W } from '../kalender/layout'
import { useBemanning, type DemandRow } from './BemanningScope'
import { DensityToggle } from './DensityToggle'
import { DEMAND_COMPACT_H, DEMAND_H } from './layout'
import { EPSILON, hoursText } from './week'

interface LineProps {
  row: DemandRow
  cols: Columns
  balance: Balance
  /** By `competence|date`: the remaining hours the people with the competence have no free normal time for. */
  uncoverable: Map<string, number>
  /** The hours that remain in the days in view. */
  remaining: number
  compact: boolean
  /** The competence in focus, if any. */
  brush: string | null
  /** Hours the stroke under the pointer would add for the brush, by date. */
  preview: Map<ISODate, number> | undefined
  onPick: (competence: string) => void
  onDay: (competence: string, date: ISODate, event: React.MouseEvent) => void
}

/** One competence's line: its name with what is left in the days in view, and each day's hours. */
const DemandLine = memo(function DemandLine({ row: { style, key }, cols, balance, uncoverable, remaining, compact, brush, preview, onPick, onDay }: LineProps) {
  const on = style.key === brush
  const label = (
    <button className="bm-pick" aria-pressed={on} disabled={!key && !on} title={on ? 'Slå av fokus og pensel (Esc)' : key ? `Fokuser på ${style.label} og mal med den (${key})` : `Ingen av de faste har ${style.label}`} onClick={() => onPick(style.key)}>
      <i className="swatch" />
      <span className="bm-name">{style.label}</span>
      {key > 0 && !compact && <kbd>{key}</kbd>}
      <span className="bm-week-left">{remaining > EPSILON ? `${hoursText(remaining)} t` : <Check size={compact ? 11 : 13} aria-label="Dekket" />}</span>
    </button>
  )
  return (
    <Line
      className={`bm-demand ${compact ? 'compact' : ''} ${on ? 'on' : brush ? 'dim' : ''}`}
      height={compact ? DEMAND_COMPACT_H : DEMAND_H}
      label={label}
      cols={cols}
      cells={(date) => {
        const cell = balance.get(style.key, date)
        const classes = `${dayClass(cols, date)} cell bm-need`
        if (cell.demand < EPSILON && cell.assigned < EPSILON) return <div key={date} className={classes} style={{ width: cols.colW }} />
        const left = Math.max(0, cell.remaining)
        const over = cell.remaining < -EPSILON
        const what = over ? `+${hoursText(-cell.remaining)} t over` : left > EPSILON ? `${hoursText(left)} t igjen av ${hoursText(cell.demand)}` : 'dekket'
        if (compact) {
          // One line: the demand as a tint, filled solid from the left as it is covered.
          return (
            <button key={date} className={classes} style={{ width: cols.colW }} title={`${style.label} · ${what}`} onClick={(e) => onDay(style.key, date, e)}>
              {cell.demand > EPSILON || over ? <i className={`bm-need-line ${over ? 'over' : ''}`}>{cell.assigned > EPSILON && cell.demand > EPSILON && <i style={{ width: `${Math.min(1, cell.assigned / cell.demand) * 100}%` }} />}</i> : null}
            </button>
          )
        }
        const unc = uncoverable.get(`${style.key}|${date}`) ?? 0
        const state = left > EPSILON ? (unc > EPSILON ? 'uncoverable' : '') : over ? 'over' : 'ok'
        const base = Math.max(cell.demand, cell.assigned) || 1
        const regular = (Math.min(cell.assigned - cell.assignedOT, cell.demand) / base) * 100
        const overtime = (Math.min(cell.assigned, cell.demand) / base) * 100 - regular
        const surplus = (Math.max(0, cell.assigned - cell.demand) / base) * 100
        const added = on ? (preview?.get(date) ?? 0) : 0
        const title =
          `${style.label} · ${fmtDay(date)}${dayType(date) !== 'arbeidsdag' ? ' (overtid)' : ''}\nBehov ${hoursText(cell.demand)} t · tildelt ${hoursText(cell.assigned)} t` +
          (cell.assignedOT > EPSILON ? ` (herav ${hoursText(cell.assignedOT)} t overtid)` : '') +
          ` · gjenstår ${hoursText(left)} t` +
          (cell.carried > EPSILON ? `\n${hoursText(cell.carried)} t er flyttet hit fra dagen før.` : '') +
          (unc > EPSILON ? `\n${hoursText(unc)} t kan ikke dekkes av faste i normaltid.` : '')
        return (
          <button key={date} className={classes} style={{ width: cols.colW }} title={title} onClick={(e) => onDay(style.key, date, e)}>
            <span className="bm-need-value">
              {added > EPSILON && <span className="bm-preview">−{hoursText(Math.min(added, left) || added)}</span>}
              {cell.carried > EPSILON && <span className="bm-carried">+{hoursText(cell.carried)}</span>}
              <b className={`bm-number ${state}`}>{state === 'ok' ? <Check size={14} aria-label="Dekket" /> : over ? `+${hoursText(-cell.remaining)}` : hoursText(cell.remaining)}</b>
              {cell.demand > EPSILON && <em>av {hoursText(cell.demand)}</em>}
            </span>
            <span className="bar">
              <i className="covered" style={{ width: `${regular}%` }} />
              {overtime > 0 && <i className="overtime" style={{ left: `${regular}%`, width: `${overtime}%` }} />}
              {surplus > 0 && <i className="surplus" style={{ left: `${regular + overtime}%`, width: `${surplus}%` }} />}
              {unc > EPSILON && <i className="uncoverable" style={{ width: `${(unc / base) * 100}%` }} />}
            </span>
          </button>
        )
      }}
      style={competenceColor(style)}
    />
  )
})

/** The free normal time of the people, or of those who have the competence in focus (R11). */
const CapacityLine = memo(function CapacityLine({ cols, capacity, label }: { cols: Columns; capacity: Map<ISODate, FreeCapacity>; label: string }) {
  return (
    <Line
      className="bm-capacity"
      label={<span className="bm-label-text">{label}</span>}
      cols={cols}
      cells={(date) => {
        const free = capacity.get(date)
        return (
          <div key={date} className={`${dayClass(cols, date)} cell bm-free`} style={{ width: cols.colW }}>
            {free && dayType(date) === 'arbeidsdag' && (
              <>
                <b>{hoursText(free.hours)}</b>
                <em>t · {free.people} pers</em>
              </>
            )}
          </div>
        )
      }}
    />
  )
})

/**
 * The demand per competence, summed over the projects (R10): what remains of each day's hours against
 * what is assigned. A competence in focus is also the brush. Folded, only the competence in focus shows.
 */
export function DemandRows() {
  const bm = useBemanning()
  const { demandRows, remainingOf, balance, uncoverable, cols, brush, preview, demandOpen: open, demandDensity, idleOpen, capacity, onFocusDate, pickFromDemand, setDemandPop } = bm
  const compact = demandDensity === 'compact'
  // A competence with neither demand nor assigned hours in the period is set aside under one line. The one in focus stays.
  const isIdle = (key: string) => key !== brush && !remainingOf.has(key)
  const busy = demandRows.filter(({ style }) => !isIdle(style.key))
  const idle = demandRows.filter(({ style }) => isIdle(style.key))
  const onDay = (competence: string, date: ISODate, event: React.MouseEvent) => {
    // A click on a day picks its competence, makes the day the one in focus, and opens its balance with moved hours.
    if (bm.keyOf.has(competence) && competence !== brush) bm.pickBrush(competence)
    onFocusDate(date)
    setDemandPop({ competence, date, x: event.clientX, y: event.clientY })
  }
  const line = (row: DemandRow) =>
    !open && row.style.key !== brush ? null : (
      <DemandLine key={row.style.key} row={row} cols={cols} balance={balance} uncoverable={uncoverable} remaining={remainingOf.get(row.style.key) ?? 0} compact={compact} brush={brush} preview={row.style.key === brush ? preview : undefined} onPick={pickFromDemand} onDay={onDay} />
    )
  return (
    <div className={`top-section bm-demand-section open ${compact ? 'compact' : ''}`}>
      <div className="section-head" style={{ width: LEFT_W }}>
        <Twisty open={open} show="Vis alle kompetanser" hide="Vis bare kompetansen i fokus" onToggle={() => bm.setDemandOpen(!open)} />
        Kompetanse
        {open && <DensityToggle compact={compact} onChange={(next) => bm.setDemandDensity(next ? 'compact' : 'detail')} />}
        <span className="section-meta section-meta-end" title={open ? 'Timer som gjenstår i dagene som vises' : undefined}>{open ? 't igjen' : `${demandRows.filter(({ style }) => style.key !== brush).length} skjult`}</span>
      </div>
      {busy.map(line)}
      {open && idle.length > 0 && (
        <div className="section-head bm-idle-head" style={{ width: LEFT_W }}>
          <Twisty open={idleOpen} show="Vis kompetansene uten behov" hide="Skjul kompetansene uten behov" onToggle={() => bm.setIdleOpen(!idleOpen)} />
          Uten behov
          <span className="section-meta">{idle.length}</span>
        </div>
      )}
      {open && idleOpen && idle.map(line)}
      <i className="bm-crosshair" />
      {open && !compact && <CapacityLine cols={cols} capacity={capacity} label={brush ? `Ledig med ${bm.labelOf(brush)}` : 'Ledig kapasitet, faste'} />}
    </div>
  )
}
