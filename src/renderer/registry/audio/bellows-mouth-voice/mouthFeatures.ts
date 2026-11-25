/**
 * Shared mouth reading for Mouth Voice and Mouth Calibrate.
 *
 * A face frame becomes a feature vector: MediaPipe blendshapes (jaw, pucker, funnel, smile...), the
 * inner-lip geometry from the face landmarks (gap and width, divided by face width so distance to
 * the camera cancels), and optionally a rough look inside the mouth from the video (how much tongue
 * shows in the upper half of the opening). Uncalibrated, the features fold into the open / round /
 * spread chart; calibrated, the vowel is whichever of YOUR recorded shapes is nearest.
 */

export interface Pt { x: number; y: number; z?: number }

export const FEATURE_KEYS = [
  'jaw', 'lipGap', 'width', 'pucker', 'funnel', 'smile', 'stretch',
  'upperUp', 'lowerDown', 'press', 'puff', 'rollLower', 'tongueUp',
] as const
export type FeatureKey = typeof FEATURE_KEYS[number]
/** Missing features (no landmarks wired, tongue reading off) are absent, never zero. */
export type Features = Partial<Record<FeatureKey, number>>

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const bs = (b: Record<string, number>, k: string) => (Number.isFinite(b[k]) ? b[k] : 0)
const avg2 = (b: Record<string, number>, k: string) => (bs(b, `${k}Left`) + bs(b, `${k}Right`)) / 2

// MediaPipe face mesh indices: inner lips (13 top, 14 bottom), mouth corners (61, 291), cheeks (234, 454).
const UPPER_INNER = 13
const LOWER_INNER = 14
const CORNER_L = 61
const CORNER_R = 291
const CHEEK_L = 234
const CHEEK_R = 454
/** Inner-lip ring, in order, for the mouth-opening polygon. */
export const INNER_LIP_RING = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

export function isFaceMesh(v: unknown): v is Pt[] {
  return Array.isArray(v) && v.length >= 468 && typeof (v[0] as Pt)?.x === 'number'
}

/** Inner-lip gap and mouth width as fractions of face width, or null without a face mesh. */
export function lipGeometry(lm: unknown): { lipGap: number; width: number } | null {
  if (!isFaceMesh(lm)) return null
  const faceW = dist(lm[CHEEK_L], lm[CHEEK_R])
  if (!(faceW > 1e-4)) return null
  return { lipGap: dist(lm[UPPER_INNER], lm[LOWER_INNER]) / faceW, width: dist(lm[CORNER_L], lm[CORNER_R]) / faceW }
}

export function mouthFeatures(b: Record<string, number> | null, lm?: unknown, tongueUp?: number | null): Features {
  const f: Features = {}
  if (b) {
    f.jaw = bs(b, 'jawOpen')
    f.pucker = bs(b, 'mouthPucker')
    f.funnel = bs(b, 'mouthFunnel')
    f.smile = avg2(b, 'mouthSmile')
    f.stretch = avg2(b, 'mouthStretch')
    f.upperUp = avg2(b, 'mouthUpperUp')
    f.lowerDown = avg2(b, 'mouthLowerDown')
    f.press = Math.max(bs(b, 'mouthClose'), avg2(b, 'mouthPress'))
    f.puff = bs(b, 'cheekPuff')
    f.rollLower = bs(b, 'mouthRollLower')
  }
  const g = lipGeometry(lm)
  if (g) { f.lipGap = g.lipGap; f.width = g.width }
  if (typeof tongueUp === 'number' && Number.isFinite(tongueUp)) f.tongueUp = tongueUp
  return f
}

// ── Uncalibrated reading ─────────────────────────────────────────────────────

export interface MouthReading {
  open: number; round: number; spread: number; closed: number
  lipTeeth: number; tongue: number; puff: number; teethShow: number
}

/**
 * A slowly-updated neutral mouth width, learned while the mouth is at rest, so lip width reads as
 * "wider / narrower than your resting mouth" without a calibration step.
 */
export interface RestBaseline { width: number | null }

/** Blendshapes (+ optional lip geometry) → open / round / spread readings, scaled by sensitivity. */
export function readMouth(b: Record<string, number>, sensitivity = 1, lm?: unknown, rest?: RestBaseline): MouthReading {
  const k = sensitivity
  let open = (bs(b, 'jawOpen') * 1.3 + (bs(b, 'mouthLowerDownLeft') + bs(b, 'mouthLowerDownRight')) * 0.15) * k
  let round = Math.max(bs(b, 'mouthPucker'), bs(b, 'mouthFunnel') * 1.2) * k
  let spread = (avg2(b, 'mouthSmile') + avg2(b, 'mouthStretch') / 2) * k
  const g = lipGeometry(lm)
  if (g) {
    // The inner-lip gap sees lip opening the jaw blendshape misses (lips parting with the jaw still).
    open = Math.max(open, (g.lipGap / 0.11) * 0.75 * k)
    if (rest) {
      if (rest.width == null) rest.width = g.width
      else if (open < 0.08 && round < 0.2 && spread < 0.2) rest.width += (g.width - rest.width) * 0.02
      const dev = (g.width - rest.width) / Math.max(1e-3, rest.width)
      if (dev > 0) spread = Math.max(spread, dev * 4 * k)
      else round = Math.max(round, -dev * 4 * k * (open < 0.45 ? 1 : 0.5))
    }
  }
  return {
    open: clamp01(open),
    round: clamp01(round),
    spread: clamp01(spread),
    closed: clamp01(Math.max(bs(b, 'mouthClose'), avg2(b, 'mouthPress'))),
    lipTeeth: clamp01(bs(b, 'mouthRollLower')),
    tongue: clamp01(bs(b, 'tongueOut')),
    puff: clamp01(bs(b, 'cheekPuff')),
    teethShow: clamp01(avg2(b, 'mouthUpperUp')),
  }
}

// ── Calibration ──────────────────────────────────────────────────────────────

/** The shapes the calibration records, in order, with what to tell the person. */
export const CALIBRATION_STEPS: { id: string; prompt: string; short: string }[] = [
  { id: 'rest', prompt: 'Relax your mouth, lips closed', short: 'RELAX, LIPS CLOSED' },
  { id: 'ɑ', prompt: 'Say AH (father) and hold it', short: 'AH (father)' },
  { id: 'i', prompt: 'Say EE (see) and hold it', short: 'EE (see)' },
  { id: 'u', prompt: 'Say OO (blue) and hold it', short: 'OO (blue)' },
  { id: 'o', prompt: 'Say OH (go) and hold it', short: 'OH (go)' },
  { id: 'ɛ', prompt: 'Say EH (bed) and hold it', short: 'EH (bed)' },
]

export interface Calibration {
  version: 1
  rest: Features
  vowels: Record<string, Features>
  /** Per-feature spread across the recorded shapes, so every feature counts on the same scale. */
  scale: Features
}

const WORDS: Record<string, string> = {
  i: 'ee (see)', 'ɪ': 'ih (sit)', e: 'ay (say)', 'ɛ': 'eh (bed)', 'æ': 'a (cat)', 'ɑ': 'ah (father)',
  'ʌ': 'uh (cup)', 'ə': 'schwa (about)', 'ɔ': 'aw (thought)', o: 'oh (go)', 'ʊ': 'oo (book)', u: 'oo (blue)',
}
export const vowelWord = (ipa: string) => WORDS[ipa] ?? ipa

function mix(parts: [Features, number][]): Features {
  const out: Features = {}
  for (const key of FEATURE_KEYS) {
    let s = 0, w = 0
    for (const [f, k] of parts) if (f[key] !== undefined) { s += f[key]! * k; w += k }
    if (w > 0) out[key] = s / w
  }
  return out
}

/** Average feature frames (a held shape). */
export function averageFeatures(frames: Features[]): Features {
  return mix(frames.map((f) => [f, 1] as [Features, number]))
}

export function buildCalibration(shapes: Record<string, Features>): Calibration | null {
  const rest = shapes.rest
  if (!rest) return null
  const vowels: Record<string, Features> = {}
  for (const s of CALIBRATION_STEPS) if (s.id !== 'rest' && shapes[s.id]) vowels[s.id] = shapes[s.id]
  if (Object.keys(vowels).length < 3) return null
  const all = [rest, ...Object.values(vowels)]
  const scale: Features = {}
  for (const key of FEATURE_KEYS) {
    const vals = all.map((f) => f[key]).filter((v): v is number => v !== undefined)
    if (vals.length < 2) continue
    const m = vals.reduce((a, v) => a + v, 0) / vals.length
    const sd = Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / vals.length)
    scale[key] = Math.max(sd, 0.02)
  }
  return { version: 1, rest, vowels, scale }
}

export function parseCalibration(v: unknown): Calibration | null {
  let o: unknown = v
  if (typeof v === 'string') {
    if (!v.trim()) return null
    try { o = JSON.parse(v) } catch { return null }
  }
  const c = o as Calibration
  if (!c || c.version !== 1 || typeof c.rest !== 'object' || typeof c.vowels !== 'object' || typeof c.scale !== 'object') return null
  return c
}

/** Normalised squared distance over the features both frames have. */
export function featureDistance(a: Features, b: Features, scale: Features): number {
  let d = 0, n = 0
  for (const key of FEATURE_KEYS) {
    const s = scale[key]
    if (s === undefined || a[key] === undefined || b[key] === undefined) continue
    d += ((a[key]! - b[key]!) / s) ** 2
    n++
  }
  return n ? d / n : Infinity
}

/**
 * Prototypes for all twelve vowels from the five recorded ones: the in-between vowels are blends of
 * their neighbours (ay between ee and eh, aw between ah and oh, uh and schwa between ah and rest...).
 */
export function calibratedPrototypes(c: Calibration): { ipa: string; f: Features }[] {
  const v = c.vowels
  const R = c.rest
  const out: { ipa: string; f: Features }[] = Object.entries(v).map(([ipa, f]) => ({ ipa, f }))
  const add = (ipa: string, parts: [Features | undefined, number][]) => {
    if (parts.every(([f]) => f)) out.push({ ipa, f: mix(parts as [Features, number][]) })
  }
  add('e', [[v.i, 1], [v['ɛ'], 1]])
  add('ɪ', [[v.i, 0.5], [v['ɛ'], 0.3], [R, 0.2]])
  add('æ', [[v['ɛ'], 1], [v['ɑ'], 1]])
  add('ʌ', [[v['ɑ'], 0.55], [R, 0.45]])
  add('ə', [[v['ɑ'], 0.3], [R, 0.7]])
  add('ɔ', [[v['ɑ'], 1], [v.o, 1]])
  add('ʊ', [[v.u, 0.5], [v.o, 0.2], [R, 0.3]])
  return out
}

/** How far a frame is from rest, relative to how far the recorded vowels are (≈1 on a full vowel). */
export function activityFrom(c: Calibration, f: Features): number {
  const ref = Object.values(c.vowels).map((v) => Math.sqrt(featureDistance(v, c.rest, c.scale))).sort((a, b) => a - b)
  const median = ref[Math.floor(ref.length / 2)] || 1
  return Math.sqrt(featureDistance(f, c.rest, c.scale)) / median
}

/** 0..1 position of a frame along rest → target (projection in normalised feature space). */
export function towards(c: Calibration, f: Features, target: Features | undefined): number {
  if (!target) return 0
  let dot = 0, len = 0
  for (const key of FEATURE_KEYS) {
    const s = c.scale[key]
    if (s === undefined || f[key] === undefined || target[key] === undefined || c.rest[key] === undefined) continue
    const t = (target[key]! - c.rest[key]!) / s
    dot += ((f[key]! - c.rest[key]!) / s) * t
    len += t * t
  }
  return len > 0 ? clamp01(dot / len) : 0
}

// ── Looking inside the mouth (experimental) ──────────────────────────────────

let probe: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null
const PW = 40
const PH = 24

/**
 * How much of the upper half of the mouth opening shows tongue (pink, lit) rather than the dark
 * cavity: a raised tongue (ee, ih) fills it, a low one (ah, aw) leaves it dark. Rough by nature:
 * it needs light on the face and an open mouth, and returns null when it cannot tell.
 */
export function readTongue(src: CanvasImageSource | null, lm: unknown, srcW: number, srcH: number): number | null {
  if (!src || !isFaceMesh(lm) || srcW <= 0 || srcH <= 0) return null
  const g = lipGeometry(lm)
  if (!g || g.lipGap < 0.035) return null
  const ring = INNER_LIP_RING.map((i) => lm[i])
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0
  for (const p of ring) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
  const sx = x0 * srcW, sy = y0 * srcH, sw = (x1 - x0) * srcW, sh = (y1 - y0) * srcH
  if (sw < 6 || sh < 4) return null
  if (!probe) {
    const canvas = document.createElement('canvas')
    canvas.width = PW; canvas.height = PH
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    probe = { canvas, ctx }
  }
  const { ctx } = probe
  try {
    ctx.clearRect(0, 0, PW, PH)
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, PW, PH)
  } catch { return null }
  const data = ctx.getImageData(0, 0, PW, PH).data
  const path = new Path2D()
  ring.forEach((p, i) => {
    const x = ((p.x - x0) / (x1 - x0)) * PW, y = ((p.y - y0) / (y1 - y0)) * PH
    if (i === 0) path.moveTo(x, y); else path.lineTo(x, y)
  })
  path.closePath()
  let inside = 0, tongue = 0
  for (let y = 0; y < PH / 2; y++) {
    for (let x = 0; x < PW; x++) {
      if (!ctx.isPointInPath(path, x + 0.5, y + 0.5)) continue
      const o = (y * PW + x) * 4
      const r = data[o], gg = data[o + 1], bb = data[o + 2]
      const luma = 0.299 * r + 0.587 * gg + 0.114 * bb
      inside++
      if (luma > 45 && r > gg * 1.2 && r > bb * 1.05 && luma < 200) tongue++
    }
  }
  return inside >= 6 ? tongue / inside : null
}
