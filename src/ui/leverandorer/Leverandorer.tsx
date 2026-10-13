import { useMemo, useState } from 'react'
import { competenceStyles } from '../../domain/competences'
import { todayIso } from '../../domain/dates'
import { SHIFT_LABELS } from '../../domain/hire'
import { addSupplier, diffSuppliers, isSupplierNameTaken, mergeSuppliers, removeSupplier, replaceSuppliers, toggleSupplierCompetence, toggleSupplierShift, updateSupplier, type FileSupplier } from '../../domain/suppliers'
import { SHIFT_IDS, type Supplier } from '../../domain/types'
import { useWorkspace } from '../../store/workspaceStore'
import { readLeverandorerWorkbook, writeLeverandorerWorkbook } from '../../import/leverandorerFile'
import { MergeReplaceDialog, MessageBanner, UndoRedoButtons, type Message } from '../common'
import { download, XLSX_TYPE } from '../files'
import { TableFileButtons } from '../TableFile'
import { describeDiff, useTableFile } from '../useTableFile'
import { DataTable } from '../DataTable'
import { count } from '../dom'
import { NumberField, TextField } from '../fields'
import { useTable, type Column } from '../useTable'
import { AddDialog } from '../personell/AddDialog'
import { CompetenceToggles } from '../personell/CompetenceToggles'
import { X } from 'lucide-react'

/** The suppliers people are hired from, and what each of them can send. How the competences are shown is on Kompetanser. */
export function Leverandorer({ onOpenCompetences }: { onOpenCompetences: () => void }) {
  const { workspace, updateStaffing } = useWorkspace()
  const ws = workspace!
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  const suppliers = useMemo(() => ws.suppliers ?? [], [ws.suppliers])
  const styles = useMemo(() => competenceStyles(ws), [ws])
  const found = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? suppliers.filter((s) => `${s.name} ${s.contact ?? ''} ${s.note ?? ''}`.toLowerCase().includes(q)) : suppliers
  }, [suppliers, search])

  const setSuppliers = (change: (suppliers: Supplier[]) => Supplier[]) => updateStaffing((w) => ({ ...w, suppliers: change(w.suppliers ?? []) }))

  /** Suppliers are told apart by their names in a file, so no two have the same. */
  const rename = (supplier: Supplier, name: string) => {
    if (isSupplierNameTaken(suppliers, name, supplier.id)) return setMessage({ kind: 'error', text: `${name} finnes allerede. To leverandører kan ikke ha samme navn.` })
    setSuppliers((list) => updateSupplier(list, supplier.id, { name }))
  }

  const suppliersText = (n: number) => count(n, 'leverandør', 'leverandører')

  const { pending, onFile, done } = useTableFile<FileSupplier[]>({
    read: readLeverandorerWorkbook,
    empty: !suppliers.length,
    takeIn: (incoming, file) => {
      updateStaffing((w) => mergeSuppliers(w, incoming))
      setMessage({ kind: 'ok', text: `${file} lest inn: ${suppliersText(incoming.length)}.` })
    },
    onError: (text) => setMessage({ kind: 'error', text }),
  })

  const apply = (mode: 'merge' | 'replace') => {
    if (!pending) return
    updateStaffing((w) => (mode === 'merge' ? mergeSuppliers(w, pending.incoming) : replaceSuppliers(w, pending.incoming)))
    setMessage({ kind: 'ok', text: `${pending.file} ${mode === 'merge' ? 'slått sammen med leverandørene' : 'har erstattet leverandørene'}. Kan angres med Ctrl/Cmd+Z.` })
    done()
  }

  const diff = pending ? diffSuppliers(ws, pending.incoming) : null

  const remove = (supplier: Supplier) => {
    const orders = (ws.hireOrders ?? []).filter((order) => order.supplierId === supplier.id).length
    const question = orders ? `Slette ${supplier.name}? ${count(orders, 'bestilling', 'bestillinger')} i Bemanning slettes også.` : `Slette ${supplier.name}?`
    if (confirm(question)) updateStaffing((w) => removeSupplier(w, supplier.id))
  }

  const columns: Column<Supplier>[] = [
    {
      key: 'name',
      head: 'Navn',
      text: (supplier) => supplier.name,
      cell: (supplier) => <TextField value={supplier.name} ariaLabel="Navn" onCommit={(name) => name && rename(supplier, name)} />,
    },
    {
      key: 'competences',
      head: 'Kompetanser',
      text: (supplier) => styles.filter((style) => supplier.competences.includes(style.key)).map((style) => style.label),
      cell: (supplier) => <CompetenceToggles styles={styles} held={supplier.competences} owner={supplier.name} onToggle={(key) => setSuppliers((list) => toggleSupplierCompetence(list, supplier.id, key))} />,
    },
    ...SHIFT_IDS.map(
      (shift): Column<Supplier> => ({
        key: shift,
        head: SHIFT_LABELS[shift],
        className: 'center',
        text: (supplier) => (supplier.shifts.includes(shift) ? 'Ja' : 'Nei'),
        cell: (supplier) => (
          <input type="checkbox" checked={supplier.shifts.includes(shift)} aria-label={`${supplier.name} stiller på ${SHIFT_LABELS[shift].toLowerCase()}`} onChange={() => setSuppliers((list) => toggleSupplierShift(list, supplier.id, shift))} />
        ),
      }),
    ),
    {
      key: 'rate',
      head: 'Kr per time',
      className: 'num',
      text: (supplier) => (supplier.rate ? String(supplier.rate) : ''),
      cell: (supplier) => <NumberField value={supplier.rate ?? 0} onCommit={(rate) => setSuppliers((list) => updateSupplier(list, supplier.id, { rate: rate || undefined }))} />,
    },
    {
      key: 'contact',
      head: 'Kontakt',
      text: (supplier) => supplier.contact ?? '',
      cell: (supplier) => <TextField value={supplier.contact ?? ''} ariaLabel="Kontakt" onCommit={(contact) => setSuppliers((list) => updateSupplier(list, supplier.id, { contact: contact || undefined }))} />,
    },
    {
      key: 'note',
      head: 'Notat',
      text: (supplier) => supplier.note ?? '',
      cell: (supplier) => <TextField value={supplier.note ?? ''} ariaLabel="Notat" onCommit={(note) => setSuppliers((list) => updateSupplier(list, supplier.id, { note: note || undefined }))} />,
    },
    {
      key: 'actions',
      className: 'actions',
      cell: (supplier) => (
        <button className="row-action" title={`Slett ${supplier.name}`} onClick={() => remove(supplier)}>
          <X size={13} aria-hidden />
        </button>
      ),
    },
  ]
  const table = useTable(found, columns)

  return (
    <div className="behov">
      <div className="toolbar">
        <input className="search" type="search" placeholder="Søk navn" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="muted small">{suppliersText(suppliers.length)}</span>
        <span className="toolbar-gap" />
        <UndoRedoButtons />
        <TableFileButtons
          exportTitle="Last ned leverandørene som en Excel-fil: en rad per leverandør, en kolonne per skift og en per kompetanse, med x der leverandøren har den."
          importTitle="Les inn en fil med leverandører: en som er eksportert herfra, eller en med kolonnen Navn og en kolonne per kompetanse."
          canExport={suppliers.length > 0}
          onExport={() => download(`expo-planner-leverandorer-${todayIso()}.xlsx`, writeLeverandorerWorkbook(ws), XLSX_TYPE)}
          onFile={onFile}
        />
        <button className="primary" onClick={() => setAdding(true)}>
          + Ny leverandør
        </button>
      </div>

      <MessageBanner message={message} onClose={() => setMessage(null)} />

      <div className="behov-body">
        <p className="hint">
          Leverandørene det leies inn folk fra, til behovet som står igjen etter de faste. <strong>Kompetanser</strong> bestemmer hva en leverandør kan bestilles til: legg til med +, og klikk en
          kompetanse for å ta den bort. <strong>Dag</strong>, <strong>Kveld</strong> og <strong>Natt</strong> er skiftene leverandøren stiller på. Navn, farge og rekkefølge på kompetansene settes på{' '}
          <button className="link" onClick={onOpenCompetences}>
            Kompetanser
          </button>
          .
        </p>
        {suppliers.length ? (
          <DataTable table={table} className="personell" rowKey={(supplier) => supplier.id} empty="Ingen leverandører passer søket eller filteret." />
        ) : (
          <p className="notice">Ingen leverandører registrert ennå. Legg dem inn med «+ Ny leverandør», og gi hver av dem kompetansene de kan stille med.</p>
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
          taken={(name) => isSupplierNameTaken(suppliers, name)}
          onClose={() => setAdding(false)}
          onAdd={(name) => {
            setSuppliers((list) => addSupplier(list, name))
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}
