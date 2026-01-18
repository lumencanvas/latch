/**
 * Node executors registry
 * Each executor is a function that takes an ExecutionContext and returns outputs
 */

import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { audioExecutors } from './audio'
import { visualExecutors } from './visual'
import { aiExecutors } from './ai'
import { connectivityExecutors } from './connectivity'
import { claspExecutors, disposeClaspNode, disposeAllClaspConnections, getClaspConnectionStatus } from './clasp'
import { codeExecutors } from './code'
import { subflowExecutors } from './subflow'
import { threeExecutors } from './3d'

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
  const factor = (ctx.controls.get('factor') as number) ?? 0.1

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
    // Dynamically import Tone for waveform analysis
    const Tone = (window as unknown as { Tone?: typeof import('tone') }).Tone
    if (Tone) {
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
    const Tone = (window as unknown as { Tone?: typeof import('tone') }).Tone
    if (Tone) {
      // Create or reconnect FFT analyzer
      if (!state.fft || state.prevAudio !== audio) {
        // Disconnect previous
        if (state.fft && state.prevAudio) {
          try {
            (state.prevAudio as { disconnect: (n: unknown) => void }).disconnect(state.fft)
          } catch { /* ignore */ }
        }
        // Create new FFT analyzer
        state.fft = new Tone.FFT(64)
        ;(audio as { connect: (n: unknown) => void }).connect(state.fft as unknown)
        state.prevAudio = audio
      }

      // Get FFT data
      const fftData = (state.fft as { getValue: () => Float32Array }).getValue()
      outputs.set('_fft_data', Array.from(fftData))
      return outputs
    }
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
// Registry
// ============================================================================

export const builtinExecutors: Record<string, NodeExecutorFn> = {
  // Inputs
  constant: constantExecutor,
  trigger: triggerExecutor,
  textbox: textboxExecutor,
  slider: sliderExecutor,
  'xy-pad': xyPadExecutor,
  time: timeExecutor,
  lfo: lfoExecutor,

  // Timing
  start: startExecutor,
  interval: intervalExecutor,
  delay: delayExecutor,
  timer: timerExecutor,

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
}
