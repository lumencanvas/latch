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
  const intervalMs = (ctx.controls.get('interval') as number) ?? 1000
  const enabled = (ctx.inputs.get('enabled') ?? ctx.controls.get('enabled') ?? true) as boolean

  if (!enabled) {
    return new Map()
  }

  let state = intervalState.get(ctx.nodeId)
  if (!state) {
    state = { lastFire: ctx.totalTime * 1000 }
    intervalState.set(ctx.nodeId, state)
  }

  const currentTime = ctx.totalTime * 1000
  const elapsed = currentTime - state.lastFire

  if (elapsed >= intervalMs) {
    state.lastFire = currentTime
    return new Map([['trigger', 1]])
  }

  // Don't output anything between intervals
  return new Map()
}

// Track delay state per node (queue + last output)
export const delayState = defineNodeState<{ queue: Array<{ value: unknown; fireAt: number }>; lastOutput: unknown }>({ label: 'delay' })

export const delayExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const delayMs = (ctx.controls.get('delay') as number) ?? 500
  const input = ctx.inputs.get('value')

  let state = delayState.get(ctx.nodeId)
  if (!state) {
    state = { queue: [], lastOutput: undefined }
    delayState.set(ctx.nodeId, state)
  }

  const currentTime = ctx.totalTime * 1000

  // Add new input to queue if it exists
  if (input !== undefined) {
    state.queue.push({ value: input, fireAt: currentTime + delayMs })
  }

  // Check if any queued values should fire
  while (state.queue.length > 0 && state.queue[0].fireAt <= currentTime) {
    state.lastOutput = state.queue.shift()!.value
  }

  return new Map([['value', state.lastOutput]])
}

// Track timer state per node
export const timerState = defineNodeState<{ running: boolean; startTime: number; pausedAt: number }>({ label: 'timer' })

export const timerExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const start = ctx.inputs.get('start') as boolean
  const stop = ctx.inputs.get('stop') as boolean
  const reset = ctx.inputs.get('reset') as boolean

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
  startTime: number
  lastBeatNum: number
  lastBarNum: number
}>({ label: 'metronome' })

export const metronomeExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const startTrigger = ctx.inputs.get('start')
  const stopTrigger = ctx.inputs.get('stop')
  const bpmInput = ctx.inputs.get('bpm') as number | undefined
  const bpmControl = (ctx.controls.get('bpm') as number) ?? 120
  const bpm = bpmInput ?? bpmControl

  const beatsPerBar = (ctx.controls.get('beatsPerBar') as number) ?? 4
  const subdivisionStr = (ctx.controls.get('subdivision') as string) ?? '1'
  const swing = (ctx.controls.get('swing') as number) ?? 0
  const runningControl = (ctx.controls.get('running') as boolean) ?? true

  // Parse subdivision
  const subdivisionMap: Record<string, number> = {
    '1': 1,
    '1/2': 2,
    '1/4': 4,
    '1/8': 8,
    '1/16': 16,
  }
  const subdivision = subdivisionMap[subdivisionStr] ?? 1

  // Initialize state
  let state = metronomeState.get(ctx.nodeId)
  if (!state) {
    state = { running: runningControl, startTime: ctx.totalTime, lastBeatNum: -1, lastBarNum: -1 }
    metronomeState.set(ctx.nodeId, state)
  }

  // Handle start/stop triggers
  const hasStart = startTrigger === true || startTrigger === 1 || (typeof startTrigger === 'number' && startTrigger > 0)
  const hasStop = stopTrigger === true || stopTrigger === 1 || (typeof stopTrigger === 'number' && stopTrigger > 0)

  if (hasStart && !state.running) {
    state.running = true
    state.startTime = ctx.totalTime
    state.lastBeatNum = -1
    state.lastBarNum = -1
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

  // Calculate timing
  const beatsPerSecond = bpm / 60
  const subBeatsPerSecond = beatsPerSecond * subdivision
  const elapsedTime = ctx.totalTime - state.startTime

  // Calculate current beat (with subdivision)
  const totalSubBeats = elapsedTime * subBeatsPerSecond
  const subBeatNum = Math.floor(totalSubBeats)

  // Apply swing to every other beat
  let phase = totalSubBeats % 1
  // Clamp swing value to 0-100 range to prevent invalid phase values
  const clampedSwing = Math.max(0, Math.min(100, swing))
  if (clampedSwing > 0 && subBeatNum % 2 === 1) {
    // Delay odd beats based on swing amount
    const swingAmount = clampedSwing / 100 * 0.5
    phase = (phase - swingAmount + 1) % 1
  }

  // Calculate beat and bar numbers
  const beatNum = Math.floor(subBeatNum / subdivision) % beatsPerBar
  const barNum = Math.floor(subBeatNum / subdivision / beatsPerBar)

  // Detect beat and bar triggers
  const isBeat = subBeatNum !== state.lastBeatNum
  const isBar = beatNum === 0 && isBeat && barNum !== state.lastBarNum

  state.lastBeatNum = subBeatNum
  if (isBar) {
    state.lastBarNum = barNum
  }

  outputs.set('beat', isBeat ? 1 : 0)
  outputs.set('bar', isBar ? 1 : 0)
  outputs.set('beatNum', beatNum + 1) // 1-indexed for display
  outputs.set('barNum', barNum + 1) // 1-indexed for display
  outputs.set('phase', phase)

  return outputs
}

// Track step sequencer state per node
export const stepSequencerState = defineNodeState<{
  currentStep: number
  direction: 1 | -1 // For ping-pong mode
  lastClockState: boolean
}>({ label: 'step-sequencer' })

export const stepSequencerExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const clock = ctx.inputs.get('clock')
  const reset = ctx.inputs.get('reset')

  const steps = (ctx.controls.get('steps') as number) ?? 8
  const mode = (ctx.controls.get('mode') as string) ?? 'Forward'
  const stepValues = (ctx.controls.get('stepValues') as number[]) ?? []

  // Initialize state
  let state = stepSequencerState.get(ctx.nodeId)
  if (!state) {
    state = { currentStep: 0, direction: 1, lastClockState: false }
    stepSequencerState.set(ctx.nodeId, state)
  }

  const outputs = new Map<string, unknown>()

  // Handle reset
  const hasReset = reset === true || reset === 1 || (typeof reset === 'number' && reset > 0)
  if (hasReset) {
    state.currentStep = 0
    state.direction = 1
  }

  // Detect clock edge (rising edge)
  const hasClock = clock === true || clock === 1 || (typeof clock === 'number' && clock > 0)
  const clockRising = hasClock && !state.lastClockState
  state.lastClockState = hasClock

  // Advance step on clock
  if (clockRising && !hasReset) {
    switch (mode) {
      case 'Forward':
        state.currentStep = (state.currentStep + 1) % steps
        break
      case 'Backward':
        state.currentStep = (state.currentStep - 1 + steps) % steps
        break
      case 'Ping-Pong':
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
    }
  }

  // Get current step value
  const stepValue = stepValues[state.currentStep] ?? 0
  const isGateOn = stepValue > 0.5

  outputs.set('gate', clockRising && isGateOn ? 1 : 0)
  outputs.set('value', stepValue)
  outputs.set('step', state.currentStep + 1) // 1-indexed for display

  return outputs
}
