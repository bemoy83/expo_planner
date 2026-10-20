import { describe, expect, it } from 'vitest'
import { History } from './history'
import type { Delta } from './records'

const cell = (id: string, before: number | null, after: number | null, by?: string): Delta => ({ kind: 'allocCell', id, before: before === null ? null : { fte: before }, after: after === null ? null : { fte: after }, ...(by ? { by } : {}) })

describe('undo of one\'s own steps', () => {
  it('undoes all of a step nobody else has touched since', () => {
    const history = new History()
    const step = { deltas: [cell('r|1', null, 2), cell('r|2', null, 2)], at: history.tick() }
    expect(history.split(step)).toEqual({ deltas: step.deltas, left: [], by: [] })
  })

  it('leaves a record another planner changed after the step, and says who', () => {
    const history = new History()
    const step = { deltas: [cell('r|1', null, 2), cell('r|2', null, 2)], at: history.tick() }
    history.changedElsewhere([cell('r|2', 2, 5, 'kari')])
    const { deltas, left, by } = history.split(step)
    expect(deltas.map((d) => d.id)).toEqual(['r|1'])
    expect(left.map((d) => d.id)).toEqual(['r|2'])
    expect(by).toEqual(['kari'])
  })

  it('undoes a record another planner changed before the step', () => {
    const history = new History()
    history.changedElsewhere([cell('r|1', null, 1, 'kari')])
    const step = { deltas: [cell('r|1', 1, 2)], at: history.tick() }
    expect(history.split(step).left).toEqual([])
  })
})
