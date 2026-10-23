import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Copy, Paintbrush } from 'lucide-react'
import { dayText, type ISODate } from '../../domain/dates'
import { groupKey, isWaiting, orderText, shiftText, SHIFT_LABELS, supplierOrders, supplierTotals } from '../../domain/hire'
import { SHIFT_IDS, type HireOrder, type Supplier } from '../../domain/types'
import { useBemanning } from '../bemanning/BemanningScope'
import { hoursText } from '../bemanning/week'
import { SidePanel } from '../common'
import { competenceColor, count } from '../dom'
import { useInnleid } from './InnleidScope'
import { AnswerGlyph } from './OrderPopovers'
import { pushTo } from '../../domain/collections'

/** How long «Kopiert» stands on the button after the order is copied, in milliseconds. */
const COPIED_MS = 1600

/** A supplier's order: what it is ordered for per day, with the answer of each, a text of it to send, and what it offers. */
function SupplierOrder({ supplier }: { supplier: Supplier }) {
  const { styles, onShowDate, projectName } = useBemanning()
  const { orders, wd, tool, brush, pickTool, edits, openOn, pick } = useInnleid()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])
  const competences = [...styles.values()]
  const own = supplierOrders(supplier, orders, competences)
  const byDay = new Map<ISODate, HireOrder[]>()
  for (const order of own) pushTo(byDay, order.date, order)
  const totals = supplierTotals(supplier, orders, wd)
  const offered = competences.filter((style) => supplier.competences.includes(style.key))
  const copy = () => navigator.clipboard.writeText(orderText(supplier, orders, competences, projectName)).then(() => setCopied(true))
  const show = (order: HireOrder) => {
    openOn(order.competence, order.date)
    pick(groupKey(order.supplierId, order))
    onShowDate(order.date)
  }
  return (
    <div className="insp-body">
      {tool === 'paint' && brush?.id === supplier.id && (
        <div className="insp-sec il-brush-on">
          <Paintbrush size={14} aria-hidden />
          <span>Pensel: dra over dager på {offered.length ? offered.map((style) => style.label).join(', ') : 'en kompetanse'}.</span>
          <button className="link" onClick={() => pickTool('select')}>
            Legg bort
          </button>
        </div>
      )}
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

/** What every supplier offers: a tick per supplier and competence. Only a supplier with the competence can be ordered for it. */
function Matrix({ onOpenSuppliers }: { onOpenSuppliers: () => void }) {
  const { styles } = useBemanning()
  const { suppliers, edits, openSupplier } = useInnleid()
  const competences = [...styles.values()]
  return (
    <div className="insp-body">
      <section className="insp-sec">
        <p className="insp-note">Hva hver leverandør kan stille med. Bare leverandører med kompetansen kan bestilles til den. Klikk et navn for bestillingen.</p>
        {suppliers.length > 0 ? (
          <table className="il-matrix">
            <thead>
              <tr>
                <th />
                {suppliers.map((supplier) => (
                  <th key={supplier.id}>
                    <button className="link" onClick={() => openSupplier(supplier.id)}>
                      {supplier.name}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {competences.map((style) => (
                <tr key={style.key} style={competenceColor(style)}>
                  <th>
                    <i className="swatch" /> {style.label}
                  </th>
                  {suppliers.map((supplier) => (
                    <td key={supplier.id}>
                      <input type="checkbox" checked={supplier.competences.includes(style.key)} aria-label={`${supplier.name} tilbyr ${style.label}`} onChange={() => edits.offers(supplier.id, style.key)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="insp-empty">Ingen leverandører er registrert ennå.</p>
        )}
        <button className="link il-to-suppliers" onClick={onOpenSuppliers}>
          Navn, kontakt og pris settes på Mannskap › Innleid
        </button>
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
          <dt>Shift+klikk</dt>
          <dd>Utvid utvalget</dd>
          <dt>Pensel + dra</dt>
          <dd>Bestill valgt leverandør på dagene som mangler (B, 1–9)</dd>
          <dt>Tøm, Alt+dra</dt>
          <dd>Fjern bestillinger (T)</dd>
          <dt>← → ↑ ↓</dt>
          <dd>Flytt dager og linje. Shift utvider.</dd>
          <dt>‹ ›</dt>
          <dd>Forrige og neste dag som mangler timer, for kompetansen</dd>
          <dt>+ −</dt>
          <dd>Flere eller færre personer</dd>
          <dt>Enter</dt>
          <dd>Svar fra leverandøren</dd>
          <dt>Esc</dt>
          <dd>Legg bort verktøy, lukk panel, fold sammen</dd>
        </dl>
      </section>
      <section className="insp-sec">
        <h3 className="insp-h">Slik fungerer det</h3>
        <ol>
          <li>Klikk en dag på en kompetanse, eller dra over flere. Endringer gjelder alle valgte dager.</li>
          <li>«+ Leverandør» fyller det som mangler. Samme leverandør kan ha flere skift.</li>
          <li>Alt starter som «Venter». Registrer svaret: stiller de færre, justerer du antallet, og resten blir udekket igjen.</li>
          <li>Bare bekreftede bestillinger teller i «Tilgjengelig» i planen.</li>
          <li>Åpne en leverandør for bestillingen du sender.</li>
        </ol>
      </section>
    </div>
  )
}

/** The side panel of Innleid: a supplier's order, what every supplier offers, or the help. It slides in over the grid. */
export function InnleidSidePanel({ onOpenSuppliers }: { onOpenSuppliers: () => void }) {
  const { panel, setPanel, suppliers } = useInnleid()
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
          <button className="ghost icon-button" aria-label="Alle leverandører" title="Alle leverandører: hva hver av dem tilbyr" onClick={() => setPanel({ kind: 'matrix' })}>
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
      label={panel.kind === 'help' ? 'Hjelp' : 'Leverandører'}
      closeTitle="Lukk (Esc)"
      onClose={close}
      head={
        <>
          <div className="insp-title">{panel.kind === 'help' ? 'Slik leser og bruker du Innleid' : 'Kompetansematrise'}</div>
          <div className="insp-sub">{panel.kind === 'help' ? 'Hjelp' : count(suppliers.length, 'leverandør', 'leverandører')}</div>
        </>
      }
    >
      {panel.kind === 'help' ? <Help /> : <Matrix onOpenSuppliers={onOpenSuppliers} />}
    </SidePanel>
  )
}
