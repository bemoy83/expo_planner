import { memo, useMemo, type CSSProperties } from 'react'
import { dayText } from '../../domain/dates'
import { HOURS_NOISE, type HireBoard } from '../../domain/hire'
import { HeatLegend, Line, SectionLine } from '../kalender/GridRows'
import { dayClass, type Columns } from '../kalender/gridTypes'
import { heatScale, heatTile, HEAT_LABELS } from '../kalender/heat'
import { HEAT_ROW_H } from '../kalender/layout'
import { AnswerGlyph } from '../innleid/OrderPopovers'
import { hoursText, signedHours } from '../format'
import { useBemanning } from './BemanningScope'
import { HoursLeft } from './NeedLabel'

/** A day of the Avvik line: under, ok or over as a tile, with the hours and a clock where an order waits for an answer. */
const AvvikLine = memo(function AvvikLine({ cols, board, maxShortage, maxSurplus, total }: { cols: Columns; board: HireBoard; maxShortage: number; maxSurplus: number; total: number }) {
  return (
    <Line
      className="sum-row deviation-row heat-row"
      height={HEAT_ROW_H}
      label={
        <>
          <span className="lbl-cap strong">Mangler / over</span>
          <HeatLegend title="Rødt: timer som mangler etter faste og bekreftet innleie (mørkere = flere). Grønt: ok, dekket innenfor én person på ett skift. Oker: bekreftet over behovet. Skravert: noe venter på svar og teller ikke ennå." />
          <HoursLeft hours={total} />
        </>
      }
      cols={cols}
      cells={(date) => {
        const dev = board.deviations.get(date)
        if (!dev || dev.state === 'none') return <div key={date} className={`${dayClass(cols, date)} cell sum-cell`} />
        const tile = heatTile(dev.value, maxShortage, maxSurplus, dev.state)
        const waits = dev.pending > HOURS_NOISE
        return (
          <div key={date} className={`${dayClass(cols, date)} cell sum-cell heat-cell ${tile.kind}`} title={`${dayText(date)} · ${HEAT_LABELS[tile.kind]} ${signedHours(dev.value) || '0'} t${waits ? `\n${hoursText(dev.pending)} t venter på svar og teller ikke` : ''}`}>
            <span className={`heat ${tile.kind}`} style={{ '--p': `${tile.percent}%` } as CSSProperties} />
            {waits && <span className="il-waits" aria-label="Venter på svar"><AnswerGlyph waits /></span>}
            <span className="heat-value">{signedHours(dev.value)}</span>
          </div>
        )
      }}
    />
  )
})

/** What Faste and Innleid both pin last, under their competences and right over the planning bar, as Plan has its own: each day's Avvik after the permanent staff and the confirmed orders. */
export function AvvikSection({ board }: { board: HireBoard }) {
  const { cols, dates, viewFrom, viewTo } = useBemanning()
  const scale = useMemo(() => heatScale([...board.deviations.values()].map((dev) => dev.value)), [board])
  // The hours missing in the days in view.
  const total = dates.slice(viewFrom, viewTo + 1).reduce((sum, date) => sum + Math.max(0, -(board.deviations.get(date)?.value ?? 0)), 0)
  return (
    <div className="top-section open">
      <SectionLine>
        Restbehov etter faste og innleie
        <span className="section-meta section-meta-end" title="Timer som mangler i dagene som vises">timer</span>
      </SectionLine>
      <AvvikLine cols={cols} board={board} maxShortage={scale.maxShortage} maxSurplus={scale.maxSurplus} total={total} />
    </div>
  )
}
