import type { ReactNode } from 'react'

export interface RailItem {
  projectNo: string
  name: string
  /** Beside the name: a count to attend to, or a mark that nothing is left. */
  aside?: ReactNode
  /** Under the name, in a smaller size. */
  sub?: ReactNode
  /** How much of the project is done, from 0 to 1, as a thin bar under it. */
  done?: number
}

interface Props {
  /** The row for every project at once, with its own aside. */
  all: { label: string; aside?: ReactNode }
  heading?: string
  items: RailItem[]
  projectNo: string
  onPick: (projectNo: string) => void
}

/** The projects of a view of Behov, down the left side of the page: a click opens one, or all of them. */
export function ProjectRail({ all, heading, items, projectNo, onPick }: Props) {
  return (
    <nav className="rail" aria-label="Prosjekter">
      <button className={`rail-item ${projectNo ? '' : 'active'}`} aria-current={!projectNo} onClick={() => onPick('')}>
        <span className="rail-name">{all.label}</span>
        {all.aside}
      </button>
      {heading && <h4 className="rail-heading">{heading}</h4>}
      {items.map((item) => (
        <button key={item.projectNo} className={`rail-item ${item.projectNo === projectNo ? 'active' : ''}`} aria-current={item.projectNo === projectNo} title={`${item.name} ${item.projectNo}`} onClick={() => onPick(item.projectNo)}>
          <span className="rail-name">{item.name}</span>
          {item.aside}
          {item.sub && <span className="rail-sub">{item.sub}</span>}
          {item.done !== undefined && (
            <span className="rail-bar" aria-hidden>
              <i style={{ width: `${Math.round(item.done * 100)}%` }} />
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}
