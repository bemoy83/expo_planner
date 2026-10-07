# Handoff: Bemanning (personnel allocation)

A new tab in Expo Planner where the planner assigns **permanent staff**, by name, to the **competence hours** the Kalender has planned. Kalender answers *how much work, which competence, which day*; Bemanning answers *who does it, and when*.

This package is the spec for building the tab in `bemoy83/expo_planner`. It follows the repo's conventions (see the repo's `CLAUDE.md`): pure domain logic in `src/domain/` with tests next to it, all mutations through `workspaceStore.tsx`, undoable and persisted to IndexedDB, Norwegian UI text, English code.

## What exists and what does not

| Needed | In the repo today | This spec |
|---|---|---|
| Competence demand per day | Yes, indirectly: `AllocationRow.fte[date]` × `settings.hoursPerDay`, per row competence | Derive it (`RULES.md` R10) |
| Competence list | Free text on `WorkTypeRule`, `DemandLine` and `AllocationRow` | Derived list plus a style table (colour, order, short label) |
| Working day, lunch, overtime band | Only `hoursPerDay: 7.5` | New `WorkdaySettings` |
| Holidays / weekends | `dayType()` in `holidays.ts` | Reused: `helg`/`helligdag` = overtime only |
| People, their competences | **No** | New `Person` table |
| Absence per person | **No** (`CapacityLine` 'unavailable' is FTE, not people) | New `Unavailability` table |
| Assignments (person × day × competence × time) | **No** | New `Assignment` table |
| Moving unfinished work to the next day | **No** | New `DemandAdjustment` table |
| Undo for the new records | `history.ts` pattern | Extend `Change` |

## Files

- `DOMAIN.md`: types, storage, where each value comes from.
- `RULES.md`: the business rules as pure functions, with signatures and worked examples. **Build and test these first.**
- `UI.md`: screen anatomy, states, gestures, keys and visual tokens.
- `ACCEPTANCE.md`: given/when/then checks for review.
- `PHASES.md`: build order in reviewable branches.
- `fixtures/`: the mockup's data as JSON (20 people, 6 competences, week 42 2026). Use it for tests and for building the UI before real people are entered.
- `mockup/Bemanning.html`: the clickable reference. **Not production code**: it is a React-in-browser sketch with global state. Match its look and behaviour, not its structure. Its Tweaks panel holds alternatives. The chosen ones are: ineligible people **hidden**, collapsed multi-block days as a **mini timeline**, demand numbers as **remaining**, expand as **Uke (vertical)**. The row mode stays as a user toggle («Utvid: Rad / Uke»).
- `screenshots/`: key states.

## Scope

In: permanent staff, one ISO week at a time, day and quarter-hour assignments, overtime made deliberately (before 07:00, after 15:00, weekends and holidays), sickness and other absence, moving unfinished hours to the next day, undo.

Out (later): hired staff and trade crews, automatic suggestions, approval or locking, reports, writing Bemanning overtime back into Kalender's staffing lines, import of a staff register.

## Decisions taken in design

1. **Time is the unit, not FTE.** Assignments hold start and end in minutes. FTE appears only where Kalender already uses it.
2. **Normal day 07:00–15:00, lunch 11:00–11:30 unpaid = 7,5 t.** Anything outside, and all of a weekend or holiday, is overtime.
3. **Painting never creates overtime.** Overtime comes only from drawing or dragging in the week editor.
4. **Surplus is allowed** and shown, never blocked.
5. **Sickness**: the person's blocks on those days become *unresolved*. They stay visible, hatched, and their hours go straight back to remaining demand. The planner removes or reassigns them.
6. **Painting over a day with other work** asks: fill the rest, or replace.
7. **Demand and allocation stay separate.** Allocating never changes demand. Only an explicit «Flytt til neste dag» adds an adjustment.
8. **Shared context**: the week and the focus day follow the planner between Kalender and Bemanning.

## Open questions (defaults in brackets; build on the default unless told otherwise)

1. Should an assignment name the project/hall, or only the competence? [Competence only. `projectNo`/`hall` are reserved optional fields so an assignment can later be tied to a Kalender row.]
2. Should a carried hour also show in the Kalender? [Bemanning only for now. The adjustment is its own record, so the Kalender can show it later.]
3. When people exist, should Kalender's «Faste» use the count of active people instead of `settings.baseCrew`? [No. Show a quiet mismatch hint in Bemanning's header.]
4. Competence identity is the normalized text (`trim().toLowerCase()`, as `calc.ts`). If a product type's competence is renamed, people lose it. [Accept; a rename in the competence table rewrites people's keys in one undo step.]
5. Where do people come from? [Manual entry in an editable table on a new «Personell» settings section, plus the fixture for development. An import can follow the repo's merge-or-replace pattern.]
6. Kalender's staffing lines are deferred by the user. Bemanning absence does **not** write `CapacityLine`s. [Keep them apart until the user asks.]
