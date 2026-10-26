import { dayText } from '../../domain/dates'
import { isWaiting, SHIFT_LABELS } from '../../domain/hire'
import { NO_PROJECT } from '../../domain/staffing/projectBalance'
import { numberKey } from '../../domain/projects'
import { sameProject } from '../../domain/types'
import { useBemanning } from '../bemanning/BemanningScope'
import { DemandPopover } from '../bemanning/Popovers'
import { hoursText } from '../format'
import { Toasts } from '../Toasts'
import { useInnleid } from './InnleidScope'
import { OrderPopover } from './OrderPopovers'

/** What opens over the grid in Innleid, as in Faste (`BemanningOverlays`): the popover of orders, the balance of a day of the demand, and the messages. */
export function InnleidOverlays() {
  const bm = useBemanning()
  const { styles, labelOf, toasts, dismissToast } = bm
  const { stored, suppliers, wd, board, tool, brush, brushProject, projectLines, projectName, projectsFor, orderPop, setOrderPop, demandPop, setDemandPop, pickBrush, pickProject, edits } = useInnleid()
  const nameOf = (id: string) => suppliers.find((supplier) => supplier.id === id)?.name ?? 'Ukjent leverandør'

  const popOrders = orderPop ? stored.filter((order) => orderPop.ids.includes(order.id)) : []
  const popTitle = () => {
    const [first] = popOrders
    const one = popOrders.every((order) => order.supplierId === first.supplierId && order.shift === first.shift && order.competence === first.competence)
    return one ? `${labelOf(first.competence)} · ${nameOf(first.supplierId)} · ${SHIFT_LABELS[first.shift]}` : `${popOrders.length} bestillinger`
  }

  const demand = demandPop && styles.get(demandPop.competence) ? demandPop : null
  const line = demand?.projectNo && demand.projectNo !== NO_PROJECT && demand.competence === brush ? projectLines.find((one) => !one.rest && numberKey(one.projectNo) === numberKey(demand.projectNo!)) : undefined
  const rest = demand?.projectNo === NO_PROJECT && demand.competence === brush ? projectLines.find((one) => one.rest) : undefined
  const shownLine = line ?? rest
  const cover = demand && (shownLine ? shownLine.cover(demand.date) : board.cover(demand.competence, demand.date))
  const dayOrders = demand ? (shownLine ? shownLine.orders(demand.date) : stored.filter((order) => order.competence === demand.competence && order.date === demand.date)) : []
  const painting = demand !== null && tool === 'paint' && brush === demand.competence && (line ? sameProject({ projectNo: brushProject ?? undefined }, { projectNo: line.projectNo }) : !brushProject)

  return (
    <>
      {orderPop && popOrders.length > 0 && (
        <OrderPopover
          key={orderPop.ids.join(' ')}
          at={orderPop.at}
          orders={popOrders}
          date={orderPop.date}
          title={popTitle()}
          wd={wd}
          projects={[...new Set(popOrders.flatMap((order) => projectsFor(order.competence)))]}
          projectName={projectName}
          edits={edits}
          onClose={() => setOrderPop(null)}
        />
      )}
      {demand && cover && (
        <DemandPopover
          x={demand.x}
          y={demand.y}
          style={styles.get(demand.competence)!}
          dayText={`${dayText(demand.date)}${shownLine ? ` · ${shownLine.name}` : ''}`}
          stats={[
            { label: 'Etter faste', hours: cover.rest },
            { label: 'Bekreftet', hours: cover.confirmed },
            { label: 'Venter', hours: cover.planned - cover.confirmed },
            cover.remaining < 0 ? { label: 'Over', hours: -cover.remaining } : { label: 'Mangler', hours: cover.remaining },
          ]}
          paintText={painting ? `Bestiller ${labelOf(demand.competence)}` : `Bestill ${labelOf(demand.competence)}`}
          canPaint={!painting}
          onClose={() => setDemandPop(null)}
          onPaint={() => {
            pickBrush(demand.competence)
            if (line) pickProject(line.projectNo)
          }}
        >
          {dayOrders.length ? (
            <ul className="il-pop-orders">
              {dayOrders.map((order) => (
                <li key={order.id}>
                  {hoursText(order.fte)} pers. {nameOf(order.supplierId)} · {SHIFT_LABELS[order.shift]}
                  {order.projectNo ? ` · ${projectName(order.projectNo)}` : ''}
                  {isWaiting(order) ? ' · venter' : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p>Ingenting bestilt denne dagen.</p>
          )}
        </DemandPopover>
      )}
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
