/**
 * Shared ports / controls / pure helpers for the bellows-voice nodes (bellows-singer,
 * bellows-speak). Pure — no bellows-voice import — so it is unit-testable and registry-safe.
 */

import type { ControlDefinition, PortDefinition } from '@/stores/nodes'
import type { SingNote } from 'bellows-voice'
import type { SingerConfig, SingerReadout } from './singerManager'
import { VOICE_PRESET_OPTIONS, ACCENT_OPTIONS, SHAPE_OPTIONS, safeVoice, safeAccent, safeShape } from './voiceData'

/**
 * The articulator probe as numbers to drive visuals. Normalized outputs are 0..1 using the
 * ranges bellows-voice documents for its frame (src/probe/frame.ts); tongue position stays in
 * its native centimetres (head frame: x forward, y up from the glottis).
 */
export const MOUTH_OUTPUTS: PortDefinition[] = [
  { id: 'jaw', type: 'number', label: 'Jaw Open (0–1)' },
  { id: 'mouthOpen', type: 'number', label: 'Lip Opening (0–1)' },
  { id: 'lipRound', type: 'number', label: 'Lip Rounding (0–1)' },
  { id: 'lipWidth', type: 'number', label: 'Lip Spread (0–1)' },
  { id: 'nasal', type: 'number', label: 'Nasal / Velum (0–1)' },
  { id: 'voicing', type: 'number', label: 'Voicing (0–1)' },
  { id: 'tongueX', type: 'number', label: 'Tongue X (cm)' },
  { id: 'tongueY', type: 'number', label: 'Tongue Y (cm)' },
  { id: 'phoneme', type: 'string', label: 'Phoneme (IPA)' },
  { id: 'sounding', type: 'boolean', label: 'Sounding' },
]

export const LINE_OUTPUTS: PortDefinition[] = [
  { id: 'ipa', type: 'string', label: 'IPA' },
  { id: 'busy', type: 'boolean', label: 'Busy' },
  { id: 'done', type: 'trigger', label: 'Done' },
]

/** Voice / accent / posture + mix controls, shared by both voice nodes. */
export function voiceControls(defaultVoice: string): ControlDefinition[] {
  return [
    { id: 'voice', type: 'select', label: 'Voice', default: defaultVoice, props: { options: VOICE_PRESET_OPTIONS } },
    { id: 'accent', type: 'select', label: 'Accent', default: 'general-american', props: { options: ACCENT_OPTIONS } },
    { id: 'shape', type: 'select', label: 'Mouth Posture', default: 'neutral', props: { options: SHAPE_OPTIONS } },
    {
      id: 'dictionary', type: 'toggle', label: 'Dictionary Pronunciation', default: true,
      description: 'Pronounce words with the CMU Pronouncing Dictionary (124k words) so vowels, stress and irregular words sound right — e.g. "beautiful", "island", the schwa in "listen". Loads ~570 KB once. Off: letter-to-sound rules only (~77% of words exact). Tip: write /IPA/ between slashes to set any word\'s sounds directly.',
    },
  ]
}

export function mixControls(): ControlDefinition[] {
  return [
    { id: 'mouth', type: 'toggle', label: 'Mouth Outputs', default: true, description: 'Read the jaw / lips / tongue as it plays (up to 8 voices at once).' },
    { id: 'gain', type: 'number', label: 'Level', default: 0.8, props: { min: 0, max: 2, step: 0.01 } },
    { id: 'pan', type: 'number', label: 'Pan (L ← → R)', default: 0, props: { min: -1, max: 1, step: 0.01 } },
  ]
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
const clamp01 = (v: number): number => clamp(Number.isFinite(v) ? v : 0, 0, 1)

/** PURE: a node's controls → the singer config. */
export function resolveSingerConfig(controls: Map<string, unknown>, defaultVoice: string): SingerConfig {
  return {
    voice: safeVoice(controls.get('voice'), defaultVoice),
    accent: safeAccent(controls.get('accent')),
    shape: safeShape(controls.get('shape')),
    gain: Math.max(0, num(controls.get('gain'), 0.8)),
    pan: clamp(num(controls.get('pan'), 0), -1, 1),
    send: clamp(num(controls.get('sendLevel'), 0), 0, 1),
    mouth: controls.get('mouth') !== false,
    dictionary: controls.get('dictionary') !== false,
  }
}

/** PURE: write the readout onto the node's outputs (held values before the first frame). */
export function writeVoiceOutputs(out: Map<string, unknown>, r: SingerReadout): void {
  const f = r.frame
  out.set('jaw', f ? clamp01(f.jaw / 2.6) : 0)
  out.set('mouthOpen', f ? clamp01(f.lipAperture / 2) : 0)
  out.set('lipRound', f ? clamp01(f.lipProtrusion / 1.4) : 0)
  out.set('lipWidth', f ? clamp01(f.lipWidth) : 0)
  out.set('nasal', f ? clamp01(f.velum / 1.2) : 0)
  out.set('voicing', f ? clamp01(f.glottal) : 0)
  out.set('tongueX', f && Number.isFinite(f.tongueBodyX) ? f.tongueBodyX : 0)
  out.set('tongueY', f && Number.isFinite(f.tongueBodyY) ? f.tongueBodyY : 0)
  out.set('phoneme', f?.phoneme ?? '')
  out.set('sounding', !!f?.sounding && r.busy)
  out.set('ipa', r.ipa)
  out.set('busy', r.busy)
  out.set('done', r.done ? 1 : 0)
}

// ── Melody parsing (bellows-singer) ──────────────────────────────────────────
const NOTE_NAME = /^[A-Ga-g](#|b)?-?\d$/
const REST = new Set(['r', 'R', '-', '_', '.', 'rest'])

type Pitch = number | string | null

function pitchOf(v: unknown): Pitch | undefined {
  if (v === null) return null
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? clamp(Math.round(v), 0, 127) : null
  if (typeof v === 'string') {
    const t = v.trim()
    if (REST.has(t)) return null
    if (NOTE_NAME.test(t)) return t.charAt(0).toUpperCase() + t.slice(1)
    const n = Number(t)
    if (t !== '' && Number.isFinite(n)) return n >= 0 ? clamp(Math.round(n), 0, 127) : null
  }
  return undefined // unparseable → dropped
}

/**
 * PURE: a melody → bellows `SingNote[]`, every duration in SECONDS at the node's own tempo (so
 * a singer never depends on — or changes — the shared kernel's global bpm).
 *
 * Accepts a data array (MIDI numbers, note names like 'C#4', null/'-' for a rest, or
 * `{ note, beats }` objects) or a text melody: `C4 C4 G4 G4 A4:2 - G4` where `:n` sets that
 * note's length in beats and `-` / `r` is a rest.
 */
export function parseMelody(raw: unknown, beatsPerNote: number, bpm: number): SingNote[] {
  const secPerBeat = 60 / clamp(num(bpm, 100), 20, 400)
  const defBeats = clamp(num(beatsPerNote, 1), 1 / 16, 16)
  const notes: SingNote[] = []
  const push = (p: Pitch | undefined, beats: number) => {
    if (p === undefined) return
    notes.push({ note: p, dur: { seconds: clamp(beats, 1 / 32, 32) * secPerBeat } })
  }
  if (Array.isArray(raw)) {
    for (const item of raw as unknown[]) {
      if (item && typeof item === 'object') {
        const o = item as { note?: unknown; beats?: unknown }
        push(pitchOf(o.note ?? null), num(o.beats, defBeats))
      } else {
        push(pitchOf(item), defBeats)
      }
    }
    return notes
  }
  if (typeof raw === 'number') {
    push(pitchOf(raw), defBeats)
    return notes
  }
  if (typeof raw !== 'string') return notes
  for (const tok of raw.split(/[\s,]+/)) {
    if (!tok) continue
    const [p, b] = tok.split(':')
    const beats = b !== undefined && b !== '' && Number.isFinite(Number(b)) ? Number(b) : defBeats
    push(pitchOf(p), beats)
  }
  return notes
}

/** Note-length select (beats). */
export const NOTE_LENGTH_OPTIONS = [
  { value: 0.25, label: 'Sixteenth' },
  { value: 0.5, label: 'Eighth' },
  { value: 1, label: 'Quarter' },
  { value: 2, label: 'Half' },
  { value: 4, label: 'Whole' },
]

// ── Fitting a melody to the words ────────────────────────────────────────────

/** What the melody fitter needs to know about each sung syllable. */
export interface SyllableShape { stress: number; wordEnd: boolean; phraseEnd: boolean }

/**
 * PURE: repeat `notes` until there is one pitched note per syllable (rests are kept where they
 * fall and don't use a syllable). A melody already long enough is returned unchanged.
 */
export function loopNotesToFit(notes: SingNote[], syllables: number): SingNote[] {
  const pitched = (n: SingNote) => n.note !== null
  const have = notes.filter(pitched).length
  if (have === 0 || have >= syllables) return notes
  const out: SingNote[] = []
  let count = 0
  for (let i = 0; count < syllables && i < syllables * 4 + notes.length; i++) {
    const n = notes[i % notes.length]
    out.push(n)
    if (pitched(n)) count++
  }
  return out
}

export const IMPROV_SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  'major pentatonic': [0, 2, 4, 7, 9],
  'minor pentatonic': [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  blues: [0, 3, 5, 6, 7, 10],
}

function seededRng(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296 }
}

/**
 * PURE: make up a singable melody for a line. Each phrase arcs up and comes home: stressed syllables
 * sit higher and longer, steps are mostly small, the last syllable of a phrase lands on the root
 * (or the fifth mid-line) and is held. Same words in, same tune out (seeded from the text).
 */
export function improviseMelody(
  syls: SyllableShape[],
  opts: { root: number; scale: string; bpm: number; beat: number; seed: string },
): SingNote[] {
  const scale = IMPROV_SCALES[opts.scale] ?? IMPROV_SCALES.major
  const secPerBeat = 60 / clamp(opts.bpm, 20, 400)
  const beat = clamp(opts.beat, 1 / 8, 4)
  const rnd = seededRng(opts.seed)
  const toMidi = (deg: number) => {
    const oct = Math.floor(deg / scale.length)
    const i = ((deg % scale.length) + scale.length) % scale.length
    return clamp(opts.root + oct * 12 + scale[i], 36, 96)
  }
  const fifth = scale.indexOf(7) >= 0 ? scale.indexOf(7) : Math.floor(scale.length / 2)
  const out: SingNote[] = []
  // Split into phrases at phraseEnd (and keep phrases a breath long).
  let start = 0
  let deg = 0
  let phraseNo = 0
  for (let i = 0; i < syls.length; i++) {
    const endHere = syls[i].phraseEnd || i === syls.length - 1 || i - start >= 11
    if (!endHere) continue
    const len = i - start + 1
    const peak = scale.length - 1 + Math.round(rnd() * 3) // how high this phrase climbs
    const lastLine = i === syls.length - 1
    for (let k = 0; k < len; k++) {
      const s = syls[start + k]
      const t = len === 1 ? 1 : k / (len - 1)
      const arc = Math.sin(Math.PI * Math.min(1, t * 1.15)) // up, then home
      let target = Math.round(arc * peak * 0.75)
      if (s.stress > 0) target += 1
      // mostly stepwise from the last note
      const step = clamp(target - deg, -2, 3)
      deg += step === 0 && rnd() < 0.3 ? (rnd() < 0.5 ? 1 : -1) : step
      const isEnd = k === len - 1
      if (isEnd) deg = lastLine || phraseNo % 2 === 1 ? 0 : fifth
      let beats = s.stress > 0 ? beat : beat / 2
      if (s.wordEnd && !isEnd && rnd() < 0.25) beats *= 1.5
      if (isEnd) beats = beat * 2
      out.push({ note: toMidi(deg), dur: { seconds: beats * secPerBeat } })
    }
    start = i + 1
    phraseNo++
  }
  return out
}
