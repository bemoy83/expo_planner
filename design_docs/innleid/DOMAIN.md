# Domain — Innleid

Everything here is **new** unless the app already has it (check first; if it does, the app's model wins and this file only lists the fields the UI reads).

## 1. Supplier
`{ id, name, competences: CompetenceId[], shifts: ShiftId[], rate: number /* kr per hour */, contact: string }`
- `competences` drives eligibility: only suppliers offering a competence appear under «Tilbyr …» and can brush it.
- Editable in the supplier panel («Kompetanser og skift») and the competence matrix.

## 2. Order
`{ id, supplierId, competence, date, fte: number /* people */, start: minutes, end: minutes, conf: number | null, asked?: number }`
- `conf = null` → Venter; otherwise Bekreftet with `conf = fte`.
- `asked` is set only when a supplier confirmed fewer than requested; shown as «av N» in the order list, never on the grid.
- `end < start` means overnight (Natt 23–07).
- Same supplier + competence + date + start + end is one order (RULES I5).

## 3. Shifts
`Dag 07:00–15:00`, `Kveld 15:00–23:00`, `Natt 23:00–07:00` (all 7,5 t paid), plus «Egen tid» (any start/end, 30-min snap). Use the app's shift settings if they exist.

## 4. Persistence
New tables `suppliers`, `orders` (one row per order per day). Needs a database version bump — **ask before migrating**. Undo is per gesture, as in Bemanning.

## 5. Inputs from existing data
- Rest demand per competence × date = Plan demand − Faste assigned (`dayBalance.remaining`), in hours. Read-only here.
- Competence list, colours and order: `staffedCompetences`, `competenceStyles`.
- Date range: Kalender range (`calendarRange`).

## 6. Not modelled (open)
Delivery status of the order (sent / seen), per-change history, multi-planner locking, supplier capacity limits (the mockup's `max` field is unused).
