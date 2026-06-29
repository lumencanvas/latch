import { describe, it, expect, vi } from 'vitest'
import { stopVideoElement } from '@/engine/executors/clasp'

/**
 * clasp video-receive builds a <video> from a canvas captureStream for MediaPipe
 * compatibility; on dispose it must stop the stream tracks and release the element,
 * or the captured MediaStream tracks keep running (AUDIT §F).
 */
describe('stopVideoElement (clasp captureStream teardown)', () => {
  it('stops every track, pauses, and clears srcObject', () => {
    const t1 = { stop: vi.fn() }
    const t2 = { stop: vi.fn() }
    const video = {
      srcObject: { getTracks: () => [t1, t2] },
      pause: vi.fn(),
    } as unknown as HTMLVideoElement

    stopVideoElement(video)

    expect(t1.stop).toHaveBeenCalledTimes(1)
    expect(t2.stop).toHaveBeenCalledTimes(1)
    expect((video as unknown as { pause: ReturnType<typeof vi.fn> }).pause).toHaveBeenCalledTimes(1)
    expect(video.srcObject).toBeNull()
  })

  it('is a no-op for null and never throws on a malformed element', () => {
    expect(() => stopVideoElement(null)).not.toThrow()
    const bad = {
      get srcObject() {
        throw new Error('boom')
      },
      pause: vi.fn(),
    } as unknown as HTMLVideoElement
    expect(() => stopVideoElement(bad)).not.toThrow()
  })

  it('tolerates a video with no srcObject', () => {
    const video = { srcObject: null, pause: vi.fn() } as unknown as HTMLVideoElement
    expect(() => stopVideoElement(video)).not.toThrow()
    expect((video as unknown as { pause: ReturnType<typeof vi.fn> }).pause).toHaveBeenCalledTimes(1)
  })
})
