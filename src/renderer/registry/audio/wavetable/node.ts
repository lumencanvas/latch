import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import * as Tone from 'tone'
import { wavetableState } from '../shared'

const definition: NodeDefinition = {
  id: 'wavetable',
  name: 'Wavetable',
  version: '1.0.0',
  category: 'audio',
  description: 'Wavetable oscillator with drawable/editable waveform',
  icon: 'waves',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'frequency', type: 'number', label: 'Freq' },
  ],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
  ],
  controls: [
    // Drawn samples — a data-only control (never rendered standalone) so the declarative `ui` wave
    // aggregate can read/write it via props.values (BaseNode.controlValues only exposes DECLARED
    // controls). Default = the 64-sample sine table, matching the bespoke generateDefaultSamples('sine').
    // Runtime-safe: the executor uses these samples only when preset === 'custom'; node.data overrides
    // the default whenever the user draws (ExecutionEngine seeds ctx.controls from data).
    { id: 'waveform', type: 'data', label: 'Waveform', default: Array.from({ length: 64 }, (_, i) => Math.sin((i / 64) * Math.PI * 2)) },
    { id: 'frequency', type: 'number', label: 'Frequency', default: 440, props: { min: 20, max: 2000, step: 1 } },
    { id: 'volume', type: 'slider', label: 'Volume', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'preset', type: 'select', label: 'Preset', default: 'sine', props: { options: ['sine', 'square', 'sawtooth', 'triangle', 'custom'] } },
  ],
  // Declarative UI (Phase 3 bullet 2): the WaveformEditor (with its own sine/square/saw/tri preset
  // buttons) via the built-in `wave` Tier-B aggregate (samples ↔ waveform, preset ↔ preset), plus the
  // frequency + volume controls — the bespoke canvas body exactly. Replaces WavetableNode.vue. Note: an
  // untouched non-`custom` preset shows a sine in the editor until interacted (bespoke regenerated it
  // per preset for display only — audio is unaffected, the executor drives non-custom presets directly).
  ui: {
    rows: [
      { widgets: [{ type: 'wave', bind: '', props: { fields: ['waveform', 'preset'] } }] },
      { widgets: [{ type: 'number', bind: 'frequency', label: 'Freq' }] },
      { widgets: [{ type: 'slider', bind: 'volume', label: 'Vol' }] },
    ],
  },
  info: {
    overview: 'A wavetable oscillator that lets you select from preset waveforms or draw a custom waveshape. The drawn waveform is stored as a wavetable and played back at the specified frequency, giving you full control over the harmonic content.',
    tips: [
      'Select the custom preset and draw directly on the waveform display to create unique timbres.',
      'Start from a preset waveform and modify it slightly for variations on familiar sounds.',
      'Modulate the frequency input with an LFO for vibrato or with a MIDI source for melodic play.',
    ],
    pairsWith: ['gain', 'filter', 'envelope', 'audio-output', 'svf-filter'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const frequencyInput = ctx.inputs.get('frequency') as number | undefined
  const frequency = frequencyInput ?? (ctx.controls.get('frequency') as number) ?? 440
  const volume = (ctx.controls.get('volume') as number) ?? 0.5
  const preset = (ctx.controls.get('preset') as string) ?? 'sine'
  const waveform = (ctx.controls.get('waveform') as number[]) ?? null

  // Initialize or get state
  let state = wavetableState.get(ctx.nodeId)
  if (!state) {
    const oscillator = new Tone.Oscillator({
      frequency,
      type: preset as OscillatorType,
      volume: Tone.gainToDb(volume),
    })
    oscillator.start()

    state = {
      oscillator,
      periodicWave: null,
      lastPreset: preset,
      lastWaveform: null,
    }
    wavetableState.set(ctx.nodeId, state)
  }

  // Update frequency and volume
  state.oscillator.frequency.value = frequency
  state.oscillator.volume.value = Tone.gainToDb(volume)

  // Handle preset change or custom waveform
  if (preset !== 'custom') {
    if (state.lastPreset !== preset) {
      state.oscillator.type = preset as OscillatorType
      state.lastPreset = preset
      state.lastWaveform = null
    }
  } else if (waveform && waveform.length > 0) {
    // Custom waveform - convert samples to periodic wave
    const waveformChanged = !state.lastWaveform ||
      state.lastWaveform.length !== waveform.length ||
      state.lastWaveform.some((v, i) => Math.abs(v - waveform[i]) > 0.001)

    if (waveformChanged) {
      // Convert time-domain samples to frequency-domain via simple DFT
      const n = waveform.length
      const real = new Float32Array(n / 2 + 1)
      const imag = new Float32Array(n / 2 + 1)

      // Simple DFT for harmonics
      for (let k = 0; k <= n / 2; k++) {
        let sumReal = 0
        let sumImag = 0
        for (let t = 0; t < n; t++) {
          const angle = (2 * Math.PI * k * t) / n
          sumReal += waveform[t] * Math.cos(angle)
          sumImag -= waveform[t] * Math.sin(angle)
        }
        real[k] = sumReal / n
        imag[k] = sumImag / n
      }

      // Create periodic wave
      const audioContext = Tone.getContext().rawContext as AudioContext
      const periodicWave = audioContext.createPeriodicWave(real, imag)
      state.periodicWave = periodicWave

      // Apply to oscillator
      const rawOsc = (state.oscillator as unknown as { _oscillator?: OscillatorNode })._oscillator
      if (rawOsc) {
        rawOsc.setPeriodicWave(periodicWave)
      }

      state.lastWaveform = [...waveform]
      state.lastPreset = 'custom'
    }
  }

  const outputs = new Map<string, unknown>()
  outputs.set('audio', state.oscillator)
  return outputs
}

export default defineNode({ definition, executor })
