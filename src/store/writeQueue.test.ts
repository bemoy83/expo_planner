import { describe, expect, it } from 'vitest'
import { writeQueue } from './writeQueue'

describe('writeQueue', () => {
  it('writes each record once, as it was at the end of the event', async () => {
    const written: { id: string; value: number }[][] = []
    const queue = writeQueue<{ id: string; value: number }>(async (records) => void written.push(records))
    const done = [queue.put({ id: 'a', value: 1 }), queue.put({ id: 'b', value: 1 }), queue.put({ id: 'a', value: 2 })]
    expect(written).toEqual([])
    await Promise.all(done)
    expect(written).toEqual([[{ id: 'a', value: 2 }, { id: 'b', value: 1 }]])
  })

  it('starts a new write for the next event', async () => {
    const written: string[][] = []
    const queue = writeQueue<{ id: string }>(async (records) => void written.push(records.map((r) => r.id)))
    await queue.put({ id: 'a' })
    await queue.put({ id: 'b' })
    expect(written).toEqual([['a'], ['b']])
  })

  it('does not write back a record deleted in the same event', async () => {
    const written: string[][] = []
    const queue = writeQueue<{ id: string }>(async (records) => void written.push(records.map((r) => r.id)))
    const done = queue.put({ id: 'a' })
    queue.drop('a')
    await done
    expect(written).toEqual([])
  })

  it('passes a failed write on to everyone waiting for it', async () => {
    const queue = writeQueue<{ id: string }>(() => Promise.reject(new Error('full')))
    await expect(Promise.all([queue.put({ id: 'a' }), queue.put({ id: 'b' })])).rejects.toThrow('full')
  })
})
