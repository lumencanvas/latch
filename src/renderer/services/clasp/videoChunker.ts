/**
 * Video Chunker Utility
 * Handles splitting encoded video frames into chunks for CLASP transport
 * and reassembling them on the receiving end.
 *
 * TypeScript port of clasp/site/src/lib/videoChunker.js
 */

export interface VideoChunk {
  seq: number
  chunkIndex: number
  totalChunks: number
  frameType: string
  timestamp: number
  data: Uint8Array
  description?: Uint8Array
}

export interface AssembledFrame {
  seq: number
  frameType: string
  timestamp: number
  data: Uint8Array
  description?: Uint8Array
}

export interface ChunkAssemblerOptions {
  onFrame?: (frame: AssembledFrame) => void
  onError?: (error: Error) => void
  maxBufferedFrames?: number
}

interface FrameBuffer {
  chunks: Map<number, Uint8Array>
  totalChunks: number
  frameType: string
  timestamp: number
  receivedAt: number
  totalSize: number
  description?: Uint8Array
}

/**
 * Create a sequence generator for a specific stream.
 * Avoids global mutable state issues with multiple instances.
 */
export function createSequenceGenerator(): () => number {
  let seq = 0
  return () => seq++
}

/**
 * Split an encoded video frame into chunks suitable for CLASP transport.
 */
export function chunkFrame(
  frameData: Uint8Array,
  frameType: string,
  timestamp: number,
  maxChunkSize = 16000,
  seqGen?: () => number
): VideoChunk[] {
  if (!(frameData instanceof Uint8Array)) {
    throw new TypeError('frameData must be a Uint8Array')
  }

  const chunks: VideoChunk[] = []
  const totalChunks = Math.ceil(frameData.byteLength / maxChunkSize)
  const frameSeq = seqGen ? seqGen() : 0

  for (let i = 0; i < totalChunks; i++) {
    const start = i * maxChunkSize
    const end = Math.min(start + maxChunkSize, frameData.byteLength)
    const chunkData = frameData.slice(start, end)

    chunks.push({
      seq: frameSeq,
      chunkIndex: i,
      totalChunks,
      frameType,
      timestamp,
      data: chunkData,
    })
  }

  return chunks
}

/**
 * Decode chunk from transport.
 * Handles Uint8Array, ArrayBuffer, typed array views, and base64 string input.
 */
export function decodeChunkFromTransport(chunk: unknown): VideoChunk {
  if (!chunk || typeof chunk !== 'object') {
    throw new TypeError('chunk is null or undefined')
  }

  const c = chunk as Record<string, unknown>

  if (c.data instanceof Uint8Array) {
    return c as unknown as VideoChunk
  }

  if (c.data instanceof ArrayBuffer) {
    return {
      ...(c as unknown as VideoChunk),
      data: new Uint8Array(c.data as ArrayBuffer),
    }
  }

  // Handle typed array views
  const data = c.data as { buffer?: ArrayBuffer; byteOffset?: number; byteLength?: number } | null
  if (data && data.buffer instanceof ArrayBuffer) {
    return {
      ...(c as unknown as VideoChunk),
      data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    }
  }

  // Legacy base64 string support
  if (typeof c.data === 'string') {
    try {
      const binary = atob(c.data)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return {
        ...(c as unknown as VideoChunk),
        data: bytes,
      }
    } catch (e) {
      throw new Error(`Failed to decode chunk: ${(e as Error).message}`)
    }
  }

  throw new TypeError(
    `chunk.data must be Uint8Array, ArrayBuffer, or base64 string. Got: ${
      (c.data as { constructor?: { name?: string } })?.constructor?.name || typeof c.data
    }`
  )
}

/**
 * ChunkAssembler - Buffers incoming chunks and emits complete frames.
 * Uses a 30-frame buffer with 2-second age pruning.
 */
export class ChunkAssembler {
  private frameBuffers = new Map<number, FrameBuffer>()
  private onFrame: (frame: AssembledFrame) => void
  private onError: (error: Error) => void
  private maxBufferedFrames: number
  lastEmittedSeq = -1

  constructor(options: ChunkAssemblerOptions = {}) {
    this.onFrame = options.onFrame || (() => {})
    this.onError = options.onError || (() => {})
    this.maxBufferedFrames = options.maxBufferedFrames || 30
  }

  addChunk(chunk: VideoChunk): void {
    if (!chunk || typeof chunk.seq !== 'number') {
      this.onError(new Error('Invalid chunk: missing seq'))
      return
    }

    const { seq, chunkIndex, totalChunks, frameType, timestamp, data } = chunk

    if (!(data instanceof Uint8Array)) {
      this.onError(new Error('Invalid chunk: data must be Uint8Array'))
      return
    }

    if (!this.frameBuffers.has(seq)) {
      if (this.frameBuffers.size >= this.maxBufferedFrames) {
        this.pruneOldBuffers()
      }

      this.frameBuffers.set(seq, {
        chunks: new Map(),
        totalChunks,
        frameType,
        timestamp,
        receivedAt: Date.now(),
        totalSize: 0,
      })
    }

    const frameBuffer = this.frameBuffers.get(seq)!

    if (frameBuffer.chunks.has(chunkIndex)) {
      return
    }

    frameBuffer.chunks.set(chunkIndex, data)
    frameBuffer.totalSize += data.byteLength

    if (chunk.description && chunkIndex === 0) {
      frameBuffer.description = chunk.description
    }

    if (frameBuffer.chunks.size === frameBuffer.totalChunks) {
      this.emitFrame(seq)
    }
  }

  private emitFrame(seq: number): void {
    const frameBuffer = this.frameBuffers.get(seq)
    if (!frameBuffer) return

    const frameData = new Uint8Array(frameBuffer.totalSize)
    let offset = 0

    for (let i = 0; i < frameBuffer.totalChunks; i++) {
      const chunk = frameBuffer.chunks.get(i)
      if (!chunk) {
        this.onError(new Error(`Missing chunk ${i} for frame ${seq}`))
        this.frameBuffers.delete(seq)
        return
      }
      frameData.set(chunk, offset)
      offset += chunk.byteLength
    }

    const frame: AssembledFrame = {
      seq,
      frameType: frameBuffer.frameType,
      timestamp: frameBuffer.timestamp,
      data: frameData,
    }
    if (frameBuffer.description) {
      frame.description = frameBuffer.description
    }
    this.onFrame(frame)

    this.lastEmittedSeq = seq
    this.frameBuffers.delete(seq)
  }

  private pruneOldBuffers(): void {
    const now = Date.now()
    const maxAge = 2000

    for (const [seq, buffer] of this.frameBuffers) {
      if (now - buffer.receivedAt > maxAge) {
        this.frameBuffers.delete(seq)
      }
    }

    if (this.frameBuffers.size >= this.maxBufferedFrames) {
      const seqs = Array.from(this.frameBuffers.keys()).sort((a, b) => a - b)
      const toRemove = seqs.slice(0, this.frameBuffers.size - this.maxBufferedFrames + 1)
      toRemove.forEach((seq) => this.frameBuffers.delete(seq))
    }
  }

  clear(): void {
    this.frameBuffers.clear()
    this.lastEmittedSeq = -1
  }

  getStats(): { bufferedFrames: number; lastEmittedSeq: number } {
    return {
      bufferedFrames: this.frameBuffers.size,
      lastEmittedSeq: this.lastEmittedSeq,
    }
  }
}
