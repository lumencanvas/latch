/**
 * bellows effects surface for the bellows-fx node family: DATA + PURE HELPERS (no bellows import,
 * so node definitions build synchronously at registry time while bellowsjs stays a lazy chunk).
 *
 * EFFECT_SPECS is generated from bellowsjs `listEffects()` (the generated catalog) and is
 * drift-guarded by tests/unit/registry/audio/bellows-fx.test.ts against the installed package,
 * like engineParams.ts is for engines.
 *
 * Every node in the family is one direct-input channel on the shared kernel (b.inputChannel)
 * with one insert effect: upstream LATCH audio plays through it into the node's Audio output
 * (silent while the output is unwired).
 */

import type { ControlDefinition, PortDefinition } from '@/stores/nodes'

export interface FxParamSpec {
  name: string
  min: number
  max: number
  default: number
  unit?: string
  curve?: 'exp' | 'db'
}

export const EFFECT_SPECS: Record<string, FxParamSpec[]> = {
  delay: [
    { name: 'timeL', min: 0.001, max: 4, default: 0.35, unit: 's', curve: 'exp' },
    { name: 'timeR', min: 0.001, max: 4, default: 0.5, unit: 's', curve: 'exp' },
    { name: 'feedback', min: 0, max: 0.99, default: 0.4 },
    { name: 'crossFeedback', min: 0, max: 1, default: 0 },
    { name: 'damping', min: 200, max: 20000, default: 8000, unit: 'Hz', curve: 'exp' },
    { name: 'mix', min: 0, max: 1, default: 0.35 },
  ],
  tapeDelay: [
    { name: 'time', min: 0.005, max: 2, default: 0.35, unit: 's', curve: 'exp' },
    { name: 'feedback', min: 0, max: 1.1, default: 0.45 },
    { name: 'wow', min: 0, max: 1, default: 0.3 },
    { name: 'flutter', min: 0, max: 1, default: 0.15 },
    { name: 'saturation', min: 0, max: 1, default: 0.4 },
    { name: 'tone', min: 500, max: 15000, default: 4500, unit: 'Hz', curve: 'exp' },
    { name: 'hiss', min: 0, max: 1, default: 0 },
    { name: 'mix', min: 0, max: 1, default: 0.35 },
  ],
  multitap: [
    { name: 'time1', min: 0.001, max: 2, default: 0.125, unit: 's', curve: 'exp' },
    { name: 'time2', min: 0.001, max: 2, default: 0.25, unit: 's', curve: 'exp' },
    { name: 'time3', min: 0.001, max: 2, default: 0.375, unit: 's', curve: 'exp' },
    { name: 'time4', min: 0.001, max: 2, default: 0.5, unit: 's', curve: 'exp' },
    { name: 'level1', min: 0, max: 1, default: 1 },
    { name: 'level2', min: 0, max: 1, default: 0.8 },
    { name: 'level3', min: 0, max: 1, default: 0.6 },
    { name: 'level4', min: 0, max: 1, default: 0.45 },
    { name: 'diffusion', min: 0, max: 1, default: 0.4 },
    { name: 'mix', min: 0, max: 1, default: 0.5 },
  ],
  fdn: [
    { name: 'size', min: 0.25, max: 3, default: 1 },
    { name: 'decay', min: 0.1, max: 20, default: 2, unit: 's', curve: 'exp' },
    { name: 'damp', min: 500, max: 20000, default: 6000, unit: 'Hz', curve: 'exp' },
    { name: 'chorus', min: 0, max: 1, default: 0.3 },
    { name: 'predelay', min: 0, max: 0.25, default: 0.01, unit: 's' },
    { name: 'mix', min: 0, max: 1, default: 0.35 },
  ],
  plate: [
    { name: 'decay', min: 0, max: 0.98, default: 0.5 },
    { name: 'damping', min: 0, max: 0.99, default: 0.3 },
    { name: 'bandwidth', min: 0, max: 1, default: 0.9995 },
    { name: 'predelay', min: 0, max: 0.25, default: 0, unit: 's' },
    { name: 'modDepth', min: 0, max: 2, default: 1 },
    { name: 'mix', min: 0, max: 1, default: 0.35 },
  ],
  compressor: [
    { name: 'threshold', min: -60, max: 0, default: -18, unit: 'dB', curve: 'db' },
    { name: 'ratio', min: 1, max: 20, default: 4 },
    { name: 'knee', min: 0, max: 24, default: 6, unit: 'dB' },
    { name: 'attack', min: 0.0001, max: 0.5, default: 0.01, unit: 's', curve: 'exp' },
    { name: 'release', min: 0.01, max: 2, default: 0.2, unit: 's', curve: 'exp' },
    { name: 'makeup', min: -1, max: 24, default: 0, unit: 'dB' },
    { name: 'lookahead', min: 0, max: 0.01, default: 0, unit: 's' },
    { name: 'mix', min: 0, max: 1, default: 1 },
  ],
  limiter: [
    { name: 'ceiling', min: -24, max: 0, default: -0.3, unit: 'dB' },
    { name: 'release', min: 0.001, max: 1, default: 0.05, unit: 's', curve: 'exp' },
    { name: 'truePeak', min: 0, max: 1, default: 0 },
  ],
  gate: [
    { name: 'threshold', min: -80, max: 0, default: -40, unit: 'dB', curve: 'db' },
    { name: 'attack', min: 0.0001, max: 0.1, default: 0.001, unit: 's', curve: 'exp' },
    { name: 'hold', min: 0, max: 1, default: 0.05, unit: 's' },
    { name: 'release', min: 0.001, max: 2, default: 0.1, unit: 's', curve: 'exp' },
    { name: 'range', min: -80, max: 0, default: -60, unit: 'dB' },
  ],
  transient: [
    { name: 'attack', min: -1, max: 1, default: 0 },
    { name: 'sustain', min: -1, max: 1, default: 0 },
  ],
  chorus: [
    { name: 'rate', min: 0.01, max: 10, default: 0.5, unit: 'Hz', curve: 'exp' },
    { name: 'depth', min: 0, max: 1, default: 0.5 },
    { name: 'mix', min: 0, max: 1, default: 0.5 },
    { name: 'feedback', min: 0, max: 0.5, default: 0 },
  ],
  flanger: [
    { name: 'rate', min: 0.01, max: 10, default: 0.25, unit: 'Hz', curve: 'exp' },
    { name: 'depth', min: 0, max: 1, default: 0.7 },
    { name: 'manual', min: 0, max: 1, default: 0.25 },
    { name: 'feedback', min: 0, max: 0.9, default: 0.4 },
    { name: 'mix', min: 0, max: 1, default: 0.5 },
    { name: 'invert', min: 0, max: 1, default: 0 },
  ],
  phaser: [
    { name: 'rate', min: 0.01, max: 10, default: 0.3, unit: 'Hz', curve: 'exp' },
    { name: 'freqlo', min: 40, max: 2000, default: 300, unit: 'Hz', curve: 'exp' },
    { name: 'freqhi', min: 200, max: 12000, default: 3000, unit: 'Hz', curve: 'exp' },
    { name: 'feedback', min: 0, max: 0.9, default: 0.3 },
    { name: 'stages', min: 4, max: 8, default: 6 },
    { name: 'spread', min: 0, max: 1, default: 0.25 },
    { name: 'mix', min: 0, max: 1, default: 0.5 },
  ],
  tremolo: [
    { name: 'rate', min: 0.05, max: 40, default: 4, unit: 'Hz', curve: 'exp' },
    { name: 'depth', min: 0, max: 1, default: 0.8 },
    { name: 'shape', min: 0, max: 4, default: 0 },
    { name: 'phase', min: 0, max: 1, default: 0 },
  ],
  autopan: [
    { name: 'rate', min: 0.05, max: 20, default: 1, unit: 'Hz', curve: 'exp' },
    { name: 'depth', min: 0, max: 1, default: 1 },
    { name: 'shape', min: 0, max: 4, default: 0 },
  ],
  ringmod: [
    { name: 'freq', min: 1, max: 8000, default: 440, unit: 'Hz', curve: 'exp' },
    { name: 'mix', min: 0, max: 1, default: 1 },
  ],
  freqshift: [
    { name: 'shift', min: -2000, max: 2000, default: 0, unit: 'Hz' },
    { name: 'mix', min: 0, max: 1, default: 1 },
  ],
  eq: [
    { name: 'b0freq', min: 20, max: 20000, default: 80, unit: 'Hz', curve: 'exp' },
    { name: 'b0gain', min: -24, max: 24, default: 0, unit: 'dB' },
    { name: 'b0q', min: 0.1, max: 12, default: 0.707 },
    { name: 'b0enabled', min: 0, max: 1, default: 1 },
    { name: 'b1freq', min: 20, max: 20000, default: 250, unit: 'Hz', curve: 'exp' },
    { name: 'b1gain', min: -24, max: 24, default: 0, unit: 'dB' },
    { name: 'b1q', min: 0.1, max: 12, default: 1 },
    { name: 'b1enabled', min: 0, max: 1, default: 1 },
    { name: 'b2freq', min: 20, max: 20000, default: 800, unit: 'Hz', curve: 'exp' },
    { name: 'b2gain', min: -24, max: 24, default: 0, unit: 'dB' },
    { name: 'b2q', min: 0.1, max: 12, default: 1 },
    { name: 'b2enabled', min: 0, max: 1, default: 1 },
    { name: 'b3freq', min: 20, max: 20000, default: 2500, unit: 'Hz', curve: 'exp' },
    { name: 'b3gain', min: -24, max: 24, default: 0, unit: 'dB' },
    { name: 'b3q', min: 0.1, max: 12, default: 1 },
    { name: 'b3enabled', min: 0, max: 1, default: 1 },
    { name: 'b4freq', min: 20, max: 20000, default: 6000, unit: 'Hz', curve: 'exp' },
    { name: 'b4gain', min: -24, max: 24, default: 0, unit: 'dB' },
    { name: 'b4q', min: 0.1, max: 12, default: 1 },
    { name: 'b4enabled', min: 0, max: 1, default: 1 },
    { name: 'b5freq', min: 20, max: 20000, default: 12000, unit: 'Hz', curve: 'exp' },
    { name: 'b5gain', min: -24, max: 24, default: 0, unit: 'dB' },
    { name: 'b5q', min: 0.1, max: 12, default: 0.707 },
    { name: 'b5enabled', min: 0, max: 1, default: 1 },
  ],
  saturator: [
    { name: 'drive', min: 0.1, max: 20, default: 2, curve: 'exp' },
    { name: 'curve', min: 0, max: 3, default: 0 },
    { name: 'tone', min: -1, max: 1, default: 0 },
    { name: 'output', min: -24, max: 24, default: 0, unit: 'dB' },
    { name: 'mix', min: 0, max: 1, default: 1 },
  ],
  pitchshift: [
    { name: 'semitones', min: -24, max: 24, default: 0, unit: 'st' },
    { name: 'mix', min: 0, max: 1, default: 1 },
  ],
  freeze: [
    { name: 'freeze', min: 0, max: 1, default: 0 },
    { name: 'mix', min: 0, max: 1, default: 1 },
  ],
  blur: [
    { name: 'amount', min: 0, max: 1, default: 0.5 },
    { name: 'mix', min: 0, max: 1, default: 1 },
    { name: 'seed', min: 0, max: 1000000000, default: 1 },
  ],
  robot: [
    { name: 'mix', min: 0, max: 1, default: 1 },
  ],
  whisper: [
    { name: 'mix', min: 0, max: 1, default: 1 },
    { name: 'seed', min: 0, max: 1000000000, default: 1 },
  ],
  denoise: [
    { name: 'amount', min: 0, max: 4, default: 1 },
    { name: 'mix', min: 0, max: 1, default: 1 },
  ],
  filter: [
    { name: 'type', min: 0, max: 9, default: 0 },
    { name: 'cutoff', min: 20, max: 20000, default: 1000, unit: 'Hz', curve: 'exp' },
    { name: 'resonance', min: 0, max: 1, default: 0.1 },
    { name: 'gain', min: -24, max: 24, default: 0, unit: 'dB' },
    { name: 'slope', min: 0, max: 1, default: 0 },
    { name: 'drive', min: 1, max: 10, default: 1, curve: 'exp' },
    { name: 'mix', min: 0, max: 1, default: 1 },
  ],
}

export const EFFECT_LABELS: Record<string, string> = {
  delay: 'Stereo Delay', tapeDelay: 'Tape Delay', multitap: 'Multitap Delay',
  fdn: 'Hall (FDN Reverb)', plate: 'Plate Reverb',
  compressor: 'Compressor', limiter: 'Limiter', gate: 'Noise Gate', transient: 'Transient Shaper',
  chorus: 'Chorus', flanger: 'Flanger', phaser: 'Phaser', tremolo: 'Tremolo', autopan: 'Auto-Pan',
  ringmod: 'Ring Modulator', freqshift: 'Frequency Shifter',
  eq: 'Parametric EQ', saturator: 'Saturator',
  pitchshift: 'Pitch Shift', freeze: 'Spectral Freeze', blur: 'Spectral Blur', robot: 'Robotize',
  whisper: 'Whisper', denoise: 'Spectral Denoise',
  filter: 'Filter',
}

/** Indexed params that name a mode: rendered as a labelled select. */
const ENUM_OPTIONS: Record<string, string[]> = {
  'filter.type': ['Low-Pass', 'High-Pass', 'Band-Pass', 'Notch', 'Peak', 'All-Pass', 'Bell', 'Low Shelf', 'High Shelf', 'Ladder Low-Pass (Moog-style)'],
  'filter.slope': ['12 dB / octave', '24 dB / octave'],
  'saturator.curve': ['Tanh (warm)', 'Soft Clip', 'Wavefolder', 'Chebyshev (harmonics)'],
  'tremolo.shape': ['Sine', 'Triangle', 'Square', 'Saw Up', 'Saw Down'],
  'autopan.shape': ['Sine', 'Triangle', 'Square', 'Saw Up', 'Saw Down'],
}

/** On/off params: rendered as a toggle (stored 0/1). */
const TOGGLES = new Set(['flanger.invert', 'limiter.truePeak', 'freeze.freeze',
  'eq.b0enabled', 'eq.b1enabled', 'eq.b2enabled', 'eq.b3enabled', 'eq.b4enabled', 'eq.b5enabled'])

/** Integer params that are counts, not modes. */
const INTS = new Set(['phaser.stages'])

const PARAM_LABELS: Record<string, string> = {
  mix: 'Mix (dry → wet)', feedback: 'Feedback', crossFeedback: 'Cross Feedback', damping: 'Damping',
  timeL: 'Time Left', timeR: 'Time Right', time: 'Time', wow: 'Wow', flutter: 'Flutter',
  saturation: 'Saturation', tone: 'Tone', hiss: 'Hiss', diffusion: 'Diffusion',
  size: 'Size', decay: 'Decay', damp: 'Damping', chorus: 'Modulation', predelay: 'Pre-Delay',
  bandwidth: 'Bandwidth', modDepth: 'Modulation Depth',
  threshold: 'Threshold', ratio: 'Ratio', knee: 'Knee', attack: 'Attack', release: 'Release',
  makeup: 'Makeup Gain', lookahead: 'Lookahead', ceiling: 'Ceiling', truePeak: 'True Peak',
  hold: 'Hold', range: 'Range', sustain: 'Sustain',
  rate: 'Rate', depth: 'Depth', manual: 'Manual', invert: 'Invert', freqlo: 'Sweep Low',
  freqhi: 'Sweep High', stages: 'Stages', spread: 'Stereo Spread', shape: 'Shape', phase: 'Phase',
  freq: 'Frequency', shift: 'Shift', drive: 'Drive', curve: 'Curve', output: 'Output',
  semitones: 'Semitones', freeze: 'Freeze', amount: 'Amount', seed: 'Seed',
  type: 'Type', cutoff: 'Cutoff', resonance: 'Resonance', gain: 'Gain', slope: 'Slope',
}

const UNIT_LABELS: Record<string, string> = { s: 's', Hz: 'Hz', dB: 'dB', ms: 'ms', cents: 'cents' }

function eqLabel(name: string): string | null {
  const m = /^b(\d)(freq|gain|q|enabled)$/.exec(name)
  if (!m) return null
  const band = ['Low Shelf', 'Bell 1', 'Bell 2', 'Bell 3', 'Bell 4', 'High Shelf'][Number(m[1])]
  const what = { freq: 'Freq', gain: 'Gain', q: 'Q', enabled: 'On' }[m[2] as 'freq']
  return `${band} ${what}`
}

export function fxParamLabel(effect: string, spec: FxParamSpec): string {
  const base = (effect === 'eq' ? eqLabel(spec.name) : null) ?? PARAM_LABELS[spec.name] ?? spec.name
  const key = `${effect}.${spec.name}`
  const unit = spec.unit && !ENUM_OPTIONS[key] && !TOGGLES.has(key) ? UNIT_LABELS[spec.unit] ?? spec.unit : ''
  return unit ? `${base} (${unit})` : base
}

/** True for params whose value is an index / flag (set, never glided). */
export function isSteppedFxParam(effect: string, name: string): boolean {
  const key = `${effect}.${name}`
  return !!ENUM_OPTIONS[key] || TOGGLES.has(key) || INTS.has(key) || name === 'seed'
}

export const fxControlId = (effect: string, param: string): string => `fx_${effect}_${param}`

function fxStep(spec: FxParamSpec): number {
  const span = spec.max - spec.min
  if (!(span > 0)) return 0.01
  const target = span / (spec.curve === 'exp' ? 10000 : 1000)
  return Math.min(1, 10 ** Math.floor(Math.log10(target)))
}

/** One control per param of each effect, shown only while that effect is selected. */
export function buildFxControls(effects: readonly string[]): ControlDefinition[] {
  const controls: ControlDefinition[] = []
  if (effects.length > 1) {
    controls.push({
      id: 'effect', type: 'select', label: 'Effect', default: effects[0],
      props: { options: effects.map((e) => ({ value: e, label: EFFECT_LABELS[e] ?? e })) },
    })
  }
  for (const effect of effects) {
    const when = effects.length > 1 ? { effect } : undefined
    for (const spec of EFFECT_SPECS[effect] ?? []) {
      const key = `${effect}.${spec.name}`
      const base = { id: fxControlId(effect, spec.name), label: fxParamLabel(effect, spec), ...(when ? { when } : {}) }
      const opts = ENUM_OPTIONS[key]
      if (opts) {
        controls.push({ ...base, type: 'select', default: spec.default,
          props: { options: opts.map((label, value) => ({ value, label })) } })
      } else if (TOGGLES.has(key)) {
        controls.push({ ...base, type: 'toggle', default: spec.default >= 0.5 })
      } else {
        controls.push({ ...base, type: 'number', default: spec.default,
          props: { min: spec.min, max: spec.max, step: INTS.has(key) || spec.name === 'seed' ? 1 : fxStep(spec) } })
      }
    }
  }
  return controls
}

export interface FxConfig {
  effect: string
  params: Record<string, number>
  /** Channel level (0..2) after the effect. */
  level: number
}

const numOf = (v: unknown): number | undefined => {
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/**
 * PURE: the node's inputs + controls → the effect and its clamped params. A wired input with
 * the same id as a param control (e.g. `fx_filter_cutoff`) wins over the control.
 */
export function resolveFxConfig(
  effects: readonly string[],
  read: (id: string) => unknown,
): FxConfig {
  const pick = read('effect')
  const effect = typeof pick === 'string' && effects.includes(pick) ? pick : effects[0]
  const params: Record<string, number> = {}
  for (const spec of EFFECT_SPECS[effect] ?? []) {
    const v = numOf(read(fxControlId(effect, spec.name)))
    const x = v === undefined ? spec.default : Math.min(spec.max, Math.max(spec.min, v))
    params[spec.name] = isSteppedFxParam(effect, spec.name) ? Math.round(x) : x
  }
  const lv = numOf(read('level'))
  return { effect, params, level: lv === undefined ? 1 : Math.min(2, Math.max(0, lv)) }
}

/** Input ports that modulate a param: same id as its control, so wiring overrides the knob. */
export function fxModInputs(effect: string, params: readonly string[]): PortDefinition[] {
  return params.map((name) => {
    const spec = EFFECT_SPECS[effect]?.find((p) => p.name === name)
    return {
      id: fxControlId(effect, name),
      type: TOGGLES.has(`${effect}.${name}`) ? 'boolean' : 'number',
      label: spec ? fxParamLabel(effect, spec) : name,
    } as PortDefinition
  })
}
