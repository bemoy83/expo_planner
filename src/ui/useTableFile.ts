import { useState } from 'react'
import type { TableDiff } from '../domain/tableDiff'
import { errorText } from './files'

/** A file that has been read and waits for the planner to say whether it is merged into the table or replaces it. */
export interface PendingFile<T> {
  file: string
  incoming: T
}

/**
 * Reading a file into one of the planner's tables: `read` turns it into rows, and a table with nothing to merge with
 * (`empty`) takes them in at once (`takeIn`). Else the file waits as `pending`, for the dialog that asks whether to
 * merge or replace; `done` puts it away. A file that cannot be read gives `onError` what is wrong with it.
 */
export function useTableFile<T>({ read, empty, takeIn, onError }: { read: (bytes: Uint8Array) => T; empty: boolean; takeIn: (incoming: T, file: string) => void; onError: (text: string) => void }) {
  const [pending, setPending] = useState<PendingFile<T> | null>(null)
  const onFile = async (file: File) => {
    try {
      const incoming = read(new Uint8Array(await file.arrayBuffer()))
      if (empty) takeIn(incoming, file.name)
      else setPending({ file: file.name, incoming })
    } catch (e) {
      onError(errorText(e))
    }
  }
  return { pending, onFile, done: () => setPending(null) }
}

/** What a file would change in a table, as a line of the dialog. `changed` says what a changed row is, where «endret» does not. */
export const describeDiff = (label: string, diff: TableDiff, changed = 'endret'): string => `${label}: ${diff.added} nye, ${diff.changed} ${changed}, ${diff.unchanged} like, ${diff.onlyInApp} bare i appen`
