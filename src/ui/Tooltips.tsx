import { useEffect, useState } from 'react'

/** How long the mouse rests on something before its tooltip shows. The browser's own wait is about a second. */
const DELAY_MS = 250
const GAP = 6

interface Tip {
  text: string
  /** The element's box in the window, for placing the tooltip under or over it. */
  box: DOMRect
}

/**
 * Shows the `title` of whatever the mouse rests on, sooner than the browser does. While an element is
 * hovered its title is held aside so the browser's own tooltip does not show as well, and put back
 * when the mouse leaves. Mounted once for the whole app.
 */
export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    let current: HTMLElement | null = null
    let held = ''
    let timer: ReturnType<typeof setTimeout> | undefined

    const leave = () => {
      clearTimeout(timer)
      // Put the title back unless it was given a new one meanwhile.
      if (current && held && !current.getAttribute('title')) current.setAttribute('title', held)
      current = null
      held = ''
      setTip(null)
    }
    const onOver = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>('[title]') : null
      if (el === current || (current && !el && e.target instanceof Node && current.contains(e.target))) return
      leave()
      const text = el?.getAttribute('title')?.trim()
      if (!el || !text) return
      current = el
      held = text
      el.removeAttribute('title')
      // A button that is only an icon is named by its title; keep that name while the title is held aside.
      if (!el.getAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', text)
      timer = setTimeout(() => current === el && setTip({ text, box: el.getBoundingClientRect() }), DELAY_MS)
    }
    const onOut = (e: MouseEvent) => {
      if (current && !(e.relatedTarget instanceof Node && current.contains(e.relatedTarget))) leave()
    }

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)
    document.addEventListener('mousedown', leave)
    document.addEventListener('keydown', leave)
    document.addEventListener('scroll', leave, true)
    return () => {
      leave()
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      document.removeEventListener('mousedown', leave)
      document.removeEventListener('keydown', leave)
      document.removeEventListener('scroll', leave, true)
    }
  }, [])

  if (!tip) return null
  const below = tip.box.bottom + GAP + 60 < window.innerHeight
  const left = Math.max(8, Math.min(tip.box.left, window.innerWidth - 340))
  return (
    <div className="tooltip" role="tooltip" style={below ? { left, top: tip.box.bottom + GAP } : { left, bottom: window.innerHeight - tip.box.top + GAP }}>
      {tip.text}
    </div>
  )
}
