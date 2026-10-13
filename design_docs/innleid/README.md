# Handoff: Bemanning · Innleid — covering rest demand with suppliers (UI guide)

**Place this package in the repo at `design_docs/innleid/`.**

## The scope, in one sentence

**Add the Innleid sub-mode to Bemanning: the planner covers the competence demand that is left after Faste (own staff) by ordering people from suppliers, tracks each supplier's answer, and sees one Avvik row that says under / ok / over per day.**

## Ground rules for the implementer

1. **The current app build trumps everything in this package.** Where the app already has a component, rule, token or behaviour that covers a need, use it as it is. This package describes *what* the planner must see and do, not new code to copy.
2. **Reuse first, invent last.** `REUSE.md` maps every part of the design to the existing app code it should be built from. New logic is only written where `REUSE.md` marks it **New**.
3. **Ask before changing existing behaviour.** Every design decision from this session that would change something already built is listed in `CONFLICTS.md`. **Do not implement any of them without asking the user first.** If you find another contradiction that is not listed, stop and ask as well.
4. The HTML in `mockup/` is a **design reference**, not production code. It is a single-file React prototype with in-memory data and `localStorage`; recreate it with the app's own components, store and domain functions.

## Fidelity

**High-fidelity** for layout, type, spacing, colour use and interaction. Colours are DS tokens (`rgb(var(--token))`), not hex: use the app's tokens with the same names. Measurements in `UI.md` are exact for the mockup at 116 px day width.

## What the planner does

1. **Sees what is left.** Under «Restbehov etter faste», one row per competence shows, per day, a coverage bar and the signed hours still missing (`−22,5`) or over (`+15`). Covered = full bar, no number.
2. **Reads one summary row.** «Avvik» above the competences: red (under, darker = more), flat green (ok), ochre (over). A clock glyph marks days where some order still waits for an answer.
3. **Orders.** Click a day (or drag across days) on a competence → the label column unfolds into an editor for that competence and those days. «+ Leverandør» adds a supplier that offers the competence; count is pre-filled to cover what is missing. Per order row: supplier, shift, count, answer, remove.
4. **Records answers.** Each order is `Venter` (default) or `Bekreftet`. If a supplier can send fewer, the planner confirms and lowers the count; the rest becomes uncovered again. There is no partial state.
5. **Brush shortcut.** Pick a supplier (toolbar or supplier row) and drag across days to order them on every short day in the range. `Tøm` / ⌥-drag removes.
6. **Sends the order.** The supplier panel lists the order per day with a copyable text summary and «Alle bekreftet».

## Read in this order

1. `README.md` (this file)
2. `CONFLICTS.md` — **decisions that need the user's go-ahead before building**
3. `REUSE.md` — what to build each part from
4. `UI.md` — screens, components, exact values, interactions
5. `RULES.md` — coverage, Avvik, ordering and answer rules (pure functions)
6. `DOMAIN.md` — suppliers and orders; what is new in the model
7. `ACCEPTANCE.md` — checks against the mockup fixture
8. `DESIGN-RULES.md` — grid/line/band rules (§6b Avvik colour, §6c Innleid are from this session)
9. `mockup/Bemanning Innleid v7.html` — clickable reference. `kalender-avvik/KalenderGrid v9.jsx` shows the three-state Avvik applied to Kalender's `capRow` (see CONFLICTS C1).
10. `screenshots/` — 8 reference states (overview light/dark, editor, answer popover, supplier menu, brush preview, erase preview, supplier panel). **Reference only: where a screenshot and `UI.md` disagree, `UI.md` wins; where either disagrees with the app, the app wins.**

## Design decisions (this session)

1. Demand-first: the work surface is the rest-demand rows, not supplier rows. Time of day does not affect coverage; only who, how many and which shift.
2. Signed hours everywhere: `−` missing, `+` over/booked, nothing when ok. Persons appear only on order chips and in the order.
3. Avvik has three states, green means *ok* only (never «lots of spare capacity»). Over is shown from the first hour (number), coloured over only past the tolerance.
4. Two answer states. A short answer is recorded as the real headcount; the original request is kept as `asked` for the order only.
5. Waiting is shown by shape (clock glyph, ink), not colour; confirmed carries no mark.
6. Grid chip = count + full supplier name; shift is order detail. One supplier's shifts on a day merge into one chip when folded.
7. Side panel is a slide-over; help sits behind `?`.
8. Popovers: first outside click only closes; Enter/Esc close; `Ferdig` confirms.

## Open developer decisions (not designed — decide with the user)

1. **Data flow.** Rest demand = Plan demand − Faste allocation (`dayBalance.remaining`). Should confirmed Innleid feed Kalender's «Innleid» readout row (today an input, `HIRED`)? See CONFLICTS C9.
2. **Order delivery.** Copy text exists. Email / supplier portal / PDF is not designed.
3. **Multiple planners.** Two planners ordering on the same competence/day: locking or last-write-wins?
4. **History.** Who changed an answer and when (`asked` is the only history kept in the mockup).
5. **Scale.** Many suppliers (> 9 breaks the 1–9 brush shortcut and the toolbar supplier picker) and long seasons: search in the supplier menu, virtualised day columns.

## Mockup notes

- Data: `mockup/innleid-data.js` (12 days, 9 competences, 5 suppliers, 11 seed orders incl. one ok day, tir 6, and one over day, ons 7). Stored in `localStorage` key `innleid-v7b`.
- Icons are inlined Lucide (`innleid-icons.js`) so the mockup runs offline; use the app's icon component.
- Light/Mørk toggle in the header is a mockup control only.
