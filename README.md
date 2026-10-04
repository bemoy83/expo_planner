# Expo Planner

A browser app for planning crew for exhibition build-up (montering) and tear-down (demontering). It replaces the `Kalender` workbook (`Bemanning_Behov_24 måneder.xlsx`) with:

- a hall calendar,
- staffing capacity, and
- daily FTE allocation per project and competence

all on one continuous date axis, without Excel's limits.

## Development

```bash
npm install
npm run dev     # local dev server
npm test        # unit tests (Vitest)
npm run build   # type check + production build
```

## Docs

- [docs/kalender-workbook.md](docs/kalender-workbook.md) describes how the current workbook works and is the main reference for what to recreate.
- `design_docs/` holds design notes from an earlier attempt. Treat them as background reading, not binding specs.

The source workbooks in `example_data/` contain real customer data and are not committed.
