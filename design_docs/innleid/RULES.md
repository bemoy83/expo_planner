# Rules — Innleid

Pure functions, in the style of `src/domain/staffing.ts` (suggested home: `src/domain/hire.ts` + `hire.test.ts`). Mockup equivalents are named in brackets (`InnleidV7.jsx`, `InnleidApp v7.jsx`).

Units: hours. `H(order)` = paid hours of the order's shift = `paidHours(start, end)` (duration − 30 min if ≥ 6 h; Dag 07–15 = 7,5 t). Numbers are formatted with one decimal, comma, no trailing `,0` (`fmtH`).

## I1 Coverage per competence × day  [`vCov`]

Input: `R` = rest demand hours after Faste (`dayBalance.remaining` × hours), `list` = orders for that competence and day.

- `P` (planned) = Σ `fte × H` over all orders (waiting counts as planned).
- `C` (confirmed) = Σ `fte × H` over orders with `conf ≠ null`.
- `rem = R − P`.
- `tol` = smallest `H` among the orders (0 if none).
- State: `none` if `R ≤ 0` and no orders; `short` if `rem > 0,01`; `ok` if `−rem < max(0,01, tol)`; else `over`.
- Display: `short` → `−rem`; `over` → `+(−rem)`; `ok`/`none` → no number.
- Bar (only when `R > 0`): confirmed part `min(100, C / R)`; waiting part `(P − C) / R`, capped at the rest.

## I2 Avvik per day  [Avvik row in `InnleidApp v7.jsx`]

Over all competences shown that day:
- If no competence has demand or orders → empty cell.
- `short` = Σ `rem` of competences in `short`. If `> 0,01`: state **under**, value `−short`.
- Else if any competence is `over`: state **over**, value Σ `max(0, −rem)`.
- Else **ok**, value Σ `max(0, −rem)` (shown only if `> 0,01` — «no hidden hours»).
- `pending` = Σ hours of waiting orders that day; `> 0,01` shows the waiting glyph.
- Fill (CONFLICTS C1): under `mix(--danger, 22 + s·63 %)`, `s = min(1, −v / maxUnder)`, text white if `s > 0,5` else `--danger`; over `mix(--draft, 18 + t·37 %)`, `t = min(1, v / max(maxUnder, maxOver))`, text ink; ok `mix(--committed, 20 %)`, text `--committed`. `mix(c, p)` = `color-mix(in oklab, c p%, canvas)`; `maxUnder`, `maxOver` ≥ 1 over the visible range.
- Label column: `−Σshort t` or `✓`.

## I3 Pre-filled count  [`planRun`]

For a supplier and a set of days: pick the first of the supplier's shifts not already ordered from that supplier on those days (else its first shift). For each day in `short`: `fte = max(1, ceil(rem / H − 1e−6))`. If no day is short: «+ Leverandør» in the editor orders every selected day with `fte = 1` (an extra supplier); the brush (strict) orders nothing.

## I4 Brush  [`cellDown` / `up` / `addRun(…, strict)`]

Drag across days on one competence with a supplier picked: on release, run I3 strict for the range, then open the editor on that range with the new orders selected. Only suppliers that offer the competence can brush it (others show `not-allowed`). Days with no rest demand are skipped. ⌥-drag (or `Tøm` tool) removes orders in the range — all suppliers, or the picked one.

## I5 Merge duplicates  [`vNorm`]

Orders with the same supplier, competence, day, start and end merge: `fte` adds; `conf` = null if either is null, else adds. Apply after every change.

## I6 Answer  [`setConf`, `setGot`]

- `Venter` → `conf = null`.
- `Bekreftet` → `conf = fte`.
- Fewer people («Stiller n av asked»): `asked = asked ?? fte`, `fte = n`, `conf = n`, `1 ≤ n ≤ asked`. The missing hours return to I1 as `short`.
- No partial state exists. Data imported with `conf < fte` is normalised: `conf > 0` → `fte = conf`, `asked = old fte`; `conf = 0` → waiting.

## I7 Count change  [`crew`]

`fte ± 1`, min 1. Raising a confirmed order sets it to waiting (`conf = null`, `asked` cleared) — it is a new question to the supplier. Lowering keeps it confirmed (`conf = fte`).

## I8 Groups in the editor  [`vGroups`]

Within the selected days of one competence, orders group by `supplier + start + end`. A group's actions apply to every order in it. Group state = `Venter` if any order waits. «Fyll» copies the group to selected days that lack it, using the median `fte`.

## I9 Order text  [`VOrder.copy`]

```
Bestilling – {supplier}
{wd} {d}. {month}
  {competence}: {fte} pers. {HH:MM}–{HH:MM}
```
Days ascending; within a day by competence order, then start time.

## I10 Totals

- Toolbar «N dager udekket» = days where I2 is under. Click → open the first such day on the first short competence.
- Toolbar «x t venter på svar» = Σ `(fte − (conf ?? 0)) × H` over all orders. Click → supplier panel of the first waiting order.
- Neither shows when zero; both zero → «Alt dekket og bekreftet».
