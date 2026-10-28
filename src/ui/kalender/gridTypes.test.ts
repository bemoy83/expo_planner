import { describe, expect, it } from 'vitest'
import { inDrawn, weekInputs, type Columns } from './gridTypes'

describe('weekInputs', () => {
  const week = { from: 7, dates: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'] }
  const cols: Columns = { dates: week.dates, weeks: [week], c0: 7, colW: 36, classes: new Map() }
  const edit = { selFrom: -1, selTo: -1, focusCol: -1, draft: null as string | null, ghost: undefined, livePlanned: undefined }

  it('hands a week the line’s props without the drawn days, with the width of a day and the classes of the days', () => {
    const inputs = weekInputs({ cols, first: 9, lane: 2, ...edit })(week)
    expect(inputs).toEqual({ lane: 2, ...edit, colW: 36, classes: cols.classes })
  })

  it('cuts the selection and the cell in focus to the week, so the weeks they are not in stay as they are', () => {
    const inputs = (selFrom: number, selTo: number, focusCol: number) => weekInputs({ cols, ...edit, selFrom, selTo, focusCol, draft: 'x' })(week)
    expect(inputs(3, 20, 3)).toMatchObject({ selFrom: 7, selTo: 13, focusCol: -1, draft: null })
    expect(inputs(9, 10, 10)).toMatchObject({ selFrom: 9, selTo: 10, focusCol: 10, draft: 'x' })
    expect(inputs(1, 5, 5)).toMatchObject({ selFrom: -1, selTo: -1, focusCol: -1, draft: null })
  })

  it('leaves out what the label alone reads', () => {
    expect(weekInputs({ cols, week: { hours: 7 }, lane: 1 }, ['week'])(week)).not.toHaveProperty('week')
  })
})

describe('inDrawn', () => {
  const dates = ['2026-10-12', '2026-10-13', '2026-10-14']
  const cols: Columns = { dates, weeks: [{ from: 7, dates }], c0: 7, colW: 36, classes: new Map() }

  it('tells whether a span of days reaches into the drawn days', () => {
    expect([[5, 2], [5, 3], [9, 1], [10, 1], [7, 0]].map(([col, span]) => inDrawn(cols, col, span))).toEqual([false, true, true, false, false])
  })
})
