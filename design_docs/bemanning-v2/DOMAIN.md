# Domain model, v2

The model in the app (`src/domain/types.ts`, database version 3) holds. v2 needs **no schema change**.

## Assignment
Unchanged (`id, personId, date, competence, start, end, source, projectNo?, hall?`). v2 does not set `projectNo` or `hall` (tagging is deferred) and adds no `note`.

## No week scope
Bemanning reads and writes assignments for the **whole Kalender range** (`calendarRange`). Week-based queries in `ui/bemanning/week.ts` become range-based; ISO-week totals stay for row labels and the overtime limit.

## Unavailability
Unchanged: one record per person and day. Ranges are a UI concept (R35): the Person panel groups consecutive days of the same kind into periods and writes a range as one record per day.

## Shared planning context
- `planningFocus` (v1) stays: the one focus day of both modes (R23, R29).
- New prefs: `planMode`, `bemanningRange`, `projectDensity`, `demandDensity`, `overtimeLimitPerWeek` (UI §11).

## Competence list
As in the app (`staffedCompetences`, `competenceStyles`). The mockup's five competences are fixture only.

## Clipboard
Transient UI state, not persisted: `{ items: { personId, dayOffset, blocks: { competence, start, end }[] }[] }`.
