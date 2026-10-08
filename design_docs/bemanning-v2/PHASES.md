# Build order, v2 (migration of the built Bemanning)

One branch per phase. Each ends with `npx tsc -b`, `npm test`, `npm run lint` green. v1 phases 1–7 are built; v2 rebuilds the Bemanning UI inside Kalender and reuses `staffing.ts`, the store and `bemanning.css`.

> **Goal:** one Plan surface. Phases 1–4 deliver the merge; 5–7 complete it. Ship after 4 if needed.

## 1. Mode switch and range — `plan/mode`
«Plan · Bemanning» toggle in `KalenderBar`/`PlanBar`; `planMode` pref; zoom fit and range memory (R18), animated switch (R28); focus day across modes (R29). Bemanning reads the whole `calendarRange`. Done: P1–P6.

## 2. Bemanning header — `plan/header`
Prosjekter in view (R37) with Detalj/Kompakt; Kompetanse rows (summed, R10) with Detalj/Kompakt and v1's «Uten behov» folding; demand-cell click opens v1's day popover (R12). Done: D30, B26, B27, B29, B30, B34.

## 3. Person rows and painting — `plan/people`
Move v1's folded person rows, painting, erase and unresolved handling into the Kalender grid (`ui/bemanning/PersonRow.tsx`, `dayCell.ts`). Selection outline and pill, pointer hit-testing, auto-scroll. Done: D33–D34, B1–B4, B14–B16.

## 4. Unfolded person — `plan/hours`
Pinned row with vertical tracks across all days, create/move/resize, move across days (R19), label column (totals, competence list, hint). **Remove** the Bemanning tab, week picker and week editor. Done: D36, B5, B6, B33, P7.

## 5. Person panel and absence — `plan/panel`
Person view only (UI §7); absence form inline in the panel replacing `AbsenceDialog` (R35); context menu entries (UI §9). Done: B31, B35, D46.

## 6. Drag between days, copy and paste — `plan/move`
Folded-row drag and drop (R38), Velg selection and clipboard (R34). Done: D45, D48, B23, B32, B36.

## 7. Focus day, overtime limit, polish — `plan/polish`
Focus day pill only (R23, no column tint), crosshair, overtime limit (R36), selection-style pref, motion. Done: D47, B11, B13, B17, B37.

## Performance notes
- Memoize person rows; a hover or drag update should re-render only the affected rows, the selection overlay and the pill. The mockup re-renders everything on every pointer move.
- Compute `buildBalance` for the range once per change, not per cell.
- Crosshair: toggle classes or a CSS variable, not page-level React state.
- R37: use the scroll event (rAF-throttled) and a ResizeObserver, not the mockup's polling.
- 20–80 people × the Kalender range is fine without virtualization if rows are memoized; the range is longer than v1's week, so measure.
