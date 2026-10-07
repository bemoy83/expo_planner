# Build order

One branch per phase (repo convention: work on a branch, push, report; the user merges). Each phase ends with `npx tsc -b`, `npm test` and `npm run lint` green.

## 1. Data model and storage

`bemanning/model`

- The types from `DOMAIN.md`, `WorkdaySettings` defaults, and Dexie `version(3)`.
- Load, save and clear; backup and restore.
- `history.ts` deltas for the new tables, and `writeStaffing()`.
- A dev-only loader for `fixtures/` (behind a query flag or a button under Innstillinger in dev builds). It is **not** shipped as data.

Done: D24 and D25 for empty and fixture data, and the existing tests are untouched.

## 2. Rules

`bemanning/rules`

- `src/domain/staffing.ts` with R1–R15 and `staffing.test.ts` covering D1–D23.
- Demand derivation from `allocations` (R10) is tested against a small hand-built workspace and, as a "(local data)" test, against the real Kalender data.

Done: every D-check passes; there is no UI yet.

## 3. People and competences

`bemanning/personell`

- An editable table (like the Behov/Produkttyper ledgers): name, competences (multi-select from the derived list), active, note.
- Competence styles: label, short label, colour, order, with drag to reorder.
- Placement: a new «Personell» section under Innstillinger, or its own tab (ask the user; default Innstillinger).

Done: people can be added, edited and deactivated, all undoable.

## 4. Read-only Bemanning

`bemanning/view`

- The tab, the header with totals, the demand strip, the capacity row, and person rows with collapsed cells (all variants in UI.md).
- The shared `planningFocus` between Kalender and Bemanning.

Done: U1, and every cell state visually matches the mockup with fixture data.

## 5. Painting

`bemanning/paint`

- The tools, brush/focus, hiding ineligible people, the paint/half/rectangle/erase gestures and the fill-or-replace question.
- The preview chip, the context menu (without sickness), keys and undo.

Done: U2–U5, U9, U10.

## 6. Hour editing

`bemanning/hours`

- The week editor (pinned, ghost row, quick-select chips, ↑/↓, overtime) and the row timeline mode with the toggle in prefs.
- R8 gestures in both.

Done: U6, U7.

## 7. Reality updates

`bemanning/reality`

- Sickness and other absence from the context menu, plus an absence editor per person (date range + kind + optional part of day).
- Unresolved display and «Fjern uløste».
- The demand popover with carry.

Done: U8, D19–D23 through the UI, U11, U12.

## Later (not in this handoff)

- Hired staff and trade crews.
- Automatic suggestions (`source: 'suggested'`) using the same `paintDays` / assignment model.
- Tying assignments to Kalender rows (`projectNo` / `hall`).
- Showing carried hours in Kalender.
- Feeding Bemanning overtime into Kalender's staffing lines when the user asks for them.
