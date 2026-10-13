# Conflicts — ask the user before implementing

These session decisions may change behaviour or visuals that already exist in the app. **The current app build wins by default.** For each item: check the app; if it already behaves as described, there is nothing to do; if it differs, **ask the user** and quote the item number. Do not change existing behaviour on your own.

| # | Decision from this session | Likely affects in the app | If not approved |
|---|---|---|---|
| C1 | **Avvik three states** (DESIGN-RULES §6b): under = `--danger` scale 22→85 %, ok = flat `--committed` 20 %, over = `--draft` scale 18→55 %, over and under share one scale (red wins at equal size). Kalender ok band = 0…+1 FTE. Legend 3 swatches. Reference: `kalender-avvik/KalenderGrid v9.jsx` (`heatStyle`, `capRow` avvik branch). | Kalender Avvik heat row (`heatStyle`: red / yellow «stramt» < 2 FTE / green scaled by spare). | Keep the app's heat map in Kalender; use the three states in Innleid only. |
| C2 | **Signed numbers, zero blank**: `+x` for positive deviation, `−x` negative (U+2212), no number at 0 (colour only). | Kalender Avvik values (unsigned positives, «0» shown). | Keep Kalender as is. |
| C3 | **Band hue per sub-mode**: Bemanning · Faste = gran (`--vh 195 / --vc .06`), Bemanning · Innleid = fjord (`235 / .065`). | `html[data-vmode]` hue; the app may use one Bemanning hue. | Use the app's Bemanning hue for Innleid too. |
| C4 | **Slide-over side panel** (absolute, over the grid, shadow, 200 ms slide-in, closed by default, Esc/× closes). | Docked inspector (grid shrinks by 340 px). | Use the docked inspector. |
| C5 | **Popover dismissal**: the first mousedown outside a popover only closes it (event swallowed, also its click); Esc closes; Enter closes the answer popover. | Existing popovers/menus that let the outside click through. | Apply only to the new Innleid popovers. |
| C6 | **`Ferdig` button**: ink fill + `--v-band` text (exception to «band hue only in the band»). | Primary button style. | Use the app's primary button. |
| C7 | **Waiting chip in the toolbar** is a surface chip (ink text + clock glyph), not `--al-warn`. Ochre is reserved for «over». | Band alert chips (`ps-otw`, `--al-warn`). | Only matters if C1 is approved; otherwise use the app's warning chip. |
| C8 | **Weekends**: ordering on weekends is allowed; only days with zero rest demand are skipped by the brush. | v1 R6 paints `arbeidsdag` only (Faste). | Follow the app's workday rule. |
| C9 | **Kalender «Innleid» row**: derived from confirmed Innleid orders (Σ conf × shift hours / hoursPerDay per day) instead of typed input. | `HIRED` readout/input in Kalender. | Keep it as input; Innleid is separate. |
| C10 | **Hours, not FTE, in Innleid**: coverage and Avvik in Innleid speak hours (7,5 t per day shift); Kalender keeps FTE. | Any shared formatter/units. | Ask which unit. |
| C11 | **Today line at the left edge** of today's column. | Kalender v9 already draws it at `400 + TODAY × W` — likely no change. | — |

If an item is approved, update `DESIGN-RULES.md` in the repo accordingly; if rejected, delete the matching line from §6b/§6c so the docs match the build.
