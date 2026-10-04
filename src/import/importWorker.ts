import { readPlannerWorkbook } from './plannerWorkbook'

export type ImportRequest = { bytes: ArrayBuffer; fileName: string }

self.onmessage = (event: MessageEvent<ImportRequest>) => {
  try {
    const workspace = readPlannerWorkbook(new Uint8Array(event.data.bytes), event.data.fileName)
    self.postMessage({ ok: true, workspace })
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}
