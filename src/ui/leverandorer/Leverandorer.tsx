import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { competenceStyles } from '../../domain/competences'
import { todayIso } from '../../domain/dates'
import { SHIFT_LABELS } from '../../domain/hire'
import { addSupplier, diffSuppliers, isSupplierNameTaken, mergeSuppliers, removeSupplier, replaceSuppliers, toggleSupplierCompetence, toggleSupplierShift, updateSupplier, type FileSupplier } from '../../domain/suppliers'
import { SHIFT_IDS, type CompetenceKey, type Supplier } from '../../domain/types'
import { useWorkspace } from '../../store/workspaceStore'
import { readLeverandorerWorkbook, writeLeverandorerWorkbook } from '../../import/leverandorerFile'
import { ConfirmDialog, MergeReplaceDialog } from '../common'
import { download, XLSX_TYPE } from '../files'
import { TableFileMenu } from '../TableFile'
import { describeDiff, useTableFile } from '../useTableFile'
import { count } from '../dom'
import { NumberField, TextField } from '../fields'
import { AddDialog } from '../personell/AddDialog'
import { CompetenceChips } from '../personell/CompetenceChips'
import { CompetenceStrip } from '../personell/CompetenceStrip'
import type { TablePage } from '../RegisterHead'

const suppliersText = (n: number) => count(n, 'leverandør', 'leverandører')

/** The suppliers people are hired from, and what each of them can send: competences, shifts and price. */
export function Leverandorer({ head, notify, show }: TablePage) {
  const { workspace, updateStaffing } = useWorkspace()
  const ws = workspace!
  const [search, setSearch] = useState('')
  const [competence, setCompetence] = useState<CompetenceKey | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<{ supplier: Supplier; orders: number } | null>(null)

  const suppliers = useMemo(() => ws.suppliers ?? [], [ws.suppliers])
  const styles = useMemo(() => competenceStyles(ws), [ws])
  const label = (key: CompetenceKey) => styles.find((style) => style.key === key)?.label ?? key
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return suppliers.filter((s) => (!q || `${s.name} ${s.contact ?? ''} ${s.note ?? ''}`.toLowerCase().includes(q)) && (!competence || s.competences.includes(competence)))
  }, [suppliers, search, competence])

  const setSuppliers = (change: (suppliers: Supplier[]) => Supplier[], text: string) => {
    updateStaffing((w) => ({ ...w, suppliers: change(w.suppliers ?? []) }))
    notify(text)
  }

  /** Suppliers are told apart by their names in a file, so no two have the same. */
  const rename = (supplier: Supplier, name: string) => {
    if (!name || name === supplier.name) return
    if (isSupplierNameTaken(suppliers, name, supplier.id)) return show(`${name} finnes allerede. To leverandører kan ikke ha samme navn.`)
    setSuppliers((list) => updateSupplier(list, supplier.id, { name }), `${supplier.name} heter nå ${name}`)
  }

  const drop = (supplier: Supplier, orders: number) => {
    updateStaffing((w) => removeSupplier(w, supplier.id))
    notify(`Slettet ${supplier.name}${orders ? ` og ${count(orders, 'bestilling', 'bestillinger')}` : ''}`)
  }
  const remove = (supplier: Supplier) => {
    const orders = (ws.hireOrders ?? []).filter((order) => order.supplierId === supplier.id).length
    if (orders) setRemoving({ supplier, orders })
    else drop(supplier, 0)
  }

  const { pending, onFile, done } = useTableFile<FileSupplier[]>({
    read: readLeverandorerWorkbook,
    empty: !suppliers.length,
    takeIn: (incoming, file) => {
      updateStaffing((w) => mergeSuppliers(w, incoming))
      notify(`${file} lest inn: ${suppliersText(incoming.length)}`)
    },
    onError: show,
  })
  const apply = (mode: 'merge' | 'replace') => {
    if (!pending) return
    updateStaffing((w) => (mode === 'merge' ? mergeSuppliers(w, pending.incoming) : replaceSuppliers(w, pending.incoming)))
    notify(`${pending.file} ${mode === 'merge' ? 'slått sammen med leverandørene' : 'har erstattet leverandørene'}`)
    done()
  }
  const diff = pending ? diffSuppliers(ws, pending.incoming) : null

  return (
    <>
      {head(
        <TableFileMenu
          exportTitle="Last ned leverandørene som en Excel-fil: en rad per leverandør, en kolonne per skift og en per kompetanse, med x der leverandøren har den."
          importTitle="Les inn en fil med leverandører: en som er eksportert herfra, eller en med kolonnen Navn og en kolonne per kompetanse."
          canExport={suppliers.length > 0}
          onExport={() => download(`expo-planner-leverandorer-${todayIso()}.xlsx`, writeLeverandorerWorkbook(ws), XLSX_TYPE)}
          onFile={onFile}
        />,
      )}
      <div className="op">
        <div className="op-bar">
          <input className="search" type="search" placeholder="Søk navn, kontakt eller notat" value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="muted small">Det leies inn til behovet som står igjen etter de faste.</span>
          <span className="toolbar-gap" />
          <button className="primary" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden /> Ny leverandør
          </button>
        </div>

        {styles.length > 0 && suppliers.length > 0 && (
          <CompetenceStrip
            label="Leverandører med kompetansen"
            styles={styles}
            count={(key) => suppliers.filter((s) => s.competences.includes(key)).length}
            picked={competence}
            onPick={setCompetence}
            alertZero
            title={(style, n) => (n ? `Vis de som stiller med ${style.label}` : `Ingen leverandør stiller med ${style.label}`)}
          />
        )}

        {suppliers.length ? (
          <div className="op-table mk-suppliers">
            <div className="op-row op-head">
              <span>Navn</span>
              <span>Kompetanser</span>
              <span title="Skiftene leverandøren stiller på">Skift</span>
              <span className="num">Kr per time</span>
              <span>Kontakt</span>
              <span>Notat</span>
              <span />
            </div>
            <div className="op-body">
              {shown.map((supplier) => (
                <div key={supplier.id} className="op-row">
                  <span className="mk-name">
                    <TextField value={supplier.name} ariaLabel="Navn" onCommit={(name) => rename(supplier, name)} />
                  </span>
                  <CompetenceChips
                    styles={styles}
                    held={supplier.competences}
                    owner={supplier.name}
                    onToggle={(key, on) => setSuppliers((list) => toggleSupplierCompetence(list, supplier.id, key), `${supplier.name} ${on ? 'kan nå stille med' : 'stiller ikke lenger med'} ${label(key)}`)}
                  />
                  <span>
                    <span className={`mk-shifts ${supplier.shifts.length ? '' : 'want'}`} role="group" aria-label={`Skiftene ${supplier.name} stiller på`}>
                      {SHIFT_IDS.map((shift) => {
                        const on = supplier.shifts.includes(shift)
                        const name = SHIFT_LABELS[shift].toLowerCase()
                        return (
                          <button
                            key={shift}
                            className={on ? 'on' : ''}
                            aria-pressed={on}
                            title={`${supplier.name} stiller ${on ? '' : 'ikke '}på ${name}`}
                            onClick={() => setSuppliers((list) => toggleSupplierShift(list, supplier.id, shift), `${supplier.name}: ${name} ${on ? 'av' : 'på'}`)}
                          >
                            {SHIFT_LABELS[shift]}
                          </button>
                        )
                      })}
                    </span>
                  </span>
                  <span className="op-rate">
                    <NumberField
                      value={supplier.rate ?? 0}
                      placeholder="pris"
                      ariaLabel={`Kr per time for ${supplier.name}`}
                      onCommit={(rate) => setSuppliers((list) => updateSupplier(list, supplier.id, { rate: rate || undefined }), rate ? `${supplier.name}: ${rate.toLocaleString('nb-NO')} kr per time` : `${supplier.name} har ingen pris`)}
                    />
                    {supplier.rate ? <i className="op-per">kr</i> : null}
                  </span>
                  <span className="mk-note">
                    <TextField value={supplier.contact ?? ''} ariaLabel={`Kontakt for ${supplier.name}`} placeholder="Kontakt" onCommit={(contact) => setSuppliers((list) => updateSupplier(list, supplier.id, { contact: contact || undefined }), `Kontakt for ${supplier.name}`)} />
                  </span>
                  <span className="mk-note">
                    <TextField value={supplier.note ?? ''} ariaLabel={`Notat for ${supplier.name}`} placeholder="Notat" onCommit={(note) => setSuppliers((list) => updateSupplier(list, supplier.id, { note: note || undefined }), `Notat for ${supplier.name}`)} />
                  </span>
                  <span className="op-actions">
                    <button className="icon-button" title={`Slett ${supplier.name}`} onClick={() => remove(supplier)}>
                      <Trash2 size={13} aria-hidden />
                    </button>
                  </span>
                </div>
              ))}
              {!shown.length && <p className="op-empty">{competence && !search.trim() ? `Ingen leverandør stiller med ${label(competence)}. Gi en leverandør kompetansen med + i raden.` : 'Ingen leverandører passer søket eller filteret.'}</p>}
            </div>
          </div>
        ) : (
          <p className="op-empty">Ingen leverandører ennå. Legg dem inn med «Ny leverandør», og gi hver av dem kompetansene de kan stille med.</p>
        )}
      </div>

      {pending && diff && (
        <MergeReplaceDialog
          title="Importer leverandører"
          source={pending.file}
          results={[describeDiff('Leverandører', diff), ...(diff.newCompetences.length ? [`Nye kompetanser: ${diff.newCompetences.join(', ')}`] : [])]}
          replaceText={`leverandørene i appen byttes ut med dem i filen, i filens rekkefølge${diff.onlyInApp ? `; ${suppliersText(diff.onlyInApp)} som bare finnes i appen slettes${diff.lostOrders ? `, med ${count(diff.lostOrders, 'bestilling', 'bestillinger')}` : ''}` : ''}`}
          onCancel={done}
          onApply={apply}
        />
      )}

      {adding && (
        <AddDialog
          title="Ny leverandør"
          label="Navn"
          styles={styles}
          taken={(name) => isSupplierNameTaken(suppliers, name)}
          onClose={() => setAdding(false)}
          onAdd={(name, competences) => {
            setSuppliers((list) => addSupplier(list, name, undefined, competences), `La til ${name}`)
            setAdding(false)
          }}
        />
      )}

      {removing && (
        <ConfirmDialog
          title={`Slette ${removing.supplier.name}?`}
          onCancel={() => setRemoving(null)}
          actions={
            <button
              className="danger"
              onClick={() => {
                drop(removing.supplier, removing.orders)
                setRemoving(null)
              }}
            >
              Slett
            </button>
          }
        >
          {count(removing.orders, 'bestilling', 'bestillinger')} i Bemanning slettes også.
        </ConfirmDialog>
      )}
    </>
  )
}
