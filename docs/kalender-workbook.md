# How `Bemanning_Behov_24 måneder.xlsx` works today

> The app does not read this workbook (import removed 2026-10-08). This document is kept as background: the rules for required hours, daily need and staffing in `src/domain/` were modelled on what is described here.

This is a read-only inspection of the 3.7 MB workbook (16 sheets, 26 tables), with a focus on the `Kalender` sheet.

## 1. The Kalender sheet, top to bottom

The window is frozen at **Q70**. The date header, the hall calendar and the staffing summary stay pinned while you scroll the allocation rows. Columns A–P are pinned as row labels.

| Rows | Block | How it works |
|---|---|---|
| 2–6 | **Date axis** | 730 day columns from the start year and month in A3:B3 (currently Jan 2026 to Dec 2027). The rows show week number, month, weekday, date, and day type (`Arbeidsdag`, `Helg` or `Helligdag`). Day type is looked up in the holiday list on `variabler`. Weekends, holidays and today get colour formatting. |
| 8–35 | **Hall calendar** ("Lokasjon") | 21 halls (A1, B1–B4, C, D1, D2, E, GLASS, GREEN, MEET5–7, MEZ, STUDIO2–4, STUDIO-N, VEST, ØST), taken as a sorted unique list from `tabell_venyou`. Each cell lists the event names in their *Event* period plus phase codes `A`, `MI`, `MO` and `D` (Assembly, Moving in, Moving out, Dismantle), coloured by phase. Rows 17–35 are grouped and collapsed, so only the 9 main halls normally show. |
| 39–62 | **Capacity** ("Belastning"), collapsed | **Faste (FTE)** = `fte_fulltid` (**21**) on workdays. **Innleid (FTE)** is hired help entered per day. Per-trade external crews (Teppeleveranser, Møbler & innredning, FOGA, Print, Banner, Design, Snekker, Extra, Gangtepper) are also entered per day. **Overtid**: headcount × hours ÷ 7.5, kept separately for permanent and hired staff. **Unavailable**: Fravær (absence), Bemanningsmargin (staffing margin), Admin. 134 cell comments hold notes such as who or what a hired-help day is for. |
| 64–67 | **Staffing summary** ("Bemanning") | **Planlagt dagsbehov** = sum of every allocation cell that day. **Tilgjengelig bemanning** = normal time + overtime − unavailable. **Avvik** = available − need, shown with a colour scale. |
| 69–1493 | **Resource allocation** (`tabell_ressursallokering`) | 1,424 rows across 104 projects. Each row is **project × reference year (DATA FRA) × competence (Nøkkelområde) × phase (Montering/Demontering) × data basis (DATAGRUNNLAG)**. You type **FTE per day** into the date cells, usually 0.5–8 per cell. There are 2,206 filled cells, about 6,120 FTE-days in total. |

### Allocation row columns

| Column | Meaning | Source |
|---|---|---|
| PROSJEKT | Event name | Dropdown of project names |
| PROSJEKT_NR | e.g. `26970` | XLOOKUP in the `Prosjekt` register |
| PROSJEKT_ID | Series, e.g. `970` | Last 3 digits |
| DATA FRA | Which year's demand to use, e.g. `2024` | Dropdown limited to years that exist for this series |
| PROSJEKT_DATA | e.g. `24970` | Reference year + series |
| NØKKELOMRÅDER, ARBEIDSFASE, DATAGRUNNLAG | Competence, phase, data basis | Dropdowns limited to what exists for that reference occurrence |
| TIMER | Required hours | `SUMIFS(Tabell_oppgaver[MONTERING or DEMONTERING], PROSJEKTNR = PROSJEKT_DATA, competence, data basis)` |
| FTE BEHOV | Required FTE-days | TIMER ÷ 7.5 |
| FTE PLAN | Allocated FTE-days | Sum of the row's day cells |
| DELTA BEHOV | Difference | PLAN − BEHOV (highlighted when over) |
| PLANLAGT START / SLUTT | First and last allocated day | Derived |

**Day-to-day use:** you hide rows to focus on one project. Right now only VVS 2026's 20 rows are visible out of 1,424. Demolition (Demontering) cells are coloured differently from assembly cells.

## 2. What feeds it

- **`Tabell_oppgaver`** is the demand ledger: 5,685 rows covering 2023–2027. Each row has project number, source (`visma per reg. dato` 3,753, `Timeregistrering` 868, `visma historikk` 603, `Opptelling/hallkart` 204 …), work type, quantity, unit, stand, hall, competence, data basis (`Historikk Antall` 3,539, `Historikk Timer` 859, `Planlagt` 765 …), an EFFEKT factor, and **MONTERING / DEMONTERING hours**.
- **`tabell_venyou`** is the pasted Venyoo export (861 rows) plus helper columns.
- **`Prosjekt`** is the name → project number register.
- **`variabler` / `datavalidering`** hold settings: holidays, weekday and month names, `fte_fulltid` = 21, `normaltid` = 7.5, `fravær` = 0.05, overhead = 10%.
- **Side reports:**
  - `Resultatside`: per-project hall-days by phase, halls used, and budget vs planned hours including overhead.
  - `oppsummering`: daily need vs base crew, with a line chart.
  - `status_bemanning_uke`: weekly status.
  - `Sum oppgaver`, `Timebudsjett`, `Tabell_budsjett_arbeidstimer`: budget hours.

## 3. Where the old design docs drifted from how you actually work

| Topic | Workbook (actual) | Old docs |
|---|---|---|
| What you type | **FTE per day** | Person-hours, with FTE display-only |
| Base crew | **21** FTE | 17 |
| Capacity | Permanent + hired + per-trade crews + overtime − absence/admin/margin, entered per day | Only a pooled crew; everything else deferred |
| Choosing the demand basis (year + data basis per competence and phase) | **Core, every day** | Deferred to a later "Demand Management" page |
| Demand source | The curated `Tabell_oppgaver` ledger (Visma, time registration, counts, manual) | Raw Visma conversion only |

## 4. Excel limits the app can remove

- The fixed 730-column horizon.
- Very heavy per-cell FILTER/SUMPRODUCT formulas for the hall calendar.
- Hiding rows by hand to focus on one project.
- Cascading dropdowns built from helper sheets.
- Name-based XLOOKUPs.
- 3.7 MB of formulas.

## 5. Suggested first slice

Recreate the **Kalender** as a browser app, starting from this workbook's own data:

1. Import `tabell_venyou`, `Prosjekt`, `Tabell_oppgaver` and the current allocation rows from the workbook, so the app opens with your real plan.
2. Build a pinned header (dates and day types), the hall calendar, the capacity and staffing summary, and a scrollable allocation grid with a project filter instead of hidden rows.
3. Add allocation rows through project → year → competence → phase → basis pickers. Required hours are looked up automatically. You type FTE into day cells.
4. Data is saved in the browser, with export and import of a backup file.

Raw Visma conversion, budgets and reports come after that.
