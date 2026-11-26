import { describe, it, expect } from 'vitest'
import { liveRunDue, liveRunStarted, liveRunFinished } from '@/registry/ai/shared'

/** AI models plan, Phase 2: live AI nodes pace themselves by inference latency and frame rate. */
describe('live AI cadence', () => {
  it('runs when due, then waits twice the last inference time', () => {
    const id = 'cad-1'
    expect(liveRunDue(id, true, 1 / 60, 1000)).toBe(true)
    liveRunStarted(id, 1000)
    liveRunFinished(id, 100)
    expect(liveRunDue(id, true, 1 / 60, 1150)).toBe(false) // 150 < 2 × 100
    expect(liveRunDue(id, true, 1 / 60, 1210)).toBe(true)
  })

  it('never runs when its own interval says no', () => {
    expect(liveRunDue('cad-2', false, 1 / 60, 5000)).toBe(false)
  })

  it('waits twice as long while frames are slow (under 24 fps)', () => {
    const id = 'cad-3'
    for (let i = 0; i < 60; i++) liveRunDue(id, false, 1 / 15) // settle the smoothed frame time
    liveRunStarted(id, 0)
    liveRunFinished(id, 100)
    expect(liveRunDue(id, true, 1 / 15, 300)).toBe(false) // needs 4 × 100 at 15 fps
    expect(liveRunDue(id, true, 1 / 15, 410)).toBe(true)
  })
})
