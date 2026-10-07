import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** The bar on one row: everything in full, then without the hint's text, then with the grouping trail cut shorter. */
const ONE_ROW = ['0', '1', '2', '3']
/** The bar on two rows, the grouping trail cut shorter step by step. */
const WRAPPED = ['w0', 'w240', 'w160', 'w110', 'w70']

interface Props {
  /** The width of the grid as it is seen, so the bar stays put when the days scroll sideways. */
  width: number
  /** Changes whenever the content of the bar may have changed width. */
  fitKey: string
  children: ReactNode
}

/**
 * The planning tools, in a bar right above the planning rows. How wide its content is depends on the
 * grouping trail, which style rules cannot know, so the bar measures itself: it tries each stage in turn
 * and keeps the first that fits, written to `data-fit` for the style sheet to act on.
 */
export function PlanBar({ width, fitKey, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // The text is measured again once the fonts are in.
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    void document.fonts?.ready.then(() => setFontsReady(true))
  }, [])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const zones = [...el.querySelectorAll<HTMLElement>('.bar-zone')]
    if (!zones.length) return
    const rows = () => new Set(zones.map((zone) => zone.offsetTop)).size
    for (const fit of ONE_ROW) {
      el.dataset.fit = fit
      if (rows() === 1) return
    }
    for (const fit of WRAPPED) {
      el.dataset.fit = fit
      if (rows() <= 2 && el.scrollWidth <= el.offsetWidth + 1) return
    }
  }, [width, fitKey, fontsReady])
  return (
    <div className="plan-bar">
      <div className="plan-bar-in bar-controls" ref={ref} style={{ width }}>
        {children}
      </div>
    </div>
  )
}
