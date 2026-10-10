import { withProjectNames } from '../domain/visma'
import type { VismaRow } from '../domain/types'
import { dataRows, findHeader, num, readXlsx, text } from './xlsx'

export class VismaFormatError extends Error {}

/**
 * The name of a product type from «Produkttype 2», where Visma writes it with a number in front and in brackets:
 * «14 [FOGA-vegger]» is «FOGA-vegger», and «1 [5999 [Diverse]]» is «5999 Diverse». Empty where the text has no
 * brackets, as «0»: the line has no product type. Only what Visma writes is read here; the app knows the name alone.
 */
export const vismaProductType = (text: string): string => {
  const open = text.indexOf('[')
  const close = text.indexOf(']')
  return close > open && open >= 0 ? text.slice(open + 1, close).replace(/[[\]]/g, ' ').replace(/\s+/g, ' ').trim() : ''
}

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
        productType: vismaProductType(text(cell(row, 'produkttype 2'))),
      })
    }
    if (rows.length) return withProjectNames(rows)
  }
  throw new VismaFormatError('Fant ingen Visma-ordrelinjer. Filen må ha kolonnene «Prosjekt», «Totalt antall» og «Produkttype 2».')
}
