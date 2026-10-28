import { dayText } from '../../domain/dates'
import { hireHours, isWaiting, orderUnits, SHIFT_LABELS } from '../../domain/hire'
import { NO_PROJECT } from '../../domain/staffing/projectBalance'
import { numberKey } from '../../domain/projects'
import { sameProject, type HireOrder } from '../../domain/types'
import { useBemanning } from '../bemanning/BemanningScope'
import { DemandPopover } from '../bemanning/Popovers'
import { count } from '../dom'
import { hoursText } from '../format'
import { Toasts } from '../Toasts'
import { useInnleid } from './InnleidScope'
import { OrderPopover, peopleText } from './OrderPopovers'

/** What opens over the grid in Innleid, as in Faste (`BemanningOverlays`): the popover of orders, the balance of a day of the demand, and the messages. */
export function InnleidOverlays() {
  const bm = useBemanning()
  const { styles, labelOf, toasts, dismissToast } = bm
  const { stored, suppliers, wd, board, tool, brush, brushProject, projectLines, projectName, projectsFor, orderPop, setOrderPop, demandPop, setDemandPop, pickBrush, pickProject, edits } = useInnleid()
  const nameOf = (id: string) => suppliers.find((supplier) => supplier.id === id)?.name ?? 'Ukjent leverandør'

  const popOrders = orderPop ? stored.filter((order) => orderPop.ids.includes(order.id)) : []
  const units = orderUnits(popOrders)
  /** The work of an order: its competence, and its project. */
  const work = (order: { competence: string; projectNo?: string }) => `${labelOf(order.competence)}${order.projectNo ? ` · ${projectName(order.projectNo)}` : ''}`
  // One shared person, or the same parts on every day (slice 6): its parts together, and what each person does.
  // The parts in the order of the competences, as the line draws them; the store keeps no order.
  const rank = (order: HireOrder) => [...styles.keys()].indexOf(order.competence)
  const inOrder = (parts: HireOrder[]) => [...parts].sort((a, b) => rank(a) - rank(b) || work(a).localeCompare(work(b)))
  const shared = units.length > 0 && units.every((unit) => unit.orders[0].person) ? inOrder(units[0].orders) : null
  const sameParts = shared !== null && units.every((unit) => inOrder(unit.orders).map(work).join('+') === shared.map(work).join('+'))
  const popTitle = () => {
    const [first] = popOrders
    const sameLine = popOrders.every((order) => order.supplierId === first.supplierId && order.shift === first.shift)
    if (sameParts && sameLine) return `${shared!.map((part) => labelOf(part.competence)).join(' + ')} · ${nameOf(first.supplierId)} · ${SHIFT_LABELS[first.shift]}`
    const one = sameLine && !shared && popOrders.every((order) => order.competence === first.competence)
    return one ? `${labelOf(first.competence)} · ${nameOf(first.supplierId)} · ${SHIFT_LABELS[first.shift]}` : count(units.length, 'bestilling', 'bestillinger')
  }
  const people = shared ? Math.round(shared.reduce((sum, part) => sum + part.fte, 0)) : 1
  const partsText = sameParts ? shared!.map((part) => `${hoursText((part.fte / people) * hireHours(part, wd))} t ${work(part)}`).join(', ') : null

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
          parts={partsText}
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
                  {peopleText(order, wd)} {nameOf(order.supplierId)} · {SHIFT_LABELS[order.shift]}
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
