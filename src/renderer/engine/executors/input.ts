/**
 * Input node executors — value sources + controllers (constant, trigger, textbox,
 * slider, knob, xy-pad, keyboard, time, lfo). Extracted from index.ts (Phase 1
 * de-monolith); the barrel re-exports these to preserve the import contract.
 */
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { defineNodeState } from '../nodeState'

export const constantExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.controls.get('value') ?? 0
  return new Map([['value', value]])
}

// Track previous trigger button state for edge detection
export const triggerPrevPressed = defineNodeState<boolean>({ label: 'trigger' })

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
