/**
 * Shared plumbing for nodes that draw a 2D overlay over a video frame (Blob Tracker, Tracking
 * Overlay): turn whatever arrives on a texture port into something drawImage() accepts, and keep
 * one output canvas + THREE texture per node.
 */
import type * as THREE from 'three'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { convertToImageData } from '../ai/shared'

export interface OverlaySurface {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  texture: THREE.Texture | null
  /** Scratch canvas for sources that have no drawable image (render targets). */
  scratch: HTMLCanvasElement | null
}

const isDrawable = (v: unknown): v is CanvasImageSource =>
  (typeof HTMLCanvasElement !== 'undefined' && v instanceof HTMLCanvasElement) ||
  (typeof HTMLImageElement !== 'undefined' && v instanceof HTMLImageElement) ||
  (typeof HTMLVideoElement !== 'undefined' && v instanceof HTMLVideoElement) ||
  (typeof ImageBitmap !== 'undefined' && v instanceof ImageBitmap)

/** Pixel size of a drawable (0 when it has no frame yet). */
export function sizeOf(src: CanvasImageSource): { w: number; h: number } {
  if (src instanceof HTMLVideoElement) return { w: src.videoWidth, h: src.videoHeight }
  if (src instanceof HTMLImageElement) return { w: src.naturalWidth, h: src.naturalHeight }
  const s = src as { width?: number; height?: number }
  return { w: Number(s.width) || 0, h: Number(s.height) || 0 }
}

/**
 * A drawable for a texture-port value: a video/canvas/image directly, a THREE texture's own image
 * when it has one, otherwise a GPU readback into the surface's scratch canvas.
 */
export function drawableOf(input: unknown, surface: OverlaySurface): CanvasImageSource | null {
  if (!input) return null
  if (isDrawable(input)) return sizeOf(input).w > 0 ? input : null
  const img = (input as { image?: unknown }).image
  if (isDrawable(img) && sizeOf(img).w > 0) return img
  const data = convertToImageData(input)
  if (!data || data.width === 0) return null
  if (!surface.scratch) surface.scratch = document.createElement('canvas')
  surface.scratch.width = data.width
  surface.scratch.height = data.height
  surface.scratch.getContext('2d')?.putImageData(data, 0, 0)
  return surface.scratch
}

export function createSurface(): OverlaySurface {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 480
  return { canvas, ctx: canvas.getContext('2d')!, texture: null, scratch: null }
}

/** Size the output canvas to the source (capped so a 4K camera stays cheap). */
export function fitSurface(surface: OverlaySurface, w: number, h: number, maxW = 1280): void {
  const scale = w > maxW ? maxW / w : 1
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))
  if (surface.canvas.width !== cw || surface.canvas.height !== ch) {
    surface.canvas.width = cw
    surface.canvas.height = ch
  }
}

/** Upload the canvas to the node's texture (created on first use). */
export function publish(surface: OverlaySurface): THREE.Texture {
  const renderer = getThreeShaderRenderer()
  if (surface.texture) renderer.updateTexture(surface.texture, surface.canvas)
  else surface.texture = renderer.createTexture(surface.canvas)
  return surface.texture
}

export function disposeSurface(surface: OverlaySurface): void {
  try { surface.texture?.dispose() } catch { /* ignore */ }
  surface.texture = null
  surface.canvas.width = 0
  surface.canvas.height = 0
  if (surface.scratch) { surface.scratch.width = 0; surface.scratch.height = 0 }
}

/** Small monospace label with a dark backing so it reads on any frame. */
export function techLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size = 11): void {
  ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`
  const w = ctx.measureText(text).width
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(x - 2, y - size, w + 4, size + 4)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}
