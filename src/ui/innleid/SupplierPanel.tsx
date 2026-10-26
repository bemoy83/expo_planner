import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Copy } from 'lucide-react'
import { dayText, type ISODate } from '../../domain/dates'
import { HOURS_NOISE, isWaiting, orderText, shiftText, SHIFT_LABELS, supplierOrders, supplierReview, supplierTotals } from '../../domain/hire'
import { SHIFT_IDS, type HireOrder, type Supplier } from '../../domain/types'
import { useBemanning } from '../bemanning/BemanningScope'
import { Segmented, SidePanel } from '../common'
import { competenceColor } from '../dom'
import { useInnleid } from './InnleidScope'
import { AnswerGlyph } from './OrderPopovers'
import { pushTo } from '../../domain/collections'
import { hoursText } from '../format'

/** How long «Kopiert» stands on the button after the order is copied, in milliseconds. */
const COPIED_MS = 1600

/** A supplier's order copied as text to send: the supplier whose order was just copied, for «Kopiert» to stand a moment, and the copying. */
function useCopyOrder() {
  const { styles, projectName } = useBemanning()
  const { orders } = useInnleid()
  const [copied, setCopied] = useState<string | null>(null)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(null), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = (supplier: Supplier) => navigator.clipboard.writeText(orderText(supplier, orders, [...styles.values()], projectName)).then(() => setCopied(supplier.id))
  return { copied, copy }
}

/** Orders by day, each with what it is for, its time and people, and its answer, which a click turns; a click on what it is for shows it in the grid. */
function OrderDays({ orders }: { orders: HireOrder[] }) {
  const { styles, projectName } = useBemanning()
  const { wd, edits, showOrder } = useInnleid()
  const byDay = new Map<ISODate, HireOrder[]>()
  for (const order of orders) pushTo(byDay, order.date, order)
  const show = (order: HireOrder) => {
    showOrder(order)
  }
  return (
    <>
      {[...byDay].map(([date, list]) => (
        <div key={date} className="il-order-day">
          <span className="insp-eyebrow">{dayText(date)}</span>
          {list.map((order) => {
            const style = styles.get(order.competence)
            return (
              <div key={order.id} className="il-panel-order" style={competenceColor(style)}>
                <button className="il-panel-what" title="Vis i rutenettet" onClick={() => show(order)}>
                  <i className="swatch" />
                  <span title={order.projectNo ? projectName(order.projectNo) : undefined}>
                    {style?.label ?? order.competence}
                    {order.projectNo ? ` · ${projectName(order.projectNo)}` : ''}
                  </span>
                  <em>{shiftText(order, wd)}</em>
                </button>
                <b>{order.fte}</b>
                {order.asked !== undefined && <em>av {order.asked}</em>}
                <button className={`il-status ${isWaiting(order) ? 'waits' : ''}`} title={isWaiting(order) ? 'Sett til bekreftet' : 'Sett til venter'} onClick={() => edits.toggleAnswer(order)}>
                  <AnswerGlyph waits={isWaiting(order)} />
                  {isWaiting(order) ? 'Venter' : 'Bekreftet'}
                </button>
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}

/** Whether the control panel lists the orders that wait for an answer, or all. */
type ControlShow = 'waiting' | 'all'

/**
 * The control panel: every supplier's orders to look over and confirm (`supplierReview`), those that wait soonest first. A supplier
 * has what it is ordered for, «Bekreft alle» for what waits, its order as text to send, and its own panel behind its name.
 */
function Control({ onOpenSuppliers }: { onOpenSuppliers: () => void }) {
  const { styles } = useBemanning()
  const { suppliers, orders, wd, edits, setPanel } = useInnleid()
  const [show, setShow] = useState<ControlShow>('waiting')
  const { copied, copy } = useCopyOrder()
  const competences = [...styles.values()]
  const review = supplierReview(suppliers, orders, competences)
  const waiting = review.filter((one) => one.waiting.length)
  const listed = show === 'waiting' ? waiting : review
  return (
    <div className="insp-body">
      <section className="insp-sec il-control-head">
        <Segmented<ControlShow>
          label="Vis"
          value={show}
          onChange={setShow}
          options={[
            { value: 'waiting', label: <>Venter <span className="count">{waiting.reduce((sum, one) => sum + one.waiting.length, 0)}</span></>, title: 'Bestillinger som venter på svar' },
            { value: 'all', label: 'Alle', title: 'Alle bestillinger' },
          ]}
        />
      </section>
      {!listed.length && <p className="insp-empty">{show === 'waiting' ? (review.length ? 'Alle bestillinger er bekreftet.' : 'Ingen bestillinger ennå.') : 'Ingen bestillinger ennå.'}</p>}
      {listed.map(({ supplier, orders: own, waiting: open }) => {
        const totals = supplierTotals(supplier, own, wd)
        return (
          <section key={supplier.id} className="insp-sec il-control">
            <div className="il-control-supplier">
              <button className="il-panel-what" title={`Åpne ${supplier.name}`} onClick={() => setPanel({ kind: 'supplier', id: supplier.id })}>
                <b>{supplier.name}</b>
              </button>
              <span className="il-control-counts">
                {open.length > 0 && (
                  <>
                    <AnswerGlyph waits /> {open.length}
                  </>
                )}
                <AnswerGlyph waits={false} /> {totals.confirmed}
              </span>
              <button className="ghost icon-button" aria-label="Kopier bestilling" title="Kopier bestillingen som tekst, til å lime inn i en e-post" onClick={() => copy(supplier)}>
                {copied === supplier.id ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
              </button>
              <button disabled={!open.length} onClick={() => edits.confirmAll(supplier.id)} title="Sett alle bestillingene som venter til bekreftet">
                Bekreft alle
              </button>
            </div>
            <OrderDays orders={show === 'waiting' ? open : own} />
          </section>
        )
      })}
      <section className="insp-sec">
        <button className="link il-to-suppliers" onClick={onOpenSuppliers}>
          Navn, kontakt, pris og hva de tilbyr settes på Mannskap › Leverandører
        </button>
      </section>
    </div>
  )
}

/** A supplier's order: what it is ordered for per day, with the answer of each, a text of it to send, and what it offers. */
function SupplierOrder({ supplier }: { supplier: Supplier }) {
  const { styles } = useBemanning()
  const { orders, wd, edits } = useInnleid()
  const { copied: copiedId, copy: copyOrder } = useCopyOrder()
  const copied = copiedId === supplier.id
  const competences = [...styles.values()]
  const own = supplierOrders(supplier, orders, competences)
  const totals = supplierTotals(supplier, orders, wd)
  const offered = competences.filter((style) => supplier.competences.includes(style.key))
  const copy = () => copyOrder(supplier)
  return (
    <div className="insp-body">
      <section className="insp-sec">
        <dl className="il-stats">
          <div>
            <dt>Persondager</dt>
            <dd>{totals.people}</dd>
          </div>
          <div>
            <dt>Timer</dt>
            <dd>{hoursText(totals.hours)}</dd>
          </div>
          <div>
            <dt>Estimert{supplier.rate ? ` · ${supplier.rate} kr/t` : ''}</dt>
            <dd>{totals.cost === null ? '–' : `${Math.round(totals.cost).toLocaleString('nb-NO')} kr`}</dd>
          </div>
        </dl>
        {own.length > 0 && (
          <>
            <p className="il-answers">
              <AnswerGlyph waits={false} /> {totals.confirmed} bekreftet
              {totals.waiting > 0 && (
                <>
                  <AnswerGlyph waits /> {totals.waiting} venter
                </>
              )}
            </p>
            <div className="il-panel-actions">
              <button onClick={copy} title="Kopier bestillingen som tekst, til å lime inn i en e-post">
                {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {copied ? 'Kopiert' : 'Kopier bestilling'}
              </button>
              <button disabled={!totals.waiting} onClick={() => edits.confirmAll(supplier.id)} title="Sett alle bestillingene som venter til bekreftet">
                Alle bekreftet
              </button>
            </div>
          </>
        )}
      </section>
      <section className="insp-sec">
        <h3 className="insp-h">Bestilling</h3>
        {!own.length && (
          <p className="insp-note">
            Ingen bestilling ennå. {offered.length ? `Velg ${supplier.name} som pensel og dra over dager på ${offered.map((style) => style.label).join(' eller ')}.` : `${supplier.name} har ingen kompetanser ennå.`}
          </p>
        )}
        <OrderDays orders={own} />
      </section>
      <section className="insp-sec">
        <details className="il-offer">
          <summary className="insp-h">Kompetanser og skift</summary>
          <div className="il-tags">
            {competences.map((style) => (
              <button key={style.key} aria-pressed={supplier.competences.includes(style.key)} style={competenceColor(style)} onClick={() => edits.offers(supplier.id, style.key)}>
                <i className="swatch" />
                {style.label}
              </button>
            ))}
          </div>
          <div className="il-tags">
            {SHIFT_IDS.map((shift) => (
              <button key={shift} aria-pressed={supplier.shifts.includes(shift)} onClick={() => edits.shift(supplier.id, shift)}>
                {SHIFT_LABELS[shift]}
              </button>
            ))}
          </div>
        </details>
      </section>
    </div>
  )
}

function Help() {
  return (
    <div className="insp-body il-help">
      <section className="insp-sec">
        <h3 className="insp-h">Tallene</h3>
        <dl>
          <dt>−7,5</dt>
          <dd>Underbemannet: timer som mangler (rødt)</dd>
          <dt>+7,5</dt>
          <dd>Overbemannet: timer over behovet (oker)</dd>
          <dt>Grønt</dt>
          <dd>Ok: dekket, innenfor én person på ett skift</dd>
          <dt>
            <AnswerGlyph waits />
          </dt>
          <dd>Venter på svar fra leverandøren</dd>
          <dt>
            <AnswerGlyph waits={false} />
          </dt>
          <dd>Bekreftet. Bestillinger uten merke i rutenettet er bekreftet.</dd>
        </dl>
      </section>
      <section className="insp-sec">
        <h3 className="insp-h">Grep i rutenettet</h3>
        <dl>
          <dt>Klikk</dt>
          <dd>Åpne dagen</dd>
          <dt>Dra</dt>
          <dd>Velg flere dager</dd>
          <dt>Pensel + dra</dt>
          <dd>Bestill valgt leverandør på dagene som mangler (B, 1–9)</dd>
          <dt>Tøm, Alt+dra</dt>
          <dd>Fjern bestillinger (T)</dd>
          <dt>↑ ↓</dt>
          <dd>Gå til linjen over eller under i kompetansen som er åpen</dd>
          <dt>Delete</dt>
          <dd>Fjern linjen som er valgt i editoren, ellers bestillingene på dagene som er valgt</dd>
          <dt>Esc</dt>
          <dd>Fjern utvalget, legg bort penselen, lukk panelet, fold sammen</dd>
        </dl>
      </section>
      <section className="insp-sec">
        <h3 className="insp-h">Slik fungerer det</h3>
        <ol>
          <li>Klikk en dag på en kompetanse, eller dra over flere. Endringer gjelder alle valgte dager.</li>
          <li>Velg leverandør til penselen, og mal over dagene: det som mangler bestilles, fordelt på prosjektene. Samme leverandør kan ha flere skift.</li>
          <li>Alt starter som «Venter». Registrer svaret: stiller de færre, justerer du antallet, og resten blir udekket igjen.</li>
          <li>Bare bekreftede bestillinger teller i «Tilgjengelig» i planen.</li>
          <li>Leverandørkontrollen viser det som venter på svar. Bekreft der, og kopier bestillingen du sender.</li>
        </ol>
      </section>
    </div>
  )
}

/** The side panel of Innleid: the control of the suppliers' orders, one supplier's order, or the help. It slides in over the grid. */
export function InnleidSidePanel({ onOpenSuppliers }: { onOpenSuppliers: () => void }) {
  const { panel, setPanel, suppliers, waiting } = useInnleid()
  if (!panel) return null
  const supplier = panel.kind === 'supplier' ? suppliers.find((s) => s.id === panel.id) : undefined
  const close = () => setPanel(null)
  if (supplier) {
    return (
      <SidePanel
        label="Leverandør"
        closeTitle="Lukk (Esc)"
        onClose={close}
        actions={
          <button className="ghost icon-button" aria-label="Leverandørkontroll" title="Tilbake til leverandørkontrollen" onClick={() => setPanel({ kind: 'control' })}>
            <ArrowLeft size={16} aria-hidden />
          </button>
        }
        head={
          <>
            <div className="insp-title">{supplier.name}</div>
            <div className="insp-sub">
              <span className="insp-trunc">{supplier.contact || 'Ingen kontakt registrert'}</span>
            </div>
          </>
        }
      >
        <SupplierOrder supplier={supplier} />
      </SidePanel>
    )
  }
  return (
    <SidePanel
      label={panel.kind === 'help' ? 'Hjelp' : 'Leverandørkontroll'}
      closeTitle="Lukk (Esc)"
      onClose={close}
      head={
        <>
          <div className="insp-title">{panel.kind === 'help' ? 'Slik leser og bruker du Innleid' : 'Leverandørkontroll'}</div>
          <div className="insp-sub">{panel.kind === 'help' ? 'Hjelp' : waiting > HOURS_NOISE ? `${hoursText(waiting)} t venter på svar` : 'Alt er bekreftet'}</div>
        </>
      }
    >
      {panel.kind === 'help' ? <Help /> : <Control onOpenSuppliers={onOpenSuppliers} />}
    </SidePanel>
  )
}
