/**
 * bellowsjs engine / preset / fx surface — DATA + PURE HELPERS (no bellows import).
 *
 * The node definition needs its controls synchronously at registry time, but bellowsjs is
 * lazy-imported (kept out of the main bundle). So the engine param ranges, the 50-preset
 * bank, and the fx list are transcribed here from `bellowsjs@0.5.0`'s generated catalog
 * (`listEngines()` / `listEffects()` / `INSTRUMENT_PRESETS`). `engineParams.test.ts` diffs this
 * table against that live catalog, so a bellows upgrade that moves a range, renames a param or
 * re-engines a preset fails CI instead of silently drifting.
 *
 * Array-expanded params (FM operators ratio1..6/level1..6/fixed1..6, additive
 * partial/target/detune 1..32) are intentionally NOT individual controls — that's 18 / 96
 * sliders. Reach them by name through the raw `params` escape hatch (see `parseRawParams`).
 * Per-engine `pan` is also omitted: the channel Pan control owns stereo placement.
 *
 * `granular` is deliberately absent: bellows' granular engine plays grains of a SOURCE BUFFER
 * handed to `b.granular(data, sampleRate)`; `b.voice('granular')` has no buffer and is silent.
 * Offering it in a plain engine picker would be a dead option.
 */

import type { ControlDefinition } from '@/stores/nodes'

export interface EngineParamSpec {
  name: string
  min: number
  max: number
  default: number
  /** Integer-valued selector param (shape, algorithm, material, …) → step 1. */
  int?: boolean
  unit?: string
  /** bellows' UI hint: 'exp' params (times, frequencies) want a finer step. */
  curve?: 'lin' | 'exp'
}

/** Engine ids registered by bellows' `registerBuiltins` that play from a bare `b.voice(id)`. */
export const ENGINES: readonly string[] = [
  'va', 'fm', 'additive', 'wavetable', 'pluck', 'string', 'tube', 'modal',
  'westcoast', 'formant', 'harmonic', 'noise',
  'kick', 'snare', 'hat', 'clap', 'tom',
] as const

export const ENGINE_LABELS: Record<string, string> = {
  va: 'Virtual Analog', fm: 'FM', additive: 'Additive', wavetable: 'Wavetable',
  pluck: 'Pluck', string: 'Waveguide String', tube: 'Waveguide Tube', modal: 'Modal',
  westcoast: 'West Coast', formant: 'Formant', harmonic: 'Harmonic + Noise',
  noise: 'Noise Synth', kick: 'Kick', snare: 'Snare', hat: 'Hat', clap: 'Clap', tom: 'Tom',
}

/**
 * Per-engine macro param specs — the named, musically-meaningful surface of each engine,
 * generated from bellowsjs@0.5.0 `listEngines()` (min/max/default/unit/curve verbatim; `int`
 * marks indexed selectors). Drift-guarded by engineParams.test.ts.
 */
export const PARAM_SPECS: Record<string, EngineParamSpec[]> = {
  va: [
    { name: 'shape', min: 0, max: 3, default: 0, int: true },
    { name: 'detune', min: 0, max: 100, default: 7, unit: 'cents' },
    { name: 'sub', min: 0, max: 1, default: 0 },
    { name: 'cutoff', min: 20, max: 20000, default: 9000, unit: 'Hz', curve: 'exp' },
    { name: 'resonance', min: 0, max: 1, default: 0.2 },
    { name: 'filterType', min: 0, max: 1, default: 0, int: true },
    { name: 'envAmount', min: -6, max: 6, default: 0, unit: 'oct' },
    { name: 'attack', min: 0, max: 10, default: 0.005, unit: 's', curve: 'exp' },
    { name: 'decay', min: 0, max: 10, default: 0.1, unit: 's', curve: 'exp' },
    { name: 'sustain', min: 0, max: 1, default: 0.8 },
    { name: 'release', min: 0, max: 10, default: 0.2, unit: 's', curve: 'exp' },
    { name: 'fAttack', min: 0, max: 10, default: 0.003, unit: 's', curve: 'exp' },
    { name: 'fDecay', min: 0, max: 10, default: 0.15, unit: 's', curve: 'exp' },
    { name: 'fSustain', min: 0, max: 1, default: 0.5 },
    { name: 'fRelease', min: 0, max: 10, default: 0.2, unit: 's', curve: 'exp' },
    { name: 'drift', min: 0, max: 1, default: 0 },
    { name: 'velLevel', min: 0, max: 1, default: 0.5 },
    { name: 'velFilter', min: 0, max: 4, default: 0, unit: 'oct' },
  ],
  fm: [
    { name: 'ops', min: 2, max: 6, default: 4, int: true },
    { name: 'algorithm', min: 1, max: 8, default: 1, int: true },
    { name: 'feedback', min: 0, max: 1, default: 0 },
    { name: 'brightness', min: 0, max: 2, default: 0.5 },
    { name: 'attack', min: 0, max: 10, default: 0.003, unit: 's', curve: 'exp' },
    { name: 'decay', min: 0, max: 10, default: 0.3, unit: 's', curve: 'exp' },
    { name: 'sustain', min: 0, max: 1, default: 0.7 },
    { name: 'release', min: 0, max: 10, default: 0.3, unit: 's', curve: 'exp' },
    { name: 'mAttack', min: 0, max: 10, default: 0.002, unit: 's', curve: 'exp' },
    { name: 'mDecay', min: 0, max: 10, default: 0.4, unit: 's', curve: 'exp' },
    { name: 'mSustain', min: 0, max: 1, default: 0.5 },
    { name: 'mRelease', min: 0, max: 10, default: 0.2, unit: 's', curve: 'exp' },
  ],
  additive: [
    { name: 'morph', min: 0, max: 1, default: 0 },
    { name: 'inharm', min: 0, max: 0.02, default: 0 },
    { name: 'decay', min: 0.01, max: 20, default: 2, unit: 's', curve: 'exp' },
    { name: 'rolloff', min: 0.3, max: 1, default: 0.8 },
    { name: 'attack', min: 0, max: 10, default: 0.002, unit: 's', curve: 'exp' },
    { name: 'release', min: 0, max: 10, default: 0.3, unit: 's', curve: 'exp' },
    { name: 'gain', min: 0, max: 2, default: 1 },
  ],
  wavetable: [
    { name: 'position', min: 0, max: 1, default: 0 },
    { name: 'scanRate', min: 0, max: 20, default: 0.5, unit: 'Hz', curve: 'exp' },
    { name: 'scanDepth', min: 0, max: 1, default: 0 },
    { name: 'envToPosition', min: -1, max: 1, default: 0 },
    { name: 'attack', min: 0, max: 10, default: 0.005, unit: 's', curve: 'exp' },
    { name: 'decay', min: 0, max: 10, default: 0.1, unit: 's', curve: 'exp' },
    { name: 'sustain', min: 0, max: 1, default: 0.8 },
    { name: 'release', min: 0, max: 10, default: 0.2, unit: 's', curve: 'exp' },
    { name: 'filter', min: 0, max: 1, default: 0 },
    { name: 'cutoff', min: 20, max: 20000, default: 8000, unit: 'Hz', curve: 'exp' },
    { name: 'resonance', min: 0, max: 1, default: 0.1 },
  ],
  pluck: [
    { name: 'damp', min: 0, max: 1, default: 0.35 },
    { name: 'pickPos', min: 0, max: 0.95, default: 0.28 },
    { name: 'exciteType', min: 0, max: 1, default: 0, int: true },
    { name: 'decay', min: 0.05, max: 20, default: 2.5, unit: 's', curve: 'exp' },
    { name: 'level', min: 0, max: 1, default: 0.9 },
  ],
  string: [
    { name: 'damp', min: 0, max: 1, default: 0.35 },
    { name: 'sustain', min: 0, max: 1, default: 0.6 },
    { name: 'dispersion', min: 0, max: 1, default: 0 },
    { name: 'bow', min: 0, max: 1, default: 0 },
    { name: 'bowPressure', min: 0, max: 1, default: 0.5 },
    { name: 'bowSpeed', min: 0, max: 1, default: 0.5 },
    { name: 'level', min: 0, max: 1, default: 0.9 },
    { name: 'body', min: 0, max: 1, default: 0 },
    { name: 'bodySize', min: 0, max: 1, default: 0 },
    { name: 'bowNoise', min: 0, max: 1, default: 0 },
    { name: 'attackBite', min: 0, max: 1, default: 0 },
    { name: 'vibRate', min: 3, max: 9, default: 6.1, unit: 'Hz' },
    { name: 'vibDepth', min: 0, max: 50, default: 0, unit: 'cents' },
    { name: 'vibOnset', min: 0, max: 1, default: 0.3, unit: 's' },
    { name: 'bowPos', min: 0.06, max: 0.2, default: 0.11 },
    { name: 'dynamics', min: 0, max: 1, default: 0 },
    { name: 'polDetune', min: 0, max: 5, default: 0, unit: 'cents' },
    { name: 'glide', min: 0, max: 0.5, default: 0.03, unit: 's' },
    { name: 'legatoScratch', min: 0, max: 1, default: 0.15 },
  ],
  tube: [
    { name: 'breath', min: 0, max: 1, default: 0.85 },
    { name: 'noise', min: 0, max: 1, default: 0.1 },
    { name: 'level', min: 0, max: 1, default: 0.7 },
    { name: 'glide', min: 0, max: 0.5, default: 0.03, unit: 's' },
    { name: 'legatoScratch', min: 0, max: 1, default: 0.15 },
  ],
  modal: [
    { name: 'material', min: 0, max: 4, default: 0, int: true },
    { name: 'decay', min: 0.05, max: 30, default: 2, unit: 's', curve: 'exp' },
    { name: 'brightness', min: 0, max: 1, default: 0.5 },
    { name: 'strikeHardness', min: 0, max: 1, default: 0.6 },
    { name: 'level', min: 0, max: 1, default: 0.6 },
  ],
  westcoast: [
    { name: 'foldAmount', min: 0, max: 1, default: 0.35 },
    { name: 'foldStages', min: 1, max: 6, default: 2, int: true },
    { name: 'foldEnv', min: 0, max: 1, default: 0.5 },
    { name: 'lpgColor', min: 0, max: 1, default: 0.7 },
    { name: 'lpgDecay', min: 0.02, max: 5, default: 0.5, unit: 's', curve: 'exp' },
    { name: 'level', min: 0, max: 1, default: 0.8 },
  ],
  formant: [
    { name: 'vowel', min: 0, max: 4, default: 0 },
    { name: 'breath', min: 0, max: 1, default: 0.1 },
    { name: 'vibratoRate', min: 0, max: 12, default: 5, unit: 'Hz' },
    { name: 'vibratoDepth', min: 0, max: 2, default: 0.25, unit: 'st' },
    { name: 'shape', min: 0, max: 1, default: 0, int: true },
    { name: 'level', min: 0, max: 2, default: 1 },
  ],
  harmonic: [
    { name: 'brightness', min: 0, max: 1, default: 0.5 },
    { name: 'evenOdd', min: 0, max: 1, default: 0.5 },
    { name: 'formantShift', min: 0.25, max: 4, default: 1, curve: 'exp' },
    { name: 'noiseMix', min: 0, max: 1, default: 0.1 },
    { name: 'noiseColor', min: 0.25, max: 16, default: 2, curve: 'exp' },
    { name: 'portamento', min: 0, max: 4, default: 0, unit: 's' },
    { name: 'attack', min: 0.001, max: 4, default: 0.01, unit: 's', curve: 'exp' },
    { name: 'release', min: 0.01, max: 8, default: 0.3, unit: 's', curve: 'exp' },
    { name: 'level', min: 0, max: 1, default: 0.8 },
  ],
  noise: [
    { name: 'color', min: 0, max: 4, default: 0, int: true },
    { name: 'filterMode', min: 0, max: 2, default: 0, int: true },
    { name: 'cutoff', min: 20, max: 20000, default: 2000, unit: 'Hz', curve: 'exp' },
    { name: 'resonance', min: 0, max: 1, default: 0.1 },
    { name: 'envAmount', min: -6, max: 6, default: 0, unit: 'oct' },
    { name: 'keyTrack', min: 0, max: 1, default: 0 },
    { name: 'attack', min: 0, max: 10, default: 0.002, unit: 's', curve: 'exp' },
    { name: 'decay', min: 0, max: 10, default: 0.15, unit: 's', curve: 'exp' },
    { name: 'sustain', min: 0, max: 1, default: 0.3 },
    { name: 'release', min: 0, max: 10, default: 0.1, unit: 's', curve: 'exp' },
    { name: 'fAttack', min: 0, max: 10, default: 0.001, unit: 's', curve: 'exp' },
    { name: 'fDecay', min: 0, max: 10, default: 0.12, unit: 's', curve: 'exp' },
    { name: 'fSustain', min: 0, max: 1, default: 0 },
    { name: 'fRelease', min: 0, max: 10, default: 0.1, unit: 's', curve: 'exp' },
  ],
  kick: [
    { name: 'clickTune', min: 1, max: 16, default: 6, int: true },
    { name: 'pitchDecay', min: 0.005, max: 0.5, default: 0.05, unit: 's', curve: 'exp' },
    { name: 'decay', min: 0.05, max: 2, default: 0.4, unit: 's', curve: 'exp' },
    { name: 'drive', min: 0, max: 10, default: 2 },
  ],
  snare: [
    { name: 'tone', min: 0, max: 1, default: 0.5 },
    { name: 'decay', min: 0.05, max: 1, default: 0.18, unit: 's', curve: 'exp' },
    { name: 'snap', min: 0.02, max: 1, default: 0.15, unit: 's', curve: 'exp' },
  ],
  hat: [
    { name: 'decay', min: 0.02, max: 2, default: 0.08, unit: 's', curve: 'exp' },
    { name: 'tone', min: 0.2, max: 2, default: 1 },
  ],
  clap: [
    { name: 'decay', min: 0.05, max: 2, default: 0.25, unit: 's', curve: 'exp' },
    { name: 'spread', min: 0.005, max: 0.05, default: 0.012, unit: 's', curve: 'exp' },
    { name: 'tone', min: 400, max: 4000, default: 1200, unit: 'Hz', curve: 'exp' },
  ],
  tom: [
    { name: 'decay', min: 0.05, max: 2, default: 0.35, unit: 's', curve: 'exp' },
    { name: 'sweep', min: 0.01, max: 0.5, default: 0.08, unit: 's', curve: 'exp' },
    { name: 'noise', min: 0, max: 1, default: 0.15 },
  ],
}

// ── Human labels, enum options, core/advanced split ──────────────────────────
/** Display names for bellows' camelCase param ids (shared across engines unless overridden). */
const PARAM_LABELS: Record<string, string> = {
  shape: 'Waveform', detune: 'Detune', sub: 'Sub Oscillator', cutoff: 'Cutoff',
  resonance: 'Resonance', filterType: 'Filter Type', envAmount: 'Filter Env Amount',
  attack: 'Attack', decay: 'Decay', sustain: 'Sustain', release: 'Release',
  fAttack: 'Filter Attack', fDecay: 'Filter Decay', fSustain: 'Filter Sustain', fRelease: 'Filter Release',
  drift: 'Analog Drift', velLevel: 'Velocity → Level', velFilter: 'Velocity → Cutoff',
  ops: 'Operators', algorithm: 'Algorithm', feedback: 'Feedback', brightness: 'Brightness',
  mAttack: 'Mod Attack', mDecay: 'Mod Decay', mSustain: 'Mod Sustain', mRelease: 'Mod Release',
  morph: 'Partial Morph', inharm: 'Inharmonicity', rolloff: 'Partial Rolloff', gain: 'Engine Gain',
  position: 'Table Position', scanRate: 'Scan Rate', scanDepth: 'Scan Depth',
  envToPosition: 'Envelope → Position', filter: 'Filter Amount',
  damp: 'Damping', pickPos: 'Pick Position', exciteType: 'Excitation', level: 'Level',
  dispersion: 'Stiffness', bow: 'Bowing', bowPressure: 'Bow Pressure', bowSpeed: 'Bow Speed',
  body: 'Body Resonance', bodySize: 'Body Size', bowNoise: 'Bow Noise', attackBite: 'Attack Bite',
  vibRate: 'Vibrato Rate', vibDepth: 'Vibrato Depth', vibOnset: 'Vibrato Onset',
  bowPos: 'Bow Position', dynamics: 'Dynamics', polDetune: 'Polarization Detune',
  glide: 'Glide', legatoScratch: 'Legato Scratch', breath: 'Breath', noise: 'Noise',
  material: 'Material', strikeHardness: 'Strike Hardness',
  foldAmount: 'Fold Amount', foldStages: 'Fold Stages', foldEnv: 'Fold Envelope',
  lpgColor: 'Low-Pass Gate Color', lpgDecay: 'Low-Pass Gate Decay',
  vowel: 'Vowel (a → e → i → o → u)', vibratoRate: 'Vibrato Rate', vibratoDepth: 'Vibrato Depth',
  evenOdd: 'Even / Odd Harmonics', formantShift: 'Formant Shift', noiseMix: 'Noise Mix',
  noiseColor: 'Noise Color', portamento: 'Portamento', color: 'Noise Color',
  filterMode: 'Filter Mode', keyTrack: 'Key Tracking', clickTune: 'Click Pitch',
  pitchDecay: 'Pitch Decay', drive: 'Drive', tone: 'Tone', snap: 'Snap', spread: 'Spread',
  sweep: 'Pitch Sweep',
}
const ENGINE_PARAM_LABELS: Record<string, string> = {
  'formant.shape': 'Source',
  'additive.decay': 'Partial Decay',
}

/** Unit suffixes as people read them. */
const UNIT_LABELS: Record<string, string> = {
  s: 's', Hz: 'Hz', cents: 'cents', oct: 'oct', st: 'semitones', ms: 'ms',
}

/** Indexed selector params whose integer values name a mode — rendered as a labelled select. */
const ENUM_OPTIONS: Record<string, string[]> = {
  'va.shape': ['Saw', 'Square', 'Triangle', 'Sine'],
  'va.filterType': ['Ladder', 'State-Variable'],
  'noise.color': ['White', 'Pink', 'Brown', 'Velvet', 'Crackle'],
  'noise.filterMode': ['Low-Pass', 'Band-Pass', 'High-Pass'],
  'pluck.exciteType': ['Noise Burst', 'Filtered Pulse'],
  'modal.material': ['Bar', 'Membrane', 'Bell', 'Glass', 'Wood'],
  'formant.shape': ['Saw', 'Square'],
}

/**
 * The params that define an engine's character — shown by default. Everything else sits
 * behind the "Show All Parameters" toggle so a manual engine opens on 5–10 controls, not 19.
 * Engines not listed here show every param (they're already small).
 */
const CORE_PARAMS: Record<string, string[]> = {
  va: ['shape', 'detune', 'sub', 'cutoff', 'resonance', 'envAmount', 'attack', 'decay', 'sustain', 'release'],
  fm: ['algorithm', 'feedback', 'brightness', 'attack', 'decay', 'sustain', 'release'],
  additive: ['morph', 'inharm', 'decay', 'rolloff', 'attack', 'release'],
  wavetable: ['position', 'scanRate', 'scanDepth', 'cutoff', 'attack', 'decay', 'sustain', 'release'],
  string: ['damp', 'sustain', 'bow', 'bowPressure', 'bowSpeed', 'body', 'vibDepth', 'level'],
  harmonic: ['brightness', 'evenOdd', 'formantShift', 'noiseMix', 'attack', 'release', 'level'],
  noise: ['color', 'filterMode', 'cutoff', 'resonance', 'attack', 'decay', 'sustain', 'release'],
}

export function isCoreParam(engine: string, param: string): boolean {
  const core = CORE_PARAMS[engine]
  return !core || core.includes(param)
}

/** Human label for an engine param, with its unit: `Filter Attack (s)`. */
export function paramLabel(engine: string, spec: EngineParamSpec): string {
  const base = ENGINE_PARAM_LABELS[`${engine}.${spec.name}`] ?? PARAM_LABELS[spec.name] ?? spec.name
  const enumerated = ENUM_OPTIONS[`${engine}.${spec.name}`]
  const unit = spec.unit ? UNIT_LABELS[spec.unit] ?? spec.unit : ''
  return unit && !enumerated ? `${base} (${unit})` : base
}

/**
 * A step that can actually reach the param's default: bellows ranges like attack 0–10 s with
 * a 0.005 s default need 0.001 resolution, cutoff 20–20000 Hz needs 1. Without an explicit step
 * the panel's number field (and its drag-scrub) falls back to step 1, which snaps a 0–1
 * sustain to 0 or 1 — so every non-integer param gets one.
 */
export function paramStep(spec: EngineParamSpec): number {
  if (spec.int) return 1
  const span = spec.max - spec.min
  if (!(span > 0)) return 0.01
  const target = span / (spec.curve === 'exp' ? 10000 : 1000)
  return Math.min(1, 10 ** Math.floor(Math.log10(target)))
}

/** Default (catalog) value of an engine param, or undefined when the name isn't a macro param. */
export function paramDefault(engine: string, name: string): number | undefined {
  return PARAM_SPECS[engine]?.find((p) => p.name === name)?.default
}

/** True for params whose value is a mode index (never ramped — a half-way index is meaningless). */
export function isSteppedParam(engine: string, name: string): boolean {
  return PARAM_SPECS[engine]?.find((p) => p.name === name)?.int === true
}

// ── Presets (50, from bellowsjs@0.5.0 INSTRUMENT_PRESETS) ────────────────────
export interface PresetMeta { id: string; label: string; family: string; engineId: string }

/** id | family | engine — labels are Title-Cased from the id for the select. */
export const PRESETS: readonly PresetMeta[] = [
  ['nylon-guitar', 'guitars', 'pluck'], ['steel-guitar', 'guitars', 'pluck'],
  ['twelve-string', 'guitars', 'pluck'], ['muted-electric', 'guitars', 'pluck'],
  ['clean-electric', 'guitars', 'pluck'], ['bass-guitar', 'guitars', 'pluck'],
  ['banjo', 'guitars', 'pluck'], ['sitar-drone', 'guitars', 'pluck'], ['koto', 'guitars', 'pluck'],
  ['harp', 'guitars', 'pluck'], ['clavinet', 'guitars', 'pluck'], ['violin', 'strings', 'string'],
  ['viola', 'strings', 'string'], ['cello', 'strings', 'string'],
  ['double-bass', 'strings', 'string'], ['pizzicato-strings', 'strings', 'string'],
  ['concert-flute', 'winds', 'harmonic'], ['pan-flute', 'winds', 'harmonic'],
  ['clarinet', 'winds', 'tube'], ['recorder', 'winds', 'tube'], ['ocarina', 'winds', 'harmonic'],
  ['shakuhachi', 'winds', 'harmonic'], ['trumpet', 'brass', 'harmonic'],
  ['trombone', 'brass', 'harmonic'], ['brass-section', 'brass', 'harmonic'],
  ['fm-horn', 'brass', 'fm'], ['dx-epiano', 'keys', 'fm'], ['drawbar-organ', 'keys', 'additive'],
  ['church-organ', 'keys', 'additive'], ['harpsichord', 'keys', 'pluck'],
  ['celesta', 'keys', 'additive'], ['music-box', 'keys', 'additive'],
  ['marimba', 'mallets', 'modal'], ['vibraphone', 'mallets', 'modal'],
  ['glockenspiel', 'mallets', 'modal'], ['tubular-bells', 'mallets', 'modal'],
  ['kalimba', 'mallets', 'modal'], ['steel-drum', 'mallets', 'modal'],
  ['woodblock', 'mallets', 'modal'], ['timpani', 'mallets', 'modal'],
  ['choir-aah', 'voices', 'formant'], ['voice-ooh', 'voices', 'formant'],
  ['whistle', 'voices', 'additive'], ['analog-lead', 'synth', 'va'],
  ['fat-saw-pad', 'synth', 'va'], ['acid-bass', 'synth', 'va'], ['sub-bass', 'synth', 'va'],
  ['west-coast-pluck', 'synth', 'westcoast'], ['motion-pad', 'synth', 'wavetable'],
  ['fm-bell-lead', 'synth', 'fm'],
].map(([id, family, engineId]) => ({
  id,
  family,
  engineId,
  label: id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
}))

const PRESET_IDS = new Set(PRESETS.map((p) => p.id))
export const isPreset = (id: string): boolean => PRESET_IDS.has(id)

const FAMILY_LABELS: Record<string, string> = {
  guitars: 'Guitars', strings: 'Strings', winds: 'Winds', brass: 'Brass',
  keys: 'Keys', mallets: 'Mallets', voices: 'Voices', synth: 'Synth',
}

/** Sentinel option label for manual (build-your-own) mode. */
export const MANUAL_PRESET_LABEL = 'Manual — build your own sound'

/** `{value,label}` select options: leading Manual sentinel, then presets grouped by family. */
export const PRESET_SELECT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: MANUAL_PRESET_LABEL },
  ...PRESETS.map((p) => ({ value: p.id, label: `${FAMILY_LABELS[p.family] ?? p.family} · ${p.label}` })),
]

export const ENGINE_SELECT_OPTIONS: { value: string; label: string }[] = ENGINES.map((e) => ({
  value: e,
  label: ENGINE_LABELS[e] ?? e,
}))

// ── Insert FX (bellows listEffects() ids) ────────────────────────────────────
// Every listed effect does something audible at its defaults, EXCEPT pitchshift/freqshift
// (0 st / 0 Hz) — those are listed because the FX-params field reaches `semitones=` / `shift=`.
// Spectral freeze/denoise are omitted: freeze needs a gate param a static insert can't drive.
export const INSERT_FX_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'filter', label: 'Filter' },
  { value: 'delay', label: 'Stereo Delay' }, { value: 'tapeDelay', label: 'Tape Delay' },
  { value: 'multitap', label: 'Multitap Delay' }, { value: 'chorus', label: 'Chorus' },
  { value: 'flanger', label: 'Flanger' }, { value: 'phaser', label: 'Phaser' },
  { value: 'tremolo', label: 'Tremolo' }, { value: 'autopan', label: 'Auto Pan' },
  { value: 'ringmod', label: 'Ring Mod' }, { value: 'plate', label: 'Plate Reverb' },
  { value: 'fdn', label: 'FDN Reverb' }, { value: 'compressor', label: 'Compressor' },
  { value: 'limiter', label: 'Limiter' }, { value: 'transient', label: 'Transient Shaper' },
  { value: 'saturator', label: 'Saturator' }, { value: 'eq', label: 'Parametric EQ' },
  { value: 'pitchshift', label: 'Pitch Shift' }, { value: 'freqshift', label: 'Frequency Shifter' },
  { value: 'blur', label: 'Spectral Blur' }, { value: 'robot', label: 'Robotize' },
  { value: 'whisper', label: 'Whisper' },
]
const INSERT_FX_IDS = new Set(INSERT_FX_OPTIONS.map((o) => o.value).filter(Boolean))

// ── Control generation ───────────────────────────────────────────────────────
/** Control id for an engine param: `p_<engine>_<param>` (avoids collision with gain/pan/preset). */
export const paramControlId = (engine: string, param: string): string => `p_${engine}_${param}`

/**
 * Every engine's param controls, each gated to its engine AND manual mode
 * (`when: { engine, preset: '' }`) so the panel only ever shows the active engine's surface
 * and presets own the timbre in preset mode. Secondary params additionally need
 * `advanced: true`. Mode-index params render as labelled selects (numeric option values,
 * coerced back to numbers by the select renderer).
 */
export function buildEngineParamControls(): ControlDefinition[] {
  const controls: ControlDefinition[] = []
  for (const engine of ENGINES) {
    for (const p of PARAM_SPECS[engine] ?? []) {
      const when: Record<string, unknown> = { engine, preset: '' }
      if (!isCoreParam(engine, p.name)) when.advanced = true
      const enumerated = ENUM_OPTIONS[`${engine}.${p.name}`]
      controls.push(enumerated
        ? {
            id: paramControlId(engine, p.name),
            type: 'select',
            label: paramLabel(engine, p),
            default: p.default,
            when,
            props: { options: enumerated.map((label, value) => ({ value, label })) },
          }
        : {
            id: paramControlId(engine, p.name),
            type: 'number',
            label: paramLabel(engine, p),
            default: p.default,
            when,
            props: { min: p.min, max: p.max, step: paramStep(p) },
          })
    }
  }
  return controls
}

/**
 * The full bellows voice control block shared by bellows-instrument and poly-voice, in panel
 * order: Preset → (Manual: Engine, its params, Show All, Insert FX + its params, Raw params) →
 * mix trims that apply in both modes.
 */
export function buildVoiceControls(defaultEngine: string): ControlDefinition[] {
  return [
    // Casual layer: pick one of 50 ready-to-play instruments. '' → manual engine mode.
    { id: 'preset', type: 'select', label: 'Preset', default: '', description: 'A ready-made instrument, or Manual to build your own from an engine.', props: { options: PRESET_SELECT_OPTIONS } },
    // Preset dials: shade the chosen preset (preset mode only).
    ...buildMacroControls(),
    // Structured layer: engine + its param surface (manual mode only).
    { id: 'engine', type: 'select', label: 'Engine', default: defaultEngine, when: { preset: '' }, props: { options: ENGINE_SELECT_OPTIONS } },
    ...buildEngineParamControls(),
    { id: 'advanced', type: 'toggle', label: 'Show All Parameters', default: false, when: { preset: '' } },
    { id: 'insertFx', type: 'select', label: 'Insert Effect', default: '', when: { preset: '' }, props: { options: INSERT_FX_OPTIONS } },
    { id: 'fxParams', type: 'text', label: 'Effect Settings (k=v)', default: '', when: { preset: '', insertFx: { ne: '' } }, props: { placeholder: 'mix=0.5, feedback=0.6' } },
    // Power escape: reach array-expanded params (FM ratio1.., additive partial1..) by name.
    { id: 'params', type: 'text', label: 'Raw Engine Params (k=v)', default: '', when: { preset: '' }, props: { placeholder: 'ratio2=3.5, level2=0.7' } },
    // Mix trims — apply in BOTH modes (on a preset, Level scales the preset's own level).
    { id: 'gain', type: 'number', label: 'Level', default: 0.8, props: { min: 0, max: 2, step: 0.01 } },
    { id: 'pan', type: 'number', label: 'Pan (L ← → R)', default: 0, props: { min: -1, max: 1, step: 0.01 } },
  ]
}

// ── Preset dials (macros) ────────────────────────────────────────────────────
/**
 * A preset is a fixed set of engine params. These dials shade it without leaving preset mode: each
 * macro maps onto the params of the preset's own engine, relative to the preset's values, so 0 is
 * the instrument exactly as voiced. Tone / Attack / Release / Length run −1..1; Vibrato 0..1.
 */
export const MACROS = ['tone', 'attack', 'release', 'length', 'vibrato'] as const
export type MacroId = typeof MACROS[number]
export type Macros = Partial<Record<MacroId, number>>

/** exp: value × factor^m.  lin: value + m × fraction of the param's range. */
type MacroTarget = [param: string, kind: 'exp' | 'lin', amount: number]

export const MACRO_MAP: Record<string, Partial<Record<MacroId, MacroTarget[]>>> = {
  va: { tone: [['cutoff', 'exp', 4]], attack: [['attack', 'exp', 8], ['fAttack', 'exp', 8]], release: [['release', 'exp', 4], ['fRelease', 'exp', 4]], length: [['decay', 'exp', 4], ['fDecay', 'exp', 4]] },
  // FM 'brightness' is velocity sensitivity (higher = darker at normal velocities), so Tone lowers it
  // and lifts the modulators' sustain and feedback.
  fm: { tone: [['brightness', 'exp', 0.3], ['mSustain', 'lin', 0.35], ['feedback', 'lin', 0.15]], attack: [['attack', 'exp', 8], ['mAttack', 'exp', 8]], release: [['release', 'exp', 4], ['mRelease', 'exp', 4]], length: [['decay', 'exp', 4], ['mDecay', 'exp', 4]] },
  additive: { tone: [['rolloff', 'lin', 0.35]], attack: [['attack', 'exp', 8]], release: [['release', 'exp', 4]], length: [['decay', 'exp', 4]] },
  wavetable: { tone: [['cutoff', 'exp', 4]], attack: [['attack', 'exp', 8]], release: [['release', 'exp', 4]], length: [['decay', 'exp', 4]] },
  pluck: { tone: [['damp', 'lin', -0.4], ['pickPos', 'lin', -0.12]], length: [['decay', 'exp', 4]] },
  string: { tone: [['damp', 'lin', -0.35]], attack: [['attackBite', 'lin', -0.5]], length: [['sustain', 'lin', 0.45]], vibrato: [['vibDepth', 'lin', 0.6]] },
  tube: { tone: [['breath', 'lin', 0.3], ['noise', 'lin', 0.2]] },
  modal: { tone: [['brightness', 'lin', 0.4], ['strikeHardness', 'lin', 0.4]], length: [['decay', 'exp', 4]] },
  westcoast: { tone: [['foldAmount', 'exp', 3]], length: [['lpgDecay', 'exp', 4]] },
  formant: { tone: [['breath', 'lin', 0.3]], vibrato: [['vibratoDepth', 'lin', 0.6]] },
  harmonic: { tone: [['brightness', 'lin', 0.4]], attack: [['attack', 'exp', 8]], release: [['release', 'exp', 4]] },
}

/** The dials that do something on an engine. */
export const macrosForEngine = (engine: string): MacroId[] => MACROS.filter((m) => (MACRO_MAP[engine]?.[m]?.length ?? 0) > 0)

/** Engine of a preset id ('' when unknown). */
export const presetEngine = (presetId: string): string => PRESETS.find((p) => p.id === presetId)?.engineId ?? ''

/**
 * The params to push for a preset's macros: only those that differ from the preset (an all-zero
 * dial set is empty, so the preset plays untouched). `base` gives the preset's value for a param.
 */
export function presetMacroParams(engine: string, base: (name: string) => number | undefined, macros: Macros): Record<string, number> {
  const out: Record<string, number> = {}
  const map = MACRO_MAP[engine]
  if (!map) return out
  for (const m of MACROS) {
    const amt = macros[m] ?? 0
    if (!Number.isFinite(amt) || Math.abs(amt) < 1e-3) continue
    for (const [param, kind, k] of map[m] ?? []) {
      const spec = (PARAM_SPECS[engine] ?? []).find((p) => p.name === param)
      const b = out[param] ?? base(param) ?? spec?.default
      if (b === undefined) continue
      let v = kind === 'exp' ? b * Math.pow(k, amt) : b + amt * k * (spec ? spec.max - spec.min : 1)
      if (spec) v = Math.max(spec.min, Math.min(spec.max, v))
      out[param] = v
    }
  }
  return out
}

/** Preset dial controls, shown in preset mode. */
export function buildMacroControls(when: Record<string, unknown> = { preset: { ne: '' } }): ControlDefinition[] {
  return [
    { id: 'm_tone', type: 'slider', label: 'Tone (darker ↔ brighter)', default: 0, when, props: { min: -1, max: 1, step: 0.01 }, description: 'Shades the preset: 0 is the instrument as voiced.' },
    { id: 'm_attack', type: 'slider', label: 'Attack (snappier ↔ softer)', default: 0, when, props: { min: -1, max: 1, step: 0.01 } },
    { id: 'm_release', type: 'slider', label: 'Release (shorter ↔ longer)', default: 0, when, props: { min: -1, max: 1, step: 0.01 } },
    { id: 'm_length', type: 'slider', label: 'Length (shorter ↔ longer ring)', default: 0, when, props: { min: -1, max: 1, step: 0.01 } },
    { id: 'm_vibrato', type: 'slider', label: 'Vibrato', default: 0, when, props: { min: 0, max: 1, step: 0.01 }, description: 'Bowed strings and voices.' },
  ]
}

/** Read the macro controls (m_tone…) from a control map. */
export function readMacros(controls: Map<string, unknown>): Macros {
  const out: Macros = {}
  for (const m of MACROS) {
    const v = controls.get(`m_${m}`)
    if (typeof v === 'number' && Number.isFinite(v) && v !== 0) out[m] = v
  }
  return out
}

// ── Pure config resolution (unit-tested; no kernel) ──────────────────────────
export interface VoiceConfig {
  /** '' = manual engine+params; otherwise a preset id (params fetched at runtime). */
  preset: string
  engine: string
  /** Manual-mode engine params (name → value), incl. any parsed raw-params overrides. */
  params: Record<string, number>
  /** Insert fx id, or null for none. */
  insertFx: string | null
  /** Insert fx param overrides (name → value), applied on top of the effect's defaults. */
  fxParams: Record<string, number>
  /** Preset dials (preset mode only); absent or empty = the preset as voiced. */
  macros?: Macros
  /** Shared reverb send level 0..1. Nodes pass 0: the bus returns into master, past the wire. */
  send: number
  gain: number
  pan: number
}

const numOf = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

/**
 * Parse the raw-params escape hatch: a JSON object OR `k=v, k2=v2` pairs → numeric map.
 * Silently drops non-numeric / malformed entries (never throws — a bad escape must not
 * kill the frame). Reaches array-expanded params like `ratio1`, `partial5`, `fixed2`.
 */
export function parseRawParams(raw: unknown): Record<string, number> {
  if (raw == null) return {}
  const out: Record<string, number> = {}
  const take = (k: string, v: unknown): void => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
    if (k && Number.isFinite(n)) out[k] = n
  }
  if (typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) take(k, v)
    return out
  }
  if (typeof raw !== 'string') return {}
  const s = raw.trim()
  if (!s) return {}
  if (s.startsWith('{')) {
    try {
      const obj = JSON.parse(s) as Record<string, unknown>
      if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) take(k, v)
      return out
    } catch {
      return {}
    }
  }
  // `cutoff=800, ratio1=2` form
  for (const pair of s.split(/[,\n;]+/)) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    take(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
  return out
}

/**
 * Resolve the imperative kernel target from a node's control map — PURE. Handles manual mode
 * fully (engine + its params + insert fx + raw overrides); in preset mode the params/fx are
 * owned by the preset and fetched by the manager at runtime, so only preset id + send/gain/pan
 * are resolved here. `send`/`gain`/`pan` always apply (user trim on top of a preset).
 *
 * Params are read regardless of the `advanced` toggle — hiding a control never changes sound.
 */
export function resolveVoiceConfig(controls: Map<string, unknown>): VoiceConfig {
  const presetRaw = String(controls.get('preset') ?? '')
  const preset = isPreset(presetRaw) ? presetRaw : ''
  const engine = ENGINES.includes(String(controls.get('engine'))) ? String(controls.get('engine')) : 'va'

  const params: Record<string, number> = {}
  let insertFx: string | null = null
  let fxParams: Record<string, number> = {}
  if (!preset) {
    for (const spec of PARAM_SPECS[engine] ?? []) {
      params[spec.name] = numOf(controls.get(paramControlId(engine, spec.name)), spec.default)
    }
    // Raw escape overrides / extends the macro params (array-expanded params live only here).
    Object.assign(params, parseRawParams(controls.get('params')))
    const fx = String(controls.get('insertFx') ?? '')
    insertFx = INSERT_FX_IDS.has(fx) ? fx : null
    if (insertFx) fxParams = parseRawParams(controls.get('fxParams'))
  }

  return {
    preset,
    engine,
    params,
    insertFx,
    fxParams,
    macros: preset ? readMacros(controls) : undefined,
    send: Math.max(0, Math.min(1, numOf(controls.get('sendLevel'), 0))),
    gain: Math.max(0, numOf(controls.get('gain'), 0.8)),
    pan: Math.max(-1, Math.min(1, numOf(controls.get('pan'), 0))),
  }
}

/**
 * Which params changed between two value maps → `[name, value]` list to push via
 * `inst.param`. PURE, so the per-frame no-op-when-unchanged discipline is testable.
 */
export function computeParamUpdates(
  prev: Record<string, number> | null,
  next: Record<string, number>,
): [string, number][] {
  const updates: [string, number][] = []
  for (const [name, value] of Object.entries(next)) {
    if (!prev || prev[name] !== value) updates.push([name, value])
  }
  return updates
}

/**
 * Params present in `prev` but gone from `next` — e.g. a raw `ratio2=3` the user deleted. The
 * kernel keeps the last value it was sent, so the manager must push these back to the engine
 * default or the deleted override keeps sounding. PURE.
 */
export function computeParamRemovals(
  prev: Record<string, number> | null,
  next: Record<string, number>,
): string[] {
  if (!prev) return []
  return Object.keys(prev).filter((name) => !(name in next))
}

/** Two fx-param maps equal by value (order-insensitive). PURE. */
export function sameParams(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => b[k] === a[k])
}
