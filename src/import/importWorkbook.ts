import type { Workspace } from '../domain/types'

/** Parses the planner workbook in a Web Worker so the page stays responsive. */
export const importWorkbookFile = async (file: File): Promise<Workspace> => {
  const bytes = await file.arrayBuffer()
  const worker = new Worker(new URL('./importWorker.ts', import.meta.url), { type: 'module' })
  try {
    return await new Promise<Workspace>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ ok: true; workspace: Workspace } | { ok: false; error: string }>) =>
        event.data.ok ? resolve(event.data.workspace) : reject(new Error(event.data.error))
      worker.onerror = (event) => reject(new Error(event.message || 'Importen feilet.'))
      worker.postMessage({ bytes, fileName: file.name }, [bytes])
    })
  } finally {
    worker.terminate()
  }
}
