# Acceptance, v2

v1 checks in `staffing.test.ts` (D1–D23) still apply, except D11–D12 (replace mode), which no gesture uses. Deferred checks are in `DEFERRED.md`.

Fixture: the mockup's data (`mockup/planner-data.js` for Kalender rows, `mockup/plan-staff-data.js` for people and seed assignments), or `domain/staffingFixture.ts`.

## Mode and zoom (U)

- P1 Plan mode renders as Kalender does today, except the «Plan · Bemanning» toggle in the plan bar.
- P2 With project «Hage 2026» in the filter, switching to Bemanning sizes columns so 19.–28. okt fills the visible width (80–160 px per day) and scrolls 19. okt to the left edge.
- P3 With no project, Bemanning restores the last range seen in Bemanning; the first time, the 10 days from Plan's left edge.
- P4 Leaving Bemanning returns to Plan's S/M/L zoom centred on the middle day that was visible.
- P5 The switch animates column width over about 460 ms with no jump in scroll position; the toggle shows the target mode at once; with reduced motion it is instant.
- P6 The focus day set in either mode is the focus day in the other (`planningFocus`) and inside the visible range after switching.
- P7 The Bemanning tab, week picker and week editor are gone; the Personell tab remains.

## Header (D/U)

- D30 `demand(vegger, d)` equals Σ Vegger rows' `fte[d] × 7,5`. Editing an FTE cell in Plan mode changes Bemanning's Vegger row on that day immediately.
- B26 Scrolling Bemanning from 5. okt to late October changes the project list from «VVS, Studentmessen» to «Hage, Matmessen, Oslo Motor Show» without changing the block's height.
- B27 A project at the right edge does not flicker in and out when scrolling ±1 day; leaving rows fade out. Project labels are not clickable.
- B29 Kompakt makes each competence row 14 px; a day with 30 t demand and 15 t assigned shows a line half solid (right half); an over-covered day shows the red hatch; the choice survives reload.
- B30 Kompakt on Prosjekter makes rows 12 px with 6 px text-less phase bars; hovering a bar shows «Prosjekt · Fase»; the choice is independent of Kompetanse's and survives reload.
- B34 Clicking a demand cell picks the brush, sets the focus day and opens the moved-hours popover; carrying and taking back hours work as in v1.

## Painting (D/U)

- D33 Paint never replaces: a day with VEG 07–11 painted Tepper (full) yields VEG 07–11 + TEP 11:30–15.
- D34 Half paint on an empty day yields 07:00–11:00; on a day whose morning is taken, 11:30–15:00.
- B1 Dragging a selection across Mon–Fri for five rows draws one outline spanning all five columns and rows, even when the pointer passes under the open side panel.
- B2 The pill shows the number of days that will get time, the total added hours, and people count; «halv dag» with Shift; «N hoppes over» for ineligible cells.
- B3 Erase selection: red outline; blocks inside become grey dashed outlines; release removes them (one undo step).
- B4 Esc during a drag cancels with no change.

## Unfolded person (D/U)

- D36 Moving a block to a day where the person has an overlapping block is refused and state is unchanged.
- B5 Dragging in an empty track 13:00→17:00 on a workday creates a block 13:00–17:00 with 2 h overtime; the folded cell badge reads «+2».
- B6 Only one person is unfolded at a time; ↑/↓ moves the unfold; clicking a competence row label folds it.
- B33 Label column: header with name and ↑/↓, hour totals, competence list with period hours per competence (sick days excluded), hint at the bottom edge.

## Person panel and absence (D/U)

- B31 Clicking a person's name opens the Person panel with overtime per week and absence periods.
- B35 «+ Legg til fravær» in the panel with Ferie 21.–23. okt writes three day records; the panel shows one period «Ferie · 21.–23. okt»; editing it to 21.–22. removes the 23rd. There is no absence modal.
- D46 «Meld syk» from tir 20. to fre 23. makes those days sick; «Friskmeld fra tor 22.» removes 22.–23.; blocks follow the v1 unresolved rule.

## Moving, copy and paste (D/U)

- D45 Copying Anders + Bjørn Mon–Wed and pasting at the next Monday creates the same blocks a week later for the same people, only in free time; absent days are skipped and counted.
- D48 Dragging Anders' Tuesday (VEG 07–15) in a folded row to Thursday moves it; to Bjørn's Thursday moves it when Bjørn has Vegger and is free, else it is refused; ⌥ copies. One undo step each.
- B23 Velg-drag selection persists, ⌘C shows «Kopiert · ⌘V», hovering shows ghost previews at the target, ⌘V pastes, Esc clears the selection but keeps the clipboard.
- B32 With Velg, clicking a cell selects it; clicking it again clears the selection.
- B36 While dragging a block between days, the target shows the ghost; ineligible targets show the not-allowed hatch.

## Focus day, overtime, visual (D/U)

- D47 Setting the overtime limit to 2 t flags Anders' week 41 (3 t overtime) in the row label, the plan bar chip and the Person panel.
- B11 Painting, erasing and dragging never move the focus day.
- B13 Hovering a person cell tints that day's date and demand column; leaving the grid clears it.
- B37 The focus day shows only as the header date pill; no workspace column is tinted.
- B14 Sick days: red hatch and red «Syk» label; ferie/kurs: neutral hatch. Same hatch geometry.
- B15 Overtime badge is an inverted pill and goes under the sticky label column when scrolled.
- B16 With «Navn på blokker = Fullt», a full-day block at ≥ 105 px shows «Vegger» without hours; narrower shows «VEG».
- B17 No selected state uses an outlined box except the selected-block ring (both «Farget» and «Hevet nøytral» preferences).
