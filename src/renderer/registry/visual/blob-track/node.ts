import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineNodeState } from '@/engine/nodeState'
import {
  createSurface, disposeSurface, drawableOf, fitSurface, publish, sizeOf, techLabel,
  type OverlaySurface,
} from '../overlayCanvas'

/**
 * Blob tracking: the "tiny squares and lines on everything that moves" look. The frame is shrunk
 * to a coarse grid, cells that changed (or are bright) are grouped into blobs, and each blob is
 * drawn as a box with an id/coordinate label, linked to its neighbours like a network graph.
 */
const definition: NodeDefinition = {
  id: 'blob-track',
  name: 'Blob Tracker',
  version: '1.0.0',
  category: 'visual',
  description: 'Boxes, labels and connecting lines on everything that moves (the blob-tracking look)',
  icon: 'scan',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'source', type: 'texture', label: 'Source' },
    { id: 'sensitivity', type: 'number', label: 'Sensitivity' },
  ],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'blobs', type: 'data', label: 'Blobs' },
    { id: 'count', type: 'number', label: 'Count' },
    { id: 'activity', type: 'number', label: 'Activity (0–1)' },
    { id: 'x', type: 'number', label: 'Biggest X (0–1)' },
    { id: 'y', type: 'number', label: 'Biggest Y (0–1)' },
    { id: 'onset', type: 'trigger', label: 'New Blob' },
  ],
  controls: [
    {
      id: 'mode', type: 'select', label: 'Track', default: 'motion',
      props: { options: [
        { value: 'motion', label: 'Motion (what changed)' },
        { value: 'bright', label: 'Bright areas' },
        { value: 'dark', label: 'Dark areas' },
      ] },
    },
    { id: 'sensitivity', type: 'slider', label: 'Sensitivity', default: 0.6, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'maxBlobs', type: 'number', label: 'Max Blobs', default: 24, props: { min: 1, max: 64, step: 1 } },
    { id: 'minSize', type: 'number', label: 'Min Blob Size (cells)', default: 2, props: { min: 1, max: 40, step: 1 } },
    {
      id: 'style', type: 'select', label: 'Box Style', default: 'outline',
      props: { options: [
        { value: 'outline', label: 'Outline' },
        { value: 'corners', label: 'Corner brackets' },
        { value: 'invert', label: 'Invert inside' },
        { value: 'fill', label: 'Tinted fill' },
      ] },
    },
    {
      id: 'links', type: 'select', label: 'Lines', default: 'nearest',
      props: { options: [
        { value: 'nearest', label: 'To nearest neighbours' },
        { value: 'chain', label: 'Chain (by id)' },
        { value: 'all', label: 'Everything to everything' },
        { value: 'none', label: 'None' },
      ] },
    },
    {
      id: 'labels', type: 'select', label: 'Labels', default: 'coords',
      props: { options: [
        { value: 'coords', label: 'Id + coordinates' },
        { value: 'id', label: 'Id only' },
        { value: 'none', label: 'None' },
      ] },
    },
    { id: 'color', type: 'color', label: 'Color', default: '#ffffff' },
    { id: 'lineWidth', type: 'slider', label: 'Line Width', default: 1, props: { min: 0.5, max: 4, step: 0.5 } },
    { id: 'showSource', type: 'toggle', label: 'Show Video', default: true },
  ],
  info: {
    overview:
      'The blob-tracking look from TouchDesigner and glitch-art edits: small boxes snap onto whatever moves, each tagged with an id and its coordinates, joined by thin lines like a network graph. Motion mode compares each frame with the last; Bright and Dark track light or shadow instead. The blobs also come out as data (count, activity, the biggest blob\'s position and a trigger on each new blob), so movement can drive sound.',
    tips: [
      'Wire a Webcam texture into Source and Texture into a Main Output for the classic look.',
      'Invert inside and Everything to everything give the busiest, most glitchy result.',
      'Activity (0–1) is how much of the frame is moving: map it to a filter, a volume or a shader.',
      'New Blob fires when something starts moving: wire it to an instrument trigger to play the room.',
    ],
    pairsWith: ['webcam', 'video-player', 'main-output', 'image-fx-rgb-shift', 'bellows-instrument'],
  },
  tags: ['blob', 'tracking', 'motion', 'glitch', 'boxes', 'network', 'graph', 'touchdesigner', 'detection', 'aesthetic'],
}

const GRID_W = 80

interface Blob { id: number; x: number; y: number; w: number; h: number; size: number }

interface BlobState {
  surface: OverlaySurface
  small: HTMLCanvasElement
  smallCtx: CanvasRenderingContext2D
  /** Motion mode: running-average background luma per grid cell. */
  prev: Float32Array | null
  tracked: Blob[]
  nextId: number
  wasActive: boolean
}

const blobState = defineNodeState<BlobState>({
  label: 'blob-track',
  dispose: (st) => {
    disposeSurface(st.surface)
    st.small.width = 0
    st.small.height = 0
  },
})

/** Grid cells above threshold grouped into 4-connected blobs (bounding boxes in cell units). */
function findBlobs(active: Uint8Array, gw: number, gh: number, minSize: number): Omit<Blob, 'id'>[] {
  const seen = new Uint8Array(active.length)
  const out: Omit<Blob, 'id'>[] = []
  const stack: number[] = []
  for (let i = 0; i < active.length; i++) {
    if (!active[i] || seen[i]) continue
    let minX = gw, minY = gh, maxX = 0, maxY = 0, n = 0
    stack.push(i)
    seen[i] = 1
    while (stack.length) {
      const c = stack.pop()!
      const cx = c % gw
      const cy = (c - cx) / gw
      n++
      if (cx < minX) minX = cx
      if (cx > maxX) maxX = cx
      if (cy < minY) minY = cy
      if (cy > maxY) maxY = cy
      const nb = [cx > 0 ? c - 1 : -1, cx < gw - 1 ? c + 1 : -1, cy > 0 ? c - gw : -1, cy < gh - 1 ? c + gw : -1]
      for (const k of nb) if (k >= 0 && active[k] && !seen[k]) { seen[k] = 1; stack.push(k) }
    }
    if (n >= minSize) out.push({ x: (minX + maxX + 1) / 2 / gw, y: (minY + maxY + 1) / 2 / gh, w: (maxX - minX + 1) / gw, h: (maxY - minY + 1) / gh, size: n })
  }
  return out
}

/** Keep ids stable: each new blob takes the id of the nearest previous blob within reach. */
function assignIds(st: BlobState, blobs: Omit<Blob, 'id'>[]): Blob[] {
  const free = [...st.tracked]
  return blobs.map((b) => {
    let best = -1
    let bestD = 0.08
    for (let i = 0; i < free.length; i++) {
      const d = Math.hypot(free[i].x - b.x, free[i].y - b.y)
      if (d < bestD) { bestD = d; best = i }
    }
    const id = best >= 0 ? free.splice(best, 1)[0].id : st.nextId++ % 1000
    return { ...b, id }
  })
}

function drawBlobs(ctx: CanvasRenderingContext2D, W: number, H: number, blobs: Blob[], o: {
  style: string; links: string; labels: string; color: string; lineWidth: number
}) {
  ctx.lineWidth = o.lineWidth
  ctx.strokeStyle = o.color
  // links first, under the boxes
  if (o.links !== 'none' && blobs.length > 1) {
    ctx.save()
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    if (o.links === 'all') {
      const n = Math.min(blobs.length, 16)
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        ctx.moveTo(blobs[i].x * W, blobs[i].y * H)
        ctx.lineTo(blobs[j].x * W, blobs[j].y * H)
      }
    } else if (o.links === 'chain') {
      const byId = [...blobs].sort((a, b) => a.id - b.id)
      ctx.moveTo(byId[0].x * W, byId[0].y * H)
      for (const b of byId.slice(1)) ctx.lineTo(b.x * W, b.y * H)
    } else {
      for (const b of blobs) {
        const near = blobs.filter((c) => c !== b)
          .sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))
          .slice(0, 2)
        for (const c of near) { ctx.moveTo(b.x * W, b.y * H); ctx.lineTo(c.x * W, c.y * H) }
      }
    }
    ctx.stroke()
    ctx.restore()
  }
  for (const b of blobs) {
    const pad = 4
    const x = (b.x - b.w / 2) * W - pad
    const y = (b.y - b.h / 2) * H - pad
    const w = b.w * W + pad * 2
    const h = b.h * H + pad * 2
    if (o.style === 'invert') {
      ctx.save()
      ctx.globalCompositeOperation = 'difference'
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x, y, w, h)
      ctx.restore()
      ctx.strokeRect(x, y, w, h)
    } else if (o.style === 'fill') {
      ctx.save()
      ctx.globalAlpha = 0.25
      ctx.fillStyle = o.color
      ctx.fillRect(x, y, w, h)
      ctx.restore()
      ctx.strokeRect(x, y, w, h)
    } else if (o.style === 'corners') {
      const c = Math.min(w, h) * 0.3
      ctx.beginPath()
      ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y)
      ctx.moveTo(x + w - c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + c)
      ctx.moveTo(x + w, y + h - c); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - c, y + h)
      ctx.moveTo(x + c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - c)
      ctx.stroke()
    } else {
      ctx.strokeRect(x, y, w, h)
    }
    // centre marker
    ctx.fillStyle = o.color
    ctx.fillRect(b.x * W - 2, b.y * H - 2, 4, 4)
    if (o.labels !== 'none') {
      const id = `#${String(b.id).padStart(3, '0')}`
      const text = o.labels === 'coords' ? `${id} ${b.x.toFixed(2)},${b.y.toFixed(2)}` : id
      techLabel(ctx, text, x, Math.max(11, y - 3), o.color, 10)
    }
  }
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const out = new Map<string, unknown>([['count', 0], ['activity', 0], ['x', 0.5], ['y', 0.5], ['onset', 0], ['blobs', []]])
  const st = blobState.getOrCreate(ctx.nodeId, () => {
    const small = document.createElement('canvas')
    return { surface: createSurface(), small, smallCtx: small.getContext('2d', { willReadFrequently: true })!, prev: null, tracked: [], nextId: 1, wasActive: false }
  })
  const src = drawableOf(ctx.inputs.get('source'), st.surface)
  if (!src) {
    out.set('texture', st.surface.texture)
    return out
  }
  const { w: sw, h: sh } = sizeOf(src)
  const gw = GRID_W
  const gh = Math.max(8, Math.round((GRID_W * sh) / Math.max(1, sw)))
  if (st.small.width !== gw || st.small.height !== gh) {
    st.small.width = gw
    st.small.height = gh
    st.prev = null
  }
  st.smallCtx.drawImage(src, 0, 0, gw, gh)
  const px = st.smallCtx.getImageData(0, 0, gw, gh).data
  const luma = new Float32Array(gw * gh)
  for (let i = 0; i < luma.length; i++) luma[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]

  const mode = ctx.str('mode', 'motion')
  const sens = Math.max(0, Math.min(1, ctx.num('sensitivity', 0.6)))
  const active = new Uint8Array(gw * gh)
  let on = 0
  if (mode === 'motion') {
    // Compare with a running-average background, not just the previous frame: at 60 fps two
    // frames barely differ (and a 30 fps camera repeats every other one), so motion would flicker.
    const thr = 60 - sens * 52 // 60 (only big changes) … 8 (any flicker)
    if (!st.prev) st.prev = Float32Array.from(luma)
    const bg = st.prev
    for (let i = 0; i < luma.length; i++) {
      if (Math.abs(luma[i] - bg[i]) > thr) { active[i] = 1; on++ }
      bg[i] += (luma[i] - bg[i]) * 0.15
    }
  } else {
    const thr = mode === 'bright' ? 250 - sens * 120 : 5 + sens * 120
    for (let i = 0; i < luma.length; i++) {
      const hit = mode === 'bright' ? luma[i] > thr : luma[i] < thr
      if (hit) { active[i] = 1; on++ }
    }
  }
  if (mode !== 'motion') st.prev = null

  const maxBlobs = Math.max(1, Math.min(64, Math.round(ctx.num('maxBlobs', 24))))
  const minSize = Math.max(1, Math.round(ctx.num('minSize', 2)))
  const found = findBlobs(active, gw, gh, minSize).sort((a, b) => b.size - a.size).slice(0, maxBlobs)
  const blobs = assignIds(st, found)
  const newBlob = blobs.some((b) => !st.tracked.some((t) => t.id === b.id))
  st.tracked = blobs

  const surface = st.surface
  fitSurface(surface, sw, sh)
  const W = surface.canvas.width
  const H = surface.canvas.height
  const g = surface.ctx
  if (ctx.bool('showSource', true)) g.drawImage(src, 0, 0, W, H)
  else { g.fillStyle = '#000'; g.fillRect(0, 0, W, H) }
  drawBlobs(g, W, H, blobs, {
    style: ctx.str('style', 'outline'),
    links: ctx.str('links', 'nearest'),
    labels: ctx.str('labels', 'coords'),
    color: ctx.str('color', '#ffffff'),
    lineWidth: ctx.num('lineWidth', 1),
  })

  const activity = on / (gw * gh)
  const isActive = blobs.length > 0
  out.set('texture', publish(surface))
  out.set('blobs', blobs)
  out.set('count', blobs.length)
  out.set('activity', activity)
  if (blobs[0]) { out.set('x', blobs[0].x); out.set('y', blobs[0].y) }
  out.set('onset', (newBlob && isActive) || (isActive && !st.wasActive) ? 1 : 0)
  st.wasActive = isActive
  return out
}

export default defineNode({ definition, executor })
