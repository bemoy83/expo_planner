import { strFromU8, unzipSync } from 'fflate'

/**
 * Minimal .xlsx reader: cached cell values and cell notes only.
 * The app never needs formulas or styles, so a small reader is simpler and faster than a
 * general-purpose library.
 */

export type CellValue = string | number | boolean | null

export interface Sheet {
  name: string
  /** Row number (1-based) → column index (0-based) → value. */
  rows: Map<number, Map<number, CellValue>>
  /** Cell reference such as `EB42` → note text. */
  notes: Map<string, string>
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export const decodeXml = (text: string): string =>
  text.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (match, code: string) => {
    if (code.startsWith('#x')) return String.fromCodePoint(parseInt(code.slice(2), 16))
    if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10))
    return ENTITIES[code] ?? match
  })

/** Concatenates every <t> run inside a fragment (shared strings, inline strings, notes). */
const textRuns = (fragment: string): string => {
  let out = ''
  for (const m of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1]
  return decodeXml(out)
}

export const columnIndex = (letters: string): number => {
  let n = 0
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

export const splitRef = (ref: string): { col: number; row: number } => {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!m) throw new Error(`Bad cell reference ${ref}`)
  return { col: columnIndex(m[1]), row: Number(m[2]) }
}

const attr = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]

const resolvePath = (base: string, target: string): string => {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

const relsOf = (files: Record<string, Uint8Array>, path: string): Map<string, string> => {
  const dir = path.split('/').slice(0, -1).join('/')
  const relPath = `${dir}/_rels/${path.split('/').at(-1)}.rels`
  const map = new Map<string, string>()
  const xml = files[relPath] ? strFromU8(files[relPath]) : ''
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id')
    const target = attr(m[0], 'Target')
    if (id && target) map.set(id, resolvePath(path, target))
  }
  return map
}

const parseCells = (xml: string, shared: string[]): Sheet['rows'] => {
  const rows: Sheet['rows'] = new Map()
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1]
    const body = m[2] ?? ''
    const ref = attr(attrs, 'r')
    if (!ref) continue
    const type = attr(attrs, 't')
    let value: CellValue = null
    if (type === 'inlineStr') value = textRuns(body)
    else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
      if (v === undefined) continue
      if (type === 's') value = shared[Number(v)] ?? ''
      else if (type === 'str' || type === 'e') value = decodeXml(v)
      else if (type === 'b') value = v === '1'
      else value = Number(v)
    }
    const { col, row } = splitRef(ref)
    let r = rows.get(row)
    if (!r) rows.set(row, (r = new Map()))
    r.set(col, value)
  }
  return rows
}

const parseNotes = (xml: string): Map<string, string> => {
  const notes = new Map<string, string>()
  for (const m of xml.matchAll(/<comment\b([^>]*)>([\s\S]*?)<\/comment>/g)) {
    const ref = attr(m[1], 'ref')
    if (ref) notes.set(ref, textRuns(m[2]).trim())
  }
  return notes
}

/** Modern Excel comments; replies to the same cell are joined line by line. */
const parseThreadedComments = (xml: string): Map<string, string> => {
  const notes = new Map<string, string>()
  for (const m of xml.matchAll(/<threadedComment\b([^>]*)>([\s\S]*?)<\/threadedComment>/g)) {
    const ref = attr(m[1], 'ref')
    const body = decodeXml(/<text>([\s\S]*?)<\/text>/.exec(m[2])?.[1] ?? '').trim()
    if (ref && body) notes.set(ref, notes.has(ref) ? `${notes.get(ref)}\n${body}` : body)
  }
  return notes
}

export const readXlsx = (bytes: Uint8Array, wanted?: string[]): Map<string, Sheet> => {
  const files = unzipSync(bytes)
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : '')
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1]))
  const workbookRels = relsOf(files, 'xl/workbook.xml')
  const sheets = new Map<string, Sheet>()
  for (const m of read('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const name = decodeXml(attr(m[0], 'name') ?? '')
    const rid = attr(m[0], 'r:id')
    const path = rid ? workbookRels.get(rid) : undefined
    if (!path || (wanted && !wanted.includes(name))) continue
    let notes = new Map<string, string>()
    let threaded = new Map<string, string>()
    for (const target of relsOf(files, path).values()) {
      if (target.includes('threadedComment')) threaded = parseThreadedComments(read(target))
      else if (/comments\d*\.xml$/.test(target)) notes = parseNotes(read(target))
    }
    // Legacy notes duplicate threaded comments with boilerplate text; prefer the threaded version.
    for (const [ref, body] of threaded) notes.set(ref, body)
    sheets.set(name, { name, rows: parseCells(read(path), shared), notes })
  }
  return sheets
}

export const cellAt = (sheet: Sheet, row: number, col: number): CellValue => sheet.rows.get(row)?.get(col) ?? null

export const text = (value: CellValue): string => (value === null || value === undefined ? '' : String(value).trim())

export const num = (value: CellValue): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}
