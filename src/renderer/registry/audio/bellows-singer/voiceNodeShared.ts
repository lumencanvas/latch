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
    { id: 'sendLevel', type: 'number', label: 'Reverb Send', default: 0, props: { min: 0, max: 1, step: 0.01 } },
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
