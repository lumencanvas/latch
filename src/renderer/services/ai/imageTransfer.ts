/**
 * Zero-copy image transfer to the AI worker.
 *
 * Vision nodes send full-frame pixel data to the worker every inference. The old
 * path did `Array.from(imageData.data)` — building a ~width*height*4 element
 * `number[]` that then gets structured-cloned across the worker boundary (a large
 * allocation + copy per frame). Instead we keep the pixels as a `Uint8ClampedArray`
 * and transfer its backing `ArrayBuffer` (zero-copy). `collectTransferables`
 * derives the postMessage transfer list from a message's args.
 */

/** Image payload sent to the worker: a typed array so its buffer can be transferred. */
export interface SerializedImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

/**
 * Transferable buffers for a worker message's args: the backing `ArrayBuffer` of
 * any `ArrayBufferView` argument (i.e. image pixel data). Strings, numbers, and
 * plain arrays contribute nothing, so non-image messages transfer nothing. Audio
 * is sent as a `number[]`, so it is unaffected and never accidentally detached.
 */
export function collectTransferables(args: readonly unknown[] | undefined): Transferable[] {
  // args is cast from `unknown` at the call site, so guard against non-arrays
  // (messages with no args) rather than just nullish values.
  if (!Array.isArray(args)) return []
  const transfer: Transferable[] = []
  for (const arg of args) {
    if (arg && typeof arg === 'object' && 'data' in arg) {
      const data = (arg as { data: unknown }).data
      if (ArrayBuffer.isView(data)) transfer.push((data as ArrayBufferView).buffer)
    }
  }
  return transfer
}
