/** What a file would change in one of the planner's tables, counted in rows. */
export interface TableDiff {
  added: number
  changed: number
  unchanged: number
  /** Rows in the app that the file does not have: kept when merging, removed when replacing. */
  onlyInApp: number
}

/**
 * Counts what a file would change: its rows against those of the app, matched by `key` and held alike by `same`.
 * A row the file has twice is counted once, as its first.
 */
export const diffBy = <T,>(app: T[], file: T[], key: (item: T) => string, same: (a: T, b: T) => boolean): TableDiff => {
  const known = new Map(app.map((item) => [key(item), item]))
  const seen = new Set<string>()
  const diff: TableDiff = { added: 0, changed: 0, unchanged: 0, onlyInApp: 0 }
  for (const item of file) {
    const k = key(item)
    if (seen.has(k)) continue
    seen.add(k)
    const before = known.get(k)
    if (before === undefined) diff.added += 1
    else if (same(before, item)) diff.unchanged += 1
    else diff.changed += 1
  }
  diff.onlyInApp = [...known.keys()].filter((k) => !seen.has(k)).length
  return diff
}
