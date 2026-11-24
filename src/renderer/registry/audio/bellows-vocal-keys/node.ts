import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineNodeState } from '@/engine/nodeState'
import {
  configureSinger,
  readSinger,
  routeSinger,
  vocalSyllables,
  vocalVowel,
  vocalKeyDown,
  vocalKeyUp,
  vocalBend,
  vocalHeld,
} from '../bellows-singer/singerManager'
import {
  MOUTH_OUTPUTS,
  voiceControls,
  mixControls,
  resolveSingerConfig,
  writeVoiceOutputs,
} from '../bellows-singer/voiceNodeShared'

const DEFAULT_VOICE = 'pop-female'

/** Sustainable vowels the vocal engine has, as people read them. */
const VOWELS: { value: string; label: string }[] = [
  { value: 'ɑ', label: 'ah (father)' },
  { value: 'i', label: 'ee (see)' },
  { value: 'u', label: 'oo (blue)' },
  { value: 'e', label: 'ay (say)' },
  { value: 'o', label: 'oh (go)' },
  { value: 'ɛ', label: 'eh (bed)' },
  { value: 'æ', label: 'a (cat)' },
  { value: 'ɪ', label: 'ih (sit)' },
  { value: 'ʊ', label: 'uh (book)' },
  { value: 'ʌ', label: 'uh (cup)' },
  { value: 'ɔ', label: 'aw (law)' },
  { value: 'ə', label: 'schwa (about)' },
  { value: 'ɝ', label: 'er (bird)' },
  { value: 'm', label: 'mm (hum)' },
  { value: 'n', label: 'nn (hum)' },
]

const definition: NodeDefinition = {
  id: 'bellows-vocal-keys',
  name: 'Bellows Voice Keys',
  version: '1.0.0',
  category: 'audio',
  description: 'Play the singing voice like an instrument: hold a vowel on each key, or step through lyrics one syllable per key',
  icon: 'mic',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'note', type: 'number', label: 'Note' },
    { id: 'velocity', type: 'number', label: 'Velocity' },
    { id: 'gate', type: 'boolean', label: 'Gate (hold)' },
    { id: 'trigger', type: 'trigger', label: 'Trigger (one-shot)' },
    { id: 'lyrics', type: 'string', label: 'Lyrics' },
    { id: 'reset', type: 'trigger', label: 'Back to First Syllable' },
  ],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'syllable', type: 'string', label: 'Syllable' },
    { id: 'syllableIndex', type: 'number', label: 'Syllable #' },
    { id: 'ipa', type: 'string', label: 'IPA' },
    { id: 'held', type: 'boolean', label: 'Sounding' },
    ...MOUTH_OUTPUTS.filter((o) => o.id !== 'sounding'),
  ],
  controls: [
    {
      id: 'mode', type: 'select', label: 'Play', default: 'lyrics',
      props: { options: [
        { value: 'lyrics', label: 'Lyrics: one syllable per key' },
        { value: 'vowel', label: 'Vowel: the same sound on every key' },
      ] },
    },
    { id: 'lyrics', type: 'text', label: 'Lyrics', default: 'twin-kle twin-kle lit-tle star', when: { mode: 'lyrics' }, props: { placeholder: 'words to sing, one syllable per key' } },
    { id: 'loop', type: 'toggle', label: 'Loop Lyrics', default: true, when: { mode: 'lyrics' } },
    { id: 'vowel', type: 'select', label: 'Vowel', default: 'ɑ', when: { mode: 'vowel' }, props: { options: VOWELS } },
    {
      id: 'legato', type: 'toggle', label: 'Legato', default: false,
      description: 'A new key while one is still held glides to it (and sings the next syllable) without a new attack.',
    },
    { id: 'length', type: 'number', label: 'Trigger Note Length (s)', default: 0.4, props: { min: 0.05, max: 4, step: 0.01 } },
    ...voiceControls(DEFAULT_VOICE),
    ...mixControls(),
  ],
  info: {
    overview:
      'The articulatory singing voice as a keyboard instrument. In Lyrics mode, type a line of words: every key press sings the next syllable on that key’s pitch (its consonants, then the vowel, held for as long as the key is down, then the closing consonants on release), so playing a melody on a MIDI or on-screen keyboard sings the words. In Vowel mode every key sings the vowel you pick, like a choir patch. Legato glides between held keys instead of re-attacking.',
    tips: [
      'Wire a Keyboard or MIDI In node’s Note, Velocity and Gate in, then play the melody: the lyric advances one syllable per key.',
      'Split a word across keys with a hyphen ("twin-kle"); the Syllable output shows what sings next.',
      'Pulse Back to First Syllable to restart the line; turn Loop off to stop at the end.',
      'Trigger plays a one-shot syllable of Trigger Note Length; drive it from a Sequencer for a sung pattern.',
      'Wire the mouth outputs (Jaw, Lip Opening…) into visuals to lip-sync to what you play.',
    ],
    pairsWith: ['keyboard', 'midi-input', 'sequencer', 'bellows-reverb', 'bellows-singer'],
  },
  tags: ['bellows', 'voice', 'vocal', 'sing', 'keyboard', 'instrument', 'lyrics', 'choir', 'chimera', 'lip-sync'],
}

interface KeysState {
  index: number
  lyricsKey: string
  prevGate: boolean
  prevNote: number
  /** Context-free release time for a trigger one-shot (performance.now ms), 0 when none. */
  oneShotUntil: number
  lastSyllable: string
}

const keyState = defineNodeState<KeysState>({ label: 'bellows-vocal-keys' })
const freshKeys = (): KeysState => ({
  index: 0, lyricsKey: '', prevGate: false, prevNote: -1, oneShotUntil: 0, lastSyllable: '',
})

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const wired = !!ctx.connectedOutputs?.has('audio')
  const cfg = resolveSingerConfig(ctx.controls, DEFAULT_VOICE)
  cfg.send = 0
  configureSinger(ctx.nodeId, cfg)

  const st = keyState.getOrCreate(ctx.nodeId, freshKeys)
  const mode = ctx.str('mode', 'lyrics') === 'vowel' ? 'vowel' : 'lyrics'
  const lyrics = ctx.str('lyrics', '').trim()
  const legato = ctx.bool('legato', false)
  const note = Math.max(0, Math.min(127, Math.round(ctx.num('note', 60))))
  const velRaw = ctx.num('velocity', 100)
  const vel = clamp01(velRaw > 1 ? velRaw / 127 : velRaw)

  const syllables = mode === 'lyrics' && lyrics ? vocalSyllables(ctx.nodeId, lyrics) : null
  if (mode === 'lyrics' && lyrics !== st.lyricsKey) {
    st.lyricsKey = lyrics
    st.index = 0
  }
  if (ctx.trig('reset')) st.index = 0

  /** The next sound to sing (advancing the lyric), or null while loading / at the end. */
  const nextPhones = () => {
    if (mode === 'vowel') return vocalVowel(ctx.nodeId, ctx.str('vowel', 'ɑ'))
    if (!syllables || syllables.length === 0) return null
    if (st.index >= syllables.length) {
      if (!ctx.bool('loop', true)) return null
      st.index = 0
    }
    const p = syllables[st.index]
    st.index++
    return p
  }

  const gate = ctx.level('gate')
  const now = performance.now()
  if (gate && !st.prevGate) {
    const p = nextPhones()
    if (p) { vocalKeyDown(ctx.nodeId, p, note, vel, false); st.lastSyllable = p.text }
    st.prevNote = note
  } else if (gate && note !== st.prevNote) {
    // a new key while the gate stays high (MIDI legato playing)
    if (legato) {
      if (mode === 'vowel') vocalBend(ctx.nodeId, note)
      else {
        const p = nextPhones()
        if (p) { vocalKeyDown(ctx.nodeId, p, note, vel, true); st.lastSyllable = p.text }
      }
    } else {
      const p = nextPhones()
      if (p) { vocalKeyDown(ctx.nodeId, p, note, vel, false); st.lastSyllable = p.text }
    }
    st.prevNote = note
  } else if (!gate && st.prevGate) {
    vocalKeyUp(ctx.nodeId)
  }
  st.prevGate = gate

  if (ctx.trig('trigger')) {
    const p = nextPhones()
    if (p) {
      vocalKeyDown(ctx.nodeId, p, note, vel, false)
      st.lastSyllable = p.text
      st.oneShotUntil = now + Math.max(0.05, Math.min(4, ctx.num('length', 0.4))) * 1000
    }
  }
  if (st.oneShotUntil && now >= st.oneShotUntil) {
    st.oneShotUntil = 0
    if (!gate) vocalKeyUp(ctx.nodeId)
  }

  const r = readSinger(ctx.nodeId)
  const out = new Map<string, unknown>()
  const isHeld = vocalHeld(ctx.nodeId)
  writeVoiceOutputs(out, { ...r, busy: isHeld, done: false })
  out.delete('busy')
  out.delete('done')
  out.delete('sounding')
  out.set('held', isHeld)
  out.set('syllable', st.lastSyllable)
  out.set('syllableIndex', st.index)
  out.set('audio', routeSinger(ctx.nodeId, wired))
  return out
}

export default defineNode({ definition, executor })
