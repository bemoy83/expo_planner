import { useRef } from 'react'
import { ChevronDown, Download, Upload } from 'lucide-react'
import { Menu } from './common'
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

/** The file of a table the planner keeps, behind one menu: «Eksporter» writes it as .xlsx, «Importer fra fil» reads one back. */
export function TableFileMenu({ exportTitle, importTitle, canExport, onExport, onFile }: Props) {
  // Outside the menu, which is gone once it closes: the file dialog answers the input after that.
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Menu
        label={
          <>
            Fil <ChevronDown size={12} aria-hidden />
          </>
        }
        title="Tabellen som Excel-fil: last den ned, eller les inn en"
        className="ghost"
        align="right"
      >
        {(close) => (
          <>
            <button role="menuitem" disabled={!canExport} title={`${exportTitle} Ta vare på filen som kopi, eller rediger den i Excel og les den inn igjen.`} onClick={() => (close(), onExport())}>
              <Download size={14} aria-hidden /> Eksporter
            </button>
            <button role="menuitem" title={`${importTitle} Har tabellen innhold, velger du om filen slås sammen med den eller erstatter den.`} onClick={() => (close(), input.current?.click())}>
              <Upload size={14} aria-hidden /> Importer fra fil …
            </button>
          </>
        )}
      </Menu>
      <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => takeFile(e, onFile)} />
    </>
  )
}
