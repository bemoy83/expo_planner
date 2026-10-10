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

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Hands the browser a file to save. */
export const download = (name: string, content: string | Uint8Array, type: string) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([typeof content === 'string' ? content : new Uint8Array(content)], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
