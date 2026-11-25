import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineNodeState } from '@/engine/nodeState'
import {
  configureSinger,
  routeSinger,
  vocalIndex,
  vocalKeyDown,
  vocalKeyUp,
  vocalBend,
  vocalHeld,
  vocalShape,
} from '../bellows-singer/singerManager'
import { voiceControls, mixControls, resolveSingerConfig } from '../bellows-singer/voiceNodeShared'
import {
  readMouth as readMouthFull, mouthFeatures, parseCalibration, calibratedPrototypes, featureDistance,
  activityFrom, towards, readTongue, vowelWord, type MouthReading, type RestBaseline, type Calibration, type Features,
} from './mouthFeatures'
import { createSurface, disposeSurface, drawableOf, sizeOf, type OverlaySurface } from '../../visual/overlayCanvas'

/**
 * Mouth Voice: your mouth shape, read from MediaPipe Face blendshapes, played through the
 * articulatory voice. Three readings of the face drive it:
 *   open   = jaw drop, round = pucker / funnel, spread = smile / stretch.
 * The nearest vowel on that (open, round, spread) chart becomes the engine's phoneme (it morphs at
 * articulator speed), the raw readings also steer the engine's jaw / lip / tongue offsets so the
 * sound follows the mouth between vowels, and lips pressed shut, the lower lip under the teeth or
 * the tongue out give m, v and th.
 *
 * v2: the inner-lip outline (Landmarks) sharpens open and width against a resting mouth it learns
 * on the fly; a Calibration from the Mouth Calibrate node swaps the generic chart for the person's
 * own recorded vowels; p / b / w / sh come from lip gestures; and, experimentally, the video shows
 * how high the tongue sits.
 */

const DEFAULT_VOICE = 'pop-female'

export type { MouthReading }

/** Vowel prototypes on the mouth chart (rough visual shapes, not acoustics). */
export const VOWEL_SHAPES: { ipa: string; word: string; open: number; round: number; spread: number }[] = [
  { ipa: 'i', word: 'ee (see)', open: 0.08, round: 0, spread: 0.75 },
  { ipa: 'ɪ', word: 'ih (sit)', open: 0.18, round: 0, spread: 0.4 },
  { ipa: 'e', word: 'ay (say)', open: 0.25, round: 0, spread: 0.55 },
  { ipa: 'ɛ', word: 'eh (bed)', open: 0.38, round: 0, spread: 0.35 },
  { ipa: 'æ', word: 'a (cat)', open: 0.55, round: 0, spread: 0.5 },
  { ipa: 'ɑ', word: 'ah (father)', open: 0.75, round: 0, spread: 0 },
  { ipa: 'ʌ', word: 'uh (cup)', open: 0.4, round: 0, spread: 0.05 },
  { ipa: 'ə', word: 'schwa (about)', open: 0.2, round: 0.05, spread: 0.05 },
  { ipa: 'ɔ', word: 'aw (thought)', open: 0.55, round: 0.5, spread: 0 },
  { ipa: 'o', word: 'oh (go)', open: 0.3, round: 0.75, spread: 0 },
  { ipa: 'ʊ', word: 'oo (book)', open: 0.18, round: 0.55, spread: 0 },
  { ipa: 'u', word: 'oo (blue)', open: 0.08, round: 0.95, spread: 0 },
]

/** Blendshapes (MediaPipe names, 0..1) → the mouth readings, scaled by sensitivity. */
export function readMouth(b: Record<string, number>, sensitivity = 1, lm?: unknown, rest?: RestBaseline): MouthReading {
  return readMouthFull(b, sensitivity, lm, rest)
}

/** The vowel nearest a reading, with its distance (open weighted most, then rounding). */
export function nearestShape(r: MouthReading): { ipa: string; word: string; d: number } {
  let best = VOWEL_SHAPES[0]
  let bestD = Infinity
  for (const v of VOWEL_SHAPES) {
    const d = ((r.open - v.open) * 1.6) ** 2 + ((r.round - v.round) * 1.2) ** 2 + (r.spread - v.spread) ** 2
    if (d < bestD) { bestD = d; best = v }
  }
  return { ipa: best.ipa, word: best.word, d: bestD }
}

/** The sound to make for a reading: a consonant the lips show clearly, else the nearest vowel. */
export function mouthSound(r: MouthReading): { ipa: string; word: string } {
  if (r.tongue > 0.4) return { ipa: 'ð', word: 'th (this)' }
  if (r.lipTeeth > 0.45 && r.open < 0.25) return { ipa: 'v', word: 'v (van)' }
  if (r.closed > 0.35 && r.open < 0.12) return { ipa: 'm', word: 'mm (hum)' }
  if (r.round > 0.4 && r.teethShow > 0.2 && r.open > 0.05 && r.open < 0.3) return { ipa: 'ʃ', word: 'sh (shoe)' }
  const v = nearestShape(r)
  return { ipa: v.ipa, word: v.word }
}

const CONSONANTS = new Set(['m', 'v', 'ð', 'ʃ'])

const definition: NodeDefinition = {
  id: 'bellows-mouth-voice',
  name: 'Mouth Voice',
  version: '2.0.0',
  category: 'audio',
  description: 'Your mouth shape becomes a voice: face tracking picks the vowel you are making and the articulatory voice sings it',
  icon: 'mic',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'blendshapes', type: 'data', label: 'Face Blendshapes' },
    { id: 'landmarks', type: 'data', label: 'Face Landmarks (sharper)' },
    { id: 'calibration', type: 'data', label: 'Calibration' },
    { id: 'video', type: 'video', label: 'Video (tongue reading)' },
    { id: 'note', type: 'number', label: 'Note' },
    { id: 'gate', type: 'boolean', label: 'Gate (override)' },
  ],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'ipa', type: 'string', label: 'Sound (IPA)' },
    { id: 'word', type: 'string', label: 'Sound (as in…)' },
    { id: 'open', type: 'number', label: 'Open' },
    { id: 'round', type: 'number', label: 'Round' },
    { id: 'spread', type: 'number', label: 'Spread' },
    { id: 'tongue', type: 'number', label: 'Tongue Height' },
    { id: 'calibrated', type: 'boolean', label: 'Calibrated' },
    { id: 'sounding', type: 'boolean', label: 'Sounding' },
  ],
  controls: [
    {
      id: 'voicing', type: 'select', label: 'Sound When', default: 'open',
      props: { options: [
        { value: 'open', label: 'Mouth moves (open, rounded, smiling or humming)' },
        { value: 'face', label: 'Face is in view (drone)' },
        { value: 'gate', label: 'Gate input is on' },
      ] },
    },
    { id: 'threshold', type: 'slider', label: 'Open Threshold', default: 0.1, props: { min: 0.02, max: 0.5, step: 0.01 } },
    { id: 'sensitivity', type: 'slider', label: 'Mouth Sensitivity', default: 1.2, props: { min: 0.5, max: 3, step: 0.05 } },
    {
      id: 'follow', type: 'slider', label: 'Follow Mouth Exactly', default: 0.6, props: { min: 0, max: 1, step: 0.05 },
      description: 'How far the voice’s jaw, lips and tongue follow your exact shape between vowels (0 = clean vowels only).',
    },
    { id: 'glide', type: 'slider', label: 'Morph Speed (s)', default: 0.08, props: { min: 0.01, max: 0.4, step: 0.01 } },
    {
      id: 'consonants', type: 'toggle', label: 'Lip Consonants (p b m w v sh th)', default: true,
      description: 'Puffed cheeks then open = p; hum then open = b; oo opening fast = w; funnelled lips with teeth showing = sh.',
    },
    {
      id: 'readTongue', type: 'toggle', label: 'Read Tongue From Video (experimental)', default: false,
      description: 'Looks inside the open mouth for how high the tongue sits. Needs Video and Landmarks wired and light on your face.',
    },
    { id: 'baseNote', type: 'number', label: 'Note (if unwired)', default: 57, props: { min: 24, max: 96, step: 1 } },
    ...voiceControls(DEFAULT_VOICE),
    ...mixControls(),
  ],
  info: {
    overview:
      'Mime and it speaks. Feed it MediaPipe Face blendshapes and it reads your mouth as three numbers: how open, how rounded (pucker) and how spread (smile). The nearest vowel (ee, ih, ay, eh, a, ah, uh, aw, oh, oo) is what the articulatory voice sings, morphing between them at your speed, while the voice’s own jaw, lips and tongue follow your mouth between vowels. Lip gestures add consonants: hum (m), puff then open (p), hum then open (b), oo opening fast (w), lower lip under the teeth (v), funnelled lips with teeth showing (sh), tongue out (th). Wire Face Landmarks too for a sharper reading of lip opening and width, and a Calibration from Mouth Calibrate to match YOUR mouth instead of an average one.',
    tips: [
      'Basic: Webcam → MediaPipe Face → Blendshapes into Face Blendshapes, Audio on to an Audio Output.',
      'Better: also wire Face → Landmarks, and add a Mouth Calibrate node: run it once (relax, ah, ee, oo, oh, eh) and wire its Calibration in.',
      'Shapes read differently on every face. Uncalibrated, raise Mouth Sensitivity if the vowel rarely leaves "uh", lower it if it jumps to "ah".',
      'Read Tongue From Video is a rough guess from the colours inside your mouth; it helps ee vs eh in good light and does little in dim light.',
      'Wire a pitch into Note (a Keyboard, or eyebrows through a Remap and Scale Quantize) to sing with your mouth.',
    ],
    pairsWith: ['mediapipe-face', 'mouth-calibrate', 'tracking-overlay', 'scale-quantize', 'bellows-reverb', 'audio-output'],
  },
  tags: ['bellows', 'voice', 'vocal', 'mouth', 'lip', 'face', 'vowel', 'ipa', 'puppet', 'mime', 'articulatory', 'mediapipe', 'calibrate'],
}

interface MouthState {
  ipa: string; word: string; note: number
  rest: RestBaseline
  /** Calibration cache, keyed by its source so prototypes are rebuilt only when it changes. */
  calKey: unknown; cal: Calibration | null; protos: { ipa: string; f: Features }[]
  /** Consonant gestures: what the last frame was, when the lips last sealed or rounded. */
  prev: string; sealedAt: number; puffed: boolean; roundAt: number
  /** The consonant onset stays on the word read-out briefly, so it can be seen. */
  onsetShown: string; onsetUntil: number
  tongue: number | null
  surface: OverlaySurface | null
}

const mouthState = defineNodeState<MouthState>({
  label: 'bellows-mouth-voice',
  dispose: (st, key) => { vocalKeyUp(key); if (st.surface) disposeSurface(st.surface) },
})

const ONSET_WINDOW_MS = 450

/** Pick the vowel from the person's own calibrated shapes (hysteresis keeps the current one close calls). */
function calibratedPick(st: MouthState, f: Features): { ipa: string; d: number } {
  const c = st.cal!
  let best = st.protos[0]
  let bestD = Infinity
  let curD = Infinity
  for (const p of st.protos) {
    const d = featureDistance(f, p.f, c.scale)
    if (d < bestD) { bestD = d; best = p }
    if (p.ipa === st.ipa) curD = d
  }
  return curD < bestD * 1.3 ? { ipa: st.ipa, d: curD } : { ipa: best.ipa, d: bestD }
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const wired = !!ctx.connectedOutputs?.has('audio')
  const cfg = resolveSingerConfig(ctx.controls, DEFAULT_VOICE)
  cfg.send = 0
  configureSinger(ctx.nodeId, cfg)
  const st = mouthState.getOrCreate(ctx.nodeId, () => ({
    ipa: '', word: '', note: -1, rest: { width: null }, calKey: undefined, cal: null, protos: [],
    prev: '', sealedAt: -1e9, puffed: false, roundAt: -1e9, onsetShown: '', onsetUntil: 0, tongue: null, surface: null,
  }))
  const now = performance.now()

  const raw = ctx.inputs.get('blendshapes')
  const hasFace = !!raw && typeof raw === 'object' && Object.keys(raw as object).length > 0
  const b = hasFace ? (raw as Record<string, number>) : null
  const lm = ctx.inputs.get('landmarks')

  // Calibration (rebuilt only when the incoming value changes)
  const calIn = ctx.inputs.get('calibration')
  if (calIn !== st.calKey) {
    st.calKey = calIn
    st.cal = parseCalibration(calIn)
    st.protos = st.cal ? calibratedPrototypes(st.cal) : []
  }

  // Tongue (experimental): a look inside the open mouth
  st.tongue = null
  if (b && ctx.bool('readTongue', false)) {
    const v = ctx.inputs.get('video')
    if (v) {
      st.surface ??= createSurface()
      const src = drawableOf(v, st.surface)
      if (src) { const { w, h } = sizeOf(src); st.tongue = readTongue(src, lm, w, h) }
    }
  }

  const sens = ctx.num('sensitivity', 1.2)
  const r = b ? readMouth(b, sens, lm, st.rest) : null
  const f = b ? mouthFeatures(b, lm, st.tongue) : null
  const cal = st.cal && st.protos.length ? st.cal : null
  if (r && f && cal) {
    // Readings relative to the person's own shapes, so the articulators follow them too.
    r.open = 0.75 * towards(cal, f, cal.vowels['ɑ'])
    r.round = Math.max(r.round * 0.3, 0.95 * towards(cal, f, cal.vowels.u))
    r.spread = Math.max(r.spread * 0.3, 0.75 * towards(cal, f, cal.vowels.i))
  }

  const out = new Map<string, unknown>([
    ['open', r?.open ?? 0], ['round', r?.round ?? 0], ['spread', r?.spread ?? 0],
    ['tongue', st.tongue ?? 0], ['calibrated', !!cal],
  ])

  const note = Math.max(0, Math.min(127, Math.round(ctx.num('note', ctx.num('baseNote', 57)))))
  const mode = ctx.str('voicing', 'open')
  const thr = ctx.num('threshold', 0.1)
  const consonants = ctx.bool('consonants', true)
  let on: boolean
  if (mode === 'gate' || ctx.inputs.get('gate') !== undefined) on = ctx.level('gate')
  else if (!r) on = false
  else if (mode === 'face') on = true
  else if (cal && f) on = activityFrom(cal, f) > Math.max(0.25, thr * 3) || r.closed > 0.35
  else on = r.open > thr || r.round > 0.35 || r.spread > 0.35 || r.closed > 0.35

  let onset: string | null = null
  if (r && f) {
    const sealed = r.closed > 0.35 && r.open < 0.12
    if (consonants && sealed && r.puff > 0.25) {
      // Cheeks puffed behind closed lips: air building for a "p". Silent until the lips open.
      st.puffed = true
      st.sealedAt = now
      on = false
    } else {
      let pick: { ipa: string; word: string }
      const cons = mouthSound(r)
      if (CONSONANTS.has(cons.ipa) && (consonants || cons.ipa === 'm')) pick = cons
      else if (cal) { const c = calibratedPick(st, f); pick = { ipa: c.ipa, word: vowelWord(c.ipa) } }
      else {
        pick = nearestShape(r)
        // hysteresis: keep the current vowel unless the new one is clearly closer
        const cur = VOWEL_SHAPES.find((v) => v.ipa === st.ipa)
        if (cur && pick.ipa !== st.ipa) {
          const dCur = ((r.open - cur.open) * 1.6) ** 2 + ((r.round - cur.round) * 1.2) ** 2 + (r.spread - cur.spread) ** 2
          if (dCur < nearestShape(r).d * 1.35) pick = { ipa: cur.ipa, word: cur.word }
        }
      }
      if (sealed) st.sealedAt = now
      const isVowel = !CONSONANTS.has(pick.ipa)
      if (consonants && isVowel && on) {
        if ((st.prev === 'm' || st.puffed) && now - st.sealedAt < ONSET_WINDOW_MS) onset = st.puffed ? 'p' : 'b'
        else if ((st.prev === 'u' || st.prev === 'ʊ') && pick.ipa !== 'u' && pick.ipa !== 'ʊ' && pick.ipa !== 'o' && now - st.roundAt < 300 && r.open > 0.25) onset = 'w'
      }
      if (pick.ipa === 'u' || pick.ipa === 'ʊ') st.roundAt = now
      if (!sealed) st.puffed = false
      if (onset) { st.onsetShown = onset; st.onsetUntil = now + 350 }
      else if (pick.ipa !== st.ipa || now > st.onsetUntil) st.onsetShown = ''
      st.ipa = pick.ipa
      st.word = st.onsetShown ? `${st.onsetShown}${pick.word}` : pick.word
    }
    st.prev = st.puffed ? 'p' : st.ipa
  }

  const idx = st.ipa ? vocalIndex(st.ipa) : -1
  // Articulator offsets follow how far the mouth is from the chosen vowel's own shape (zero at the
  // prototype), so they shade the vowel instead of closing the voice's lips on an already-round oo.
  const follow = ctx.num('follow', 0.6)
  const proto = VOWEL_SHAPES.find((v) => v.ipa === st.ipa)
  const lim = (v: number) => Math.max(-0.45, Math.min(0.45, v))
  const glide = ctx.num('glide', 0.08)
  const tongueLift = st.tongue == null ? 0 : (st.tongue - 0.4) * 0.8
  const shape: Record<string, number> = r && proto ? {
    jawSet: lim((r.open - proto.open) * 1.4 * follow),
    lipOpen: lim((r.open - proto.open) * follow),
    lipRound: lim(((r.round - proto.round) - (r.spread - proto.spread) * 0.6) * follow),
    tongueFront: lim(((r.spread - proto.spread) - (r.round - proto.round)) * 0.6 * follow),
    tongueHigh: lim(((proto.open - r.open) * 0.8 + tongueLift) * follow),
    glide,
  } : { jawSet: 0, lipOpen: 0, lipRound: 0, tongueFront: 0, tongueHigh: 0, glide }

  if (on && idx >= 0) {
    const held = vocalHeld(ctx.nodeId)
    const onsetIdx = onset ? vocalIndex(onset) : -1
    if (!held || onsetIdx >= 0) {
      // A fresh note, or a consonant onset into the next vowel (legato keeps the held note's pitch).
      vocalKeyDown(ctx.nodeId, { text: st.word, ipa: st.ipa, onset: onsetIdx >= 0 ? [onsetIdx] : [], nucleus: [idx], coda: [] }, note, 0.85, held)
      st.note = note
    } else if (note !== st.note) {
      vocalBend(ctx.nodeId, note)
      st.note = note
    }
    vocalShape(ctx.nodeId, idx, shape)
  } else if (!on && vocalHeld(ctx.nodeId)) {
    vocalKeyUp(ctx.nodeId)
  }

  out.set('ipa', st.ipa)
  out.set('word', st.word)
  out.set('sounding', vocalHeld(ctx.nodeId))
  out.set('audio', routeSinger(ctx.nodeId, wired))
  return out
}

export default defineNode({ definition, executor })
