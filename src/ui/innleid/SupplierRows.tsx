import { memo, useMemo, useState } from 'react'
import { Paintbrush } from 'lucide-react'
import { dayText, type ISODate } from '../../domain/dates'
import { isWaiting } from '../../domain/hire'
import type { CompetenceStyle, Supplier } from '../../domain/types'
import { useBemanning } from '../bemanning/BemanningScope'
import { competenceColor } from '../dom'
import { Line, SectionLine } from '../kalender/GridRows'
import { dayClass, type Columns } from '../kalender/gridTypes'
import { ROW_H } from '../kalender/layout'
import { useInnleid } from './InnleidScope'
import { AnswerGlyph } from './OrderPopovers'

/** The people a supplier is ordered for on a day, over the competences: confirmed, and waiting for an answer. */
interface DayPeople {
  people: number
  waiting: number
}

interface LineProps {
  supplier: Supplier
  cols: Columns
  /** By date. */
  days: Map<ISODate, DayPeople> | undefined
  /** The people-days in the days in view. */
  total: number
  waits: boolean
  /** The competences of the board, for the marks of what the supplier offers. */
  competences: CompetenceStyle[]
  /** The supplier is the one the brush orders from. */
  brushed: boolean
  /** The supplier does not offer the competence whose days are picked. */
  faint: boolean
  onBrush: (id: string | null) => void
  /** Opens the supplier's panel. */
  onOpen: (id: string) => void
}

/** One supplier: its name with what it offers and its people-days in view, and the people it is ordered for per day, those that wait for an answer hatched. */
const SupplierLine = memo(function SupplierLine({ supplier, cols, days, total, waits, competences, brushed, faint, onBrush, onOpen }: LineProps) {
  return (
    <Line
      className={`il-supplier ${brushed ? 'on' : ''} ${faint ? 'faint' : ''}`}
      height={ROW_H}
      label={
        <>
          <button className="il-brush" aria-pressed={brushed} aria-label={brushed ? `Legg bort penselen` : `Bestill fra ${supplier.name} med penselen`} title={brushed ? 'Legg bort penselen (Esc)' : `Velg ${supplier.name} som pensel`} onClick={() => onBrush(brushed ? null : supplier.id)}>
            <Paintbrush size={13} aria-hidden />
          </button>
          <button className="il-supplier-name lbl-desc" title={`Åpne bestillingen til ${supplier.name}`} onClick={() => onOpen(supplier.id)}>
            {supplier.name}
          </button>
          {waits && <AnswerGlyph waits size={12} />}
          <span className="il-offers" title={`Tilbyr: ${competences.filter((style) => supplier.competences.includes(style.key)).map((style) => style.label).join(', ') || 'ingen av kompetansene med restbehov'}`}>
            {competences.map((style) => (
              <i key={style.key} className={supplier.competences.includes(style.key) ? 'on' : ''} style={competenceColor(style)} />
            ))}
          </span>
          <span className="bm-week-left">{total || ''}</span>
        </>
      }
      cols={cols}
      cells={(date) => {
        const day = days?.get(date)
        return (
          <div key={date} className={`${dayClass(cols, date)} cell il-people`} title={day ? `${supplier.name} · ${dayText(date)}\n${day.people} pers.${day.waiting ? `, ${day.waiting} venter på svar` : ''}` : undefined}>
            {day && day.people > day.waiting && <span>{day.people - day.waiting}</span>}
            {day && day.waiting > 0 && <span className="waits">{day.waiting}</span>}
          </div>
        )
      }}
    />
  )
})

/**
 * The suppliers under the competences: the people each is ordered for per day. A click on the brush of one picks it as
 * the brush, and a click on its name opens its panel. With days picked on a competence, the suppliers listed are those that offer it, until all are asked for.
 */
export function SupplierRows() {
  const { cols, dates, viewFrom, viewTo, styles } = useBemanning()
  const { suppliers, orders, rows, open, brush, tool, pickBrush, pickTool, openSupplier } = useInnleid()
  const [all, setAll] = useState(false)
  const perDay = useMemo(() => {
    const map = new Map<string, Map<ISODate, DayPeople>>()
    for (const order of orders) {
      const days = map.get(order.supplierId) ?? new Map<ISODate, DayPeople>()
      const day = days.get(order.date)
      days.set(order.date, { people: (day?.people ?? 0) + order.fte, waiting: (day?.waiting ?? 0) + (isWaiting(order) ? order.fte : 0) })
      map.set(order.supplierId, days)
    }
    return map
  }, [orders])
  if (!suppliers.length) return null
  const focus = open ? styles.get(open.competence) : undefined
  const offers = focus ? suppliers.filter((supplier) => supplier.competences.includes(focus.key)) : suppliers
  const listed = focus && !all ? offers : suppliers
  const view = dates.slice(viewFrom, viewTo + 1)
  const onBrush = (id: string | null) => (id ? pickBrush(id) : pickTool('select'))
  return (
    <div className="il-suppliers">
      <SectionLine>
        Leverandører{focus ? ` · ${focus.label}` : ''}
        {focus && offers.length < suppliers.length && (
          <button className="link small" onClick={() => setAll(!all)}>
            {all ? `Bare ${focus.label}` : `Vis alle (${suppliers.length})`}
          </button>
        )}
        <span className="section-meta section-meta-end" title="Persondager i dagene som vises">
          pers.
        </span>
      </SectionLine>
      {listed.map((supplier) => {
        const days = perDay.get(supplier.id)
        return (
          <SupplierLine
            key={supplier.id}
            supplier={supplier}
            cols={cols}
            days={days}
            total={view.reduce((sum, date) => sum + (days?.get(date)?.people ?? 0), 0)}
            waits={!!days && [...days.values()].some((day) => day.waiting > 0)}
            competences={rows}
            brushed={tool === 'paint' && brush?.id === supplier.id}
            faint={!!focus && !supplier.competences.includes(focus.key)}
            onBrush={onBrush}
            onOpen={openSupplier}
          />
        )
      })}
      {focus && !listed.length && <p className="empty-rows">Ingen leverandør tilbyr {focus.label} ennå.</p>}
    </div>
  )
}
