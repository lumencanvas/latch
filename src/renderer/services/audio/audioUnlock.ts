/**
 * Audio gesture-gate + interruption recovery (mobile tier — Phase 5).
 *
 * Mobile browsers (especially iOS Safari) create the AudioContext `suspended` and
 * only allow it to start/resume inside a user gesture. iOS additionally moves the
 * context to a non-standard `interrupted` state on phone calls, Siri, audio-route
 * changes, or backgrounding, requiring a re-resume (again gesture-gated). These
 * pure helpers encapsulate the decision logic so it's testable without a real
 * AudioContext / Tone.js.
 */

/** AudioContext states, including iOS Safari's non-standard `interrupted`. */
export type ExtendedAudioState = 'suspended' | 'running' | 'closed' | 'interrupted'

/** Minimal context surface we need — a raw AudioContext or Tone's context. */
export interface ResumableContext {
  readonly state: string
  resume(): Promise<void>
}

/** Whether the context is stopped in a way only a user gesture can clear. */
export function needsUserGesture(state: string): boolean {
  return state === 'suspended' || state === 'interrupted'
}

/** Whether the context is actively producing audio. */
export function isAudioRunning(state: string): boolean {
  return state === 'running'
}

/**
 * Try to bring the context to `running` (e.g. after an iOS interruption or an
 * inactivity suspend). Returns true if running afterward, false if it still needs
 * a user gesture — iOS rejects `resume()` outside a gesture. Never throws.
 */
export async function tryResumeAudio(ctx: ResumableContext): Promise<boolean> {
  if (ctx.state === 'running') return true
  if (ctx.state === 'closed') return false
  try {
    await ctx.resume()
  } catch {
    return false
  }
  return ctx.state === 'running'
}
