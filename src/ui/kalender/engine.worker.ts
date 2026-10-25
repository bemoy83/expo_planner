import { runEngine, type EngineData } from '../../domain/planner/run'

/** The planning engine off the page's thread: a run's data in, the plan and its scores out. */
self.onmessage = (event: MessageEvent<{ id: number; data: EngineData }>) => {
  const { id, data } = event.data
  ;(self as unknown as { postMessage: (message: unknown) => void }).postMessage({ id, result: runEngine(data) })
}
