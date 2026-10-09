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

  // Scroll events already arrive once per frame, so the viewport can be read directly.
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    // A scroll that follows a placing of the left edge tells nothing new, and draws nothing again.
    if (el) setViewport((v) => (Math.abs(v.left - el.scrollLeft) < 1 && v.top === el.scrollTop && v.width === el.clientWidth && v.height === el.clientHeight ? v : { left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight }))
    onScrolled()
  }, [onScrolled])

  useLayoutEffect(() => {
    const el = scrollRef.current
    const head = headRef.current
    const top = topRef.current
    const tools = toolsRef.current
    if (!el || !head || !top || !tools) return
    const observer = new ResizeObserver(() => {
      setViewport({ left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight })
      setTopHeight(head.offsetHeight + top.offsetHeight + tools.offsetHeight)
      setHeadHeight(head.offsetHeight)
      setBarHeight(tools.offsetHeight)
    })
    observer.observe(el)
    observer.observe(head)
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

  // Keep the same date at the left edge when zooming, unless the edge is placed: the switch between the
  // modes zooms to other days, and says where the edge is on every frame of the way.
  const placed = useRef<number | null>(null)
  const [placings, setPlacings] = useState(0)
  /** Puts the left edge at a position among the days (3,5 is the middle of the fourth day), at the column width that is on its way in. */
  const placeLeft = useCallback((left: number, atColW: number) => {
    placed.current = left
    // What is in view is known at once, so the right days are drawn in the same frame as the new width.
    setViewport((v) => ({ ...v, left: left * atColW }))
    setPlacings((n) => n + 1)
  }, [])
  const prevColW = useRef(colW)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && placed.current !== null) el.scrollLeft = placed.current * colW
    else if (el && prevColW.current !== colW) el.scrollLeft = (el.scrollLeft / prevColW.current) * colW
    placed.current = null
    prevColW.current = colW
  }, [colW, placings])

  // The top block stays pinned like Excel's frozen rows. When it would cover most of the screen, or leave the
  // rows less than they are promised, it gives way: it moves up by that much as the rows scroll, and the rest
  // stays. What it holds says which part is lost: the hall calendar stays under the date header, and the
  // staffing lines slide in under it. The date header and the planning bar never give way.
  const room = Math.min(viewport.height * 0.65, viewport.height - reserve)
  const tucked = Math.round(Math.max(0, Math.min(topHeight - room, topHeight - headHeight - barHeight)))
  // Bring a span of days into view. Declared after the zoom effect above, so it has the last word on a change of column width.
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

  return { scrollRef, headRef, topRef, toolsRef, viewport, topHeight, headHeight, barHeight, tucked, onScroll, scrollToDate, showSpan: setGoTo, placeLeft }
}
