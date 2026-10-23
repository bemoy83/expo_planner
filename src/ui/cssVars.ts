import { DAY_INSET, LEAVE_MS } from './bemanning/layout'
import { LEFT_W } from './kalender/layout'

/** The width of the panel that slides in over a page, see `.inspector`. */
export const PANEL_W = 340

/**
 * The sizes and times that both the code and the style sheets need. They are written in the code, which reckons with
 * them, and handed to the style sheets as variables on the page, so each is written once.
 */
const CSS_VARS: Record<string, string> = {
  '--left-w': `${LEFT_W}px`,
  '--panel-w': `${PANEL_W}px`,
  '--day-inset': `${DAY_INSET}px`,
  '--leave-ms': `${LEAVE_MS}ms`,
}

export const setCssVars = (root: HTMLElement) => {
  for (const [name, value] of Object.entries(CSS_VARS)) root.style.setProperty(name, value)
}
