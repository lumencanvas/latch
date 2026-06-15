import { describe, it, expect } from 'vitest'
import { collectTransferables } from '@/services/ai/imageTransfer'

/**
 * Image pixel data is sent to the AI worker as a typed array whose backing
 * ArrayBuffer is transferred (zero-copy) instead of structured-cloning a large
 * `number[]` (the old `Array.from(imageData.data)` path). collectTransferables
 * derives the transfer list from a message's args.
 */
describe('collectTransferables', () => {
  it('returns the backing buffer of image pixel data (zero-copy transfer)', () => {
    const data = new Uint8ClampedArray([1, 2, 3, 4])
    const transfer = collectTransferables([{ width: 1, height: 1, data }, 5])
    expect(transfer).toHaveLength(1)
    expect(transfer[0]).toBe(data.buffer)
    expect(transfer[0]).toBeInstanceOf(ArrayBuffer)
  })

  it('transfers nothing for non-image args (strings, numbers, plain arrays)', () => {
    expect(collectTransferables(['data:image/png;base64,xyz', 5])).toEqual([])
    expect(collectTransferables([{ data: [1, 2, 3] }])).toEqual([]) // plain array is not a view
    expect(collectTransferables([{ notData: 1 }])).toEqual([])
  })

  it('handles missing, empty, or non-array args', () => {
    expect(collectTransferables(undefined)).toEqual([])
    expect(collectTransferables([])).toEqual([])
    // A non-array slipping through the `unknown` cast must not throw.
    expect(collectTransferables({} as unknown as readonly unknown[])).toEqual([])
  })

  it('collects buffers from multiple typed-array payloads', () => {
    const a = new Uint8ClampedArray([1, 2])
    const b = new Float32Array([3, 4])
    const transfer = collectTransferables([{ data: a }, { data: b }])
    expect(transfer).toHaveLength(2)
    expect(transfer).toContain(a.buffer)
    expect(transfer).toContain(b.buffer)
  })
})
