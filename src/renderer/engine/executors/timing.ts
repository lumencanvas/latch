/**
 * Timing node executors — clocks / sequencers (start, interval, delay, timer,
 * metronome, step-sequencer). Per-node state via defineNodeState (auto gc/dispose).
 * Extracted from index.ts (Phase 1 de-monolith).
 */
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { defineNodeState } from '../nodeState'

// Track if start has fired for each node
// Set modelled as a presence store (value is always true) so it shares the
// auto-registered gc/dispose lifecycle with the other timing groups.
export const startFiredNodes = defineNodeState<true>({ label: 'start' })

export const startExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  // Fire once on first frame, then never again
  if (ctx.frameCount === 0 || !startFiredNodes.has(ctx.nodeId)) {
    startFiredNodes.set(ctx.nodeId, true)
    return new Map([['trigger', 1]])
  }
  // Don't output anything after first frame
  return new Map()
}

// Track interval state per node
export const intervalState = defineNodeState<{ lastFire: number }>({ label: 'interval' })

export const intervalExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  // ≥ 1 ms: a 0 / negative / NaN interval used to fire every frame.
  const intervalMs = Math.max(1, ctx.num('interval', 1000))
  const enabled = ctx.bool('enabled', true)

  if (!enabled) {
    // Drop the phase so re-enabling starts a fresh period (instead of firing at once because
    // the stale lastFire is long past).
    intervalState.delete(ctx.nodeId)
    return new Map()
  }

  const currentTime = ctx.totalTime * 1000
  let state = intervalState.get(ctx.nodeId)
  if (!state) {
    state = { lastFire: currentTime }
    intervalState.set(ctx.nodeId, state)
  }

  if (currentTime - state.lastFire >= intervalMs) {
    // Advance on the SCHEDULE (lastFire += interval), not to "now": snapping to the frame
    // time slipped the period by up to a frame every tick (1000 ms at 60 fps ran ~1008 ms).
    // After a long stall (hidden tab) resync instead of bursting to catch up.
    state.lastFire += intervalMs
    if (currentTime - state.lastFire >= intervalMs) state.lastFire = currentTime
    return new Map([['trigger', 1]])
  }

  // Don't output anything between intervals
  return new Map()
}

// Delay line: every frame's input (including "nothing") is queued, so the output replays the
// input TIMELINE shifted by the delay. The old version queued only defined values and HELD the
// last one forever: a delayed 1-frame trigger became a permanently-high signal, so downstream
// edge detectors fired once and never again.
export const delayState = defineNodeState<{ queue: Array<{ value: unknown; fireAt: number }>; lastOutput: unknown }>({ label: 'delay' })

const DELAY_MAX_QUEUE = 20000 // ~5.5 min at 60 fps; a backstop, not a design limit

export const delayExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  // Clamp wired values to the control's 0–10 s range: the queue backstop (DELAY_MAX_QUEUE)
  // would otherwise silently drop the head of a longer delay at high frame rates.
  const delayMs = Math.min(10000, Math.max(0, ctx.num('delay', 500)))
  const input = ctx.inputs.get('value')

  let state = delayState.get(ctx.nodeId)
  if (!state) {
    state = { queue: [], lastOutput: undefined }
    delayState.set(ctx.nodeId, state)
  }

  const currentTime = ctx.totalTime * 1000
  state.queue.push({ value: input, fireAt: currentTime + delayMs })
  if (state.queue.length > DELAY_MAX_QUEUE) state.queue.shift()

  // Release everything that is due. If several entries are due in one frame, emit the last
  // DEFINED one so a pulse followed by silence in the same frame isn't swallowed.
  let released = false
  let out: unknown
  while (state.queue.length > 0 && state.queue[0].fireAt <= currentTime) {
    const v = state.queue.shift()!.value
    released = true
    if (v !== undefined) out = v
  }
  if (released) state.lastOutput = out
  // Before anything is due, hold the previous release (continuous values stay continuous).
  // Note a released `undefined` (the source was silent) is passed on as silence.
  return new Map([['value', state.lastOutput]])
}

// Track timer state per node
export const timerState = defineNodeState<{ running: boolean; startTime: number; pausedAt: number }>({ label: 'timer' })

export const timerExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  // Rising edges for all three: a held-high reset re-zeroed every frame (and blocked start),
  // and a held-high start immediately restarted the timer after every stop.
  const start = ctx.trig('start')
  const stop = ctx.trig('stop')
  const reset = ctx.trig('reset')

  let state = timerState.get(ctx.nodeId)
  if (!state) {
    state = { running: false, startTime: 0, pausedAt: 0 }
    timerState.set(ctx.nodeId, state)
  }

  const currentTime = ctx.totalTime * 1000

  if (reset) {
    state.running = false
    state.startTime = currentTime
    state.pausedAt = 0
  } else if (start && !state.running) {
    state.running = true
    state.startTime = currentTime - state.pausedAt
  } else if (stop && state.running) {
    state.running = false
    state.pausedAt = currentTime - state.startTime
  }

  const elapsed = state.running
    ? (currentTime - state.startTime) / 1000
    : state.pausedAt / 1000

  return new Map([
    ['elapsed', elapsed],
    ['running', state.running ? 1 : 0],
  ])
}

// Track metronome state per node
export const metronomeState = defineNodeState<{
  running: boolean
  /** Position in SUB-beats (ticks), accumulated per frame so BPM changes are smooth. */
  pos: number
  lastTime: number
  lastFrame: number
  lastTick: number
  lastBarNum: number
  prevRunning: boolean
  /** Beat/bar output last frame (to guarantee a low frame between consecutive triggers). */
  beatHigh: boolean
  barHigh: boolean
  /** A tick/bar that landed while the output was still high, emitted next frame. */
  beatPending: boolean
  barPending: boolean
}>({ label: 'metronome' })

const SUBDIVISIONS: Record<string, number> = { '1': 1, '1/2': 2, '1/4': 4, '1/8': 8, '1/16': 16 }

export const metronomeExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  // BPM clamped to a sane range: 0 froze the clock, negative ran it backwards (and a backwards
  // tick still counted as a "new beat").
  const bpm = Math.max(1, Math.min(999, ctx.num('bpm', 120)))
  const beatsPerBar = Math.max(1, Math.floor(ctx.num('beatsPerBar', 4)))
  const subdivision = SUBDIVISIONS[String(ctx.controls.get('subdivision') ?? '1')] ?? 1
  const swing = Math.max(0, Math.min(100, ctx.num('swing', 0)))
  const runningControl = (ctx.controls.get('running') as boolean) ?? true

  const fresh = () => ({
    pos: 0, lastTime: ctx.totalTime, lastFrame: -2, lastTick: -1, lastBarNum: -1,
    beatHigh: false, barHigh: false, beatPending: false, barPending: false,
  })
  let state = metronomeState.get(ctx.nodeId)
  if (!state) {
    state = { running: runningControl, prevRunning: runningControl, ...fresh() }
    metronomeState.set(ctx.nodeId, state)
  }

  const hasStart = ctx.trig('start')
  const hasStop = ctx.trig('stop')

  // Reconcile the `running` toggle CONTROL every frame with edge memory — it was read only at
  // init, so toggling it after the first frame did nothing. A false→true edge starts (and rezeros
  // the beat), true→false stops. Composes with the start/stop trigger inputs below.
  if (runningControl && !state.prevRunning) {
    Object.assign(state, fresh(), { running: true })
  } else if (!runningControl && state.prevRunning) {
    state.running = false
  }
  state.prevRunning = runningControl

  if (hasStart && !state.running) {
    Object.assign(state, fresh(), { running: true })
  }
  if (hasStop && state.running) {
    state.running = false
  }

  const outputs = new Map<string, unknown>()

  if (!state.running) {
    outputs.set('beat', 0)
    outputs.set('bar', 0)
    outputs.set('beatNum', 0)
    outputs.set('barNum', 0)
    outputs.set('phase', 0)
    return outputs
  }

  // Advance by THIS frame's time at THIS frame's tempo. Deriving position from
  // `elapsed * bpm` made every BPM change jump the position (at t = 100 s, 120 → 121 BPM
  // leaps ~13 ticks), skipping or repeating beats.
  const dt = Math.max(0, ctx.totalTime - state.lastTime)
  state.lastTime = ctx.totalTime
  if (state.lastTick >= 0) state.pos += dt * (bpm / 60) * subdivision

  // Swing: within each PAIR of ticks the off-beat is delayed by up to half a tick (swing 100
  // → 3:1). It now delays the off-beat TRIGGER itself; previously only the phase output was
  // warped, so swing was inaudible on anything driven by `beat`.
  const s = (swing / 100) * 0.5
  const pair = Math.floor(state.pos / 2)
  const inPair = state.pos - pair * 2 // [0, 2)
  const offbeat = s > 0 ? inPair >= 1 + s : inPair >= 1
  const tick = pair * 2 + (offbeat ? 1 : 0)
  const phase = s > 0
    ? (offbeat ? (inPair - (1 + s)) / (1 - s) : inPair / (1 + s))
    : inPair % 1

  // Musical position: `beatNum` counts BEATS within the bar (subdivision ticks fire `beat`
  // more often but don't advance the beat number).
  const beatIndex = Math.floor(tick / subdivision)
  const beatNum = beatIndex % beatsPerBar
  const barNum = Math.floor(beatIndex / beatsPerBar)

  const newTick = tick !== state.lastTick
  const newBar = newTick && tick % (subdivision * beatsPerBar) === 0 && barNum !== state.lastBarNum
  state.lastTick = tick
  if (newBar) state.lastBarNum = barNum

  // Trigger outputs must drop LOW between pulses or downstream edge detectors miss them: with
  // fast ticks (1/16 at high BPM) every frame was a "new beat", so `beat` stayed 1 forever.
  // A tick landing while the output is still high is deferred one frame.
  const emit = (fire: boolean, high: boolean, pending: boolean): [boolean, boolean] => {
    const want = fire || pending
    if (!want) return [false, false]
    return high ? [false, true] : [true, false]
  }
  // "High last frame" only matters if we ran on the immediately preceding frame.
  const consecutive = ctx.frameCount === state.lastFrame + 1
  state.lastFrame = ctx.frameCount
  const [beatOut, beatPend] = emit(newTick, consecutive && state.beatHigh, state.beatPending)
  const [barOut, barPend] = emit(newBar, consecutive && state.barHigh, state.barPending)
  state.beatHigh = beatOut
  state.beatPending = beatPend
  state.barHigh = barOut
  state.barPending = barPend

  outputs.set('beat', beatOut ? 1 : 0)
  outputs.set('bar', barOut ? 1 : 0)
  outputs.set('beatNum', beatNum + 1) // 1-indexed for display
  outputs.set('barNum', barNum + 1) // 1-indexed for display
  outputs.set('phase', Math.max(0, Math.min(1, phase)))

  return outputs
}

// Track step sequencer state per node
export const stepSequencerState = defineNodeState<{
  /** -1 = "armed": the next clock plays step 1 (fresh start / after reset). */
  currentStep: number
  direction: 1 | -1 // For ping-pong mode
}>({ label: 'step-sequencer' })

export const stepSequencerExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const steps = Math.max(1, Math.min(64, Math.floor(ctx.num('steps', 8))))
  const mode = (ctx.controls.get('mode') as string) ?? 'Forward'
  const rawValues = ctx.controls.get('stepValues')
  const stepValues = Array.isArray(rawValues) ? (rawValues as unknown[]) : []

  let state = stepSequencerState.get(ctx.nodeId)
  if (!state) {
    state = { currentStep: -1, direction: 1 }
    stepSequencerState.set(ctx.nodeId, state)
  }

  const outputs = new Map<string, unknown>()

  // Rising edges: a held-high reset used to pin the sequencer to step 1 AND block the clock.
  const reset = ctx.trig('reset')
  const clockRising = ctx.trig('clock')
  if (reset) {
    // Re-arm so the NEXT clock (possibly this very frame — e.g. bar + beat together) plays
    // step 1. Previously the first clock after start/reset skipped straight to step 2, so
    // step 1 never sounded on the first pass.
    state.currentStep = -1
    state.direction = 1
  }
  // Steps lowered below the playhead: fold it back into range.
  if (state.currentStep >= steps) state.currentStep = state.currentStep % steps

  if (clockRising) {
    if (state.currentStep < 0) {
      state.currentStep = mode === 'Backward' ? steps - 1 : mode === 'Random' ? Math.floor(Math.random() * steps) : 0
      state.direction = 1
    } else {
      switch (mode) {
        case 'Backward':
          state.currentStep = (state.currentStep - 1 + steps) % steps
          break
        case 'Ping-Pong':
          if (steps === 1) break
          state.currentStep += state.direction
          if (state.currentStep >= steps - 1) {
            state.currentStep = steps - 1
            state.direction = -1
          } else if (state.currentStep <= 0) {
            state.currentStep = 0
            state.direction = 1
          }
          break
        case 'Random':
          state.currentStep = Math.floor(Math.random() * steps)
          break
        case 'Forward':
        default:
          state.currentStep = (state.currentStep + 1) % steps
          break
      }
    }
  }

  // While armed, report step 1 (what the next clock will play).
  const shown = state.currentStep < 0 ? (mode === 'Backward' ? steps - 1 : 0) : state.currentStep
  const raw = Number(stepValues[shown])
  const stepValue = Number.isFinite(raw) ? raw : 0
  const isGateOn = stepValue > 0.5

  outputs.set('gate', clockRising && isGateOn ? 1 : 0)
  outputs.set('value', stepValue)
  outputs.set('step', shown + 1) // 1-indexed for display

  return outputs
}
