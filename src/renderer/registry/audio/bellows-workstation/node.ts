import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { Tone } from '@/services/audio/AudioManager'
import { KEYS, SCALES, STYLES, type Part } from '@/services/audio/workstation/composer'
import { bumpSeed, configureWorkstation, readWorkstation, routeWorkstation, seedBumpOf } from '@/services/audio/workstation/workstationManager'

const definition: NodeDefinition = {
  id: 'bellows-workstation',
  name: 'Bellows Workstation',
  version: '1.0.0',
  category: 'audio',
  description: 'A generative band from a seed: song form, Markov chords and melodies, Euclidean drums and bass, several instruments',
  icon: 'music',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'seed', type: 'string', label: 'Seed' },
    { id: 'playing', type: 'boolean', label: 'Play' },
    { id: 'energy', type: 'number', label: 'Energy' },
    { id: 'next', type: 'trigger', label: 'New Seed' },
  ],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'kick', type: 'trigger', label: 'Kick' },
    { id: 'snare', type: 'trigger', label: 'Snare' },
    { id: 'hat', type: 'trigger', label: 'Hat' },
    { id: 'bass', type: 'number', label: 'Bass Note' },
    { id: 'lead', type: 'number', label: 'Lead Note' },
    { id: 'leadHit', type: 'trigger', label: 'Lead Hit' },
    { id: 'chord', type: 'string', label: 'Chord' },
    { id: 'chordNotes', type: 'data', label: 'Chord Notes' },
    { id: 'section', type: 'string', label: 'Section' },
    { id: 'bar', type: 'number', label: 'Bar' },
    { id: 'intensity', type: 'number', label: 'Intensity' },
    { id: 'song', type: 'string', label: 'Song' },
    { id: 'seedOut', type: 'string', label: 'Seed' },
  ],
  controls: [
    { id: 'seed', type: 'text', label: 'Seed', default: 'latch', description: 'Any words. The same seed always plays the same song; share a song by sharing its seed.' },
    { id: 'style', type: 'select', label: 'Style', default: 'lofi', props: { options: STYLES.map((s) => ({ value: s.id, label: s.name })) } },
    { id: 'key', type: 'select', label: 'Key', default: 'auto', props: { options: [{ value: 'auto', label: 'From seed' }, ...KEYS.map((k) => ({ value: k, label: k }))] } },
    { id: 'scale', type: 'select', label: 'Mode', default: 'auto', props: { options: [{ value: 'auto', label: 'From style' }, ...Object.keys(SCALES).map((s) => ({ value: s, label: s }))] } },
    { id: 'bpm', type: 'number', label: 'BPM (0 = style)', default: 0, props: { min: 0, max: 220, step: 1 } },
    { id: 'playing', type: 'toggle', label: 'Play', default: true },
    { id: 'energy', type: 'slider', label: 'Energy', default: 0, description: 'Shifts the arrangement: up brings in drums, arpeggios and fills sooner; down strips it back.', props: { min: -1, max: 1, step: 0.01 } },
    { id: 'level', type: 'slider', label: 'Level', default: 0.8, props: { min: 0, max: 1.5, step: 0.01 } },
    { id: 'drums', type: 'toggle', label: 'Drums', default: true },
    { id: 'bassOn', type: 'toggle', label: 'Bass', default: true },
    { id: 'chordsOn', type: 'toggle', label: 'Chords', default: true },
    { id: 'leadOn', type: 'toggle', label: 'Lead', default: true },
    { id: 'arpOn', type: 'toggle', label: 'Arpeggio', default: true },
  ],
  info: {
    overview:
      'A whole piece of music from one seed. The seed picks a key, mode, tempo and song form (intro, verses, choruses, a break, an outro). Each section gets a chord progression from a Markov chain of functional harmony, a melody built from short motifs that repeat, vary and answer (a Markov chain over melodic steps, landing on chord tones), and Euclidean grooves for drums and bass. Several bellows instruments play it, chosen by the style. It keeps going: each pass through the form keeps the song and varies the details. The outputs follow the music, so visuals can move with the kick, the chords and the sections.',
    tips: [
      'Type any words as the seed. Same seed, same song: write it down to come back to one you like.',
      'Energy shapes the arrangement live. Wire an Audio Analyzer, a slider or a hand tracker into it.',
      'New Seed moves to a fresh song (seed, seed+1, seed+2 …); the Seed output shows the one playing.',
      'Kick, Snare and Hat fire as they sound, so they line up with the audio, not the scheduler.',
    ],
    pairsWith: ['audio-output', 'bellows-reverb', 'audio-analyzer', 'shader', 'xy-pad'],
  },
  tags: ['bellows', 'generative', 'music', 'markov', 'euclidean', 'seed', 'song', 'band', 'workstation', 'procedural', 'audio'],
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const base = ctx.str('seed', 'latch').trim() || 'latch'
  if (ctx.trig('next')) bumpSeed(ctx.nodeId)
  const bump = seedBumpOf(ctx.nodeId)
  const seed = bump ? `${base}+${bump}` : base
  const drumsOff = !ctx.bool('drums', true)
  const mutes: Partial<Record<Part, boolean>> = {
    kick: drumsOff, snare: drumsOff, hat: drumsOff, clap: drumsOff,
    bass: !ctx.bool('bassOn', true), chords: !ctx.bool('chordsOn', true), lead: !ctx.bool('leadOn', true), arp: !ctx.bool('arpOn', true),
  }
  configureWorkstation(ctx.nodeId, {
    seed,
    style: ctx.str('style', 'lofi'),
    key: ctx.str('key', 'auto'),
    scale: ctx.str('scale', 'auto'),
    bpm: Math.max(0, Math.min(220, ctx.num('bpm', 0))),
    playing: ctx.bool('playing', true),
    energy: Math.max(-1, Math.min(1, ctx.num('energy', 0))),
    mutes,
    level: Math.max(0, Math.min(1.5, ctx.num('level', 0.8))),
    reverb: 0.3,
  })

  const out = new Map<string, unknown>([['audio', routeWorkstation(ctx.nodeId, !!ctx.connectedOutputs?.has('audio'))], ['seedOut', seed]])
  const now = (Tone.getContext().rawContext as BaseAudioContext).currentTime
  const st = readWorkstation(ctx.nodeId, now)
  for (const id of ['kick', 'snare', 'hat', 'leadHit']) out.set(id, 0)
  if (st) {
    for (const h of st.due) {
      if (h.part === 'kick' || h.part === 'snare' || h.part === 'hat') out.set(h.part, 1)
      if (h.part === 'clap') out.set('snare', 1)
      if (h.part === 'lead') out.set('leadHit', 1)
    }
    out.set('bass', st.lastBass)
    out.set('lead', st.lastLead)
    out.set('chord', st.bar.chord.name)
    out.set('chordNotes', st.bar.chord.midi)
    out.set('section', st.bar.section)
    out.set('bar', st.barIndex)
    out.set('intensity', st.bar.energy)
    out.set('song', `${st.piece.key} ${st.piece.scale}, ${st.piece.bpm} BPM`)
  }
  return out
}

export default defineNode({ definition, executor })
