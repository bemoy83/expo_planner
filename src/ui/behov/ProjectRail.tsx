import { useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'

interface RailItem {
  projectNo: string
  name: string
  /** Beside the name: a count to attend to, hours, or a mark that nothing is left. */
  aside?: ReactNode
  /** Under the name, in a smaller size. */
  sub?: ReactNode
  /** Nothing of the project in this view: its name is muted. */
  off?: boolean
}

export interface RailSection {
  heading?: string
  items: RailItem[]
}

interface Props {
  /** The row for every project at once, with its own aside. */
  all: { label: string; aside?: ReactNode }
  sections: RailSection[]
  projectNo: string
  onPick: (projectNo: string) => void
}

/** The projects of Behov, down the left side of the page in both views: a click opens one, or all of them. */
export function ProjectRail({ all, sections, projectNo, onPick }: Props) {
  const [find, setFind] = useState('')
  const q = find.trim().toLowerCase()
  const found = (item: RailItem) => !q || `${item.name} ${item.projectNo}`.toLowerCase().includes(q)
  return (
    <nav className="rail" aria-label="Prosjekter">
      <label className="rail-search">
        <Search size={14} aria-hidden />
        <input type="search" placeholder="Finn prosjekt" aria-label="Finn prosjekt" value={find} onChange={(e) => setFind(e.target.value)} />
      </label>
      <button className={`rail-item ${projectNo ? '' : 'active'}`} aria-current={!projectNo} onClick={() => onPick('')}>
        <span className="rail-name">{all.label}</span>
        {all.aside}
      </button>
      {sections.map((section, index) => {
        const items = section.items.filter(found)
        if (!items.length) return null
        return (
          <div key={section.heading ?? index}>
            {section.heading && <h4 className="rail-heading">{section.heading}</h4>}
            {items.map((item) => (
              <button key={item.projectNo} className={['rail-item', item.projectNo === projectNo && 'active', item.off && 'off'].filter(Boolean).join(' ')} aria-current={item.projectNo === projectNo} title={`${item.name} ${item.projectNo}`} onClick={() => onPick(item.projectNo)}>
                <span className="rail-name">{item.name}</span>
                {item.aside}
                {item.sub && <span className="rail-sub">{item.sub}</span>}
              </button>
            ))}
          </div>
        )
      })}
    </nav>
  )
}
