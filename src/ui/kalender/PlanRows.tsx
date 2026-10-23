import type { HTMLAttributes } from 'react'
import { daysBetween, type ISODate } from '../../domain/dates'
import type { AllocationRow, VenuePhase } from '../../domain/types'
import { AllocRow, GroupRow } from './GridRows'
import type { AllocLane, CellEdit, Columns, GridActions } from './gridTypes'
import { daysWide, LEFT_W, TOP_ROW_H } from './layout'
import type { Dimension, GridItem, GroupItem, LevelSection } from './rows'
import { PILL_ROOM, StrokeBox } from './StrokeBox'
import type { StrokePill } from './strokes'

/** A line that takes no numbers has nothing selected on it. */
const NO_EDIT: CellEdit = { selFrom: -1, selTo: -1, focusCol: -1, draft: null, ghost: undefined, livePlanned: undefined }

interface Props {
  /** The first day of the period. */
  start: ISODate
  items: GridItem[]
  /** The lines drawn, from `r0` up to `r1`, and where each line starts (`lineTops`). */
  r0: number
  r1: number
  rowTops: number[]
  allocLanes: AllocLane[]
  laneOfRow: Map<string, number>
  sections: LevelSection[]
  /** How far down the stuck line of a top level sits: what is pinned over the rows. */
  pinnedHeight: number
  /** How much of the rows the stuck line of a top level covers above a line, see `headOver`. */
  headOver: (index: number) => number
  /** The top of the rows in view, under what is pinned over them, for where the pill has room. */
  shownTop: number
  windowOf: (row: AllocationRow) => Set<ISODate> | undefined
  levelWindows: Map<string, Set<ISODate>>
  phasesOfProject: Map<string, Map<ISODate, VenuePhase>>
  rowDimensions: Dimension[]
  cols: Columns
  actions: GridActions
  editOf: (lane: number) => CellEdit
  /** What the stroke or the drag in progress would do, on one pill over the days and the lines it changes. */
  pill: StrokePill | null
  /** What the rows are given to trace the day under the pointer. */
  hoverProps: HTMLAttributes<HTMLDivElement>
  /** Why there are no lines, where there are none. */
  empty: string | null
}

/**
 * The planning rows of the plan, drawn from `r0` to `r1` of the lines. A top level's line is drawn in a box as tall as its stretch
 * of lines and sticks inside it, so the browser moves it while scrolling and nothing is worked out per frame.
 */
export function PlanRows({ start, items, r0, r1, rowTops, allocLanes, laneOfRow, sections, pinnedHeight, headOver, shownTop, windowOf, levelWindows, phasesOfProject, rowDimensions, cols, actions, editOf, pill, hoverProps, empty }: Props) {
  const groupRow = (item: GroupItem) => {
    // A level takes numbers only where it is folded; open, it has no place among the lanes.
    const lane = item.entry ? laneOfRow.get(`level:${item.node.key}`)! : -1
    return <GroupRow key={`g:${item.node.key}`} item={item} lane={lane} phases={item.node.project ? phasesOfProject.get(item.node.project.key) : undefined} window={levelWindows.get(item.node.key)} cols={cols} actions={actions} {...(item.entry ? editOf(lane) : NO_EDIT)} />
  }
  // The pill sits above the lines it is about, or below where the top of the rows leaves it no room.
  const pillFrom = pill ? allocLanes[pill.lane0]?.index : undefined
  const pillTo = pill ? allocLanes[pill.lane1]?.index : undefined
  const pillBelow = pillFrom !== undefined && rowTops[pillFrom] - shownTop - headOver(pillFrom) < PILL_ROOM
  return (
    <>
      <div className="grid-alloc" style={{ height: rowTops[items.length] }} {...hoverProps}>
        <div style={{ height: rowTops[r0] }} />
        {items.slice(r0, r1).map((item) => {
          if (item.kind === 'row') {
            const lane = laneOfRow.get(item.row.id)!
            return <AllocRow key={item.row.id} item={item} lane={lane} window={windowOf(item.row)} rowDimensions={rowDimensions} cols={cols} actions={actions} {...editOf(lane)} />
          }
          // A top level's line is drawn in its section below; here it only takes up its place.
          if (item.node.depth === 0) return <div key={`g:${item.node.key}`} style={{ height: TOP_ROW_H }} />
          return groupRow(item)
        })}
        {pill && pillFrom !== undefined && pillTo !== undefined && (
          <StrokeBox kind={`bare plan ${pill.erase ? 'erase' : ''}`} style={{ left: daysWide(daysBetween(start, pill.from), LEFT_W), width: daysWide(daysBetween(pill.from, pill.to) + 1), top: rowTops[pillFrom], height: rowTops[pillTo + 1] - rowTops[pillFrom] }} below={pillBelow}>
            <b>{pill.title}</b>
            {pill.parts.map((part) => (
              <span key={part}>{part}</span>
            ))}
          </StrokeBox>
        )}
        {sections
          .filter((section) => section.end > r0 && section.index < r1)
          .map(({ item, index, end }) => (
            <div key={`s:${item.node.key}`} className="level-section" style={{ top: rowTops[index], height: rowTops[end] - rowTops[index] }}>
              <div className="level-stick" style={{ top: pinnedHeight }}>
                {groupRow(item)}
              </div>
            </div>
          ))}
      </div>
      {empty && <p className="empty-rows">{empty}</p>}
    </>
  )
}
