/**
 * Node executors registry
 * Each executor is a function that takes an ExecutionContext and returns outputs
 */

import * as Tone from 'tone'
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { audioExecutors } from './audio'
import { visualExecutors } from './visual'
import { aiExecutors } from './ai'
import { connectivityExecutors } from './connectivity'
import { claspExecutors, disposeClaspNode, disposeAllClaspConnections, getClaspConnectionStatus } from './clasp'
import { codeExecutors } from './code'
import { subflowExecutors } from './subflow'
import { threeExecutors } from './3d'
import { stringExecutors } from './string'
import { messagingExecutors } from './messaging'

// Re-export CLASP utilities for external use
export { disposeClaspNode, disposeAllClaspConnections, getClaspConnectionStatus }

// ============================================================================
// Input Nodes
// ============================================================================

export const constantExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.controls.get('value') ?? 0
  return new Map([['value', value]])
}

// Track previous trigger button state for edge detection
const triggerPrevPressed = new Map<string, boolean>()

export const triggerExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputType = (ctx.controls.get('outputType') as string) ?? 'boolean'
  const boolValue = (ctx.controls.get('value') as boolean) ?? false
  const stringValue = (ctx.controls.get('stringValue') as string) ?? ''
  const jsonValue = (ctx.controls.get('jsonValue') as string) ?? '{}'

  // Edge detection: only fire when value transitions from false to true
  const prevPressed = triggerPrevPressed.get(ctx.nodeId) ?? false
  const shouldFire = boolValue && !prevPressed
  triggerPrevPressed.set(ctx.nodeId, boolValue)

  // Don't output anything if not firing
  if (!shouldFire) {
    return new Map()
  }

  // Firing - output the value
  let output: unknown
  switch (outputType) {
    case 'boolean':
      output = true
      break
    case 'number':
      output = 1
      break
    case 'string':
      output = stringValue
      break
    case 'json':
      try {
        output = JSON.parse(jsonValue)
      } catch {
        output = {}
      }
      break
    case 'timestamp':
      output = Date.now()
      break
    default:
      output = true
  }

  return new Map([['trigger', output]])
}

export const textboxExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const text = (ctx.controls.get('text') as string) ?? ''
  return new Map([['text', text]])
}

export const sliderExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.controls.get('value') ?? 0.5
  return new Map([['value', value]])
}

export const knobExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const rawValue = (ctx.controls.get('value') as number) ?? 0.5
  const min = (ctx.controls.get('min') as number) ?? 0
  const max = (ctx.controls.get('max') as number) ?? 1
  // Map 0-1 knob value to min-max range
  const value = min + rawValue * (max - min)
  return new Map([['value', value]])
}

export const xyPadExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  // Get normalized values (0-1)
  const normX = (ctx.controls.get('normalizedX') as number) ?? 0.5
  const normY = (ctx.controls.get('normalizedY') as number) ?? 0.5

  // Get range values
  const minX = (ctx.controls.get('minX') as number) ?? 0
  const maxX = (ctx.controls.get('maxX') as number) ?? 1
  const minY = (ctx.controls.get('minY') as number) ?? 0
  const maxY = (ctx.controls.get('maxY') as number) ?? 1

  // Calculate raw values (mapped to range)
  const rawX = minX + normX * (maxX - minX)
  const rawY = minY + normY * (maxY - minY)

  return new Map([
    ['rawX', rawX],
    ['rawY', rawY],
    ['normX', normX],
    ['normY', normY],
  ])
}

export const keyboardExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  // Keyboard outputs its values from controls (set by Vue component on key press)
  const note = (ctx.controls.get('note') as number) ?? 60
  const velocity = (ctx.controls.get('velocity') as number) ?? 100
  const gate = (ctx.controls.get('gate') as boolean) ?? false
  const noteOn = (ctx.controls.get('noteOn') as boolean) ?? false

  const outputs = new Map<string, unknown>()
  outputs.set('note', note)
  outputs.set('velocity', velocity)
  outputs.set('gate', gate)
  outputs.set('noteOn', noteOn)
  return outputs
}

export const timeExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  return new Map([
    ['time', ctx.totalTime],
    ['delta', ctx.deltaTime],
    ['frame', ctx.frameCount],
  ])
}

export const lfoExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const frequency = (ctx.controls.get('frequency') as number) ?? 1
  const amplitude = (ctx.controls.get('amplitude') as number) ?? 1
  const offset = (ctx.controls.get('offset') as number) ?? 0
  const waveform = (ctx.controls.get('waveform') as string) ?? 'sine'

  const phase = ctx.totalTime * frequency * Math.PI * 2
  let value: number

  switch (waveform) {
    case 'sine':
      value = Math.sin(phase)
      break
    case 'square':
      value = Math.sin(phase) >= 0 ? 1 : -1
      break
    case 'triangle':
      value = Math.asin(Math.sin(phase)) / (Math.PI / 2)
      break
    case 'sawtooth':
      value = ((ctx.totalTime * frequency) % 1) * 2 - 1
      break
    default:
      value = Math.sin(phase)
  }

  return new Map([['value', value * amplitude + offset]])
}

// ============================================================================
// Math Nodes
// ============================================================================

export const addExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = (ctx.inputs.get('a') as number) ?? 0
  const b = (ctx.inputs.get('b') as number) ?? 0
  return new Map([['result', a + b]])
}

export const subtractExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = (ctx.inputs.get('a') as number) ?? 0
  const b = (ctx.inputs.get('b') as number) ?? 0
  return new Map([['result', a - b]])
}

export const multiplyExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = (ctx.inputs.get('a') as number) ?? 0
  const b = (ctx.inputs.get('b') as number) ?? 1
  return new Map([['result', a * b]])
}

export const divideExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = (ctx.inputs.get('a') as number) ?? 0
  const b = (ctx.inputs.get('b') as number) ?? 1
  return new Map([['result', b !== 0 ? a / b : 0]])
}

export const mapRangeExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const inMin = (ctx.controls.get('inMin') as number) ?? 0
  const inMax = (ctx.controls.get('inMax') as number) ?? 1
  const outMin = (ctx.controls.get('outMin') as number) ?? 0
  const outMax = (ctx.controls.get('outMax') as number) ?? 100

  // Normalize to 0-1 then scale to output range
  const normalized = inMax !== inMin ? (value - inMin) / (inMax - inMin) : 0
  const result = normalized * (outMax - outMin) + outMin

  return new Map([['result', result]])
}

export const clampExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const min = (ctx.controls.get('min') as number) ?? 0
  const max = (ctx.controls.get('max') as number) ?? 1
  return new Map([['result', Math.min(max, Math.max(min, value))]])
}

export const absExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  return new Map([['result', Math.abs(value)]])
}

export const smoothExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const target = (ctx.inputs.get('value') as number) ?? 0
  const rawFactor = (ctx.controls.get('factor') as number) ?? 0.1
  // Guard against NaN and invalid values
  const factor = Number.isFinite(rawFactor) ? rawFactor : 0.1

  // Get previous value from outputs (stateful node)
  const prev = (ctx.controls.get('_prev') as number) ?? target
  const smoothed = prev + (target - prev) * Math.min(1, factor * ctx.deltaTime * 60)

  // Store for next frame (this would need special handling in the engine)
  return new Map([
    ['result', smoothed],
    ['_prev', smoothed], // Internal state
  ])
}

export const randomExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const min = (ctx.controls.get('min') as number) ?? 0
  const max = (ctx.controls.get('max') as number) ?? 1
  const seed = ctx.inputs.get('seed') !== undefined

  // If seed input is connected, use it for deterministic random
  if (seed) {
    const seedValue = ctx.inputs.get('seed') as number
    const x = Math.sin(seedValue * 12.9898) * 43758.5453
    const random = x - Math.floor(x)
    return new Map([['result', random * (max - min) + min]])
  }

  return new Map([['result', Math.random() * (max - min) + min]])
}

export const trigExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const fn = (ctx.controls.get('function') as string) ?? 'sin'
  const useDegrees = (ctx.controls.get('degrees') as boolean) ?? false

  // Convert to radians if needed
  const input = useDegrees ? (value * Math.PI) / 180 : value

  let result: number
  switch (fn) {
    case 'sin':
      result = Math.sin(input)
      break
    case 'cos':
      result = Math.cos(input)
      break
    case 'tan':
      result = Math.tan(input)
      break
    case 'asin':
      result = Math.asin(value) // asin/acos/atan take normalized values
      if (useDegrees) result = (result * 180) / Math.PI
      break
    case 'acos':
      result = Math.acos(value)
      if (useDegrees) result = (result * 180) / Math.PI
      break
    case 'atan':
      result = Math.atan(value)
      if (useDegrees) result = (result * 180) / Math.PI
      break
    case 'sinh':
      result = Math.sinh(input)
      break
    case 'cosh':
      result = Math.cosh(input)
      break
    case 'tanh':
      result = Math.tanh(input)
      break
    default:
      result = Math.sin(input)
  }

  return new Map([['result', result]])
}

export const powerExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const base = (ctx.inputs.get('base') as number) ?? 0
  const exponentInput = ctx.inputs.get('exponent') as number | undefined
  const exponentControl = (ctx.controls.get('exponent') as number) ?? 2
  const exponent = exponentInput ?? exponentControl
  const operation = (ctx.controls.get('operation') as string) ?? 'Power'

  let result: number
  switch (operation) {
    case 'Power':
      result = Math.pow(base, exponent)
      break
    case 'Sqrt':
      result = Math.sqrt(base)
      break
    case 'Cbrt':
      result = Math.cbrt(base)
      break
    case 'Log':
      result = Math.log(base) / Math.log(exponent) // Log base exponent
      break
    case 'Log10':
      result = Math.log10(base)
      break
    case 'Ln':
      result = Math.log(base)
      break
    case 'Exp':
      result = Math.exp(base)
      break
    default:
      result = Math.pow(base, exponent)
  }

  return new Map([['result', isNaN(result) ? 0 : result]])
}

export const vectorMathExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const ax = (ctx.inputs.get('ax') as number) ?? 0
  const ay = (ctx.inputs.get('ay') as number) ?? 0
  const az = (ctx.inputs.get('az') as number) ?? 0
  const bx = (ctx.inputs.get('bx') as number) ?? 0
  const by = (ctx.inputs.get('by') as number) ?? 0
  const bz = (ctx.inputs.get('bz') as number) ?? 0
  const scalar = (ctx.controls.get('scalar') as number) ?? 1
  const operation = (ctx.controls.get('operation') as string) ?? 'Add'

  let x: number, y: number, z: number

  switch (operation) {
    case 'Add':
      x = ax + bx
      y = ay + by
      z = az + bz
      break
    case 'Subtract':
      x = ax - bx
      y = ay - by
      z = az - bz
      break
    case 'Cross':
      x = ay * bz - az * by
      y = az * bx - ax * bz
      z = ax * by - ay * bx
      break
    case 'Normalize': {
      const mag = Math.sqrt(ax * ax + ay * ay + az * az)
      if (mag > 0) {
        x = ax / mag
        y = ay / mag
        z = az / mag
      } else {
        x = y = z = 0
      }
      break
    }
    case 'Scale':
      x = ax * scalar
      y = ay * scalar
      z = az * scalar
      break
    case 'Lerp':
      x = ax + (bx - ax) * scalar
      y = ay + (by - ay) * scalar
      z = az + (bz - az) * scalar
      break
    case 'Dot': {
      const dot = ax * bx + ay * by + az * bz
      x = dot
      y = dot
      z = dot
      break
    }
    default:
      x = ax + bx
      y = ay + by
      z = az + bz
  }

  const magnitude = Math.sqrt(x * x + y * y + z * z)

  return new Map([
    ['x', x],
    ['y', y],
    ['z', z],
    ['magnitude', magnitude],
  ])
}

export const moduloExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const divisorInput = ctx.inputs.get('divisor') as number | undefined
  const divisorControl = (ctx.controls.get('divisor') as number) ?? 1
  const divisor = divisorInput ?? divisorControl
  const mode = (ctx.controls.get('mode') as string) ?? 'Standard'

  if (divisor === 0) {
    return new Map([['result', 0]])
  }

  let result: number
  switch (mode) {
    case 'Standard':
      result = value % divisor
      break
    case 'Positive':
      // Always returns positive result
      result = ((value % divisor) + divisor) % divisor
      break
    case 'Floor':
      // Floor division remainder (Python-style)
      result = value - divisor * Math.floor(value / divisor)
      break
    default:
      result = value % divisor
  }

  return new Map([['result', result]])
}

// ============================================================================
// Logic Nodes
// ============================================================================

export const compareExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = (ctx.inputs.get('a') as number) ?? 0
  const b = (ctx.inputs.get('b') as number) ?? 0
  const operator = (ctx.controls.get('operator') as string) ?? '=='

  let result: boolean
  switch (operator) {
    case '==':
      result = a === b
      break
    case '!=':
      result = a !== b
      break
    case '>':
      result = a > b
      break
    case '>=':
      result = a >= b
      break
    case '<':
      result = a < b
      break
    case '<=':
      result = a <= b
      break
    default:
      result = false
  }

  return new Map([['result', result ? 1 : 0]])
}

export const andExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = Boolean(ctx.inputs.get('a'))
  const b = Boolean(ctx.inputs.get('b'))
  return new Map([['result', a && b ? 1 : 0]])
}

export const orExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = Boolean(ctx.inputs.get('a'))
  const b = Boolean(ctx.inputs.get('b'))
  return new Map([['result', a || b ? 1 : 0]])
}

export const notExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = Boolean(ctx.inputs.get('value'))
  return new Map([['result', !value ? 1 : 0]])
}

// Gate holds last passed value
const gateLastValue = new Map<string, unknown>()

export const gateExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const gate = Boolean(ctx.inputs.get('gate') ?? ctx.controls.get('open') ?? true)

  // Only update stored value when gate is open and value is defined
  if (gate && value !== undefined) {
    gateLastValue.set(ctx.nodeId, value)
  }

  return new Map([['result', gateLastValue.get(ctx.nodeId)]])
}

export const selectExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const index = Math.floor((ctx.inputs.get('index') as number) ?? 0)
  const a = ctx.inputs.get('a')
  const b = ctx.inputs.get('b')
  const c = ctx.inputs.get('c')
  const d = ctx.inputs.get('d')

  const inputs = [a, b, c, d].filter(v => v !== undefined)
  const selected = inputs[Math.max(0, Math.min(index, inputs.length - 1))]

  return new Map([['result', selected]])
}

export const switchExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const condition = Boolean(ctx.inputs.get('condition'))
  const trueValue = ctx.inputs.get('true') ?? 1
  const falseValue = ctx.inputs.get('false') ?? 0
  return new Map([['result', condition ? trueValue : falseValue]])
}

// ============================================================================
// Timing Nodes
// ============================================================================

// Track if start has fired for each node
const startFiredNodes = new Set<string>()

export const startExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  // Fire once on first frame, then never again
  if (ctx.frameCount === 0 || !startFiredNodes.has(ctx.nodeId)) {
    startFiredNodes.add(ctx.nodeId)
    return new Map([['trigger', 1]])
  }
  // Don't output anything after first frame
  return new Map()
}

// Track interval state per node
const intervalState = new Map<string, { lastFire: number }>()

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
const delayState = new Map<string, { queue: Array<{ value: unknown; fireAt: number }>; lastOutput: unknown }>()

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
const timerState = new Map<string, { running: boolean; startTime: number; pausedAt: number }>()

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
const metronomeState = new Map<
  string,
  {
    running: boolean
    startTime: number
    lastBeatNum: number
    lastBarNum: number
  }
>()

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
const stepSequencerState = new Map<
  string,
  {
    currentStep: number
    direction: 1 | -1 // For ping-pong mode
    lastClockState: boolean
  }
>()

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

// ============================================================================
// Debug Nodes
// ============================================================================

// Track previous values for change detection
const consolePrevValues = new Map<string, unknown>()

// Monitor remembers last received value
const monitorLastValue = new Map<string, unknown>()

export const monitorExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')

  // Only update stored value if we received a defined value
  if (value !== undefined) {
    monitorLastValue.set(ctx.nodeId, value)
  }

  const displayValue = monitorLastValue.get(ctx.nodeId)
  return new Map([
    ['display', displayValue],
    ['value', displayValue], // Pass through
  ])
}

// Audio waveform analyzers per oscilloscope node
const scopeAnalyzers = new Map<string, { waveform: unknown; prevAudio: unknown }>()

export const oscilloscopeExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const signal = ctx.inputs.get('signal') as number | undefined
  const audio = ctx.inputs.get('audio') as unknown

  // Initialize state for this node
  if (!scopeAnalyzers.has(ctx.nodeId)) {
    scopeAnalyzers.set(ctx.nodeId, { waveform: null, prevAudio: null })
  }
  const state = scopeAnalyzers.get(ctx.nodeId)!

  // Handle audio input - use Tone.js Waveform analyzer
  if (audio && typeof audio === 'object' && 'connect' in audio) {
    // Create or get waveform analyzer
    if (!state.waveform || state.prevAudio !== audio) {
      // Disconnect previous
      if (state.waveform && state.prevAudio) {
        try {
          (state.prevAudio as { disconnect: (n: unknown) => void }).disconnect(state.waveform)
        } catch { /* ignore */ }
      }
      // Create new waveform analyzer
      state.waveform = new Tone.Waveform(256)
      ;(audio as { connect: (n: unknown) => void }).connect(state.waveform as unknown)
      state.prevAudio = audio
    }

    // Get waveform data
    const waveformData = (state.waveform as { getValue: () => Float32Array }).getValue()
    const outputs = new Map<string, unknown>()
    outputs.set('_input_waveform', Array.from(waveformData))
    outputs.set('_input_signal', null)
    outputs.set('_mode', 'audio')
    return outputs
  }

  // Handle number signal input
  const outputs = new Map<string, unknown>()
  outputs.set('_input_signal', signal ?? 0)
  outputs.set('_input_waveform', null)
  outputs.set('_mode', 'signal')
  return outputs
}

export const graphExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const pointCount = (ctx.controls.get('pointCount') as number) ?? 1
  const outputs = new Map<string, unknown>()

  // Read x/y pairs for each point
  for (let i = 0; i < pointCount; i++) {
    const x = (ctx.inputs.get(`x${i}`) as number) ?? 0
    const y = (ctx.inputs.get(`y${i}`) as number) ?? 0
    outputs.set(`_point${i}_x`, x)
    outputs.set(`_point${i}_y`, y)
  }

  return outputs
}

// Equalizer FFT analyzers per node
const eqAnalyzers = new Map<string, { fft: unknown; prevAudio: unknown }>()

export const equalizerExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as unknown
  const outputs = new Map<string, unknown>()

  // Initialize state for this node
  if (!eqAnalyzers.has(ctx.nodeId)) {
    eqAnalyzers.set(ctx.nodeId, { fft: null, prevAudio: null })
  }
  const state = eqAnalyzers.get(ctx.nodeId)!

  // Handle audio input
  if (audio && typeof audio === 'object' && 'connect' in audio) {
    // Create or reconnect FFT analyzer
    if (!state.fft || state.prevAudio !== audio) {
      // Disconnect previous
      if (state.fft && state.prevAudio) {
        try {
          (state.prevAudio as { disconnect: (n: unknown) => void }).disconnect(state.fft)
        } catch { /* ignore */ }
      }
      // Create new FFT analyzer with more bins for better resolution
      state.fft = new Tone.FFT(128)
      ;(audio as { connect: (n: unknown) => void }).connect(state.fft as unknown)
      state.prevAudio = audio
    }

    // Get FFT data
    const fftData = (state.fft as { getValue: () => Float32Array }).getValue()
    outputs.set('_fft_data', Array.from(fftData))
    return outputs
  }

  // Clear state if no audio
  if (state.fft) {
    state.fft = null
    state.prevAudio = null
  }

  outputs.set('_fft_data', null)
  return outputs
}

export const consoleExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const label = (ctx.controls.get('label') as string) ?? 'Log'
  const logOnChange = (ctx.controls.get('logOnChange') as boolean) ?? true

  // Only log if we have a value and (not logOnChange OR value changed)
  if (value !== undefined) {
    const prevValue = consolePrevValues.get(ctx.nodeId)
    const valueChanged = prevValue !== value

    if (!logOnChange || valueChanged) {
      console.log(`[${label}]`, value)
      consolePrevValues.set(ctx.nodeId, value)
    }
  }

  return new Map()
}

// ============================================================================
// Cleanup Functions
// ============================================================================

/**
 * Clean up state for a specific node
 */
export function disposeTimingNode(nodeId: string): void {
  intervalState.delete(nodeId)
  delayState.delete(nodeId)
  timerState.delete(nodeId)
  metronomeState.delete(nodeId)
  stepSequencerState.delete(nodeId)
  startFiredNodes.delete(nodeId)
}

/**
 * Clean up state for debug nodes
 */
export function disposeDebugNode(nodeId: string): void {
  consolePrevValues.delete(nodeId)
  monitorLastValue.delete(nodeId)

  // Clean up oscilloscope waveform analyzer
  const scopeState = scopeAnalyzers.get(nodeId)
  if (scopeState?.waveform && scopeState.prevAudio) {
    try {
      (scopeState.prevAudio as { disconnect: (n: unknown) => void }).disconnect(scopeState.waveform)
    } catch { /* ignore */ }
  }
  scopeAnalyzers.delete(nodeId)

  // Clean up equalizer FFT analyzer
  const eqState = eqAnalyzers.get(nodeId)
  if (eqState?.fft && eqState.prevAudio) {
    try {
      (eqState.prevAudio as { disconnect: (n: unknown) => void }).disconnect(eqState.fft)
    } catch { /* ignore */ }
  }
  eqAnalyzers.delete(nodeId)
}

/**
 * Clean up state for input nodes
 */
export function disposeInputNode(nodeId: string): void {
  triggerPrevPressed.delete(nodeId)
}

/**
 * Clean up all timing-related state (called when execution stops)
 */
export function disposeAllTimingState(): void {
  intervalState.clear()
  delayState.clear()
  timerState.clear()
  metronomeState.clear()
  stepSequencerState.clear()
  startFiredNodes.clear()
}

/**
 * Clean up all debug-related state (called when execution stops)
 */
export function disposeAllDebugState(): void {
  consolePrevValues.clear()
  monitorLastValue.clear()

  // Clean up oscilloscope waveform analyzers
  for (const [, state] of scopeAnalyzers) {
    if (state.waveform && state.prevAudio) {
      try {
        (state.prevAudio as { disconnect: (n: unknown) => void }).disconnect(state.waveform)
      } catch { /* ignore */ }
    }
  }
  scopeAnalyzers.clear()

  // Clean up equalizer FFT analyzers
  for (const [, state] of eqAnalyzers) {
    if (state.fft && state.prevAudio) {
      try {
        (state.prevAudio as { disconnect: (n: unknown) => void }).disconnect(state.fft)
      } catch { /* ignore */ }
    }
  }
  eqAnalyzers.clear()
}

/**
 * Clean up all input-related state (called when execution stops)
 */
export function disposeAllInputState(): void {
  triggerPrevPressed.clear()
}

// ============================================================================
// Registry
// ============================================================================

export const builtinExecutors: Record<string, NodeExecutorFn> = {
  // Inputs
  constant: constantExecutor,
  trigger: triggerExecutor,
  textbox: textboxExecutor,
  slider: sliderExecutor,
  knob: knobExecutor,
  'xy-pad': xyPadExecutor,
  keyboard: keyboardExecutor,
  time: timeExecutor,
  lfo: lfoExecutor,

  // Timing
  start: startExecutor,
  interval: intervalExecutor,
  delay: delayExecutor,
  timer: timerExecutor,
  metronome: metronomeExecutor,
  'step-sequencer': stepSequencerExecutor,

  // Math
  add: addExecutor,
  subtract: subtractExecutor,
  multiply: multiplyExecutor,
  divide: divideExecutor,
  'map-range': mapRangeExecutor,
  clamp: clampExecutor,
  abs: absExecutor,
  smooth: smoothExecutor,
  random: randomExecutor,
  trig: trigExecutor,
  power: powerExecutor,
  'vector-math': vectorMathExecutor,
  modulo: moduloExecutor,

  // Logic
  compare: compareExecutor,
  and: andExecutor,
  or: orExecutor,
  not: notExecutor,
  gate: gateExecutor,
  select: selectExecutor,
  switch: switchExecutor,

  // Debug
  monitor: monitorExecutor,
  oscilloscope: oscilloscopeExecutor,
  graph: graphExecutor,
  equalizer: equalizerExecutor,
  console: consoleExecutor,

  // Audio
  ...audioExecutors,

  // Visual
  ...visualExecutors,

  // AI
  ...aiExecutors,

  // Connectivity
  ...connectivityExecutors,

  // CLASP Protocol
  ...claspExecutors,

  // Code
  ...codeExecutors,

  // Subflows
  ...subflowExecutors,

  // 3D
  ...threeExecutors,

  // String
  ...stringExecutors,

  // Messaging
  ...messagingExecutors,
}
