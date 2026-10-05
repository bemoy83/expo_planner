import { useLayoutEffect, useMemo, useRef } from 'react'

/**
 * An object of handlers that keeps its identity while always calling the latest version of each one.
 * Memoized rows can then take the handlers without being drawn again every time the grid renders.
 * The handlers are for events; they must not be called while rendering.
 */
export const useStableActions = <T extends object>(latest: T): T => {
  const ref = useRef(latest)
  useLayoutEffect(() => {
    ref.current = latest
  })
  return useMemo(() => {
    const stable: Record<string, unknown> = {}
    for (const name of Object.keys(latest)) stable[name] = (...args: unknown[]) => (ref.current as Record<string, (...a: unknown[]) => unknown>)[name](...args)
    return stable as T
    // The names never change; the handlers are read from the ref.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
