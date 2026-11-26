/**
 * The Bellows Workstation's composer: one seed becomes a whole piece — a song form with sections,
 * a Markov chord progression per section, Markov melodies built from motifs that repeat and answer,
 * Euclidean drums and bass, voice-led chords and arpeggios. Pure and deterministic: the same seed,
 * style and cycle give the same notes, so a piece can be shared as its seed.
 *
 * Playback (bellows instruments, the clock, arrangement by energy) lives in workstationManager.ts.
 */

// ── Seeded randomness ──────────────────────────────────────────────────────

export interface Rng {
  (): number
  int(n: number): number
  pick<T>(arr: readonly T[]): T
  chance(p: number): boolean
  range(lo: number, hi: number): number
  weighted(weights: Record<number, number>): number
}

function hash(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

/** A named stream: the same seed and label always give the same numbers (mulberry32). */
export function rngFor(seed: string, label: string): Rng {
  let a = hash(`${seed}/${label}`)
  const next = (() => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }) as Rng
  next.int = (n) => Math.floor(next() * n)
  next.pick = (arr) => arr[Math.floor(next() * arr.length)]
  next.chance = (p) => next() < p
  next.range = (lo, hi) => lo + next() * (hi - lo)
  next.weighted = (w) => {
    const entries = Object.entries(w).filter(([, v]) => v > 0)
    let r = next() * entries.reduce((s, [, v]) => s + v, 0)
    for (const [k, v] of entries) if ((r -= v) < 0) return Number(k)
    return Number(entries[entries.length - 1][0])
  }
  return next
}

// ── Euclidean rhythm and Markov chains ─────────────────────────────────────

/** Bjorklund's even spread of `pulses` over `steps`, rotated: euclid(3, 8) = [1,0,0,1,0,0,1,0]. */
export function euclid(pulses: number, steps: number, rotation = 0): number[] {
  const p = Math.max(0, Math.min(steps, Math.round(pulses)))
  const out = Array.from({ length: steps }, (_, i) => (Math.floor((i * p) / steps) !== Math.floor(((i - 1) * p) / steps) || (i === 0 && p > 0) ? 1 : 0))
  // The bucket form above starts every pattern on a pulse; rotate to place it.
  const r = ((rotation % steps) + steps) % steps
  return out.slice(steps - r).concat(out.slice(0, steps - r))
}

/** A Markov chain of order n over numbers, trained on sequences. */
export class Markov {
  private table = new Map<string, Map<number, number>>()
  constructor(readonly order: number) {}
  train(seq: readonly number[], weight = 1): this {
    for (let i = this.order; i < seq.length; i++) {
      const key = seq.slice(i - this.order, i).join(',')
      const row = this.table.get(key) ?? new Map<number, number>()
      row.set(seq[i], (row.get(seq[i]) ?? 0) + weight)
      this.table.set(key, row)
    }
    return this
  }
  /** Next value after `context`, or null when the chain never saw it. */
  next(context: readonly number[], rng: Rng): number | null {
    const row = this.table.get(context.slice(-this.order).join(','))
    if (!row) return null
    return rng.weighted(Object.fromEntries(row))
  }
}

// ── Theory ─────────────────────────────────────────────────────────────────

export const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
}

export const KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

/** MIDI note of scale degree `d` (any integer; 7 = the octave) from a tonic MIDI note. */
export function degreeToMidi(scale: readonly number[], tonic: number, d: number): number {
  const oct = Math.floor(d / 7)
  return tonic + oct * 12 + scale[((d % 7) + 7) % 7]
}

/** Functional-harmony transitions between chord degrees (0 = I … 6 = vii/VII). */
const HARMONY: Record<number, Record<number, number>> = {
  0: { 3: 3, 4: 3, 5: 2.5, 1: 1, 2: 0.5 },
  1: { 4: 4, 3: 1, 6: 0.5 },
  2: { 5: 3, 3: 2 },
  3: { 4: 3, 0: 2, 1: 2, 5: 1 },
  4: { 0: 5, 5: 2, 3: 1 },
  5: { 3: 3, 1: 2, 4: 2, 2: 1 },
  6: { 0: 3, 2: 1 },
}
/** Minor-flavoured modes lean on the flat VII and VI. */
const MINOR_LIFT: Record<number, Record<number, number>> = { 0: { 6: 2, 5: 1 }, 5: { 6: 2 }, 3: { 6: 1.5 }, 6: { 0: 2, 5: 1 } }

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

/**
 * Melodic contour corpus (scale-degree steps) the melody chain learns from: scale runs, turns,
 * neighbour tones, leaps that recover by step, arpeggio shapes. Steps, not pitches, so it fits
 * every key and mode.
 */
const CONTOURS: number[][] = [
  [1, 1, 1, -1, -1, -1, 0, 1],
  [2, -1, 2, -1, -1, -1, 1, 0],
  [-1, -1, 2, 1, 1, -2, -1, 0],
  [4, -1, -1, -1, 1, -2, 0, -1],
  [0, 1, -1, 0, 2, 2, -1, -1],
  [1, -1, 1, 1, 1, -3, 1, 0],
  [-2, 1, 1, 2, -1, -1, -1, 1],
  [2, 2, -1, -2, 1, -1, -1, 0],
  [0, 0, 1, 1, -2, 0, -1, 1],
  [-1, 2, -1, -1, 3, -1, -1, -1],
]
const melodyChain = new Markov(2)
for (const c of CONTOURS) melodyChain.train([0, 0, ...c, ...c])

// ── Styles ─────────────────────────────────────────────────────────────────

export type Part = 'kick' | 'snare' | 'hat' | 'clap' | 'bass' | 'chords' | 'lead' | 'arp'
export const PARTS: Part[] = ['kick', 'snare', 'hat', 'clap', 'bass', 'chords', 'lead', 'arp']

export interface Style {
  id: string
  name: string
  bpm: [number, number]
  swing: number
  scales: string[]
  sevenths: boolean
  /** bellows instrument presets (or engine ids for drums). */
  sound: Record<Part, string>
  bass: 'pulse' | 'euclid' | 'sustain' | 'octaves'
  chords: 'pad' | 'stabs' | 'strum'
  drums: 'four' | 'boom' | 'break' | 'soft' | 'none'
  /** Lead notes per bar (Euclidean pulses), low and high. */
  leadPulses: [number, number]
  /** Energy each part needs before it plays (arrangement). */
  enter: Record<Part, number>
}

const ENTER_DEFAULT: Record<Part, number> = { kick: 0.4, snare: 0.55, hat: 0.3, clap: 0.7, bass: 0.35, chords: 0, lead: 0.5, arp: 0.75 }

export const STYLES: Style[] = [
  {
    id: 'lofi', name: 'Lo-fi', bpm: [72, 86], swing: 0.22, scales: ['dorian', 'minor', 'major'], sevenths: true,
    sound: { kick: 'kick', snare: 'snare', hat: 'hat', clap: 'clap', bass: 'bass-guitar', chords: 'dx-epiano', lead: 'vibraphone', arp: 'kalimba' },
    bass: 'euclid', chords: 'pad', drums: 'boom', leadPulses: [3, 6], enter: { ...ENTER_DEFAULT },
  },
  {
    id: 'house', name: 'House', bpm: [120, 126], swing: 0.08, scales: ['minor', 'dorian', 'mixolydian'], sevenths: true,
    sound: { kick: 'kick', snare: 'snare', hat: 'hat', clap: 'clap', bass: 'sub-bass', chords: 'drawbar-organ', lead: 'fm-bell-lead', arp: 'west-coast-pluck' },
    bass: 'euclid', chords: 'stabs', drums: 'four', leadPulses: [3, 7], enter: { ...ENTER_DEFAULT, clap: 0.5, snare: 0.95 },
  },
  {
    id: 'synthwave', name: 'Synthwave', bpm: [96, 112], swing: 0, scales: ['minor', 'dorian'], sevenths: false,
    sound: { kick: 'kick', snare: 'snare', hat: 'hat', clap: 'clap', bass: 'acid-bass', chords: 'fat-saw-pad', lead: 'analog-lead', arp: 'west-coast-pluck' },
    bass: 'octaves', chords: 'pad', drums: 'boom', leadPulses: [4, 7], enter: { ...ENTER_DEFAULT },
  },
  {
    id: 'ambient', name: 'Ambient', bpm: [64, 78], swing: 0, scales: ['lydian', 'major', 'dorian'], sevenths: true,
    sound: { kick: 'kick', snare: 'snare', hat: 'hat', clap: 'clap', bass: 'sub-bass', chords: 'motion-pad', lead: 'celesta', arp: 'music-box' },
    bass: 'sustain', chords: 'pad', drums: 'soft', leadPulses: [2, 4], enter: { ...ENTER_DEFAULT, kick: 0.9, snare: 2, clap: 2, arp: 0.45 },
  },
  {
    id: 'folk', name: 'Folk', bpm: [88, 108], swing: 0.12, scales: ['major', 'mixolydian', 'dorian'], sevenths: false,
    sound: { kick: 'kick', snare: 'snare', hat: 'hat', clap: 'clap', bass: 'bass-guitar', chords: 'nylon-guitar', lead: 'concert-flute', arp: 'harp' },
    bass: 'pulse', chords: 'strum', drums: 'soft', leadPulses: [4, 7], enter: { ...ENTER_DEFAULT, kick: 0.6, snare: 2, clap: 2 },
  },
  {
    id: 'techno', name: 'Techno', bpm: [126, 134], swing: 0, scales: ['minor', 'phrygian'], sevenths: false,
    sound: { kick: 'kick', snare: 'snare', hat: 'hat', clap: 'clap', bass: 'sub-bass', chords: 'motion-pad', lead: 'fm-bell-lead', arp: 'acid-bass' },
    bass: 'euclid', chords: 'stabs', drums: 'four', leadPulses: [2, 5], enter: { ...ENTER_DEFAULT, kick: 0.25, snare: 2, lead: 0.7, arp: 0.6 },
  },
]

export const styleOf = (id: string): Style => STYLES.find((s) => s.id === id) ?? STYLES[0]

// ── The piece ──────────────────────────────────────────────────────────────

export interface NoteEvent {
  part: Part
  /** 16th-note step within the bar, 0..15. */
  step: number
  midi: number
  vel: number
  /** Length in 16ths. */
  len: number
}

export interface Bar {
  section: string
  /** Bar within its section, from 0. */
  index: number
  energy: number
  chord: { degree: number; name: string; midi: number[] }
  events: NoteEvent[]
}

export interface Piece {
  seed: string
  style: string
  key: string
  scale: string
  bpm: number
  swing: number
  bars: Bar[]
}

export interface ComposeOptions {
  style?: string
  /** 'auto' or a key name (C … B). */
  key?: string
  /** 'auto' or a scale name. */
  scale?: string
  /** 0 = from the style and seed. */
  bpm?: number
}

const FORMS: Array<Array<[string, number, number]>> = [
  [['intro', 4, 0.3], ['A', 8, 0.6], ['B', 8, 0.85], ['A', 8, 0.65], ['break', 4, 0.35], ['B', 8, 1], ['outro', 4, 0.4]],
  [['intro', 4, 0.35], ['A', 8, 0.55], ['A', 8, 0.7], ['B', 8, 0.9], ['break', 4, 0.3], ['B', 8, 1], ['A', 4, 0.5]],
  [['intro', 8, 0.3], ['A', 8, 0.65], ['B', 8, 0.95], ['break', 4, 0.4], ['A', 8, 0.75], ['B', 8, 1], ['outro', 4, 0.35]],
]

/** Song-level choices from the seed: style, key, mode, tempo, form. */
export function plan(seed: string, opts: ComposeOptions = {}) {
  const r = rngFor(seed, 'plan')
  const style = styleOf(opts.style ?? 'lofi')
  const key = opts.key && opts.key !== 'auto' && KEYS.includes(opts.key) ? opts.key : r.pick(KEYS)
  const scale = opts.scale && opts.scale !== 'auto' && SCALES[opts.scale] ? opts.scale : r.pick(style.scales)
  const bpm = opts.bpm && opts.bpm > 0 ? opts.bpm : Math.round(r.range(style.bpm[0], style.bpm[1]))
  const form = r.pick(FORMS)
  return { style, key, scale, bpm, form }
}

function progression(r: Rng, minorish: boolean, start: number, length: number): number[] {
  const weights = (from: number) => {
    const w = { ...HARMONY[from] }
    if (minorish) for (const [k, v] of Object.entries(MINOR_LIFT[from] ?? {})) w[+k] = (w[+k] ?? 0) + v
    return w
  }
  const out = [start]
  while (out.length < length - 1) {
    let d = r.weighted(weights(out[out.length - 1]))
    if (d === out[out.length - 1]) d = (d + 3) % 7
    out.push(d)
  }
  // Turn back toward the start: end on a chord that leads home.
  const lead = weights(out[out.length - 1])
  const toHome = Object.fromEntries(Object.entries(lead).map(([k, v]) => [k, v * (HARMONY[+k]?.[start] ?? 0.2) + 0.01]))
  out.push(length > 1 ? r.weighted(toHome) : start)
  return out
}

function chordTones(scale: readonly number[], tonic: number, degree: number, sevenths: boolean): number[] {
  const ds = sevenths ? [0, 2, 4, 6] : [0, 2, 4]
  return ds.map((x) => degreeToMidi(scale, tonic, degree + x))
}

/** The inversion of `tones` (moved by octaves into 52..76) nearest the previous voicing. */
function voiceLead(tones: number[], prev: number[] | null): number[] {
  const fit = (m: number) => { while (m < 52) m += 12; while (m > 76) m -= 12; return m }
  const base = tones.map(fit).sort((a, b) => a - b)
  if (!prev) return base
  let best = base
  let cost = Infinity
  for (let rot = 0; rot < base.length; rot++) {
    const v = base.map((m, i) => (i < rot ? m + 12 : m)).map((m) => (m > 79 ? m - 12 : m)).sort((a, b) => a - b)
    const c = v.reduce((s, m, i) => s + Math.abs(m - (prev[i] ?? prev[prev.length - 1])), 0)
    if (c < cost) { cost = c; best = v }
  }
  return best
}

/** Roman numeral with its quality: upper case major, lower case minor, ° diminished. */
function chordName(tones: number[], degree: number): string {
  const third = tones[1] - tones[0]
  const fifth = tones[2] - tones[0]
  const roman = ROMAN[degree]
  return third === 4 ? roman : fifth === 6 ? `${roman.toLowerCase()}°` : roman.toLowerCase()
}

interface Motif { steps: number[]; degrees: number[] }

/** A one-bar melodic idea: Euclidean rhythm, Markov contour, strong beats on chord tones. */
function motif(r: Rng, style: Style, startDegree: number, chordDegree: number, pulses?: number): Motif {
  const p = pulses ?? Math.round(r.range(style.leadPulses[0], style.leadPulses[1] + 0.99))
  const rhythm = euclid(p, 16, r.int(4) * 2)
  const steps = rhythm.flatMap((v, i) => (v ? [i] : []))
  const degrees: number[] = []
  const ctx = [0, 0]
  let d = startDegree
  for (const s of steps) {
    const step = melodyChain.next(ctx, r) ?? r.pick([-1, 1, 0, 2, -2])
    ctx.push(step)
    d += step
    if (d > 9) d -= 3 // stay in a singable range around the tonic
    if (d < -3) d += 3
    if (s % 8 === 0) d = nearestChordTone(d, chordDegree)
    degrees.push(d)
  }
  return { steps, degrees }
}

function nearestChordTone(d: number, chordDegree: number): number {
  let best = d
  let dist = Infinity
  for (let c = d - 3; c <= d + 3; c++) {
    const rel = (((c - chordDegree) % 7) + 7) % 7
    if ((rel === 0 || rel === 2 || rel === 4) && Math.abs(c - d) < dist) { dist = Math.abs(c - d); best = c }
  }
  return best
}

/** Re-fit a motif to a new chord: same rhythm and shape, strong beats snapped to the chord. */
function refit(m: Motif, chordDegree: number, shift = 0): Motif {
  return { steps: m.steps, degrees: m.degrees.map((d, i) => (m.steps[i] % 8 === 0 ? nearestChordTone(d + shift, chordDegree) : d + shift)) }
}

/**
 * One pass through the song form. `cycle` varies the details (fills, answers, ornaments) while
 * the seed keeps the song itself: key, progressions, motifs and grooves.
 */
export function compose(seed: string, opts: ComposeOptions = {}, cycle = 0): Piece {
  const { style, key, scale, bpm, form } = plan(seed, opts)
  const sc = SCALES[scale]
  const minorish = sc[2] === 3
  const tonic = 60 + KEYS.indexOf(key) // lead register; bass and chords move from here
  const leadTonic = tonic + (tonic < 66 ? 12 : 0) // around C5
  const vary = rngFor(seed, `cycle:${cycle}`)

  // Per section type: a progression, a groove and a motif, fixed by the seed.
  const sections = new Map<string, { prog: number[]; motifA: Motif; motifB: Motif; groove: Rng }>()
  const sectionOf = (name: string) => {
    let s = sections.get(name)
    if (s) return s
    const r = rngFor(seed, `section:${name}`)
    const start = name === 'B' ? r.pick(minorish ? [5, 3, 6] : [3, 5, 4]) : name === 'break' ? r.pick([5, 3]) : 0
    const prog = progression(r, minorish, start, 4)
    s = { prog, motifA: motif(r, style, r.pick([2, 4, 7]), prog[0]), motifB: motif(r, style, r.pick([4, 7, 9]), prog[1]), groove: rngFor(seed, `groove:${name}`) }
    sections.set(name, s)
    return s
  }

  const g = rngFor(seed, 'groove')
  const kickRot = g.int(3)
  const hatPulses = 5 + g.int(6)
  const hatRot = g.int(4)
  const bassPulses = 3 + g.int(3)
  const bassRot = g.int(3)
  const stabRot = 1 + g.int(3)

  const bars: Bar[] = []
  let prevVoicing: number[] | null = null
  for (const [name, length, energy] of form) {
    const sec = sectionOf(name)
    for (let i = 0; i < length; i++) {
      const degree = sec.prog[i % sec.prog.length]
      const nextDegree = sec.prog[(i + 1) % sec.prog.length]
      const tones = chordTones(sc, tonic, degree, style.sevenths)
      const voicing = voiceLead(tones, prevVoicing)
      prevVoicing = voicing
      const root = degreeToMidi(sc, tonic - 24, degree)
      const fifth = degreeToMidi(sc, tonic - 24, degree + 4) // the scale's fifth (diminished on vii)
      const events: NoteEvent[] = []
      const add = (part: Part, step: number, midi: number, vel: number, len = 1) => events.push({ part, step, midi, vel: Math.max(0.05, Math.min(1, vel)), len })
      const lastOfSection = i === length - 1
      const fill = lastOfSection && energy > 0.5 && vary.chance(0.7)

      // Drums
      if (style.drums === 'four') {
        for (const s of [0, 4, 8, 12]) add('kick', s, 36, s === 0 ? 1 : 0.9)
        for (const s of [4, 12]) add('clap', s, 39, 0.85)
        euclid(hatPulses, 16, hatRot).forEach((v, s) => v && add('hat', s, 42, s % 4 === 2 ? 0.8 : 0.45))
        for (const s of [2, 6, 10, 14]) add('hat', s, 42, 0.7)
      } else if (style.drums === 'boom' || style.drums === 'break') {
        euclid(3, 16, kickRot).forEach((v, s) => v && add('kick', s, 36, 0.9))
        add('kick', 0, 36, 1)
        for (const s of [4, 12]) add('snare', s, 38, 0.9)
        euclid(2, 16, 3).forEach((v, s) => v && s !== 4 && s !== 12 && add('snare', s, 38, 0.25))
        for (let s = 0; s < 16; s += 2) add('hat', s, 42, s % 4 === 0 ? 0.65 : 0.4)
        add('clap', 12, 39, 0.6)
      } else if (style.drums === 'soft') {
        add('kick', 0, 36, 0.6)
        if (sec.groove.chance(0.5)) add('kick', 10, 36, 0.45)
        euclid(3 + (hatPulses % 3), 16, hatRot).forEach((v, s) => v && add('hat', s, 42, 0.3 + vary() * 0.15))
      }
      if (fill && style.drums !== 'none' && style.drums !== 'soft') {
        euclid(5 + vary.int(4), 8, 0).forEach((v, k) => v && add('snare', 8 + k, 38, 0.4 + k * 0.07))
      }

      // Bass
      if (style.bass === 'sustain') add('bass', 0, root, 0.8, 16)
      else if (style.bass === 'pulse') for (const s of [0, 4, 8, 12]) add('bass', s, s === 8 ? fifth : root, s === 0 ? 0.9 : 0.7, 3)
      else if (style.bass === 'octaves') for (let s = 0; s < 16; s += 2) add('bass', s, s % 4 === 2 ? root + 12 : root, 0.75, 1)
      else {
        add('bass', 0, root, 0.95, 3)
        euclid(bassPulses, 16, bassRot).forEach((v, s) => v && s > 1 && add('bass', s, vary.chance(0.25) ? fifth : root, 0.7, 2))
      }
      if (energy > 0.6 && style.bass !== 'sustain' && degree !== nextDegree) {
        const target = degreeToMidi(sc, tonic - 24, nextDegree)
        add('bass', 14, target + (target > root ? -1 : 1), 0.6, 2) // chromatic approach into the next chord
      }

      // Chords
      if (style.chords === 'pad') for (const m of voicing) add('chords', 0, m, 0.55, 16)
      else if (style.chords === 'stabs') euclid(3, 8, stabRot).forEach((v, k) => v && voicing.forEach((m) => add('chords', k * 2, m, 0.6, 1)))
      else for (const s of [0, 4, 8, 12]) voicing.forEach((m, j) => add('chords', s, m, (s === 0 ? 0.6 : 0.45) - j * 0.03, 4))

      // Arpeggio: chord tones climbing over two octaves in 16ths, gated by a Euclidean pattern.
      const arpTones = [...voicing, ...voicing.map((m) => m + 12)]
      euclid(10 + (hatPulses % 5), 16, 0).forEach((v, s) => v && add('arp', s, arpTones[s % arpTones.length], 0.4 + (s % 4 === 0 ? 0.15 : 0), 1))

      // Lead: phrases of motifs — A, A refitted, B (an answer), A again ending home.
      if (name === 'A' || name === 'B' || (name === 'outro' && i < 2)) {
        const phrasePos = i % 4
        let m: Motif
        if (phrasePos === 0) m = refit(sec.motifA, degree)
        else if (phrasePos === 1) m = refit(sec.motifA, degree, vary.pick([0, 0, 1, -1]))
        else if (phrasePos === 2) m = refit(sec.motifB, degree)
        else m = vary.chance(0.5) ? refit(sec.motifA, degree) : motif(vary, style, sec.motifA.degrees[0] ?? 2, degree)
        m.steps.forEach((s, k) => {
          const until = (m.steps[k + 1] ?? 16) - s
          let d = m.degrees[k]
          // The phrase's last note resolves to a chord tone and rings.
          if (phrasePos === 3 && k === m.steps.length - 1) d = nearestChordTone(d, degree)
          add('lead', s, degreeToMidi(sc, leadTonic, d), (s % 4 === 0 ? 0.8 : 0.62) + vary() * 0.08, Math.min(until, phrasePos === 3 && k === m.steps.length - 1 ? 8 : 4))
        })
      }

      bars.push({
        section: name, index: i, energy,
        chord: { degree, name: chordName(tones, degree), midi: voicing },
        events,
      })
    }
  }
  return { seed, style: style.id, key, scale, bpm, swing: style.swing, bars }
}
