import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineNodeState } from '@/engine/nodeState'

const definition: NodeDefinition = {
  id: 'lfo',
  name: 'LFO',
  version: '1.0.0',
  category: 'timing',
  description: 'Low frequency oscillator',
  icon: 'waves',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'frequency', type: 'number', label: 'Frequency' },
    { id: 'amplitude', type: 'number', label: 'Amplitude' },
    { id: 'offset', type: 'number', label: 'Offset' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
  ],
  outputs: [{ id: 'value', type: 'number', label: 'Value' }],
  controls: [
    { id: 'frequency', type: 'number', label: 'Frequency (Hz)', default: 1, props: { step: 0.01 } },
    { id: 'amplitude', type: 'number', label: 'Amplitude', default: 1, props: { step: 0.01 } },
    { id: 'offset', type: 'number', label: 'Offset', default: 0, props: { step: 0.01 } },
    { id: 'phase', type: 'slider', label: 'Phase', default: 0, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'waveform', type: 'select', label: 'Waveform', default: 'sine', props: { options: ['sine', 'square', 'triangle', 'sawtooth'] } },
  ],
  tags: ['lfo', 'oscillator', 'modulation', 'wobble', 'wave', 'sine', 'automation', 'cycle', 'low frequency'],
  info: {
    overview: 'Generates a continuous oscillating value (offset ± amplitude) at a given frequency in Hz. Supports sine, square, triangle, and sawtooth waveforms. Frequency, amplitude and offset can be wired for modulation; the phase accumulates smoothly, so changing the frequency never makes the output jump. Reset restarts the cycle (plus the Phase offset). Commonly used to animate parameters like color, position, or shader uniforms over time.',
    tips: [
      'Use the offset control to shift the output range so it stays positive when feeding into parameters that do not accept negative values.',
      'Square waveform at low frequency works well as an on/off toggle signal.',
      'Connect the output to a map-range node to rescale the LFO to any arbitrary range.',
    ],
    pairsWith: ['map-range', 'shader', 'smooth', 'blend', 'color-correction'],
  },
}

// Co-located (was engine/executors/input.ts lfoExecutor). The old executor computed the
// phase as `totalTime * frequency`, so ANY frequency change jumped the phase by
// `totalTime * Δf` cycles (at t = 100 s, 1 → 1.01 Hz skipped a whole cycle): modulating the
// rate glitched every frame. The phase is now integrated from deltaTime per node.
export const lfoPhase = defineNodeState<number>({ label: 'lfo' })

export const lfoExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const frequency = ctx.num('frequency', 1)
  const amplitude = ctx.num('amplitude', 1)
  const offset = ctx.num('offset', 0)
  const phaseOffset = ctx.num('phase', 0)
  const waveform = (ctx.controls.get('waveform') as string) ?? 'sine'

  let cycle = lfoPhase.get(ctx.nodeId)
  const reset = ctx.trig('reset')
  if (cycle === undefined) {
    // Seed from the global clock so LFOs of the same frequency stay in phase with each other
    // (as they were when phase was derived from totalTime), then integrate from here on.
    cycle = ctx.totalTime * frequency
    cycle -= Math.floor(cycle)
  } else if (reset) {
    cycle = 0
  } else {
    cycle += Math.max(0, ctx.deltaTime) * frequency
    cycle -= Math.floor(cycle) // keep in [0, 1) — negative frequencies run backwards
  }
  lfoPhase.set(ctx.nodeId, cycle)

  let p = cycle + phaseOffset
  p -= Math.floor(p) // [0, 1)
  let value: number
  switch (waveform) {
    case 'square':
      value = p < 0.5 ? 1 : -1
      break
    case 'triangle':
      // 0 → 1 at p=0.25 → 0 at 0.5 → -1 at 0.75 (same shape/phase as the old asin(sin) form)
      value = p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4
      break
    case 'sawtooth':
      value = p * 2 - 1
      break
    case 'sine':
    default:
      value = Math.sin(p * Math.PI * 2)
  }

  return new Map([['value', value * amplitude + offset]])
}

export default defineNode({ definition, executor: lfoExecutor })
