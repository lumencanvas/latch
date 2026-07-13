import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import * as Tone from 'tone'
import { parametricEqState } from '../shared'

const definition: NodeDefinition = {
  id: 'parametric-eq',
  name: 'Parametric EQ',
  version: '1.0.0',
  category: 'audio',
  description: '3-band parametric equalizer with visual frequency response and draggable bands',
  icon: 'sliders-horizontal',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
  ],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
  ],
  controls: [
    // Band 1 (Low)
    { id: 'freq1', type: 'number', label: 'Freq 1', default: 200, props: { min: 20, max: 20000, step: 1 } },
    { id: 'gain1', type: 'number', label: 'Gain 1', default: 0, props: { min: -24, max: 24, step: 0.1 } },
    { id: 'q1', type: 'number', label: 'Q 1', default: 1, props: { min: 0.1, max: 10, step: 0.1 } },
    // Band 2 (Mid)
    { id: 'freq2', type: 'number', label: 'Freq 2', default: 1000, props: { min: 20, max: 20000, step: 1 } },
    { id: 'gain2', type: 'number', label: 'Gain 2', default: 0, props: { min: -24, max: 24, step: 0.1 } },
    { id: 'q2', type: 'number', label: 'Q 2', default: 1, props: { min: 0.1, max: 10, step: 0.1 } },
    // Band 3 (High)
    { id: 'freq3', type: 'number', label: 'Freq 3', default: 5000, props: { min: 20, max: 20000, step: 1 } },
    { id: 'gain3', type: 'number', label: 'Gain 3', default: 0, props: { min: -24, max: 24, step: 0.1 } },
    { id: 'q3', type: 'number', label: 'Q 3', default: 1, props: { min: 0.1, max: 10, step: 0.1 } },
  ],
  // Declarative UI (Phase 3 bullet 2): the whole body is the EQEditor bound to the 9 flat band
  // controls, so it's expressible as the built-in `eq` Tier-B aggregate — no bespoke SFC needed.
  // Fields are positional, chunked by 3 into bands (freq,gain,q per band). Replaces ParametricEqNode.vue.
  ui: {
    rows: [
      { widgets: [{ type: 'eq', bind: '', props: { fields: ['freq1', 'gain1', 'q1', 'freq2', 'gain2', 'q2', 'freq3', 'gain3', 'q3'] } }] },
    ],
  },
  info: {
    overview: 'A 3-band parametric equalizer with a visual frequency response display and draggable band controls. Each band has independent frequency, gain, and Q settings for precise tonal shaping across the low, mid, and high ranges.',
    tips: [
      'Drag the band handles in the visual display for quick, intuitive adjustments.',
      'Cut narrow bands (high Q, negative gain) to remove problem frequencies rather than boosting others.',
      'Use gentle broad boosts (low Q, small positive gain) for overall tonal warmth or brightness.',
    ],
    pairsWith: ['audio-player', 'gain', 'audio-output', 'reverb', 'filter'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null

  // Get band parameters
  const freq1 = (ctx.controls.get('freq1') as number) ?? 200
  const gain1 = (ctx.controls.get('gain1') as number) ?? 0
  const q1 = (ctx.controls.get('q1') as number) ?? 1

  const freq2 = (ctx.controls.get('freq2') as number) ?? 1000
  const gain2 = (ctx.controls.get('gain2') as number) ?? 0
  const q2 = (ctx.controls.get('q2') as number) ?? 1

  const freq3 = (ctx.controls.get('freq3') as number) ?? 5000
  const gain3 = (ctx.controls.get('gain3') as number) ?? 0
  const q3 = (ctx.controls.get('q3') as number) ?? 1

  const outputs = new Map<string, unknown>()

  if (!audio) {
    outputs.set('audio', null)
    return outputs
  }

  // Initialize or get state
  let state = parametricEqState.get(ctx.nodeId)
  if (!state) {
    state = {
      band1: new Tone.Filter({ type: 'peaking', frequency: freq1, Q: q1, gain: gain1 }),
      band2: new Tone.Filter({ type: 'peaking', frequency: freq2, Q: q2, gain: gain2 }),
      band3: new Tone.Filter({ type: 'peaking', frequency: freq3, Q: q3, gain: gain3 }),
      prevInput: null,
    }
    // Chain filters together
    state.band1.connect(state.band2)
    state.band2.connect(state.band3)
    parametricEqState.set(ctx.nodeId, state)
  }

  // Update filter parameters
  state.band1.frequency.value = freq1
  state.band1.Q.value = q1
  state.band1.gain.value = gain1

  state.band2.frequency.value = freq2
  state.band2.Q.value = q2
  state.band2.gain.value = gain2

  state.band3.frequency.value = freq3
  state.band3.Q.value = q3
  state.band3.gain.value = gain3

  // Connect input to first filter
  if (state.prevInput !== audio) {
    if (state.prevInput) {
      try {
        state.prevInput.disconnect(state.band1)
      } catch { /* ignore */ }
    }
    audio.connect(state.band1)
    state.prevInput = audio
  }

  outputs.set('audio', state.band3)
  return outputs
}

export default defineNode({ definition, executor })
