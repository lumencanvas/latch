import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineNodeState } from '@/engine/nodeState'
import { HAND_CONNECTIONS, POSE_CONNECTIONS, FACE_CONTOURS } from '../../ai/utils/mediapipe-drawing'
import {
  createSurface, disposeSurface, drawableOf, fitSurface, publish, sizeOf, techLabel,
  type OverlaySurface,
} from '../overlayCanvas'

/**
 * Draws MediaPipe landmarks (hands, pose, face) over the video in the styles people post:
 * a thin "tech" skeleton with square joints, bracketed boxes and coordinate read-outs, or a
 * neon glow. Unlike the MediaPipe nodes' own preview overlay, this is a texture you can send to
 * the Main Output and through more effects.
 */
const definition: NodeDefinition = {
  id: 'tracking-overlay',
  name: 'Tracking Overlay',
  version: '1.0.0',
  category: 'visual',
  description: 'Draws hand, body or face tracking over the video as a styled overlay (tech HUD, neon, dots)',
  icon: 'scan-face',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'source', type: 'texture', label: 'Source' },
    { id: 'landmarks', type: 'data', label: 'Landmarks' },
    { id: 'landmarks2', type: 'data', label: 'Landmarks 2' },
    { id: 'label', type: 'string', label: 'Label' },
    { id: 'note', type: 'number', label: 'Note (shown as C4…)' },
  ],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: [
    {
      id: 'style', type: 'select', label: 'Style', default: 'tech',
      props: { options: [
        { value: 'tech', label: 'Tech HUD (lines, squares, read-outs)' },
        { value: 'neon', label: 'Neon glow' },
        { value: 'dots', label: 'Dots only' },
      ] },
    },
    { id: 'color', type: 'color', label: 'Color', default: '#ffffff' },
    { id: 'accent', type: 'color', label: 'Accent', default: '#00ffcc' },
    { id: 'showBox', type: 'toggle', label: 'Bracket Box + Tag', default: true },
    { id: 'showCoords', type: 'toggle', label: 'Fingertip Coordinates', default: true },
    { id: 'web', type: 'toggle', label: 'Fingertip Web', default: true },
    { id: 'lineWidth', type: 'slider', label: 'Line Width', default: 1.5, props: { min: 0.5, max: 6, step: 0.5 } },
    { id: 'dim', type: 'slider', label: 'Dim Video', default: 0.25, props: { min: 0, max: 1, step: 0.05 } },
    { id: 'strings', type: 'number', label: 'Guide Strings', default: 0, props: { min: 0, max: 48, step: 1 }, description: 'Horizontal lines across the video, like harp strings, so you can see where each note is (0 = off).' },
    { id: 'stringsTop', type: 'slider', label: 'Strings Top', default: 0.15, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'stringsBottom', type: 'slider', label: 'Strings Bottom', default: 0.85, props: { min: 0, max: 1, step: 0.01 } },
  ],
  info: {
    overview:
      'Turns tracking data into the overlay look from hand-tracking and body-tracking videos: a skeleton of thin lines with small square joints, a bracketed box tagged with what it is and where, live fingertip coordinates, and a web of lines between all fingertips. Wire a Webcam texture into Source and the Landmarks output of MediaPipe Hand, Pose or Face into Landmarks; it recognises which one it got. Label and Note print big next to the box, for showing the note a gesture plays.',
    tips: [
      'Wire MediaPipe Hand → All Hands into Landmarks to draw both hands and web them together.',
      'Use a second tracker (Pose or Face) on Landmarks 2 to layer body and hands.',
      'Neon looks best with Dim Video around 0.5; Tech HUD with a white Color and a bright Accent.',
    ],
    pairsWith: ['mediapipe-hand', 'mediapipe-pose', 'mediapipe-face', 'webcam', 'main-output', 'blob-track'],
  },
  tags: ['overlay', 'hud', 'tracking', 'skeleton', 'hand', 'pose', 'face', 'landmarks', 'mediapipe', 'touchdesigner'],
}

interface Pt { x: number; y: number; z?: number }

const isPt = (v: unknown): v is Pt => !!v && typeof (v as Pt).x === 'number' && typeof (v as Pt).y === 'number'

/** Accepts one landmark list, a list of lists, or MediaPipe Hand's All Hands objects. */
export function landmarkSets(v: unknown): Pt[][] {
  if (!Array.isArray(v) || v.length === 0) return []
  if (isPt(v[0])) return [v as Pt[]]
  const out: Pt[][] = []
  for (const item of v) {
    if (Array.isArray(item) && isPt(item[0])) out.push(item as Pt[])
    else if (item && Array.isArray((item as { landmarks?: unknown }).landmarks)) {
      const lm = (item as { landmarks: unknown[] }).landmarks
      if (isPt(lm[0])) out.push(lm as Pt[])
    }
  }
  return out
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const noteName = (m: number) => `${NOTE_NAMES[((Math.round(m) % 12) + 12) % 12]}${Math.floor(Math.round(m) / 12) - 1}`
const FINGERTIPS = [4, 8, 12, 16, 20]

interface OverlayState { surface: OverlaySurface }

const overlayState = defineNodeState<OverlayState>({
  label: 'tracking-overlay',
  dispose: (st) => disposeSurface(st.surface),
})

function kindOf(set: Pt[]): 'hand' | 'pose' | 'face' | 'points' {
  if (set.length === 21) return 'hand'
  if (set.length === 33) return 'pose'
  if (set.length >= 468) return 'face'
  return 'points'
}

function drawSet(g: CanvasRenderingContext2D, set: Pt[], idx: number, W: number, H: number, o: {
  style: string; color: string; accent: string; lw: number; box: boolean; coords: boolean
}) {
  const kind = kindOf(set)
  const P = (i: number) => [set[i].x * W, set[i].y * H] as const
  const neon = o.style === 'neon'
  g.save()
  g.lineWidth = o.lw
  g.strokeStyle = neon ? o.accent : o.color
  if (neon) { g.shadowColor = o.accent; g.shadowBlur = 14 }

  if (o.style !== 'dots') {
    g.beginPath()
    if (kind === 'hand' || kind === 'pose') {
      const conns = kind === 'hand' ? HAND_CONNECTIONS : POSE_CONNECTIONS
      for (const [a, b] of conns) {
        if (!set[a] || !set[b]) continue
        const [ax, ay] = P(a); const [bx, by] = P(b)
        g.moveTo(ax, ay); g.lineTo(bx, by)
      }
    } else if (kind === 'face') {
      for (const path of Object.values(FACE_CONTOURS)) {
        path.forEach((i, k) => { if (!set[i]) return; const [x, y] = P(i); if (k === 0) g.moveTo(x, y); else g.lineTo(x, y) })
      }
    }
    g.stroke()
  }

  // joints: hollow squares (tech), glowing dots (neon/dots); face mesh only a sprinkle
  const step = kind === 'face' ? 6 : 1
  for (let i = 0; i < set.length; i += step) {
    const [x, y] = P(i)
    const tip = kind === 'hand' && FINGERTIPS.includes(i)
    if (o.style === 'tech') {
      const s = tip ? 8 : 5
      g.strokeStyle = tip ? o.accent : o.color
      g.strokeRect(x - s / 2, y - s / 2, s, s)
    } else {
      g.fillStyle = tip ? o.accent : (neon ? o.accent : o.color)
      g.beginPath(); g.arc(x, y, tip ? 4 : 2.5, 0, Math.PI * 2); g.fill()
    }
  }
  g.restore()

  if (o.coords && kind === 'hand') {
    for (const i of FINGERTIPS) {
      const [x, y] = P(i)
      techLabel(g, `${set[i].x.toFixed(2)} ${set[i].y.toFixed(2)}`, x + 7, y - 6, o.accent, 9)
    }
  }
  if (o.box) {
    let minX = 1, minY = 1, maxX = 0, maxY = 0
    for (const p of set) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y) }
    const pad = 12
    const x = minX * W - pad, y = minY * H - pad, w = (maxX - minX) * W + pad * 2, h = (maxY - minY) * H + pad * 2
    const c = Math.min(w, h) * 0.18
    g.save()
    g.strokeStyle = o.color
    g.lineWidth = Math.max(1, o.lw)
    g.beginPath()
    g.moveTo(x, y + c); g.lineTo(x, y); g.lineTo(x + c, y)
    g.moveTo(x + w - c, y); g.lineTo(x + w, y); g.lineTo(x + w, y + c)
    g.moveTo(x + w, y + h - c); g.lineTo(x + w, y + h); g.lineTo(x + w - c, y + h)
    g.moveTo(x + c, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h - c)
    g.stroke()
    g.restore()
    const tag = `${kind.toUpperCase()}_${String(idx + 1).padStart(2, '0')}  ${((minX + maxX) / 2).toFixed(2)},${((minY + maxY) / 2).toFixed(2)}`
    techLabel(g, tag, x, Math.max(12, y - 4), o.color, 11)
    return { x, y, w, h }
  }
  return null
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const out = new Map<string, unknown>()
  const st = overlayState.getOrCreate(ctx.nodeId, () => ({ surface: createSurface() }))
  const src = drawableOf(ctx.inputs.get('source'), st.surface)
  const surface = st.surface
  if (src) {
    const { w, h } = sizeOf(src)
    fitSurface(surface, w, h)
  }
  const W = surface.canvas.width
  const H = surface.canvas.height
  const g = surface.ctx
  if (src) g.drawImage(src, 0, 0, W, H)
  else { g.fillStyle = '#000'; g.fillRect(0, 0, W, H) }
  const dim = Math.max(0, Math.min(1, ctx.num('dim', 0.25)))
  if (dim > 0) { g.fillStyle = `rgba(0,0,0,${dim})`; g.fillRect(0, 0, W, H) }

  // Guide strings: evenly spaced lines; the one nearest the fingertip (index tip of the first hand) lights up
  const sets = [...landmarkSets(ctx.inputs.get('landmarks')), ...landmarkSets(ctx.inputs.get('landmarks2'))]
  const nStrings = Math.max(0, Math.min(48, Math.round(ctx.num('strings', 0))))
  if (nStrings > 0) {
    const top = ctx.num('stringsTop', 0.15)
    const bottom = ctx.num('stringsBottom', 0.85)
    const hand = sets.find((s) => s.length === 21)
    const tipY = hand ? hand[8].y : null
    const accent = ctx.str('accent', '#00ffcc')
    g.save()
    for (let i = 0; i < nStrings; i++) {
      const yN = nStrings === 1 ? (top + bottom) / 2 : top + ((bottom - top) * i) / (nStrings - 1)
      const near = tipY !== null && Math.abs(tipY - yN) < Math.abs(bottom - top) / Math.max(1, nStrings - 1) / 2
      g.strokeStyle = near ? accent : 'rgba(255,255,255,0.18)'
      g.lineWidth = near ? 2.5 : 1
      if (near) { g.shadowColor = accent; g.shadowBlur = 12 } else g.shadowBlur = 0
      g.beginPath(); g.moveTo(W * 0.04, yN * H); g.lineTo(W * 0.96, yN * H); g.stroke()
    }
    g.restore()
  }
  const o = {
    style: ctx.str('style', 'tech'),
    color: ctx.str('color', '#ffffff'),
    accent: ctx.str('accent', '#00ffcc'),
    lw: ctx.num('lineWidth', 1.5),
    box: ctx.bool('showBox', true),
    coords: ctx.bool('showCoords', true),
  }

  // web between every fingertip of every hand (and across hands)
  if (ctx.bool('web', true)) {
    const tips = sets.filter((s) => s.length === 21).flatMap((s) => FINGERTIPS.map((i) => s[i]))
    if (tips.length > 1) {
      g.save()
      g.strokeStyle = o.accent
      g.globalAlpha = 0.35
      g.lineWidth = 1
      g.beginPath()
      for (let i = 0; i < tips.length; i++) for (let j = i + 1; j < tips.length; j++) {
        g.moveTo(tips[i].x * W, tips[i].y * H)
        g.lineTo(tips[j].x * W, tips[j].y * H)
      }
      g.stroke()
      g.restore()
    }
  }

  let firstBox: { x: number; y: number; w: number; h: number } | null = null
  sets.forEach((set, i) => {
    const b = drawSet(g, set, i, W, H, o)
    if (!firstBox && b) firstBox = b
  })

  const noteIn = ctx.inputs.get('note')
  const parts = [ctx.str('label', '')]
  if (typeof noteIn === 'number' && Number.isFinite(noteIn) && sets.length > 0) parts.push(noteName(noteIn))
  const big = parts.filter(Boolean).join('  ')
  if (big) {
    const at = firstBox as { x: number; y: number; w: number; h: number } | null
    const x = at ? at.x + at.w + 10 : 16
    const y = at ? at.y + 28 : 40
    g.save()
    g.font = 'bold 28px ui-monospace, SFMono-Regular, Menlo, monospace'
    if (o.style === 'neon') { g.shadowColor = o.accent; g.shadowBlur = 16 }
    g.fillStyle = o.accent
    g.fillText(big, Math.min(x, W - g.measureText(big).width - 8), y)
    g.restore()
  }

  out.set('texture', publish(surface))
  return out
}

export default defineNode({ definition, executor })
