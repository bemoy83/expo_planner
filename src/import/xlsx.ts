import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

/**
 * Minimal .xlsx reader: cached cell values only.
 * The app never needs formulas or styles, so a small reader is simpler and faster than a
 * general-purpose library. `writeXlsx` writes the tables the app exports, as plain values under a heading.
 */

export type CellValue = string | number | boolean | null

export interface Sheet {
  name: string
  /** Row number (1-based) → column index (0-based) → value. */
  rows: Map<number, Map<number, CellValue>>
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

const decodeXml = (text: string): string =>
  text.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (match, code: string) => {
    if (code.startsWith('#x')) return String.fromCodePoint(parseInt(code.slice(2), 16))
    if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10))
    return ENTITIES[code] ?? match
  })

/** Concatenates every <t> run inside a fragment (shared strings, inline strings). */
const textRuns = (fragment: string): string => {
  let out = ''
  for (const m of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1]
  return decodeXml(out)
}

const columnIndex = (letters: string): number => {
  let n = 0
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

const splitRef = (ref: string): { col: number; row: number } => {
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

export const readXlsx = (bytes: Uint8Array): Map<string, Sheet> => {
  const files = unzipSync(bytes)
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : '')
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1]))
  const workbookRels = relsOf(files, 'xl/workbook.xml')
  const sheets = new Map<string, Sheet>()
  for (const m of read('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const name = decodeXml(attr(m[0], 'name') ?? '')
    const rid = attr(m[0], 'r:id')
    const path = rid ? workbookRels.get(rid) : undefined
    if (!path) continue
    sheets.set(name, { name, rows: parseCells(read(path), shared) })
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

/** Finds the first row that contains all the given headers and maps header name, in lower case, → column. */
export const findHeader = (sheet: Sheet, required: string[]): { row: number; columns: Map<string, number> } | null => {
  const rows = [...sheet.rows.keys()].sort((a, b) => a - b).slice(0, 20)
  for (const row of rows) {
    const columns = new Map<string, number>()
    for (const [col, value] of sheet.rows.get(row)!) {
      const name = text(value).toLowerCase()
      if (name && !columns.has(name)) columns.set(name, col)
    }
    if (required.every((name) => columns.has(name))) return { row, columns }
  }
  return null
}

/** The numbers of the rows under a heading, in order. */
export const dataRows = (sheet: Sheet, headerRow: number): number[] => [...sheet.rows.keys()].filter((r) => r > headerRow).sort((a, b) => a - b)

/** What a cell is marked with in a file edited by hand: «Ja», «x» and the like. */
const MARKS = new Set(['ja', 'j', 'x', '1', 'true', 'yes'])
export const isMarked = (value: CellValue): boolean => MARKS.has(text(value).toLowerCase())

/** One sheet to write: a heading and the rows under it. */
export interface SheetTable {
  name: string
  head: string[]
  rows: CellValue[][]
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE = 'http://schemas.openxmlformats.org/package/2006'
const TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml'

/** XML 1.0 holds no control characters but tab and the line breaks. */
const inXml = (ch: string): boolean => ch >= ' ' || ch === '\t' || ch === '\n' || ch === '\r'

const encodeXml = (value: string): string =>
  [...value]
    .filter(inXml)
    .join('')
    .replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!)

const columnLetters = (index: number): string => {
  let letters = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters
  return letters
}

const cellXml = (value: CellValue, ref: string, style: string): string => {
  if (value === null || value === '') return ''
  if (typeof value === 'number') return Number.isFinite(value) ? `<c r="${ref}"${style}><v>${value}</v></c>` : ''
  if (typeof value === 'boolean') return `<c r="${ref}"${style} t="b"><v>${value ? 1 : 0}</v></c>`
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${encodeXml(value)}</t></is></c>`
}

const sheetXml = ({ head, rows }: SheetTable): string => {
  const all = [head, ...rows]
  const width = (col: number) => Math.min(60, Math.max(8, ...all.map((row) => String(row[col] ?? '').length + 2)))
  const cols = head.map((_, col) => `<col min="${col + 1}" max="${col + 1}" width="${width(col)}" customWidth="1"/>`).join('')
  const data = all.map((row, r) => `<row r="${r + 1}">${row.map((value, col) => cellXml(value, `${columnLetters(col)}${r + 1}`, r === 0 ? ' s="1"' : '')).join('')}</row>`).join('')
  // The heading stays in view while the rows scroll.
  const frozen = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
  return `${XML}<worksheet xmlns="${MAIN}">${frozen}<cols>${cols}</cols><sheetData>${data}</sheetData></worksheet>`
}

// Two cell formats: plain, and bold for the heading.
const STYLES = `${XML}<styleSheet xmlns="${MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`

/** A sheet name as Excel takes it: at most 31 characters, without the characters it keeps for itself. */
const sheetName = (name: string): string => name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Ark'

/** Writes the tables as a workbook Excel opens, a sheet per table, for `readXlsx` to read back. */
export const writeXlsx = (tables: SheetTable[]): Uint8Array => {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `${XML}<Types xmlns="${PACKAGE}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${TYPE}.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="${TYPE}.styles+xml"/>${tables
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${TYPE}.worksheet+xml"/>`)
        .join('')}</Types>`,
    ),
    '_rels/.rels': strToU8(`${XML}<Relationships xmlns="${PACKAGE}/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(
      `${XML}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>${tables.map((table, i) => `<sheet name="${encodeXml(sheetName(table.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${XML}<Relationships xmlns="${PACKAGE}/relationships">${tables.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${tables.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/styles.xml': strToU8(STYLES),
  }
  tables.forEach((table, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(table))))
  return zipSync(files)
}
