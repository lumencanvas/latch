import { markRaw } from 'vue'
import * as THREE from 'three'
import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { EscPosPrinterAdapter, type PrinterTransport } from '@/services/connections/adapters/EscPosPrinterAdapter'
import { buildPrintJob, type DitherMode } from '@/services/ble/escpos/escpos'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { printerState, disposePrinter, type PrinterState } from './printerState'
import PrintPreview from './PrintPreview.vue'

// ── Source compositing (image/texture or text → ImageData at print width) ──
let work: HTMLCanvasElement | null = null
let texScratch: HTMLCanvasElement | null = null
function workCanvas(): HTMLCanvasElement {
  if (!work) work = document.createElement('canvas')
  return work
}

/** Draw a THREE.Texture / canvas / image / video / bitmap into `ctx` at (w × h). Returns success. */
function drawInput(input: unknown, ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  if (input instanceof THREE.Texture) {
    if (!texScratch) texScratch = document.createElement('canvas')
    const img = input.image as { width?: number; height?: number } | undefined
    texScratch.width = img?.width || w
    texScratch.height = img?.height || h
    try {
      getThreeShaderRenderer().renderToCanvas(input, texScratch)
      ctx.drawImage(texScratch, 0, 0, w, h)
      return true
    } catch {
      return false
    }
  }
  if (
    input instanceof HTMLCanvasElement || input instanceof HTMLImageElement ||
    input instanceof HTMLVideoElement || input instanceof ImageBitmap
  ) {
    ctx.drawImage(input as CanvasImageSource, 0, 0, w, h)
    return true
  }
  if (input instanceof ImageData) {
    // Blit then rescale via a scratch (putImageData ignores transforms).
    if (!texScratch) texScratch = document.createElement('canvas')
    texScratch.width = input.width
    texScratch.height = input.height
    texScratch.getContext('2d')?.putImageData(input, 0, 0)
    ctx.drawImage(texScratch, 0, 0, w, h)
    return true
  }
  return false
}

function sourceDims(input: unknown): { w: number; h: number } | null {
  if (input instanceof THREE.Texture) {
    const img = input.image as { width?: number; height?: number; videoWidth?: number; videoHeight?: number } | undefined
    if (img instanceof HTMLVideoElement) return img.videoWidth ? { w: img.videoWidth, h: img.videoHeight } : null
    if (img?.width) return { w: img.width, h: img.height || img.width }
    // A render-target / GPU texture has no sized `.image` — renderToCanvas can still read it;
    // assume a square so it prints (scaled to the print width) instead of silently blanking.
    return { w: 512, h: 512 }
  }
  if (input instanceof HTMLVideoElement) return input.videoWidth ? { w: input.videoWidth, h: input.videoHeight } : null
  if (input instanceof HTMLCanvasElement || input instanceof HTMLImageElement || input instanceof ImageBitmap || input instanceof ImageData) return { w: (input as { width: number }).width, h: (input as { height: number }).height }
  return null
}

function composeSource(image: unknown, text: string, width: number, fontPx: number): ImageData | null {
  const canvas = workCanvas()
  const dims = sourceDims(image)
  if (dims && dims.w > 0) {
    const h = Math.max(1, Math.round((width * dims.h) / dims.w))
    canvas.width = width
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, h)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    if (!drawInput(image, ctx, width, h)) return null
    return ctx.getImageData(0, 0, width, h)
  }
  if (text && text.trim()) {
    return renderText(canvas, text, width, fontPx)
  }
  return null
}

/** Word-wrap `text` at `fontPx` into a `width`-wide black-on-white bitmap. */
function renderText(canvas: HTMLCanvasElement, text: string, width: number, fontPx: number): ImageData {
  const pad = 8
  const lineH = Math.round(fontPx * 1.35)
  const measure = canvas.getContext('2d')!
  measure.font = `${fontPx}px monospace`
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(' ')) {
      const trial = line ? `${line} ${word}` : word
      if (measure.measureText(trial).width > width - pad * 2 && line) { lines.push(line); line = word }
      else line = trial
    }
    lines.push(line)
  }
  canvas.width = width
  canvas.height = Math.max(lineH, lines.length * lineH + pad * 2)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000'
  ctx.font = `${fontPx}px monospace`
  ctx.textBaseline = 'top'
  lines.forEach((l, i) => ctx.fillText(l, pad, pad + i * lineH))
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

const definition: NodeDefinition = {
  id: 'thermal-printer',
  name: 'Thermal Printer',
  version: '1.0.0',
  category: 'devices',
  description: 'Print images, textures, or text to a BLE ESC/POS thermal printer, with a live dithered preview',
  icon: 'printer',
  platforms: ['web', 'electron'],
  requires: ['bluetooth'],
  component: markRaw(PrintPreview),
  inputs: [
    { id: 'image', type: 'texture', label: 'Image' },
    { id: 'text', type: 'string', label: 'Text' },
    { id: 'print', type: 'trigger', label: 'Print' },
    { id: 'feed', type: 'trigger', label: 'Feed' },
  ],
  outputs: [
    { id: 'connected', type: 'boolean', label: 'Connected' },
    { id: 'ready', type: 'boolean', label: 'Ready' },
    { id: 'printing', type: 'boolean', label: 'Printing' },
    { id: 'status', type: 'string', label: 'Status' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'deviceId', type: 'ble-pair', label: 'Device ID', default: '', props: { placeholder: 'Set by "Add Bluetooth Device"' } },
    { id: 'transport', type: 'select', label: 'Transport', default: 'auto', props: { options: [
      { label: 'Auto (Phomemo / Nordic UART)', value: 'auto' },
      { label: 'Phomemo (FF00)', value: 'phomemo' },
      { label: 'Nordic UART', value: 'nus' },
    ] } },
    { id: 'width', type: 'select', label: 'Width', default: '384', props: { options: [
      { label: '384 px (58 mm)', value: '384' },
      { label: '576 px (80 mm)', value: '576' },
    ] } },
    { id: 'dither', type: 'select', label: 'Dither', default: 'floyd', props: { options: [
      { label: 'Floyd–Steinberg', value: 'floyd' },
      { label: 'Atkinson', value: 'atkinson' },
      { label: 'Ordered', value: 'ordered' },
      { label: 'Threshold', value: 'threshold' },
    ] } },
    { id: 'threshold', type: 'number', label: 'Threshold', default: 128, props: { min: 1, max: 254, step: 1 } },
    { id: 'fontSize', type: 'number', label: 'Text Size', default: 24, props: { min: 10, max: 64, step: 2 } },
    { id: 'feedLines', type: 'number', label: 'Feed Lines', default: 3, props: { min: 0, max: 40, step: 1 } },
  ],
  tags: ['printer', 'thermal', 'escpos', 'receipt', 'bluetooth', 'ble', 'phomemo', 'print'],
  info: {
    overview: 'Prints an image, a live texture (shader/webcam/render), or text to a BLE ESC/POS thermal printer (Phomemo M02/T02, ORGBRO X3, and Nordic-UART printers). The preview shows the exact 1-bit dithered output; trigger Print to send it.',
    tips: [
      'Click "Pair device…" on this node to bind a printer, or use the "Add Bluetooth Device" panel to drop a pre-bound node.',
      'Wire a shader or webcam texture into Image to print live visuals; try the Atkinson dither for photos.',
      'The preview IS the print — what you see dithered is exactly what the printer lays down.',
    ],
    pairsWith: ['webcam', 'shader', 'text', 'trigger', 'image-loader'],
  },
}

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const deviceId = (ctx.controls.get('deviceId') as string) ?? ''
  const transport = ((ctx.controls.get('transport') as string) ?? 'auto') as PrinterTransport
  const width = parseInt((ctx.controls.get('width') as string) ?? '384', 10)
  const dither = ((ctx.controls.get('dither') as string) ?? 'floyd') as DitherMode
  const threshold = (ctx.controls.get('threshold') as number) ?? 128
  const fontSize = (ctx.controls.get('fontSize') as number) ?? 24
  const feedLines = (ctx.controls.get('feedLines') as number) ?? 3
  const image = ctx.inputs.get('image')
  const text = (ctx.inputs.get('text') as string) ?? ''
  const printTrig = ctx.inputs.get('print')
  const feedTrig = ctx.inputs.get('feed')

  const outputs = new Map<string, unknown>()
  const emit = (s: PrinterState, connected: boolean, ready: boolean, printing: boolean) => {
    outputs.set('connected', connected)
    outputs.set('ready', ready)
    outputs.set('printing', printing)
    outputs.set('status', s.status)
    outputs.set('error', s.error)
    // Internal: the preview reads the composed source + dither settings each frame.
    outputs.set('_source', s.source)
    outputs.set('_dither', s.dither)
    outputs.set('_threshold', s.threshold)
    outputs.set('_width', s.width)
    return outputs
  }

  let state = printerState.get(ctx.nodeId)
  if (!state) {
    state = { adapter: null, deviceId: '', transport, lastConnectAt: 0, lastComposeAt: 0, source: null, width, dither, threshold, printRequested: false, lastPrintHigh: false, lastFeedHigh: false, status: 'idle', error: null }
    printerState.set(ctx.nodeId, state)
  }
  state.width = width
  state.dither = dither
  state.threshold = threshold

  // Compose the print source from the current inputs (used by the preview + print). Throttled
  // to ~10 fps by TIME (not by source===null): a texture source needs a GPU readback
  // (renderToCanvas + getImageData) that is too costly for the 60 fps loop, and a null result
  // (no input / failed readback) must not bypass the throttle and re-attempt every frame.
  const nowC = Date.now()
  if (nowC - state.lastComposeAt >= 100) {
    state.lastComposeAt = nowC
    state.source = composeSource(image, text, width, fontSize)
  }

  // Web Bluetooth is Chromium-only — feature-detect so the node reports "unsupported"
  // with guidance instead of a confusing adapter connect error on Safari/Firefox.
  if (!('bluetooth' in navigator)) {
    state.status = 'unsupported'
    state.error = 'Web Bluetooth needs Chrome/Edge or the desktop app'
    return emit(state, false, false, false)
  }

  if (!deviceId) {
    if (state.adapter) { disposePrinter(ctx.nodeId); state = { adapter: null, deviceId: '', transport, lastConnectAt: 0, lastComposeAt: state.lastComposeAt, source: state.source, width, dither, threshold, printRequested: false, lastPrintHigh: false, lastFeedHigh: false, status: 'no device', error: 'No device — click "Pair device…" to connect a printer' }; printerState.set(ctx.nodeId, state) }
    else { state.status = 'no device'; state.error = 'No device — click "Pair device…" to connect a printer' }
    return emit(state, false, false, false)
  }

  if (!state.adapter || state.deviceId !== deviceId || state.transport !== transport) {
    if (state.adapter) state.adapter.dispose()
    // autoReconnect:false — the executor's canConnect()-throttled loop below owns
    // reconnection; adapter autoReconnect would trap drops in 'reconnecting' and
    // starve the executor retry (see muse-eeg for the rationale).
    state.adapter = new EscPosPrinterAdapter(ctx.nodeId, { id: ctx.nodeId, name: 'Thermal Printer', protocol: 'ble', deviceId, transport, autoConnect: false, autoReconnect: false, reconnectDelay: 2000, maxReconnectAttempts: 0 })
    state.deviceId = deviceId
    state.transport = transport
    state.lastConnectAt = 0
    state.error = null
  }
  const adapter = state.adapter

  // Throttled, state-machine-guarded gesture-free connect (fires + retries, never storms).
  const now = Date.now()
  if (adapter.canConnect() && now - state.lastConnectAt >= 2000) {
    state.lastConnectAt = now
    const a = adapter
    a.connect().catch((e) => { const s = printerState.get(ctx.nodeId); if (s && s.adapter === a) s.error = e instanceof Error ? e.message : 'Connection failed' })
  }

  const connected = adapter.status === 'connected'
  state.status = adapter.status

  // Print on a RISING EDGE of the trigger (a held-high trigger must NOT re-print every frame)
  // OR the preview's Print button (printRequested). The request survives until a print is
  // actually dispatched — so a click while still connecting prints once ready, not never.
  const printHigh = printTrig === true || printTrig === 1 || (typeof printTrig === 'number' && printTrig > 0)
  const printEdge = printHigh && !state.lastPrintHigh
  state.lastPrintHigh = printHigh
  if ((printEdge || state.printRequested) && adapter.ready && state.source && !adapter.isPrinting) {
    state.printRequested = false // drain only when actually enqueued
    const a = adapter
    const job = buildPrintJob(state.source.data, state.source.width, state.source.height, { mode: dither, threshold, feed: feedLines })
    a.print(job).catch((e) => { const s = printerState.get(ctx.nodeId); if (s && s.adapter === a) s.error = e instanceof Error ? e.message : 'Print failed' })
  }
  // Feed on a rising edge only, and never mid-print (a queued feed corrupts the raster stream).
  const feedHigh = feedTrig === true || feedTrig === 1 || (typeof feedTrig === 'number' && feedTrig > 0)
  const feedEdge = feedHigh && !state.lastFeedHigh
  state.lastFeedHigh = feedHigh
  if (feedEdge && adapter.ready && !adapter.isPrinting) adapter.feed(feedLines).catch(() => {})

  return emit(state, connected, adapter.ready, adapter.isPrinting)
}

export default defineNode({ definition, executor })
