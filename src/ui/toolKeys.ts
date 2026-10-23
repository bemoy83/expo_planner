/** The three tools of every mode of the Kalender, by what they do: Plan calls its brush the pencil and its eraser «eraser». */
export type ToolKind = 'select' | 'paint' | 'erase'

/** The keys that pick a tool, anywhere on the page and in every mode: V, B and T. */
const TOOL_KEYS: Record<string, ToolKind> = { v: 'select', b: 'paint', t: 'erase' }

/** The tool a key picks, or nothing. */
export const toolOfKey = (key: string): ToolKind | undefined => TOOL_KEYS[key.toLowerCase()]
