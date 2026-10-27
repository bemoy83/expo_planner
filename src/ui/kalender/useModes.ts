import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { daysBetween, type ISODate } from '../../domain/dates'
import type { DateSpan } from '../../domain/types'
import { loadPref, savePref, usePref } from '../../store/prefs'
import { LEFT_W, ZOOM_WIDTHS, type Zoom } from './layout'
import { useModeZoom } from './useModeZoom'
import { anchoredLeft, BEMANNING_DAYS, cleanCrewPart, cleanPlanMode, enterSpan, fitWidth, partWidth, spanDays, zoomAnchor, type CrewPart, type DaySpan, type HeldColumns, type PlanMode, type ZoomPoint } from './zoom'

/**
 * The modes of the Kalender and their widths of a day. The rows are the demand plan or the people (`planMode`), and `shown` is
 * what is drawn: on the way into Bemanning the plan zooms in first and the rows change at the end, on the way out they change first.
 * Bemanning has two parts on the same days, the permanent staff and the people hired for what they leave: the days of Faste are as wide
 * as the span they show asks for, those of Innleid a step wider (`partWidth`), and Bemanning has no steps of zoom.
 */
export function useModeState(range: DateSpan, focusDate: ISODate | undefined, today: ISODate, zoom: Zoom) {
  const [planMode, setPlanMode] = usePref<PlanMode>('planMode', 'plan', cleanPlanMode)
  const [shown, setShown] = useState<PlanMode>(planMode)
  const [crewPart, setCrewPart] = usePref<CrewPart>('crewPart', 'faste', cleanCrewPart)
  // A page that opens in Bemanning opens on the days last seen there.
  const [openSpan] = useState(() => {
    const inPeriod = (date: ISODate | undefined) => !!date && date >= range.start && date <= range.end
    return enterSpan({ period: range, stored: loadPref<DaySpan | null>('bemanningRange', null), leftEdge: inPeriod(focusDate) ? focusDate! : inPeriod(today) ? today : range.start })
  })
  // Faste's width of a day; Innleid's follows from it.
  const [bemanningW, setBemanningW] = useState(() => fitWidth(spanDays(openSpan), window.innerWidth - LEFT_W, crewPart))
  // The width the lines are drawn at. While the switch zooms, the width on screen is on its way from
  // one mode's to the other's (`useModeZoom`), and the days it passes are held drawn.
  const colW = shown === 'bemanning' ? partWidth(bemanningW, crewPart) : ZOOM_WIDTHS[zoom]
  const [held, setHeld] = useState<HeldColumns | null>(null)
  // While the switch between the modes zooms, the days in view are held at those the plan shows at its own
  // width. The zoom passes through fewer days, and the projects listed would come and go with them,
  // moving the rows under the planner.
  const [heldWindow, setHeldWindow] = useState<DaySpan | null>(null)
  return { planMode, setPlanMode, shown, setShown, crewPart, setCrewPart, openSpan, bemanningW, setBemanningW, colW, held, setHeld, heldWindow, setHeldWindow }
}

type Modes = ReturnType<typeof useModeState>

interface Options {
  modes: Modes
  scrollRef: RefObject<HTMLDivElement | null>
  dates: ISODate[]
  range: DateSpan
  /** The day in focus, which keeps its place on screen while a switch zooms, when it is in view. */
  focus: ISODate | undefined
  zoom: Zoom
  viewport: { left: number; width: number }
  /** From `useGridViewport`: the width and the left edge on screen, a frame of a zoom, the placing of the left edge, and a measure of the heights. */
  zoomFrom: () => ZoomPoint & { room: number }
  zoomStep: (left: number, colW: number) => void
  placeLeft: (left: number, colW: number) => void
  measure: () => void
  /** What a switch of the mode lets go of: the selection, the cell menu and the tool of the plan. */
  onLeave: () => void
}

/** The switches between the modes and the parts, with the zoom between their widths, and the days of Bemanning remembered. */
export function useModeSwitch({ modes, scrollRef, dates, range, focus, zoom, viewport, zoomFrom, zoomStep, placeLeft, measure, onLeave }: Options) {
  const { planMode, setPlanMode, shown, setShown, crewPart, setCrewPart, openSpan, bemanningW, setBemanningW, colW, held, setHeld, setHeldWindow } = modes
  const zoomTo = useModeZoom(zoomFrom, zoomStep, setHeld, placeLeft)
  /** The days between the label column and the right edge of the grid, in pixels. */
  const dayRoom = () => (scrollRef.current?.clientWidth ?? viewport.width) - LEFT_W
  /** Zooms Bemanning to a span of days: as wide as fills the grid in the part shown, the first day at the left edge (R18). */
  const fitBemanning = (span: DaySpan) => {
    const width = fitWidth(spanDays(span), dayRoom(), crewPart)
    zoomTo({ colW: partWidth(width, crewPart), left: daysBetween(range.start, span.start) }, () => setBemanningW(width))
  }
  /** The zoom to a width with the day in focus, or the middle of the view, kept where it is on screen. */
  const zoomKept = (width: number, then: () => void) => {
    const from = zoomFrom()
    const left = anchoredLeft(from, width, zoomAnchor(from, focus ? daysBetween(range.start, focus) : -1), dates.length)
    zoomTo({ colW: width, left }, then)
  }
  // The two modes have rows of their own, so each keeps how far down it was scrolled: the plan is found
  // again where it was left, and the people do not open partway down their list. The plan is put back
  // once more when the zoom out has ended, should the list have changed on the way. The modes also have
  // blocks of different heights above the rows; they are measured here and now, or the first frame would
  // draw the rows of the other mode's place under the other mode's heights.
  const scrolledTo = useRef<Record<PlanMode, number>>({ plan: 0, bemanning: 0 })
  const [zoomsEnded, setZoomsEnded] = useState(0)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = scrolledTo.current[shown]
    measure()
  }, [shown, zoomsEnded, scrollRef, measure])
  const switchMode = (next: PlanMode) => {
    const el = scrollRef.current
    if (next === planMode || !el) return
    scrolledTo.current[shown] = el.scrollTop
    setPlanMode(next)
    onLeave()
    // The two modes share the timeline: the day in focus, or the middle of the view, keeps its place on
    // screen. Only the width of a day differs, and Bemanning keeps the width it was last seen in.
    const left = Math.floor(zoomFrom().left + 0.01)
    setHeldWindow({ start: dates[left], end: dates[Math.min(dates.length - 1, left + Math.floor(dayRoom() / ZOOM_WIDTHS[zoom]))] })
    if (next === 'bemanning') {
      const stored = loadPref<DaySpan | null>('bemanningRange', null)
      const fitted = fitWidth(stored && stored.start <= stored.end ? spanDays(stored) : BEMANNING_DAYS, dayRoom())
      zoomKept(partWidth(fitted, crewPart), () => {
        setBemanningW(fitted)
        setShown('bemanning')
        setHeldWindow(null)
      })
    } else {
      setShown('plan')
      zoomKept(ZOOM_WIDTHS[zoom], () => {
        setHeldWindow(null)
        setZoomsEnded((n) => n + 1)
      })
    }
  }
  /**
   * Goes to the other part of Bemanning, with the zoom between their widths: into Innleid the days of Faste
   * zoom in and the rows change at the end, out of it the rows change first, as between the modes.
   */
  const switchPart = (next: CrewPart) => {
    if (next === crewPart) return
    if (next === 'innleid') return zoomKept(partWidth(bemanningW, next), () => setCrewPart(next))
    setCrewPart(next)
    zoomKept(bemanningW, () => {})
  }
  // The days seen in Bemanning are remembered, for the next time it is opened: their width is theirs alone.
  // Whole days, so the same days give the same width when they are opened again; as many as Faste shows, in either part.
  const seenFrom = Math.min(dates.length - 1, Math.round(viewport.left / colW))
  const seenTo = Math.min(dates.length - 1, seenFrom + Math.max(1, Math.round((viewport.width - LEFT_W) / bemanningW)) - 1)
  const bemanningSpan = shown === 'bemanning' && held === null && dates.length ? `${dates[seenFrom]}|${dates[seenTo]}` : null
  useEffect(() => {
    if (!bemanningSpan) return
    const [start, end] = bemanningSpan.split('|')
    // Not while the grid has no width of its own (a page opened out of sight): the days it seems to show then are not the days seen.
    const timer = setTimeout(() => {
      const el = scrollRef.current
      if (el && el.clientWidth > LEFT_W) savePref('bemanningRange', { start, end })
    }, 300)
    return () => clearTimeout(timer)
  }, [bemanningSpan, scrollRef])
  useLayoutEffect(() => {
    if (shown === 'bemanning') placeLeft(daysBetween(range.start, openSpan.start), colW)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return { switchMode, switchPart, fitBemanning }
}
