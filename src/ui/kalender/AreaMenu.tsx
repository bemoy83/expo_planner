import { ChevronDown, MapPin } from 'lucide-react'
import { ALL_HALLS, areaShown, NO_AREA, shownHalls, withAreaShown, withHallShown, type AreaNode, type HallFilter } from '../../domain/areas'
import { Menu, TriCheckbox } from '../common'

interface Props {
  /** The halls of the ledger by area, see `areaTree`. */
  tree: AreaNode[]
  filter: HallFilter
  onChange: (filter: HallFilter) => void
}

/**
 * The button «Steder» of the planning bar and the tree under it: the areas with their halls, to tick the ones to
 * work with. The hall calendar, the rows of the plan and Bemanning follow it.
 */
export function AreaMenu({ tree, filter, onChange }: Props) {
  const all = tree.reduce((sum, node) => sum + node.halls.length, 0)
  const shown = shownHalls(tree, filter).length
  const grouped = tree.some((node) => node.name !== NO_AREA)
  return (
    <Menu
      label={
        <>
          <MapPin size={14} aria-hidden />
          <span className="bar-button-label">Steder</span>
          {shown < all && (
            <span className="bar-count">
              {shown}/{all}
            </span>
          )}
          <ChevronDown size={12} aria-hidden />
        </>
      }
      className={`bar-button ${shown < all ? 'on' : ''}`}
      title="Steder: velg hvilke områder og haller som vises. Prosjekter som bare har bookinger i haller du har valgt bort, vises ikke."
    >
      {() => (
        <div className="col-filter-pop area-menu">
          <div className="col-filter-all">
            <button className="link small" onClick={() => onChange(ALL_HALLS)}>
              Velg alle
            </button>
            <button className="link small" onClick={() => onChange({ areas: tree.map((node) => node.name), halls: [] })}>
              Fjern alle
            </button>
          </div>
          {all === 0 && <p className="muted small">Ingen haller ennå. Les inn VenYou.</p>}
          <div className="col-filter-list">
            {tree.map((node) => {
              const state = areaShown(node, filter)
              const name = node.name === NO_AREA ? 'Uten område' : node.name
              return (
                <div key={node.name} className="area-node">
                  {grouped && (
                    <label className="area-name">
                      <TriCheckbox checked={state === 'all'} partial={state === 'some'} label={name} onChange={(show) => onChange(withAreaShown(filter, node, show))} />
                      <span>{name}</span>
                      <em>{node.halls.length}</em>
                    </label>
                  )}
                  {node.halls.map((hall) => {
                    const on = shownHalls([node], filter).includes(hall)
                    return (
                      <label key={hall} className={grouped ? 'area-hall' : undefined}>
                        <input type="checkbox" checked={on} onChange={() => onChange(withHallShown(tree, filter, hall, !on))} />
                        <span>{hall}</span>
                      </label>
                    )
                  })}
                </div>
              )
            })}
          </div>
          {!grouped && all > 0 && <p className="muted small">Samle hallene i områder under Hallregler, så kan du velge et helt område her.</p>}
        </div>
      )}
    </Menu>
  )
}
