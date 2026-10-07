import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { daysBetween, type ISODate } from '../../domain/dates'
import { fitSpan, LEFT_W, type Zoom } from './layout'

interface Options {
  /** The period shown. */
  start: ISODate
  end: ISODate
  /** The day the grid opens on, if it is in the period. */
  openOn: ISODate
  zoom: Zoom
  colW: number
  /** Called on every scroll. Must keep its identity. */
  onScrolled: () => void
  /** Called when the period grows at the start, so the columns count from another day. Must keep its identity. */
  onPeriodMoved: () => void
}

/**
 * The scrolling of the grid: what part of it is in view, how tall the block pinned above the rows is,
 * and keeping the same days in view when the period or the column width changes.
 */
export function useGridViewport({ start, end, openOn, zoom, colW, onScrolled, onPeriodMoved }: Options) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ left: 0, top: 0, width: 1200, height: 800 })
  // The height of everything above the planning rows, and of the planning bar with the heading row at the foot of it.
  const [topHeight, setTopHeight] = useState(0)
  const [barHeight, setBarHeight] = useState(0)
  // The days to bring into view, once the column width that fits them is in place.
  const [goTo, setGoTo] = useState<{ start: ISODate; end: ISODate } | null>(null)

  // Scroll events already arrive once per frame, so the viewport can be read directly.
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (el) setViewport({ left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight })
    onScrolled()
  }, [onScrolled])

  useLayoutEffect(() => {
    const el = scrollRef.current
    const top = topRef.current
    const tools = toolsRef.current
    if (!el || !top || !tools) return
    const observer = new ResizeObserver(() => {
      setViewport({ left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight })
      setTopHeight(top.offsetHeight + tools.offsetHeight)
      setBarHeight(tools.offsetHeight)
    })
    observer.observe(el)
    observer.observe(top)
    observer.observe(tools)
    return () => observer.disconnect()
  }, [])

  const scrollToDate = useCallback(
    (date: ISODate, offsetDays = 7) => {
      const el = scrollRef.current
      if (!el) return
      el.scrollLeft = Math.max(0, (daysBetween(start, date) - offsetDays) * colW)
      onScroll()
    },
    [start, colW, onScroll],
  )

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

  // Keep the same date at the left edge when zooming.
  const prevColW = useRef(colW)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && prevColW.current !== colW) el.scrollLeft = (el.scrollLeft / prevColW.current) * colW
    prevColW.current = colW
  }, [colW])

  /** The top block stays pinned like Excel's frozen rows, unless it would cover most of the screen. */
  const topPinned = topHeight < viewport.height * 0.65
  // Bring a span of days into view. Declared after the zoom effect above, so it has the last word on a change of column width.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !goTo) return
    const { leftCol } = fitSpan(daysBetween(start, goTo.start), daysBetween(goTo.start, goTo.end) + 1, el.clientWidth - LEFT_W, zoom)
    el.scrollLeft = leftCol * colW
    // The hall calendar scrolls away with the rows when it is too tall to pin.
    if (!topPinned) el.scrollTop = 0
    onScroll()
    setGoTo(null)
  }, [goTo]) // eslint-disable-line react-hooks/exhaustive-deps

  return { scrollRef, topRef, toolsRef, viewport, topHeight, barHeight, topPinned, onScroll, scrollToDate, showSpan: setGoTo }
}
