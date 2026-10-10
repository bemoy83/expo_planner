import { useRef } from 'react'
import { takeFile } from './files'

interface Props {
  /** What the file holds, for the tooltip of «Eksporter». */
  exportTitle: string
  /** What a file to read must hold, for the tooltip of «Importer fra fil». */
  importTitle: string
  /** False while the table is empty: there is nothing to export. */
  canExport: boolean
  onExport: () => void
  onFile: (file: File) => unknown
}

/** The two buttons of a table the planner keeps as a file: «Eksporter» writes it as .xlsx, «Importer fra fil» reads one back. */
export function TableFileButtons({ exportTitle, importTitle, canExport, onExport, onFile }: Props) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <button onClick={onExport} disabled={!canExport} title={`${exportTitle} Ta vare på filen som kopi, eller rediger den i Excel og les den inn igjen.`}>
        Eksporter
      </button>
      <button onClick={() => input.current?.click()} title={`${importTitle} Har tabellen innhold, velger du om filen slås sammen med den eller erstatter den.`}>
        Importer fra fil
      </button>
      <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => takeFile(e, onFile)} />
    </>
  )
}
