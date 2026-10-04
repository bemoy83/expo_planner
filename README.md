# Expo Planner

A browser app for planning crew for exhibition build-up (montering) and tear-down (demontering). It replaces the `Kalender` workbook (`Bemanning_Behov_24 måneder.xlsx`) with:

- a hall calendar,
- staffing capacity, and
- daily FTE allocation per project and competence

all on one continuous date axis, without Excel's limits.

## Using it

1. Run `npm run dev` and open the page.
2. Click **Start uten arbeidsbok** to begin empty and read in the sources one by one, or **Importer arbeidsbok** to bring everything over from the planner workbook once. Everything is read in the browser and saved there (IndexedDB). The Kalender's period follows the hall bookings from Venyou.
3. Plan in the Kalender:
   - Type FTE into day cells. Enter moves down, Tab moves right.
   - Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z redoes, for this session. This also covers the Behov tab, including a Visma import.
   - Shift+click or Shift+arrows selects a range, which you can then fill or delete. Ctrl/Cmd+C/V copies and pastes, also to and from Excel.
4. Set up KPI on the **KPI** tab. Work types, units, competences and rates are edited directly in the table. **Importer KPI-filer** can fill it from the mapping (`Nøkkeltall Visma`) and the rates (`Kpier.xlsx`); a later import asks whether to merge with or replace what is there.
5. Keep demand up to date on the **Behov** tab:
   - **Importer Visma-utskrift** replaces the Visma lines of every project in the export. Other projects and your own lines are left alone.
   - Tick **I plan** on the Visma lines you want to plan with; they then count under «Planlagt». Effekt, comments and work types you choose are kept when a newer export is read.
   - **Ny linje** adds your own counts or hours, for example walls the venue provides that nobody ordered.
6. Use **Oppdater haller (Venyou)** to read a new `location_format` export. It replaces the hall bookings in the export's period that have a status found in the export (for example confirmed events), and keeps everything else.
7. Every Venyou event is a project in the Kalender, with or without demand. Its project number connects it to Visma: **Importer prosjektliste** on the **Haller** tab reads `Prosjekt.xlsx` and fills in the number where the name matches, and the rest are typed in per event.
8. On the **Haller** tab, untick hall bookings that should not show in the Kalender, per hall or for a whole event. The choice is kept when a new Venyou export is read.
9. Use **Last ned sikkerhetskopi** regularly. Browser storage is tied to this browser and computer.

## Development

```bash
npm install
npm run dev     # local dev server
npm test        # unit tests (Vitest)
npm run build   # type check + production build
```

## Docs

- [docs/kalender-workbook.md](docs/kalender-workbook.md) describes how the current workbook works and is the main reference for what to recreate.
- `design_docs/` holds design notes from an earlier attempt. Treat them as background reading, not binding specs.

The source workbooks in `example_data/` contain real customer data and are not committed.
