# Acceptance — Innleid

Fixture: `mockup/innleid-data.js` + the seed in `mockup/InnleidApp v7.jsx` (orders b1–b11; b9–b11 add an ok day and an over day). Day shift = 7,5 t. Today = tor 8. okt.

Screenshots (reference, `UI.md` wins): A1–A6 `screenshots/01-overview-light.jpg`, dark `02-overview-dark.jpg` (A21); A9 `05-supplier-menu.jpg`; editor `03-editor-row-selected.jpg`; A15/A17 `04-answer-popover.jpg`; A11 hover preview `06-brush-preview.jpg`; A12 `07-erase-preview.jpg`; A19–A20 `08-supplier-panel.jpg`.

## Coverage and Avvik
- A1 Vegger tor 8: rest 30 t, Manpower 4 confirmed → full bar, no number.
- A2 Vegger tir 13: rest 60 t, no orders → `−60`, empty bar; folded label total includes it.
- A3 Tir 6 Avvik: flat green, no number (Vegger 2 + Elektro 1 confirmed cover 22,5 t exactly).
- A4 Ons 7 Avvik: ochre `+15` (Elektro 3 × 7,5 against 7,5 t) — and Vegger/Rigg covered.
- A5 Fre 9 is darker red than tor 8; `+15` on ons 7 is lighter than a `−15` would be (shared scale).
- A6 A day with any waiting order shows the clock glyph in the Avvik cell; tooltip states the waiting hours.
- A7 Lowering a confirmed order from 4 to 3 on a day with rest 30 t turns that day's cell to `−7,5` and Avvik red; the order list shows «3 av 4».
- A8 Over by less than one shift-person (e.g. +3,5 t) is ok-coloured but shows `+3,5`.

## Ordering
- A9 Click Vegger man 12 → editor opens on man 12; «+ Leverandør» lists Manpower, Nordic Crew, StandBygg under «Tilbyr Vegger», Adecco and Elkraft disabled.
- A10 Picking a supplier fills the count to cover the rest (`ceil(rem / 7,5)`), status Venter.
- A11 Brush Manpower, drag Vegger man 12 → ons 14: orders on all three short days, editor opens on the range with the new orders selected; days with no rest demand are skipped.
- A12 ⌥-drag across Vegger removes orders in the range; with a supplier picked in Tøm, only that supplier's.
- A13 Same supplier, two shifts on one day → one chip when folded (count summed), two rows in the editor.
- A14 Raising a confirmed order's count sets it to Venter.

## Answers and popovers
- A15 Answer popover: Venter / Bekreftet only; Bekreftet shows «Stiller n av asked».
- A16 Clicking outside an open popover closes it and does not select a day or press anything (C5 if approved).
- A17 Enter or Ferdig closes the answer popover; Esc closes any popover.

## Toolbar and panel
- A18 Toolbar shows «N dager udekket» (red) and «x t venter på svar» (neutral); neither wraps.
- A19 Panel is closed on load; supplier label click opens the supplier panel and picks the brush; `?` opens help; Esc closes.
- A20 «Kopier bestilling» copies the I9 text; «Alle bekreftet» confirms all waiting orders of the supplier in one undo step.

## Rules
- A21 Light and dark: chip text ≥ 4,5:1 on its fill; Avvik numbers readable on every heat step.
- A22 DESIGN-RULES checklist §7 passes for the new rows.
