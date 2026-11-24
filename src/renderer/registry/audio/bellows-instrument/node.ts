import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { configureVoice, queueNote, setMonoGate, routeChannel, getVoice } from './bellowsManager'
import { resolveVoiceConfig, buildVoiceControls } from './engineParams'

const definition: NodeDefinition = {
  id: 'bellows-instrument',
  name: 'Bellows Instrument',
  version: '1.0.0',
  category: 'audio',
  description: 'bellowsjs synth voice — 50 presets or a hand-built engine, played by note / gate / trigger',
  icon: 'music',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'note', type: 'number', label: 'Note' },
    { id: 'velocity', type: 'number', label: 'Velocity' },
    { id: 'gate', type: 'boolean', label: 'Gate' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
  ],
  // The kernel routes this voice to its own direct output, heard only when Audio is wired on to an
  // Audio Output (see bellowsManager routeChannel), like every LATCH sound source.
  outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
  // Layered surface: Preset (casual) → Manual engine + core params → Show All / Raw params
  // (power). Only the active engine's params are ever visible (see buildVoiceControls).
  controls: buildVoiceControls('va'),
  info: {
    overview:
      'A bellowsjs synthesizer voice with a layered surface. Pick one of fifty ready-to-play presets (guitars, strings, winds, brass, keys, mallets, voices, synths) for instant sound — or switch Preset to “Manual” and build a sound on any of seventeen engines (virtual analog, FM, additive, wavetable, plucked and bowed strings, wind tube, modal mallets, west-coast, formant, drums…). Manual mode opens on each engine’s core controls; “Show All Parameters” reveals the rest. Add an insert effect, and a Bellows Reverb after it for space. Play it from LATCH note / gate / trigger inputs: the trigger fires a one-shot eighth note; the gate sustains a note while it stays high. Wire its Audio output to an Audio Output to hear it, through any effects on the way (Bellows Filter, Reverb, Delay…, or any LATCH audio node).',
    tips: [
      'Start with a Preset — 50 curated instruments, zero theory required. Choose “Manual” to pick an engine and shape it yourself.',
      'Changing Preset or Engine starts that sound fresh from its defaults — the previous sound rings out instead of cutting off.',
      'Wire a keyboard, sequencer, MIDI or Arpeggiator node into Note, then pulse Trigger for one-shot hits.',
      'Hold notes with the Gate input — it plays on the rising edge and releases when Gate goes low.',
      'This plays ONE note per trigger — to sound a chord array from Chord/Progression, use the Poly Voice node.',
      'Raw Engine Params reaches params the panel omits: e.g. “ratio2=3.5, level2=0.7” on FM, or “partial3=0.5” on additive. Delete an entry to return it to the engine default.',
      'Effect Settings tunes the insert effect, e.g. “semitones=7” on Pitch Shift or “feedback=0.7, mix=0.5” on a delay.',
    ],
    pairsWith: ['arpeggiator', 'poly-voice', 'keyboard', 'sequencer', 'midi-input'],
  },
  tags: ['bellows', 'synth', 'instrument', 'preset', 'generative', 'audio'],
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  // Idempotent boot/voice acquisition + config push (async kernel boot applies it on boot).
  // The sound goes ONLY down the Audio wire, so the shared reverb send (which returns into master)
  // stays off; a Bellows Reverb downstream replaces it.
  const wired = !!ctx.connectedOutputs?.has('audio')
  const cfg = resolveVoiceConfig(ctx.controls)
  configureVoice(ctx.nodeId, { ...cfg, send: 0 })

  // Note value is a MIDI number (bellows resolves it through the active tuning);
  // velocity accepts 0–1 directly or 0–127 (normalized like the synth node).
  const note = ctx.num('note', 60)
  const velRaw = ctx.num('velocity', 100)
  const vel = clamp01(velRaw > 1 ? velRaw / 127 : velRaw)

  // Latch the trigger edge EVERY frame (even while booting) → queueNote plays it now or
  // replays it on boot, so a hit that lands in the async boot window isn't dropped.
  if (ctx.trig('trigger')) queueNote(ctx.nodeId, note, vel)

  // Gate is LEVEL-based (self-heals through the boot window): manager holds the note id.
  setMonoGate(ctx.nodeId, ctx.level('gate'), note, vel)

  // Wired: its own direct output. Unwired: the silent output.
  const audio = routeChannel(ctx.nodeId, getVoice(ctx.nodeId)?.instrument ?? null, wired)
  return new Map<string, unknown>([['audio', audio]])
}

export default defineNode({ definition, executor })
