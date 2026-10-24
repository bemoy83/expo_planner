import { Children, type CSSProperties, type ReactNode } from 'react'

/** A key figure on the band: a label, the figure with its unit, and a line under it. What follows the figure, as a meter, is its children. */
export function Figure({ label, value, unit = 't', sub, children }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="band-figure">
      <span className="band-figure-label">{label}</span>
      <span className="band-figure-value">
        <b>
          {value}
          {unit && <small>{unit}</small>}
        </b>
        {children}
      </span>
      {sub && <span className="band-figure-sub">{sub}</span>}
    </div>
  )
}

/** The key figures of a page as the lower half of its band (Resultat, Behov): a column each, side by side. */
export const BandFigures = ({ children }: { children: ReactNode }) => (
  <div className="band-figures" style={{ '--figures': Children.toArray(children).length } as CSSProperties}>
    {children}
  </div>
)
