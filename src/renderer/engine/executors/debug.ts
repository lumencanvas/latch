/**
 * Debug node executors — inspectors / scopes (monitor, oscilloscope, graph,
 * equalizer, console). Audio scopes use Tone analysers, torn down via the
 * defineNodeState dispose callbacks. Extracted from index.ts (Phase 1 de-monolith).
 */
import * as Tone from 'tone'
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { defineNodeState } from '../nodeState'

// Track previous values for change detection
export const consolePrevValues = defineNodeState<unknown>({ label: 'console' })

// Monitor remembers last received value
export const monitorLastValue = defineNodeState<unknown>({ label: 'monitor' })

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
export const scopeAnalyzers = defineNodeState<{ waveform: unknown; prevAudio: unknown }>({
  label: 'oscilloscope',
  dispose: (s) => disposeAnalyzer(s.waveform, s.prevAudio),
})

/**
 * Tear down a Tone analyser: disconnect it from its source (if still wired) and
 * dispose it. A Tone Waveform/FFT wraps a Web Audio AnalyserNode that leaks unless
 * disposed — disconnect alone is not enough, so every add/remove/stop/rewire that
 * discarded one previously leaked an AnalyserNode. Null- and error-safe. (AUDIT §F.)
 */
export function disposeAnalyzer(node: unknown, source: unknown): void {
  if (!node) return
  if (source && typeof source === 'object' && 'disconnect' in source) {
    try {
      (source as { disconnect: (n: unknown) => void }).disconnect(node)
    } catch { /* already disconnected */ }
  }
  try {
    (node as { dispose?: () => void }).dispose?.()
  } catch { /* ignore */ }
}

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
      // Dispose the previous analyser before replacing it (disconnect alone leaks).
      disposeAnalyzer(state.waveform, state.prevAudio)
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
export const eqAnalyzers = defineNodeState<{ fft: unknown; prevAudio: unknown }>({
  label: 'equalizer',
  dispose: (s) => disposeAnalyzer(s.fft, s.prevAudio),
})

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
      // Dispose the previous analyser before replacing it (disconnect alone leaks).
      disposeAnalyzer(state.fft, state.prevAudio)
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

  // Clear state if no audio — dispose the analyser, don't just drop the reference.
  if (state.fft) {
    disposeAnalyzer(state.fft, state.prevAudio)
    state.fft = null
    state.prevAudio = null
  }

  outputs.set('_fft_data', null)
  return outputs
}

export const consoleExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const logOnChange = (ctx.controls.get('logOnChange') as boolean) ?? true
  const label = (ctx.controls.get('label') as string) ?? 'Log'

  // Only log if we have a value and (not logOnChange OR value changed). Compare by
  // a stringified key so objects (recreated each frame) don't log every frame.
  if (value !== undefined) {
    const key = typeof value === 'object' && value !== null ? safeStringify(value) : value
    const prevKey = consolePrevValues.get(ctx.nodeId)

    if (!logOnChange || prevKey !== key) {
      consolePrevValues.set(ctx.nodeId, key)
      // The Console node's whole job is to print — this feeds the DevTools console
      // AND the Debug panel (which captures console.log).
      console.log(`[${label}]`, value)
    }
  }

  return new Map()
}

function safeStringify(value: unknown): unknown {
  try {
    return JSON.stringify(value)
  } catch {
    return value
  }
}
