import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { daysBetween, type ISODate } from '../../domain/dates'
import { fitSpan, LEFT_W, ROW_H, type Zoom } from './layout'

interface Options {
  /** The period shown. */
  start: ISODate
  end: ISODate
  /** The day the grid opens on, if it is in the period. */
  openOn: ISODate
  zoom: Zoom
  colW: number
  /** The height the rows must be left with under the top block, such as a person's open hours in Bemanning. */
  reserve?: number
  /** Called on every scroll. Must keep its identity. */
  onScrolled: () => void
  /** Called when the period grows at the start, so the columns count from another day. Must keep its identity. */
  onPeriodMoved: () => void
}

/**
 * The scrolling of the grid: what part of it is in view, how tall the block pinned above the rows is and how much of it gives way,
 * and keeping the same days in view when the period or the column width changes.
 */
export function useGridViewport({ start, end, openOn, zoom, colW, reserve = 0, onScrolled, onPeriodMoved }: Options) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ left: 0, top: 0, width: 1200, height: 800 })
  // The height of everything above the planning rows, of the date header at the top of it, and of the planning bar with the heading row at the foot of it.
  const [topHeight, setTopHeight] = useState(0)
  const [headHeight, setHeadHeight] = useState(0)
  const [barHeight, setBarHeight] = useState(0)
  // The days to bring into view, once the column width that fits them is in place.
  const [goTo, setGoTo] = useState<{ start: ISODate; end: ISODate } | null>(null)

  // The width of a day goes to the page as the style variable `--col-w`, which every cell and bar is
  // laid out by. A zoom writes it frame by frame (`zoomStep`), so the lines are not drawn again on the
  // way; until it ends, the width in `colW` is only the one the lines were drawn at.
  const liveColW = useRef(colW)
  const zooming = useRef(false)
  // Where the left edge is to be, among the days, when it is placed and not kept.
  const placed = useRef<number | null>(null)
  const [placings, setPlacings] = useState(0)

  // Scroll events already arrive once per frame, so the viewport can be read directly.
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    // A scroll that follows a placing of the left edge tells nothing new, and draws nothing again.
    // Nor does a frame of a zoom: what is in view is told when it ends.
    if (el && !zooming.current) setViewport((v) => (Math.abs(v.left - el.scrollLeft) < 1 && v.top === el.scrollTop && v.width === el.clientWidth && v.height === el.clientHeight ? v : { left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight }))
    onScrolled()
  }, [onScrolled])

  /**
   * Reads what is in view and the heights of what is pinned. The grid does this by itself when a size
   * changes, but a frame late: whoever swaps the block above the rows and moves the rows in one go calls
   * it in a layout effect, so the first frame is drawn from the new heights and the new place.
   */
  const measure = useCallback(() => {
    const el = scrollRef.current
    const head = headRef.current
    const top = topRef.current
    const tools = toolsRef.current
    if (!el || !head || !top || !tools) return
    setViewport((v) => {
      const left = zooming.current ? v.left : el.scrollLeft
      return v.left === left && v.top === el.scrollTop && v.width === el.clientWidth && v.height === el.clientHeight ? v : { left, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight }
    })
    setTopHeight(head.offsetHeight + top.offsetHeight + tools.offsetHeight)
    setHeadHeight(head.offsetHeight)
    setBarHeight(tools.offsetHeight)
  }, [])

  useLayoutEffect(() => {
    const el = scrollRef.current
    const head = headRef.current
    const top = topRef.current
    const tools = toolsRef.current
    if (!el || !head || !top || !tools) return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    observer.observe(head)
    observer.observe(top)
    observer.observe(tools)
    return () => observer.disconnect()
  }, [measure])

  const scrollToDate = useCallback(
    (date: ISODate, offsetDays = 7) => {
      const el = scrollRef.current
      if (!el) return
      el.scrollLeft = Math.max(0, (daysBetween(start, date) - offsetDays) * colW)
      onScroll()
    },
    [start, colW, onScroll],
  )

  /** Puts the left edge at a position among the days (3,5 is the middle of the fourth day), at the column width that is on its way in. It ends a zoom. */
  const placeLeft = useCallback((left: number, atColW: number) => {
    placed.current = left
    zooming.current = false
    // What is in view is known at once, so the right days are drawn in the same frame as the new width.
    setViewport((v) => ({ ...v, left: left * atColW }))
    setPlacings((n) => n + 1)
  }, [])
  /** Where a zoom starts: the width of a day on screen, the place of the left edge among the days, and the room the days have. */
  const zoomFrom = useCallback(() => {
    const el = scrollRef.current
    return { colW: liveColW.current, left: (el?.scrollLeft ?? 0) / liveColW.current, room: (el?.clientWidth ?? 0) - LEFT_W }
  }, [])
  /**
   * One frame of a zoom: the width of a day and the place of the left edge go straight to the page, and
   * nothing is drawn again. The caller sees to it that the days the zoom passes are drawn, and ends it
   * with `placeLeft`.
   */
  const zoomStep = useCallback((left: number, atColW: number) => {
    const el = scrollRef.current
    if (!el) return
    zooming.current = true
    liveColW.current = atColW
    el.style.setProperty('--col-w', `${atColW}px`)
    el.scrollLeft = left * atColW
  }, [])

  // The width of a day, and with it the same date at the left edge, unless the edge is placed. Before
  // the first scroll below, which needs the grid to have its width. Not while a zoom has the width.
  const prevColW = useRef(colW)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && !zooming.current) {
      el.style.setProperty('--col-w', `${colW}px`)
      liveColW.current = colW
      if (placed.current !== null) el.scrollLeft = placed.current * colW
      else if (prevColW.current !== colW) el.scrollLeft = (el.scrollLeft / prevColW.current) * colW
    }
    placed.current = null
    prevColW.current = colW
  }, [colW, placings])

  // Start near the day asked for, once.
  const didInitialScroll = useRef(false)
  useLayoutEffect(() => {
    if (didInitialScroll.current) return
    didInitialScroll.current = true
    scrollToDate(openOn >= start && openOn <= end ? openOn : start)
  }, [scrollToDate, openOn, start, end])

  // When the period grows at the start (new hall bookings, for example), stay on the same dates.
  const prevStart = useRef(start)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && prevStart.current !== start) {
      el.scrollLeft = Math.max(0, el.scrollLeft + daysBetween(start, prevStart.current) * colW)
      onPeriodMoved()
      onScroll()
    }
    prevStart.current = start
  }, [start, colW, onScroll, onPeriodMoved])

  // The top block stays pinned like Excel's frozen rows, however much of the screen it covers: its sections are
  // how the planner finds the way, and stay within reach. It gives way only where the rows would be left with
  // less than they are promised, or with no more than a few lines: it then moves up by that much as the rows
  // scroll. What it holds says which part is lost: the hall calendar stays under the date header, and the
  // staffing lines slide in under it. The date header and the planning bar never give way.
  const room = viewport.height - Math.max(reserve, 3 * ROW_H)
  const tucked = Math.round(Math.max(0, Math.min(topHeight - room, topHeight - headHeight - barHeight)))
  // Bring a span of days into view. Declared after the effect of the width above, so it has the last word on a change of column width.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !goTo) return
    const { leftCol } = fitSpan(daysBetween(start, goTo.start), daysBetween(goTo.start, goTo.end) + 1, el.clientWidth - LEFT_W, zoom)
    el.scrollLeft = leftCol * colW
    // Part of the top block is out of sight once the rows are scrolled, when it is too tall to pin whole.
    if (tucked) el.scrollTop = 0
    onScroll()
    setGoTo(null)
  }, [goTo]) // eslint-disable-line react-hooks/exhaustive-deps

  return { scrollRef, headRef, topRef, toolsRef, viewport, topHeight, headHeight, barHeight, tucked, measure, onScroll, scrollToDate, showSpan: setGoTo, placeLeft, zoomFrom, zoomStep }
}
