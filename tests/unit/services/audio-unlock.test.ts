import { describe, it, expect, vi } from 'vitest'
import {
  needsUserGesture,
  isAudioRunning,
  tryResumeAudio,
  type ResumableContext,
} from '@/services/audio/audioUnlock'

/** A fake AudioContext whose resume() optionally transitions its state. */
function fakeCtx(state: string, onResume?: (c: { state: string }) => void): ResumableContext & { resume: ReturnType<typeof vi.fn> } {
  const c = {
    state,
    resume: vi.fn(async () => {
      onResume?.(c)
    }),
  }
  return c as ResumableContext & { resume: ReturnType<typeof vi.fn> }
}

describe('needsUserGesture', () => {
  it('is true for suspended and iOS interrupted, false otherwise', () => {
    expect(needsUserGesture('suspended')).toBe(true)
    expect(needsUserGesture('interrupted')).toBe(true)
    expect(needsUserGesture('running')).toBe(false)
    expect(needsUserGesture('closed')).toBe(false)
  })
})

describe('isAudioRunning', () => {
  it('is true only for running', () => {
    expect(isAudioRunning('running')).toBe(true)
    expect(isAudioRunning('suspended')).toBe(false)
    expect(isAudioRunning('interrupted')).toBe(false)
  })
})

describe('tryResumeAudio', () => {
  it('returns true immediately when already running (no resume call)', async () => {
    const ctx = fakeCtx('running')
    expect(await tryResumeAudio(ctx)).toBe(true)
    expect(ctx.resume).not.toHaveBeenCalled()
  })

  it('resumes a suspended context and reports running', async () => {
    const ctx = fakeCtx('suspended', (c) => (c.state = 'running'))
    expect(await tryResumeAudio(ctx)).toBe(true)
    expect(ctx.resume).toHaveBeenCalledTimes(1)
  })

  it('recovers an iOS interrupted context', async () => {
    const ctx = fakeCtx('interrupted', (c) => (c.state = 'running'))
    expect(await tryResumeAudio(ctx)).toBe(true)
  })

  it('returns false (no throw) when resume rejects — needs a gesture', async () => {
    const ctx = fakeCtx('suspended')
    ctx.resume.mockRejectedValueOnce(new Error('gesture required'))
    expect(await tryResumeAudio(ctx)).toBe(false)
  })

  it('returns false when resume succeeds but the context is still not running', async () => {
    const ctx = fakeCtx('suspended') // resume resolves but leaves state suspended
    expect(await tryResumeAudio(ctx)).toBe(false)
  })

  it('does not attempt to resume a closed context', async () => {
    const ctx = fakeCtx('closed')
    expect(await tryResumeAudio(ctx)).toBe(false)
    expect(ctx.resume).not.toHaveBeenCalled()
  })
})
