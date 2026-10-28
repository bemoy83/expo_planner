import { act, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Counts what each memoized component draws, by name, so the test can say which weeks of the lines a scroll draws again.
const drawn: Record<string, number> = {}
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  const memo = ((component: (props: object) => unknown, same?: (a: object, b: object) => boolean) => {
    const counted = (props: object) => {
      drawn[component.name] = (drawn[component.name] ?? 0) + 1
      return component(props)
    }
    return actual.memo(counted as never, same)
  }) as typeof actual.memo
  return { ...actual, memo, default: { ...actual, memo } }
})

const { cleanupKalender, renderKalender, workspaceOf } = await import('../test/kalenderHarness')

const recount = () => Object.keys(drawn).forEach((key) => delete drawn[key])

/** The harness's season with a second event in February, so there are months to scroll through. */
const season = () => {
  const ws = workspaceOf()
  return workspaceOf({ venue: [...ws.venue, { id: 'v2', hall: 'B1', eventName: 'Hage 2027', status: 'Bekreftet', phases: { assembly: { start: '2027-02-08', end: '2027-02-10' }, event: { start: '2027-02-11', end: '2027-02-13' }, dismantle: { start: '2027-02-14', end: '2027-02-15' } } }] })
}

async function scrolled(prefs: Record<string, unknown>) {
  const { container } = await renderKalender(season(), prefs)
  const grid = container.querySelector<HTMLElement>('.grid-scroll')!
  const colW = parseFloat(grid.style.getPropertyValue('--col-w'))
  const scrollTo = async (days: number) => {
    await act(async () => {
      grid.scrollLeft = days * colW
      fireEvent.scroll(grid)
    })
  }
  return { container, scrollTo }
}

describe('the days of a line, a week at a time', () => {
  afterEach(cleanupKalender)

  for (const [mode, prefs, line, lineKinds] of [
    ['Plan', {}, 'AllocRow', ['AllocRow', 'GroupRow']],
    ['Faste', { planMode: 'bemanning', crewPart: 'faste' }, 'PersonLine', ['PersonLine']],
  ] as const) {
    it(`draws only the week that comes in when the days are scrolled, in ${mode}`, async () => {
      const { scrollTo } = await scrolled(prefs)
      // The harness's period begins on Thursday 1 October 2026: day 4 is Monday the 5th, when VVS 2026 is built up.
      await scrollTo(4.1)
      recount()
      // Within the same day at both edges, nothing is drawn again.
      await scrollTo(4.4)
      expect(drawn.DayChunk ?? 0).toBe(0)
      // A day further, the drawn weeks are the same: no week of a line is drawn again.
      await scrollTo(5.1)
      expect(drawn.DayChunk ?? 0).toBe(0)
      // A week further: each line draws the week that came in, and only that.
      recount()
      await scrollTo(11.1)
      const lines = lineKinds.reduce((sum, kind) => sum + (drawn[kind] ?? 0), 0)
      expect(drawn[line]).toBeGreaterThan(0)
      expect(drawn.DayChunk).toBe(lines)
    })
  }
})
