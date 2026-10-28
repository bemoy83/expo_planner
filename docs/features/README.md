# What the app does

What the page does, as built. Moved from CLAUDE.md on 2026-10-23 so that it is read when work touches this part, not in every session; the rules of the code stay in CLAUDE.md.

Six tabs, all in Norwegian: Kalender and Behov, where the planning is done, Resultat, which compares it with the budget, and after a gap the planner's tables in three, Haller (VenYou, Prosjekter, Hallregler), Mannskap (Faste, the page Personell; Innleid, the page Leverandører; Kompetanser) and Oppsett (Produkttyper, Tekstregler, Utelatte artikler). A tab of tables switches its pages in its page header and opens on the page last open in it (`TABS` in `App.tsx`); the VenYou export is read from the head of VenYou, or from Data in the ⚙ menu. The pages:

- [Kalender · Plan](plan.md): the planning rows, the tools, spans and their ends, the hall calendar and the staffing lines.
- [Kalender · Bemanning](bemanning.md): the permanent staff by name against the demand per competence, the brush, runs, absence and the Person panel.
- [Kalender · Bemanning · Innleid](innleid.md): the hours left after the permanent staff, ordered from suppliers.
- [Arbeidsplan](arbeidsplan.md): the day plan and the week plan, the printouts of Bemanning.
- [Behov](behov.md): Visma · gjennomgang and Egen registrering.
- [Resultat](resultat.md): the season against the budget.
- [Haller](haller.md): VenYou, Prosjekter and Hallregler.
- [Oppsett](oppsett.md): Produkttyper, Tekstregler and Utelatte artikler.
- [Mannskap](mannskap.md): Personell, Leverandører and Kompetanser.

Prosjekter, Hallregler, Oppsett, Personell, Leverandører, Kompetanser and the budgets of Resultat are the planner's own tables, and each has «Eksporter» and «Importer fra fil» behind its menu «Fil» (`TableFileMenu` in `ui/TableFile.tsx`, with the reading and the wait for merge or replace in `ui/useTableFile.ts`): the table as an .xlsx file to keep or edit in Excel, read back with merge or replace.

## Phases and work

The words of the docs (the planner, 2026-10-28). A **hall phase** is a phase of a booking in Venyou; a **work phase** is the crew's work for a project, and runs over several of them:

- **Montering** (A) and **Demontering** (D) are the venue's own days, for building and pulling down. They are pressed all the time, and the D of one event and the A of the next often overlap.
- **Innflytting** (MI) and **Utflytting** (MO) are the exhibitors moving in and out. They are the only days in the contract, and are never moved.
- **Arrangement** (E) is the event.
- **Build-up** (opprigg) is done in Montering, and goes on into Innflytting where it is not done in time or where the customer has agreed that the delivery need not stand ready on the first day. Innflytting is otherwise late orders, extra work and customer service.
- **Tear-down** (nedrigg) always begins in Utflytting, carefully, so that the exhibitors are not disturbed, and goes on through Demontering.
- No work is planned on a weekend or a holiday, whatever the phase.

In the app today a row's window is its Montering or Demontering days alone (`domain/windows.ts`), and the engine does not plan tear-down in Utflytting; see [TODO](../TODO.md). The UI still names the work phases «Montering» and «Demontering» (the level «Arbeidsfase», `--mon` and `--dem`); whether it says «Opprigg» and «Nedrigg» is open.

Sources read from files: the Venyou export (`location_format_from-…_to-….xlsx`), Visma exports (`utskrift_visma_….xlsx`), and optionally `Prosjekt.xlsx` (through «Importer fra fil» on Prosjekter) and `Kpier.xlsx` as one-time shortcuts. KPI reads and writes its own file (`import/kpiFile.ts`): «Eksporter» writes the table as .xlsx, and «Importer fra fil» reads that file, or `Kpier.xlsx`, with merge or replace. The Nøkkeltall workbook is not read (2026-10-09); which unit is in use for a product type with several is chosen in the app, or marked «I bruk» in the file.
