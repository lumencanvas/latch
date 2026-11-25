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

/**
 * Mouth Voice: your mouth shape, read from MediaPipe Face blendshapes, played through the
 * articulatory voice. Three readings of the face drive it:
 *   open   = jaw drop, round = pucker / funnel, spread = smile / stretch.
 * The nearest vowel on that (open, round, spread) chart becomes the engine's phoneme (it morphs at
 * articulator speed), the raw readings also steer the engine's jaw / lip / tongue offsets so the
 * sound follows the mouth between vowels, and lips pressed shut, the lower lip under the teeth or
 * the tongue out give m, v and th.
 */

const DEFAULT_VOICE = 'pop-female'

export interface MouthReading { open: number; round: number; spread: number; closed: number; lipTeeth: number; tongue: number }

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

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const bs = (b: Record<string, number>, k: string) => (Number.isFinite(b[k]) ? b[k] : 0)

/** Blendshapes (MediaPipe names, 0..1) → the mouth readings, scaled by sensitivity. */
export function readMouth(b: Record<string, number>, sensitivity = 1): MouthReading {
  const k = sensitivity
  return {
    open: clamp01((bs(b, 'jawOpen') * 1.3 + (bs(b, 'mouthLowerDownLeft') + bs(b, 'mouthLowerDownRight')) * 0.15) * k),
    round: clamp01(Math.max(bs(b, 'mouthPucker'), bs(b, 'mouthFunnel') * 1.2) * k),
    spread: clamp01(((bs(b, 'mouthSmileLeft') + bs(b, 'mouthSmileRight')) / 2 + (bs(b, 'mouthStretchLeft') + bs(b, 'mouthStretchRight')) / 4) * k),
    closed: clamp01(bs(b, 'mouthClose') + (bs(b, 'mouthPressLeft') + bs(b, 'mouthPressRight')) / 2),
    lipTeeth: clamp01(bs(b, 'mouthRollLower')),
    tongue: clamp01(bs(b, 'tongueOut')),
  }
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
  const v = nearestShape(r)
  return { ipa: v.ipa, word: v.word }
}

const definition: NodeDefinition = {
  id: 'bellows-mouth-voice',
  name: 'Mouth Voice',
  version: '1.0.0',
  category: 'audio',
  description: 'Your mouth shape becomes a voice: face tracking picks the vowel you are making and the articulatory voice sings it',
  icon: 'mic',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'blendshapes', type: 'data', label: 'Face Blendshapes' },
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
    { id: 'baseNote', type: 'number', label: 'Note (if unwired)', default: 57, props: { min: 24, max: 96, step: 1 } },
    ...voiceControls(DEFAULT_VOICE),
    ...mixControls(),
  ],
  info: {
    overview:
      'Mime and it speaks. Feed it MediaPipe Face blendshapes and it reads your mouth as three numbers: how open, how rounded (pucker) and how spread (smile). The nearest vowel on that chart (ee, ih, ay, eh, a, ah, uh, aw, oh, oo) is what the articulatory voice sings, morphing between them at your speed, and the voice’s own jaw, lip and tongue settings also follow your mouth between vowels. Lips pressed together hum (m), the lower lip under the teeth gives v, and the tongue out gives th.',
    tips: [
      'Wire Webcam → MediaPipe Face, then Face → Blendshapes into Face Blendshapes, and Audio on to an Audio Output.',
      'Shapes read differently on every face: raise Mouth Sensitivity if the vowel rarely leaves "uh", lower it if it jumps to "ah".',
      'Wire a pitch into Note (a Keyboard, or eyebrows through a Remap and Scale Quantize) to sing with your mouth.',
      'Sound (as in…) shows which vowel it hears; watch it while you exaggerate ee / ah / oo.',
    ],
    pairsWith: ['mediapipe-face', 'tracking-overlay', 'scale-quantize', 'bellows-reverb', 'audio-output'],
  },
  tags: ['bellows', 'voice', 'vocal', 'mouth', 'lip', 'face', 'vowel', 'ipa', 'puppet', 'mime', 'articulatory', 'mediapipe'],
}

interface MouthState { ipa: string; word: string; note: number; reading: MouthReading | null }

const mouthState = defineNodeState<MouthState>({
  label: 'bellows-mouth-voice',
  dispose: (_st, key) => { vocalKeyUp(key) },
})

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const wired = !!ctx.connectedOutputs?.has('audio')
  const cfg = resolveSingerConfig(ctx.controls, DEFAULT_VOICE)
  cfg.send = 0
  configureSinger(ctx.nodeId, cfg)
  const st = mouthState.getOrCreate(ctx.nodeId, () => ({ ipa: '', word: '', note: -1, reading: null }))

  const raw = ctx.inputs.get('blendshapes')
  const hasFace = !!raw && typeof raw === 'object' && Object.keys(raw as object).length > 0
  const r = hasFace ? readMouth(raw as Record<string, number>, ctx.num('sensitivity', 1.2)) : null

  const out = new Map<string, unknown>([['ipa', st.ipa], ['word', st.word], ['open', r?.open ?? 0], ['round', r?.round ?? 0], ['spread', r?.spread ?? 0]])

  const note = Math.max(0, Math.min(127, Math.round(ctx.num('note', ctx.num('baseNote', 57)))))
  const mode = ctx.str('voicing', 'open')
  const thr = ctx.num('threshold', 0.1)
  let on: boolean
  if (mode === 'gate' || ctx.inputs.get('gate') !== undefined) on = ctx.level('gate')
  else if (!r) on = false
  else if (mode === 'face') on = true
  else on = r.open > thr || r.round > 0.35 || r.spread > 0.35 || r.closed > 0.35

  if (r) {
    const pick = mouthSound(r)
    // hysteresis: keep the current vowel unless the new one is clearly closer
    if (pick.ipa !== st.ipa) {
      const cur = VOWEL_SHAPES.find((v) => v.ipa === st.ipa)
      const keep = cur && !['m', 'v', 'ð'].includes(pick.ipa)
        ? ((r.open - cur.open) * 1.6) ** 2 + ((r.round - cur.round) * 1.2) ** 2 + (r.spread - cur.spread) ** 2 < nearestShape(r).d * 1.35
        : false
      if (!keep) { st.ipa = pick.ipa; st.word = pick.word }
    }
    st.reading = r
  }

  const idx = st.ipa ? vocalIndex(st.ipa) : -1
  // Articulator offsets follow how far the mouth is from the chosen vowel's own shape (zero at the
  // prototype), so they shade the vowel instead of closing the voice's lips on an already-round oo.
  const follow = ctx.num('follow', 0.6)
  const proto = VOWEL_SHAPES.find((v) => v.ipa === st.ipa)
  const lim = (v: number) => Math.max(-0.45, Math.min(0.45, v))
  const glide = ctx.num('glide', 0.08)
  const shape: Record<string, number> = r && proto ? {
    jawSet: lim((r.open - proto.open) * 1.4 * follow),
    lipOpen: lim((r.open - proto.open) * follow),
    lipRound: lim(((r.round - proto.round) - (r.spread - proto.spread) * 0.6) * follow),
    tongueFront: lim(((r.spread - proto.spread) - (r.round - proto.round)) * 0.6 * follow),
    tongueHigh: lim((proto.open - r.open) * 0.8 * follow),
    glide,
  } : { jawSet: 0, lipOpen: 0, lipRound: 0, tongueFront: 0, tongueHigh: 0, glide }

  if (on && idx >= 0) {
    if (!vocalHeld(ctx.nodeId)) {
      vocalKeyDown(ctx.nodeId, { text: st.ipa, ipa: st.ipa, onset: [], nucleus: [idx], coda: [] }, note, 0.85, false)
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
