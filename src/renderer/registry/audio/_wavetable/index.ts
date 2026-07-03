import type { NodeDefinition } from '../../types'

export const wavetableNode: NodeDefinition = {
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

// Export the custom node component
export { default as WavetableNode } from './WavetableNode.vue'
