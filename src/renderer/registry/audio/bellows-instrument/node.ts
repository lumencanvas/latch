import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { acquireVoice, getVoice, setVoiceEngine, queueNote } from './bellowsManager'

// bellowsjs synth engines (0.1.5). See docs/reference/bellowsjs-0.1.5-llm-reference.md.
const ENGINES = [
  'va', 'fm', 'additive', 'wavetable', 'pluck', 'string', 'tube', 'modal',
  'westcoast', 'formant', 'granular', 'harmonic', 'noise',
  'kick', 'snare', 'hat', 'clap', 'tom',
] as const

const definition: NodeDefinition = {
  id: 'bellows-instrument',
  name: 'Bellows Instrument',
  version: '1.0.0',
  category: 'audio',
  description: 'Polyphonic bellowsjs synth engine played by note / gate / trigger inputs',
  icon: 'music',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'note', type: 'number', label: 'Note' },
    { id: 'velocity', type: 'number', label: 'Velocity' },
    { id: 'gate', type: 'boolean', label: 'Gate' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
  ],
  // No audio output: bellows hosts every voice inside one worklet kernel with no free
  // graph out, so the shared kernel routes straight into LATCH's master (see bellowsManager).
  outputs: [],
  controls: [
    {
      id: 'engine',
      type: 'select',
      label: 'Engine',
      default: 'va',
      props: { options: [...ENGINES] },
    },
    { id: 'gain', type: 'number', label: 'Gain', default: 0.8, props: { min: 0, max: 2, step: 0.01 } },
    { id: 'pan', type: 'number', label: 'Pan', default: 0, props: { min: -1, max: 1, step: 0.01 } },
  ],
  info: {
    overview:
      'A bellowsjs synthesizer voice. Pick one of eighteen engines (virtual-analog, FM, additive, wavetable, pluck, string, modal, granular, drums, …) and play it from LATCH note / gate / trigger inputs. The trigger input fires a one-shot eighth note; the gate input sustains a note for as long as it stays high. bellowsjs boots on first use and all voices share LATCH’s master output, so no audio wire is needed.',
    tips: [
      'Wire a keyboard, sequencer, MIDI or Arpeggiator node into Note, then pulse Trigger for one-shot hits.',
      'Hold notes with the Gate input — it plays on the rising edge and releases when Gate goes low.',
      'This plays ONE note per trigger — to sound a chord array from Chord/Progression, use the Poly Voice node.',
      'Try the pluck, modal or granular engines for textures Tone.js can’t make.',
    ],
    pairsWith: ['arpeggiator', 'poly-voice', 'keyboard', 'sequencer', 'midi-input'],
  },
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const engine = (ctx.controls.get('engine') as string) ?? 'va'

  // Idempotent boot/voice acquisition (async kernel boot fills the voice in later).
  acquireVoice(ctx.nodeId, engine)
  setVoiceEngine(ctx.nodeId, engine)

  // Note value is a MIDI number (bellows resolves it through the active tuning);
  // velocity accepts 0–1 directly or 0–127 (normalized like the synth node).
  const note = ctx.num('note', 60)
  const velRaw = ctx.num('velocity', 100)
  const vel = clamp01(velRaw > 1 ? velRaw / 127 : velRaw)

  // Latch the trigger edge EVERY frame (even while the kernel is still booting) and hand
  // it to queueNote, which plays it now or replays it on boot — so a hit that lands in the
  // async boot window isn't dropped (the record already exists from acquireVoice above).
  if (ctx.trig('trigger')) queueNote(ctx.nodeId, note, vel)

  const gateHigh = ctx.level('gate')
  const rec = getVoice(ctx.nodeId)
  if (rec?.instrument) {
    const inst = rec.instrument

    // Gain / pan — apply only on change (they schedule kernel events).
    const gain = (ctx.controls.get('gain') as number) ?? 0.8
    const pan = (ctx.controls.get('pan') as number) ?? 0
    if (gain !== rec.prevGain) { inst.gain(gain); rec.prevGain = gain }
    if (pan !== rec.prevPan) { inst.pan(pan); rec.prevPan = pan }

    // Gate: LEVEL-based (start when high and nothing is held, release when low) rather than
    // edge-based, so a note held through the boot window still starts once the voice is ready.
    if (gateHigh && rec.heldId == null) {
      rec.heldId = inst.on(note, vel)
    } else if (!gateHigh && rec.heldId != null) {
      inst.off(rec.heldId)
      rec.heldId = null
    }
  }

  return new Map()
}

export default defineNode({ definition, executor })
