import type { ChangeEvent } from 'react'

export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Copies the chosen files before clearing the input; the input's own list empties when it is reset. */
export const takeFiles = (e: ChangeEvent<HTMLInputElement>, handle: (files: File[]) => unknown) => {
  const files = [...(e.target.files ?? [])]
  e.target.value = ''
  handle(files)
}

/** As `takeFiles`, for an input that takes one file. Nothing happens when none was chosen. */
export const takeFile = (e: ChangeEvent<HTMLInputElement>, handle: (file: File) => unknown) =>
  takeFiles(e, ([file]) => file && handle(file))
