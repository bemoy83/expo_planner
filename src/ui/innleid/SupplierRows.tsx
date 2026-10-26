import { memo, useMemo } from 'react'
import { ChevronDown, ChevronRight, Paintbrush } from 'lucide-react'
import { dayText, type ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { lineKey, orderRuns, SHIFT_LABELS, shiftTimes, supplierDays, supplierLines, timesText, type LineRuns, type SupplierDay, type SupplierLine } from '../../domain/hire'
import type { CompetenceStyle, HireOrder, Supplier, WorkdaySettings } from '../../domain/types'
import { pushTo } from '../../domain/collections'
import { usePref } from '../../store/prefs'
import { useBemanning } from '../bemanning/BemanningScope'
import { DAY_INSET, DIVIDER_H, shiftLine } from '../bemanning/layout'
import { competenceColor } from '../dom'
import { hoursText } from '../format'
import { Line, SectionLine } from '../kalender/GridRows'
import { dayClass, type Columns } from '../kalender/gridTypes'
import { daysWide, LEFT_W, ROW_H } from '../kalender/layout'
import { useInnleid } from './InnleidScope'
import { AnswerGlyph } from './OrderPopovers'

const NO_ORDERS: HireOrder[] = []
const NO_FOLDED: string[] = []
const cleanFolded = (stored: unknown): string[] => (Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : NO_FOLDED)

/** What the label of a supplier's first line holds: its name, which opens its panel, what it offers, and the brush. */
interface NameProps {
  supplier: Supplier
  /** The competences of the board, for the marks of what the supplier offers. */
  competences: CompetenceStyle[]
  /** The competence in focus, whose mark has a ring. */
  focus: string | undefined
  waits: boolean
  /** The supplier is the one the brush orders from. */
  brushed: boolean
  onBrush: (id: string | null) => void
  onOpen: (id: string) => void
}

function SupplierName({ supplier, competences, focus, waits, brushed, onBrush, onOpen }: NameProps) {
  return (
    <>
      <button className="il-brush" aria-pressed={brushed} aria-label={brushed ? `Legg bort penselen` : `Bestill fra ${supplier.name} med penselen`} title={brushed ? 'Legg bort penselen (Esc)' : `Velg ${supplier.name} som pensel`} onClick={() => onBrush(brushed ? null : supplier.id)}>
        <Paintbrush size={13} aria-hidden />
      </button>
      <button className="il-supplier-name lbl-desc" title={`Åpne bestillingen til ${supplier.name}`} onClick={() => onOpen(supplier.id)}>
        {supplier.name}
      </button>
      {waits && <AnswerGlyph waits size={12} />}
      <span className="bm-dots" title={`Tilbyr: ${competences.filter((style) => supplier.competences.includes(style.key)).map((style) => style.label).join(', ') || 'ingen av kompetansene med restbehov'}`}>
        {competences.map((style) => (
          <i key={style.key} className={`${supplier.competences.includes(style.key) ? 'has' : ''} ${style.key === focus ? 'focused' : ''}`} style={competenceColor(style)} />
        ))}
      </span>
    </>
  )
}

interface NameLineProps extends NameProps {
  cols: Columns
  /** By date. */
  days: Map<ISODate, SupplierDay> | undefined
  /** The people-days in the days in view. */
  total: number
  folded: boolean
  onFold: (id: string) => void
  dim: boolean
}

/** A supplier with more than one line: its name, and the people it is ordered for per day over its shifts, those that wait for an answer hatched. Its lines fold under it. */
const NameLine = memo(function NameLine({ cols, days, total, folded, onFold, dim, ...name }: NameLineProps) {
  const { supplier } = name
  return (
    <Line
      className={`il-supplier ${name.brushed ? 'on' : ''} ${dim ? 'dim' : ''}`}
      height={ROW_H}
      label={
        <>
          <button className="row-action" aria-expanded={!folded} aria-label={folded ? 'Vis skiftene' : 'Skjul skiftene'} title={folded ? 'Vis skiftene' : 'Skjul skiftene'} onClick={() => onFold(supplier.id)}>
            {folded ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          </button>
          <SupplierName {...name} />
          <span className="bm-week-left">{total || ''}</span>
        </>
      }
      cols={cols}
      cells={(date) => {
        const day = days?.get(date)
        return (
          <div key={date} className={`${dayClass(cols, date)} cell il-people`} title={day ? `${supplier.name} · ${dayText(date)}\n${hoursText(day.people)} pers.${day.waiting ? `, ${hoursText(day.waiting)} venter på svar` : ''}` : undefined}>
            {day && day.people > day.waiting && <span>{hoursText(day.people - day.waiting)}</span>}
            {day && day.waiting > 0 && <span className="waits">{hoursText(day.waiting)}</span>}
          </div>
        )
      }}
    />
  )
})

interface ShiftLineProps {
  supplier: Supplier
  line: SupplierLine
  /** The line's orders over the days drawn, as runs in lanes. */
  runs: LineRuns
  cols: Columns
  styles: Map<string, CompetenceStyle>
  wd: WorkdaySettings
  projectName: (projectNo: string) => string
  /** The competence in focus: runs of other competences are dimmed. */
  focus: string | undefined
  dim: boolean
  /** The supplier has this line alone: its label is the supplier's too, with the name. */
  name?: NameProps & { total: number }
}

/** A supplier's shift, as a person's line in Faste: its orders as runs over the days, a lane in height for each competence and project. */
const ShiftLine = memo(function ShiftLine({ supplier, line, runs, cols, styles, wd, projectName, focus, dim, name }: ShiftLineProps) {
  const geometry = shiftLine(runs.lanes.length)
  const times = timesText(shiftTimes(line.shift, wd))
  const shift = (
    <span className={`il-shift ${line.offered ? '' : 'retired'}`} title={line.offered ? `${supplier.name} · ${SHIFT_LABELS[line.shift]} ${times}` : `${supplier.name} tilbyr ikke ${SHIFT_LABELS[line.shift].toLowerCase()} lenger. Bestillingene står til de er flyttet eller fjernet.`}>
      <b>{SHIFT_LABELS[line.shift]}</b> {times}
    </span>
  )
  return (
    <Line
      className={`il-line ${name ? 'il-supplier' : ''} ${dim ? 'dim' : ''}`}
      height={geometry.height}
      label={
        <>
          {name && <SupplierName {...name} />}
          {shift}
          {!line.offered && (
            <span className="il-retired">
              <i className="need-dot" />
              Tilbys ikke lenger
            </span>
          )}
          {name && <span className="bm-week-left">{name.total || ''}</span>}
        </>
      }
      cols={cols}
      cells={(date) => <div key={date} className={`${dayClass(cols, date)} cell bm-cell ${dayType(date) === 'arbeidsdag' ? '' : 'off-day'}`} />}
      overlay={runs.runs.map((run) => {
        const style = styles.get(run.competence)
        const label = `${style?.label ?? run.competence}${run.projectNo ? ` · ${projectName(run.projectNo)}` : ''}`
        const order = run.orders[0]
        const people = order.asked && !run.waits ? `${hoursText(run.fte)}/${hoursText(order.asked)}` : hoursText(run.fte)
        // Its own times where they are not the shift's, without the minutes of a whole hour: «10–18».
        const own = timesText(run) === timesText(shiftTimes(line.shift, wd)) ? null : timesText(run).replace(/:00/g, '')
        const stale = line.stale.includes(run.competence)
        const lane = geometry.lane(run.lane)
        const at = cols.c0 + cols.dates.indexOf(run.from)
        const days = cols.dates.indexOf(run.to) - cols.dates.indexOf(run.from) + 1
        return (
          <span
            key={`${run.lane}|${run.from}`}
            className={`il-run ${run.waits ? 'waits' : ''} ${lane.height < 20 ? 'sm' : ''} ${focus && focus !== run.competence ? 'other' : ''}`}
            style={{ left: daysWide(at, LEFT_W + DAY_INSET), width: daysWide(days, -2 * DAY_INSET), top: lane.top, height: lane.height, ...competenceColor(style) }}
            title={`${label} · ${supplier.name} · ${SHIFT_LABELS[line.shift]}\n${dayText(run.from)}${run.to === run.from ? '' : ` – ${dayText(run.to)}`} · ${people} pers. · ${run.waits ? 'venter på svar' : 'bekreftet'}${own ? `\nEgne tider ${own}` : ''}${run.projectNo ? '' : '\nUten prosjekt: fordeles på prosjektene'}${stale ? `\n${supplier.name} tilbyr ikke ${style?.label ?? run.competence} lenger` : ''}`}
          >
            <span className="il-run-name" style={{ left: LEFT_W + DAY_INSET }}>
              {stale && <i className="need-dot" />}
              {label}
              <b>{people}</b>
              {own && <small>{own}</small>}
            </span>
          </span>
        )
      })}
    />
  )
})

/**
 * The suppliers under the competences, as the people under them in Faste: each with a line per shift it offers, its
 * orders drawn as runs on them, and with more than one shift a name line over them with the people per day, which
 * folds them. With a competence open, the suppliers that offer it come first, and the others are dimmed under a divider.
 */
export function SupplierRows({ onOpenSuppliers }: { onOpenSuppliers: () => void }) {
  const { cols, dates, viewFrom, viewTo, styles, labelOf } = useBemanning()
  const { suppliers, orders, rows, open, brush, tool, pickBrush, dropBrush, openSupplier, wd, projectName } = useInnleid()
  const [folded, setFolded] = usePref<string[]>('innleidFolded', NO_FOLDED, cleanFolded)
  const perDay = useMemo(() => supplierDays(orders), [orders])
  const rank = useMemo(() => {
    const order = new Map([...styles.keys()].map((key, at) => [key, at]))
    return (competence: string) => order.get(competence) ?? order.size
  }, [styles])
  const drawn = cols.dates
  // The orders of each line as runs over the days drawn: a lane for each competence and project the line has in them.
  const lineRuns = useMemo(() => {
    const byLine = new Map<string, HireOrder[]>()
    for (const order of orders) {
      pushTo(byLine, lineKey(order.supplierId, order.shift), order)
    }
    return (line: SupplierLine) => orderRuns(byLine.get(line.key) ?? NO_ORDERS, drawn, rank)
  }, [orders, drawn, rank])
  if (!suppliers.length) return null
  const focus = open?.competence
  const offers = (supplier: Supplier) => !focus || supplier.competences.includes(focus)
  const listed = [...suppliers.filter(offers), ...suppliers.filter((supplier) => !offers(supplier))]
  const able = suppliers.filter(offers).length
  const view = dates.slice(viewFrom, viewTo + 1)
  const onBrush = (id: string | null) => (id ? pickBrush(id) : dropBrush())
  const onFold = (id: string) => setFolded((now) => (now.includes(id) ? now.filter((one) => one !== id) : [...now, id]))
  return (
    <div className="il-suppliers">
      <SectionLine>
        Leverandører
        <span className="section-meta section-meta-end" title="Persondager i dagene som vises">
          pers.
        </span>
      </SectionLine>
      {listed.map((supplier, at) => {
        const days = perDay.get(supplier.id)
        const dim = at >= able
        const name: NameProps & { total: number } = {
          supplier,
          competences: rows,
          focus,
          waits: !!days && [...days.values()].some((day) => day.waiting > 0),
          brushed: tool === 'paint' && brush?.id === supplier.id,
          onBrush,
          onOpen: openSupplier,
          total: view.reduce((sum, date) => sum + (days?.get(date)?.people ?? 0), 0),
        }
        const lines = supplierLines(supplier, orders)
        const shift = (line: SupplierLine, alone: boolean) => (
          <ShiftLine key={line.key} supplier={supplier} line={line} runs={lineRuns(line)} cols={cols} styles={styles} wd={wd} projectName={projectName} focus={focus} dim={dim} name={alone ? name : undefined} />
        )
        return (
          <div key={supplier.id}>
            {at === able && able < listed.length && (
              <div className="bm-divider" style={{ height: DIVIDER_H }}>
                <span style={{ width: LEFT_W }}>
                  Uten {labelOf(focus!)} · {listed.length - able}
                </span>
              </div>
            )}
            {lines.length === 1 ? (
              shift(lines[0], true)
            ) : (
              <>
                <NameLine {...name} cols={cols} days={days} folded={folded.includes(supplier.id)} onFold={onFold} dim={dim} />
                {!lines.length && (
                  <p className="empty-rows">
                    {supplier.name} har ingen skift.{' '}
                    <button className="link" onClick={onOpenSuppliers}>
                      Velg skift på Leverandører
                    </button>
                  </p>
                )}
                {!folded.includes(supplier.id) && lines.map((line) => shift(line, false))}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
