import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineNodeState } from '@/engine/nodeState'
import {
  CALIBRATION_STEPS, averageFeatures, buildCalibration, mouthFeatures, parseCalibration, readTongue,
  type Calibration, type Features,
} from '../bellows-mouth-voice/mouthFeatures'
import { createSurface, disposeSurface, drawableOf, sizeOf, type OverlaySurface } from '../../visual/overlayCanvas'

/**
 * Mouth Calibrate: a guided run that records the person's own mouth at rest and on five vowels
 * (ah, ee, oo, oh, eh), so Mouth Voice matches THEIR shapes instead of an average face. The result
 * is saved in the node (it travels with the flow) and comes out of Calibration.
 */
const definition: NodeDefinition = {
  id: 'mouth-calibrate',
  name: 'Mouth Calibrate',
  version: '1.0.0',
  category: 'audio',
  description: 'Records your mouth on a few vowels so Mouth Voice reads your face, not an average one',
  icon: 'scan-face',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'blendshapes', type: 'data', label: 'Face Blendshapes' },
    { id: 'landmarks', type: 'data', label: 'Face Landmarks' },
    { id: 'video', type: 'video', label: 'Video (tongue reading)' },
    { id: 'start', type: 'trigger', label: 'Start' },
  ],
  outputs: [
    { id: 'calibration', type: 'data', label: 'Calibration' },
    { id: 'prompt', type: 'string', label: 'Prompt' },
    { id: 'progress', type: 'number', label: 'Progress' },
    { id: 'calibrated', type: 'boolean', label: 'Calibrated' },
    { id: 'done', type: 'trigger', label: 'Done' },
  ],
  controls: [
    { id: 'calibrate', type: 'toggle', label: 'Calibrate Now', default: false, description: 'Turn on to start the guided run; it switches itself off when done.' },
    { id: 'holdSeconds', type: 'slider', label: 'Hold Each Shape (s)', default: 1.5, props: { min: 0.8, max: 4, step: 0.1 } },
    { id: 'readTongue', type: 'toggle', label: 'Record Tongue (experimental)', default: false, description: 'Also record the tongue reading; match it with Read Tongue on in Mouth Voice.' },
    { id: 'saved', type: 'text', label: 'Saved Calibration', default: '', description: 'Filled in by the run. Clear it to forget the calibration.' },
  ],
  info: {
    overview:
      'Teaches Mouth Voice your mouth. Turn on Calibrate Now (or pulse Start) and follow the Prompt: relax, then say and hold AH, EE, OO, OH and EH. Each shape is held for a moment while the node averages what the camera sees. The result is saved inside the node, so it stays with the flow, and comes out of Calibration: wire it into Mouth Voice. Run it again any time (new lighting, different person).',
    tips: [
      'Wire Prompt into a Tracking Overlay Label so the instructions show over the video (it goes empty once calibrated).',
      'Exaggerate a little and keep your head still while each shape is held.',
      'Wire the same Landmarks into both nodes: calibration and playing must see the same features.',
    ],
    pairsWith: ['bellows-mouth-voice', 'mediapipe-face', 'tracking-overlay'],
  },
  tags: ['calibrate', 'mouth', 'face', 'vowel', 'voice', 'mediapipe', 'training'],
}

const READY_S = 1.2

interface CalState {
  running: boolean
  step: number
  phase: 'ready' | 'hold'
  phaseAt: number
  frames: Features[]
  shapes: Record<string, Features>
  lastToggle: boolean
  savedKey: string
  saved: Calibration | null
  surface: OverlaySurface | null
}

const calState = defineNodeState<CalState>({
  label: 'mouth-calibrate',
  dispose: (st) => { if (st.surface) disposeSurface(st.surface) },
})

const round4 = (f: Features): Features =>
  Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Math.round((v as number) * 1e4) / 1e4])) as Features

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const st = calState.getOrCreate(ctx.nodeId, () => ({
    running: false, step: 0, phase: 'ready', phaseAt: 0, frames: [], shapes: {},
    lastToggle: false, savedKey: '\u0000', saved: null, surface: null,
  }))
  const now = performance.now() / 1000
  const out = new Map<string, unknown>([['done', 0]])

  const savedRaw = ctx.str('saved', '')
  if (savedRaw !== st.savedKey) { st.savedKey = savedRaw; st.saved = parseCalibration(savedRaw) }

  const toggle = ctx.bool('calibrate', false)
  const rising = toggle && !st.lastToggle
  if (st.running && st.lastToggle && !toggle) st.running = false // switched off mid-run: cancel
  st.lastToggle = toggle
  if (!st.running && (rising || ctx.trig('start'))) {
    Object.assign(st, { running: true, step: 0, phase: 'ready', phaseAt: now, frames: [], shapes: {} })
  }

  const raw = ctx.inputs.get('blendshapes')
  const b = raw && typeof raw === 'object' && Object.keys(raw as object).length > 0 ? (raw as Record<string, number>) : null

  // Short prompts: they are drawn over the video. Empty once calibrated, so a label can show other text.
  let prompt = st.saved ? '' : 'NOT CALIBRATED: turn on Calibrate Now'
  let progress = st.saved ? 1 : 0

  if (st.running) {
    const step = CALIBRATION_STEPS[st.step]
    const hold = ctx.num('holdSeconds', 1.5)
    const t = now - st.phaseAt
    progress = (st.step + (st.phase === 'hold' ? Math.min(1, t / hold) : 0)) / CALIBRATION_STEPS.length
    if (st.phase === 'ready') {
      prompt = `${st.step + 1}/${CALIBRATION_STEPS.length} get ready: ${step.short}`
      if (t >= READY_S) { st.phase = 'hold'; st.phaseAt = now; st.frames = [] }
    } else {
      if (b) {
        let tongue: number | null = null
        if (ctx.bool('readTongue', false)) {
          const v = ctx.inputs.get('video')
          if (v) {
            st.surface ??= createSurface()
            const src = drawableOf(v, st.surface)
            if (src) { const { w, h } = sizeOf(src); tongue = readTongue(src, ctx.inputs.get('landmarks'), w, h) }
          }
        }
        st.frames.push(mouthFeatures(b, ctx.inputs.get('landmarks'), tongue))
      }
      prompt = b ? `${st.step + 1}/${CALIBRATION_STEPS.length} hold ${step.short} ●` : 'LOOK AT THE CAMERA'
      if (t >= hold) {
        if (st.frames.length < 5) {
          st.phaseAt = now // not enough of the face seen: hold this shape again
        } else {
          st.shapes[step.id] = averageFeatures(st.frames)
          st.step++
          st.phase = 'ready'
          st.phaseAt = now
          if (st.step >= CALIBRATION_STEPS.length) {
            st.running = false
            const cal = buildCalibration(st.shapes)
            if (cal) {
              const tidy: Calibration = {
                ...cal, rest: round4(cal.rest), scale: round4(cal.scale),
                vowels: Object.fromEntries(Object.entries(cal.vowels).map(([k, f]) => [k, round4(f)])),
              }
              const json = JSON.stringify(tidy)
              st.saved = tidy
              st.savedKey = json
              out.set('_controlUpdates', { saved: json, calibrate: false })
              out.set('done', 1)
              prompt = ''
              progress = 1
            } else {
              out.set('_controlUpdates', { calibrate: false })
              prompt = 'FAILED: face not seen, try again'
            }
          }
        }
      }
    }
  }

  out.set('calibration', st.saved)
  out.set('prompt', prompt)
  out.set('progress', progress)
  out.set('calibrated', !!st.saved)
  return out
}

export default defineNode({ definition, executor })
