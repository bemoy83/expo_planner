import type { CompetenceKey, CompetenceStyle } from '../../domain/types'
import { competenceColor } from '../dom'

interface Props {
  /** What the counts are of: «Faste med kompetansen». */
  label: string
  styles: CompetenceStyle[]
  /** How many of the rows have the competence. */
  count: (key: CompetenceKey) => number
  picked: CompetenceKey | null
  onPick: (key: CompetenceKey | null) => void
  /** The tooltip of a competence, by how many have it. */
  title: (style: CompetenceStyle, n: number) => string
  /** A count of 0 asks for attention, as a competence nobody can be assigned to. */
  alertZero?: boolean
}

/** A strip over a table of how many rows have each competence, a button each that filters the table by it. */
export function CompetenceStrip({ label, styles, count, picked, onPick, title, alertZero }: Props) {
  return (
    <div className="mk-cover" role="group" aria-label={label}>
      <span className="mk-cover-label">{label}</span>
      {styles.map((style) => {
        const n = count(style.key)
        return (
          <button key={style.key} className={`mk-cover-item ${picked === style.key ? 'on' : ''}`} aria-pressed={picked === style.key} title={title(style, n)} onClick={() => onPick(picked === style.key ? null : style.key)}>
            <i className="swatch" style={competenceColor(style)} />
            {style.label}
            {!n && alertZero ? <span className="count-chip alert">0</span> : <b>{n}</b>}
          </button>
        )
      })}
      {picked && (
        <button className="link small" onClick={() => onPick(null)}>
          Vis alle
        </button>
      )}
    </div>
  )
}
