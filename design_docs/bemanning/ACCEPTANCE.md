# Acceptance

Run against `fixtures/` (week 42 2026, Monday 12 Oct). Default workday. Each item is one check; domain checks (D) become unit tests, UI checks (U) are verified in the browser or with component tests.

## Hours and overtime (D)

- D1 `paidHours(07:00–15:00)` is 7,5; `(10:00–12:00)` is 1,5.
- D2 On a workday, `overtimeHours(13:00–17:00)` is 2; on Saturday, `(08:00–12:00)` is 4.
- D3 For the defaults, `paidHours(dayStart, dayEnd)` equals `settings.hoursPerDay`.

## Availability (D)

- D4 Hanne Johansen, Wed–Fri ferie: `normalWindows` is empty; `editableWindows` is empty.
- D5 Mona Olsen, Friday, unavailable 12:00–15:00: `normalWindows` is [07:00–12:00]; `editableWindows` is the same.
- D6 Anyone, Saturday: `normalWindows` is empty; `editableWindows` is [06:00–21:00].

## Painting (D)

- D7 Given Geir Isaksen (Møbler, Extra), when Teppefliser is painted on Monday, nothing changes.
- D8 Given Anders Berg, Wednesday, empty, when Teppefliser is painted full, one block 07:00–15:00 results, and `assigned(teppefliser, Wed)` rises by 7,5.
- D9 Given Per Solberg, Tuesday (TEP 07–11, FOGA 11:30–15), when Innredning is painted full with fill, nothing changes. With replace, one Innredning 07:00–15:00 results.
- D10 Given Hanne, Monday, empty: a half paint of Teppefliser gives 07:00–11:00. A second half paint gives 11:30–15:00. A third does nothing.
- D11 Given Anders, Saturday, when painted, nothing changes (painting never creates overtime).
- D12 Painting a 3 × 4 rectangle that includes ineligible and absent cells changes only the eligible, available cells, in one undo step.
- D13 After any mutation, no person has overlapping assignments on a date (invariant helper).
- D14 Two adjacent Teppefliser blocks 07:00–11:00 and 11:00–13:00 merge into one block.

## Balance (D)

- D15 `remaining(teppefliser, Mon)` equals 37,5 − assigned. With the fixture assignments that is 37,5 − 30 = 7,5.
- D16 Assigning above demand gives a negative `remaining`, shown as «+N». Nothing is blocked.
- D17 A block 13:00–17:00 on Tuesday counts 4 h in `assigned` and 2 h in `assignedOT`.
- D18 `uncoverable` is greater than 0 only when `remaining` exceeds the free normal hours of eligible people.

## Sickness (D)

- D19 Given Anders with TEP Mon and Tue, when he is marked sick Mon–Fri, both blocks are `unresolved`, and `remaining(teppefliser)` rises by 7,5 on Mon and on Tue.
- D20 When the sickness on Tuesday is taken back, the Tuesday block is `ok` again without being recreated.
- D21 «Fjern uløste» deletes exactly the unresolved blocks, in one undo step.

## Carry (D)

- D22 Carrying 3 h Teppefliser from Tuesday adds an adjustment on Wednesday. `demand(teppefliser, Wed)` rises by 3; Tuesday is unchanged.
- D23 Carrying from Friday puts the demand on Saturday, and it shows under «Helg åpent».

## Persistence and undo (D/U)

- D24 Every mutation above is one undo step. Undo then redo restores the same state, and IndexedDB matches after a reload.
- D25 A backup holds persons, unavailability, assignments, adjustments and competence styles; a restore brings them back.

## UI (U)

- U1 Opening Bemanning from Kalender with Wednesday 14 Oct selected shows week 42, with Wednesday as the focus day. Selecting Thursday in Bemanning and going back to Kalender shows Thursday selected.
- U2 Pressing 1 sets the focus and brush to the first competence. People without it are hidden, and the «Personell» bar reads «N med X».
- U3 Hovering an eligible cell with the brush shows a «−N» chip on that day's demand cell. Clicking it makes the remaining number drop with the slide-in animation.
- U4 Shift-hover shows a dashed outline, and the chip shows the half-day hours.
- U5 Clicking a demand row while a person is open in week mode folds the person and scrolls to the top. Clicking a quick-select chip in the open person does not fold.
- U6 In week mode, dragging a block's bottom edge from 15:00 to 17:00 gives a striped overtime part and «7,5 t + 2 OT». The person's Overtid reads 2 t, the header shows «2 t overtid», and the collapsed cell shows «+2».
- U7 ↑/↓ steps the pinned person without the list jumping. The ghost row marks the person's place.
- U8 Right-click → «Meld syk ut uka» shows the toast with «Angre», red cells, hatched blocks and «N uløste blokker».
- U9 Painting a cell that holds another competence asks Fyll resten / Erstatt / Avbryt. A cell holding only the same competence fills silently.
- U10 Undo/redo buttons and keys work across all of the above.
- U11 With the viewport under 640 px tall, the demand strip starts folded to the focused competence.
- U12 Dark mode follows the app setting, and every state stays legible.
