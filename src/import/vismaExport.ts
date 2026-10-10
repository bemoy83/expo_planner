import { withProjectNames } from '../domain/visma'
import type { VismaRow } from '../domain/types'
import { dataRows, findHeader, num, readXlsx, text } from './xlsx'

export class VismaFormatError extends Error {}

/** Reads a Visma booking export (`utskrift_visma`). The total row and rows without a project are left out; every project must have its name, see `withProjectNames`. */
export const readVismaExport = (bytes: Uint8Array): VismaRow[] => {
  for (const sheet of readXlsx(bytes).values()) {
    const header = findHeader(sheet, ['prosjekt', 'totalt antall', 'produkttype 2'])
    if (!header) continue
    const cell = (row: number, name: string) => {
      const col = header.columns.get(name)
      return col === undefined ? null : (sheet.rows.get(row)?.get(col) ?? null)
    }
    const rows: VismaRow[] = []
    for (const row of dataRows(sheet, header.row)) {
      const projectNo = text(cell(row, 'prosjekt'))
      if (!projectNo || projectNo === '0') continue
      rows.push({
        projectNo,
        eventName: text(cell(row, 'navn2')),
        stand: text(cell(row, 'stand')),
        transInfo: text(cell(row, 'trans.opplysn. 1')),
        customer: text(cell(row, 'navn')),
        avdeling: text(cell(row, 'avdeling')),
        orderNo: text(cell(row, 'ordrenr')),
        articleNo: text(cell(row, 'art.nr')),
        description: text(cell(row, 'beskrivelse')),
        quantity: num(cell(row, 'totalt antall')) ?? 0,
        productGroup: text(cell(row, 'varegr')),
        productType: text(cell(row, 'produkttype 2')),
      })
    }
    if (rows.length) return withProjectNames(rows)
  }
  throw new VismaFormatError('Fant ingen Visma-ordrelinjer. Filen må ha kolonnene «Prosjekt», «Totalt antall» og «Produkttype 2».')
}
