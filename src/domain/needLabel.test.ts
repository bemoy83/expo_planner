import { describe, expect, it } from 'vitest'
import { staffedLabel } from './needLabel'

describe("Faste's label", () => {
  it('fills from the left by the hours assigned, with what is missing on it', () => {
    expect(staffedLabel({ demand: 30, assigned: 15, remaining: 15 }, 0, 0.05)).toEqual({ segs: [{ kind: 'covered', from: 0, width: 0.5 }], rules: [], figure: -15, alert: false, of: { done: 15, need: 30 } })
  })

  it('is full with no figure where the day is covered', () => {
    expect(staffedLabel({ demand: 7.5, assigned: 7.5, remaining: 0 }, 0, 0.05)).toEqual({ segs: [{ kind: 'covered', from: 0, width: 1 }], rules: [], figure: null, alert: false, of: { done: 7.5, need: 7.5 } })
  })

  it('has what is given beyond the demand as the tail, with the figure in the alerts ink', () => {
    expect(staffedLabel({ demand: 7.5, assigned: 15, remaining: -7.5 }, 0, 0.05)).toEqual({
      segs: [
        { kind: 'covered', from: 0, width: 0.5 },
        { kind: 'surplus', from: 0.5, width: 0.5 },
      ],
      rules: [],
      figure: 7.5,
      alert: true,
      of: { done: 15, need: 7.5 },
    })
  })

  it('has no hours of the demand to show where the day needs none', () => {
    expect(staffedLabel({ demand: 0, assigned: 7.5, remaining: -7.5 }, 0, 0.05).of).toBeNull()
  })

  it('hatches at the end the hours the staff cannot cover in normal time', () => {
    const label = staffedLabel({ demand: 30, assigned: 0, remaining: 30 }, 7.5, 0.05)
    expect(label.segs).toEqual([{ kind: 'uncoverable', from: 0.75, width: 0.25 }])
    expect(label).toMatchObject({ figure: -30, alert: true })
  })
})
