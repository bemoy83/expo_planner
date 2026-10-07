/**
 * Gathers the records changed in one event and writes each of them once, when the event is over.
 * A fill or paste over many days changes the same row once per cell; only the row as it ended up is written.
 */
export const writeQueue = <T extends { id: string }>(write: (records: T[]) => Promise<unknown>) => {
  let open: { records: Map<string, T>; done: Promise<unknown> } | null = null
  return {
    /** Resolves when the record, as it is at the end of the event, is written. */
    put(record: T): Promise<unknown> {
      if (!open) {
        const records = new Map<string, T>()
        const done = Promise.resolve().then(() => {
          open = null
          return records.size ? write([...records.values()]) : undefined
        })
        open = { records, done }
      }
      open.records.set(record.id, record)
      return open.done
    },
    /** A record deleted in the same event must not be written back. */
    drop(id: string) {
      open?.records.delete(id)
    },
  }
}
