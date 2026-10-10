import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { cellAt, dataRows, findHeader, readXlsx, writeXlsx } from './xlsx'

describe('writing a workbook', () => {
  const bytes = writeXlsx([
    {
      name: 'KPI',
      head: ['Produkttype', 'Enhet', 'Sats'],
      rows: [
        ['14 [FOGA-vegger]', 'lm', 7.01],
        ['Disker & Podier <små> "x"', 'm²', null],
        ['Blåbærsyltetøy', '', 0],
        [' med mellomrom ', true, -1.5e-7],
      ],
    },
    { name: 'Navn [med] tegn: */? som Excel ikke tar og som er altfor langt', head: ['A'], rows: [] },
  ])

  it('is read back cell for cell', () => {
    const sheets = readXlsx(bytes)
    expect([...sheets.keys()]).toEqual(['KPI', 'Navn  med  tegn      som Excel'])
    const sheet = sheets.get('KPI')!
    const cells = dataRows(sheet, 0).map((row) => [0, 1, 2].map((col) => cellAt(sheet, row, col)))
    expect(cells).toEqual([
      ['Produkttype', 'Enhet', 'Sats'],
      ['14 [FOGA-vegger]', 'lm', 7.01],
      ['Disker & Podier <små> "x"', 'm²', null],
      ['Blåbærsyltetøy', null, 0],
      [' med mellomrom ', true, -1.5e-7],
    ])
    expect(findHeader(sheet, ['produkttype', 'sats'])).toEqual({ row: 1, columns: new Map([['produkttype', 0], ['enhet', 1], ['sats', 2]]) })
  })

  it('holds the parts Excel asks for, each well-formed', () => {
    const files = unzipSync(bytes)
    expect(Object.keys(files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'])
    for (const [path, content] of Object.entries(files)) {
      const doc = new DOMParser().parseFromString(strFromU8(content), 'application/xml')
      expect(doc.querySelector('parsererror'), path).toBeNull()
    }
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml'])
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr">')
    expect(sheet).toContain('<c r="C2"><v>7.01</v></c>')
    expect(sheet).toContain('Disker &amp; Podier &lt;små&gt; &quot;x&quot;')
  })
})
