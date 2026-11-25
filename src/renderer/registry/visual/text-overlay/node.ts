import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineNodeState } from '@/engine/nodeState'
import { createSurface, disposeSurface, drawableOf, fitSurface, publish, sizeOf, type OverlaySurface } from '../overlayCanvas'

/**
 * Text Overlay: words and numbers drawn over any texture (a score over a game, a caption over the
 * webcam, a title over a visual). {value} and {value2} in the text are replaced by the inputs.
 */
const definition: NodeDefinition = {
  id: 'text-overlay',
  name: 'Text Overlay',
  version: '1.0.0',
  category: 'visual',
  description: 'Draw text and live numbers over a texture: scores, captions, titles',
  icon: 'type',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'source', type: 'texture', label: 'Source' },
    { id: 'text', type: 'string', label: 'Text' },
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'value2', type: 'any', label: 'Value 2' },
    { id: 'subtitle', type: 'string', label: 'Subtitle' },
  ],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: [
    { id: 'text', type: 'text', label: 'Text', default: 'SCORE {value}', props: { placeholder: 'Use {value} and {value2}' } },
    { id: 'subtitle', type: 'text', label: 'Subtitle', default: '', props: { placeholder: 'A smaller second line' } },
    {
      id: 'position', type: 'select', label: 'Position', default: 'top-left',
      props: { options: ['top-left', 'top', 'top-right', 'center', 'bottom-left', 'bottom', 'bottom-right'] },
    },
    { id: 'size', type: 'number', label: 'Size', default: 36, props: { min: 8, max: 300, step: 1 } },
    { id: 'font', type: 'select', label: 'Font', default: 'mono', props: { options: ['mono', 'sans', 'serif'] } },
    { id: 'color', type: 'color', label: 'Color', default: '#ffffff' },
    { id: 'glow', type: 'color', label: 'Glow', default: '#00e5ff' },
    { id: 'glowAmount', type: 'slider', label: 'Glow Amount', default: 0.6, props: { min: 0, max: 1, step: 0.05 } },
    { id: 'box', type: 'toggle', label: 'Backing Box', default: false },
    { id: 'decimals', type: 'number', label: 'Number Decimals', default: 0, props: { min: 0, max: 6, step: 1 } },
  ],
  info: {
    overview:
      'Draws text over the Source texture (or over black when unwired). {value} and {value2} in the text are replaced by the Value inputs, so “SCORE {value}” with a Counter wired in becomes a live score. A Subtitle input adds a smaller second line, and Text wired in replaces the Text control.',
    tips: [
      'Put it last before Main Output so the text sits on top of everything.',
      'Center position with a big size makes a title or GAME OVER screen.',
      'Numbers are rounded to Number Decimals.',
    ],
    pairsWith: ['render-3d', 'counter', 'main-output', 'webcam', 'template'],
  },
  tags: ['text', 'overlay', 'hud', 'score', 'caption', 'title', 'label', 'type'],
}

const textState = defineNodeState<{ surface: OverlaySurface }>({
  label: 'text-overlay',
  dispose: (st) => disposeSurface(st.surface),
})

const FONTS: Record<string, string> = {
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  sans: 'system-ui, -apple-system, Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
}

/** Fill {value} / {value2}; numbers rounded. Pure (tested). */
export function fillText(t: string, v: unknown, v2: unknown, decimals: number): string {
  const fmt = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(decimals) : x == null ? '' : String(x))
  return t.replace(/\{value2\}/g, fmt(v2)).replace(/\{value\}/g, fmt(v))
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const st = textState.getOrCreate(ctx.nodeId, () => ({ surface: createSurface() }))
  const surface = st.surface
  const src = drawableOf(ctx.inputs.get('source'), surface)
  if (src) { const { w, h } = sizeOf(src); fitSurface(surface, w, h) }
  else if (surface.canvas.width !== 1280) fitSurface(surface, 1280, 720)
  const W = surface.canvas.width
  const H = surface.canvas.height
  const g = surface.ctx
  if (src) g.drawImage(src, 0, 0, W, H)
  else { g.fillStyle = '#000'; g.fillRect(0, 0, W, H) }

  const textIn = ctx.inputs.get('text')
  const template = typeof textIn === 'string' ? textIn : ctx.str('text', 'SCORE {value}')
  const line = fillText(template, ctx.inputs.get('value'), ctx.inputs.get('value2'), Math.max(0, Math.round(ctx.num('decimals', 0))))
  const sub = ctx.inputs.get('subtitle')
  const subtitle = fillText(typeof sub === 'string' ? sub : ctx.str('subtitle', ''), ctx.inputs.get('value'), ctx.inputs.get('value2'), Math.max(0, Math.round(ctx.num('decimals', 0))))
  // Size is in pixels at 720p, scaled with the texture so it looks the same at any resolution.
  const size = ctx.num('size', 36) * (H / 720)
  const font = FONTS[ctx.str('font', 'mono')] ?? FONTS.mono
  const pos = ctx.str('position', 'top-left')
  const pad = Math.max(12, size * 0.6)

  if (line || subtitle) {
    g.save()
    g.font = `bold ${size}px ${font}`
    const w1 = g.measureText(line).width
    g.font = `${size * 0.5}px ${font}`
    const w2 = subtitle ? g.measureText(subtitle).width : 0
    const bw = Math.max(w1, w2)
    const bh = size + (subtitle ? size * 0.65 : 0)
    const align = pos.endsWith('left') ? 'left' : pos.endsWith('right') ? 'right' : 'center'
    const x = align === 'left' ? pad : align === 'right' ? W - pad : W / 2
    const top = pos.startsWith('top') ? pad : pos.startsWith('bottom') ? H - pad - bh : (H - bh) / 2
    if (ctx.bool('box', false)) {
      const bx = align === 'left' ? x - pad / 2 : align === 'right' ? x - bw - pad / 2 : x - bw / 2 - pad / 2
      g.fillStyle = 'rgba(0,0,0,0.55)'
      g.fillRect(bx, top - pad / 3, bw + pad, bh + pad * 0.66)
    }
    g.textAlign = align
    g.textBaseline = 'top'
    const glow = ctx.num('glowAmount', 0.6)
    if (glow > 0) { g.shadowColor = ctx.str('glow', '#00e5ff'); g.shadowBlur = size * 0.6 * glow }
    g.fillStyle = ctx.str('color', '#ffffff')
    g.font = `bold ${size}px ${font}`
    g.fillText(line, x, top)
    if (subtitle) { g.font = `${size * 0.5}px ${font}`; g.fillText(subtitle, x, top + size * 1.1) }
    g.restore()
  }

  return new Map<string, unknown>([['texture', publish(surface)]])
}

export default defineNode({ definition, executor })
