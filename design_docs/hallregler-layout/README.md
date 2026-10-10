# Hallregler – UI layout suggestion (for review)

A **suggestion** to compare against the current `src/ui/behov/HallRules.tsx`. Not a spec: keep what works today, adopt what improves the workflow. The domain is unchanged (`locations.ts`, `areas.ts`, `HallRules` type, file import/export). Everything below is layout and presentation, plus a few read-only derived counts.

Reference mockup: `Hallregler-reference.html` (offline, open in a browser; sample data, not real rules).

## Problems with the current page
1. It opens with a long paragraph on precedence, then four stacked tables. You read before you can act.
2. The real job, placing texts that land in «Mangler hall», can't be done here. It happens in the Plassering column on Behov.
3. There's no feedback: you can't see what a rule catches, rules that never fire, or choices that match nothing.
4. Områder (display only) sits among the rules that decide where demand counts.
5. Disabled «Legg til» explains itself only in a tooltip. Overlapping halls between collecting places are invisible.

## Suggested layout
**Header:** keep it, with the status as the description: «N linjer mangler hall · M tekster å plassere». Actions as today: ← Behov, undo/redo, Eksporter, Importer.

**Body:** two columns, the work area plus a 340px sticky side panel. Below ~980px the panel stacks under the work area.

**Work area:** one table at a time, picked with a segmented control:
`Uplassert (n) · Valg for tekster (n) · Steder (n) · Ordregler (n)` │ `👁 Områder (n)`.
Områder sits behind a separator with an eye icon, marked as display only. Each tab has a single-sentence lede instead of the paragraphs.

### Side panel: «Prøv en tekst» + the precedence chain
- An input for the text plus a project select. The result shows live: «→ C · ordregel nr. 1».
- The chain lists the five steps in order, each with a line count from the current demand:
  1. Valg i prosjektet
  2. Valg i alle prosjekter
  3. Navnet på en hall eller et sted
  4. Første ordregel som passer
  5. Mangler hall
- The step that placed the tested text is highlighted, and the steps before it are dimmed. Clicking a step opens its tab.
- The spelling rule («Hall» foran, case, spaces, hyphens) is a one-line note under step 3.
- Footnote: Områder don't change where demand counts.

This replaces the opening paragraph: the precedence is shown, not described.

### Tab: Uplassert (new, default when n > 0)
- Rows are texts resolving to `UNRESOLVED_HALL`, grouped by normalised text, sorted by hours.
- Columns: checkbox · text (click to test in the panel) · projects · linjer · timer · «Plasser i» (place select + scope toggle `Alle prosjekter | Bare prosjektet / Hvert prosjekt`) · «Ordregel…» link.
- Picking a place commits immediately through `withChoice`. The row leaves the list and a toast shows «… teller under X · Angre».
- Bulk: ticking rows shows an inverse bar «n tekster · plasser i [select] [scope] · Plasser».
- «Ordregel…» adds a word rule pre-filled with the text, switches to Ordregler and focuses the new row.
- Empty state: «Alt er plassert».

### Tab: Valg for tekster
- Tools: search (text or place), a filter (all / all-projects only / per project), «Bare ubrukte», and «Fjern ubrukte (n)».
- Columns: text · Gjelder (editable select) · Teller under (editable place select) · linjer · remove.
- Choices that match no current demand line show an «Ubrukt» badge.

### Tab: Steder
- The name is editable inline. Halls are toggle chips in the row (all halls visible), not a popover list.
- Where a collecting place higher up already takes a hall, the chip has a dashed border with the tooltip «B1 telles under B, som står over».
- The Samler checkbox is labelled with its state (Samler / Hver for seg). There's a line count per place.
- `PROJECT_HALLS` is a locked row with a one-line explanation.
- Add with a dashed «+ Nytt sted» button that inserts an editable row, instead of the always-present input row.

### Tab: Ordregler
- Drag handle plus the existing up/down buttons. Columns: nr · word (inline edit) · teller under · linjer · status.
- Under the word, a muted list of the texts this rule actually places.
- Status badges:
  - «Skygget av nr. k»: the word matches texts, but an earlier step or rule always wins.
  - «Ingen treff»: the word matches nothing in current demand.

### Tab: Områder
- Same row pattern as Steder (name plus hall chips; dashed chip where a higher area already holds the hall).
- An «Uten område» row lists the halls in no area.

## Derived data needed (read-only, from existing functions)
- Per demand line: `placeOf` result, plus which step and which rule/choice. `placeOf` may need to return the step and rule index if it doesn't already.
- Counts per step, per choice, per place and per word rule; texts per word rule; the shadowing check.

## Open for review
- Should Uplassert live here, on Behov, or both? Today Plassering on Behov creates choices.
- Is per-project vs all-projects the right default scope when placing? The mockup defaults to all projects.
- Do toggle chips scale to the real hall count? If there are more than ~20 halls, keep the popover picker.
