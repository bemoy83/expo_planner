# UI

Reference: `mockup/Bemanning.html` and `screenshots/`. Look and components follow the Ledger design system already in the repo (`src/styles/tokens.css`, `base.css`, `kalender.css`). Reuse Kalender's classes and patterns wherever one exists: the header, toolbar, sticky label column, `keb` eyebrows, section bars with chevrons (`ksec`/`ksectog`), weekend shading (`--sunken-2`), the selected-day pill (`accent-soft`), toasts, menus and undo buttons from `common.tsx`. New styles go in `src/styles/bemanning.css`, imported after `kalender.css`. Each rule is written once (repo convention).

UI text is Norwegian. Numbers use the numeric font, a decimal comma, and «t» for hours.

## Tab

«Bemanning» sits between «Behov» and «Haller» in the top bar.

## Layout, top to bottom

1. **Page header**: title «Bemanning». The meta line reads `N faste · X % dekket · Y t gjenstår · Z t overtid · helg W t åpent`; parts that are 0 are left out. On the right is the week picker (‹ U42 12.–18. okt ›).
2. **Toolbar**:
   - Undo / Redo.
   - Tools as a segmented control: Velg (V), Pensel (B), Tøm (T).
   - The brush chip (colour + name + ×) with the gesture hints «Klikk hel dag · Shift halv dag · Dra flere · Alt tøm». With no brush, a muted hint takes its place.
   - When there are any, a red «N uløste blokker · Fjern».
   - On the right: «Utvid: Rad | Uke». In row mode only, also «Fold alle / Utvid alle».
3. **Scroll area**. One grid with columns `label 268px | Mon–Fri minmax(136px, 1fr) | Sat, Sun 64px`. The label column sticks to the left.
   - **Sticky top block** (the demand strip):
     - Date row (`keb` «Dato» + week range; day cells as `man / 12`, the focus day as an accent pill). Clicking a day sets the focus day.
     - Section bar «Behov» with a chevron that folds the strip to only the focused competence (`N skjult` when folded). It starts folded when the viewport is under 640 px tall.
     - One row per competence: swatch, name, key number, «N t igjen» for the week. Day cells show the number for remaining hours (or «tildelt / behov»), «av N», and the balance bar (R10). The weekend cells are narrow.
     - «Ledig kapasitet, faste» row (R11).
   - Section bar «Personell» with the count (`6 med Teppefliser` when focused) and the hint «Dobbeltklikk en dag for …».
   - **Pinned editor** (week mode): the open person directly under the section bar.
   - **Person rows**, 46 px. Label: chevron, name, the competence dots (all competences, filled where the person has one, ringed where focused), and the week «assigned/capacity» with a thin bar plus «+OT».

## Day cell, collapsed

- **One block covering the whole normal window**: a full-width bar in the competence colour, reading «Name · hel dag».
- **Several blocks**: a mini timeline over 07–15, with the blocks placed proportionally. Labels: the full name if the block is wide enough, else the short label, else nothing.
- **Partial availability**: hatched where the person is not there, plus a small note («Går 12:00»).
- **Ferie / Kurs / Annet**: a hatched cell with the label in italics.
- **Syk**: a light red cell and a red pill «Syk · N uløst». The blocks are drawn hatched.
- **Overtime on the day**: a small «+N» tag at the top right.
- **Weekend**: a narrow cell. Blocks there show as thin vertical colour bars, plus «+N».

## Focus and brush

- **Picking a competence** sets it as both the *focus* and the *brush* (tool becomes Pensel). There are four ways to pick:
  - click a demand row
  - press its key 1–9
  - click «Mal med …» in the demand popover
  - click a quick-select chip in an open person
- **Focused view**:
  - The other demand rows dim to 40 %.
  - Blocks of other competences dim to 28 %.
  - People without the competence are **hidden** (the alternatives, «Samle nederst» and «Kun dempet», are prefs).
  - The capacity row counts only eligible people.
- **Clearing**: Esc, or × on the brush chip, clears focus and brush.
- **Fold rule**:
  - Picking from the **demand strip** (row or popover) folds every open person and scrolls to the top. This is «zoom out to the next task».
  - Picking from a person's quick-select chips or with the 1–9 keys **never** folds.

## Grid gestures (collapsed cells)

| Gesture | With brush | With eraser (or Alt) | With select |
|---|---|---|---|
| Click | paint full day (R6, may ask) | clear the day | select the cell, set the focus day |
| Shift-click | paint half day | – | – |
| Drag over a rectangle | paint all cells | clear all cells | – |
| Double-click | – | – | open the person (row or week mode) |
| Right-click | menu: Utvid/Fold, Tøm dagen, Meld syk dag, Meld syk ut uka / Friskmeld | | |

- While painting, the hovered cell or dragged rectangle gets an outline in the brush colour (dashed for half day). The demand cell for that day shows a «−N» preview chip before the click.
- Cells the brush cannot fill (ineligible, absent, weekend) show the `not-allowed` cursor.
- The fill/replace question is a small popover at the pointer: «N av dagene har allerede andre oppgaver. Vil du fylle den ledige tiden, eller erstatte alt?» with the buttons Avbryt · Erstatt · **Fyll resten**.

## Demand cell popover

Opened by clicking a demand day cell. It shows:

- Behov / Tildelt / Gjenstår.
- «Ledig hos faste med X: N t».
- «Ikke fullført? Flytt arbeid til <next day>», with an hours field (default 3) and «Flytt til <dag>». This is R12.
- Lukk · **Mal med X**.

## Expanding a person

Two modes, chosen with «Utvid»; the choice is stored in prefs.

**Uke (default), the vertical week editor. One person at a time.**

- Opened by double-clicking a cell, clicking the row label, pressing E, or from the menu.
- The person is **pinned** under the «Personell» bar and the list scrolls to the top. A slim accent ghost row in their place in the list («Redigeres øverst · klikk for å folde sammen») folds it.
- **Label column**:
  - A header with the chevron and name. The whole header is clickable to fold.
  - Quick-select chips for **that person's** competences only (name + key).
  - Normaltid «a / c t» and Overtid «N t».
  - ↑/↓ buttons to step to the previous/next person (also the arrow keys).
  - The hint «Dra en blokk forbi 15:00 for overtid».
  - An hour axis 06–21 with 07 and 15 in bold.
- **Day columns**: a flat, recessed track (`--sunken`, the segmented control's track fill) with faint hour lines.
  - Hatched bands mark overtime before 07 and after 15; the weekend is hatched all the way.
  - The lunch band is finer hatching. 07:00 and 15:00 are drawn as rules.
  - Absent days are hatched with the label; partial days are hatched outside their window.
- **Blocks**: the competence colour, with the name, time, and «N t + N OT». Their overtime parts carry a light diagonal stripe.
  - Top/bottom edges resize; a drag moves; a double-click splits; × or Alt-click deletes.
  - Gestures follow R8. 28 px per hour.

**Rad, the horizontal row timeline. Several people at once.**

- The row grows to 96 px. Each day becomes a 07–15 track with an hour ruler.
- Left/right edges resize; otherwise the gestures are the same as R8, without overtime.

## Sickness flow

1. Right-click a cell → «Meld syk tirsdag» or «Meld syk ut uka». This is one undo step.
2. A toast says «Navn meldt syk dag–dag. N blokker (X t) er tilbake i behovet og merket uløst.» with «Angre».
3. The cells turn light red with «Syk · N uløst». The blocks are hatched. The toolbar shows «N uløste blokker · Fjern».
4. Demand updates at once.
5. «Friskmeld» removes the unavailability, and the blocks become ok again (R7).

## Keys

V select · B brush · T eraser · 1–9 pick a competence · Esc clears the menu → the brush/focus · E opens/folds the selected or open person · ↑/↓ steps person in week mode · Delete/Backspace clears the selected cell · Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z redo · Shift held = half day · Alt held = erase for one stroke (as in Kalender).

## Motion

- Changed numbers in the demand strip slide in (600 ms, `--ease`).
- Bars animate width (280 ms).
- Dimming is 160 ms.
- Nothing else animates.

## Empty and edge states

- **No people yet**: the personnel section shows «Ingen faste registrert» with a button to the Personell table.
- **No demand this week**: the demand rows show «–». The capacity row still shows.
- **A competence in demand that no one has**: the row is shown, and its whole remaining is red.
- **Narrow window** (< 1080 px): the grid scrolls sideways and the label column stays.
- **Short window** (< 820 px): the strip rows compact to 30 px.

## Performance

20–80 people × 7 days. No virtualization is needed for 80 rows. Keep person rows memoized (as `GridRows.tsx`) so a paint updates only the touched rows and the strip.
