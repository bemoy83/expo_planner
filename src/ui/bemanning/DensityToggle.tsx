import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react'

/** The switch between the detailed and the compact lines of a section: one small icon that shows what a click does. */
export function DensityToggle({ compact, onChange }: { compact: boolean; onChange: (compact: boolean) => void }) {
  return (
    <button className="bm-density" aria-pressed={compact} aria-label={compact ? 'Vis detaljert' : 'Vis kompakt'} title={compact ? 'Vis detaljert' : 'Vis kompakt'} onClick={() => onChange(!compact)}>
      {compact ? <ChevronsUpDown size={14} aria-hidden /> : <ChevronsDownUp size={14} aria-hidden />}
    </button>
  )
}
