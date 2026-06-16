/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * EmulatorJS loader — boots a libretro core via EmulatorJS, feeds controller input
 * through gameManager.simulateInput, and exposes the emulator's canvas + audio so
 * LATCH can route them as a texture/audio output.
 *
 * EmulatorJS drives everything through global window.EJS_* and a single
 * window.EJS_emulator, so only ONE emulator may run at a time (the node enforces
 * this). Adapted from the doot-games retro-arcade integration.
 */

interface EJSWindow extends Window {
  EJS_player?: string
  EJS_core?: string
  EJS_gameUrl?: string
  EJS_gameName?: string
  EJS_pathtodata?: string
  EJS_startOnLoaded?: boolean
  EJS_threads?: boolean
  EJS_volume?: number
  EJS_color?: string
  EJS_onGameStart?: () => void
  EJS_emulator?: any
}

export interface EmulatorBootOptions {
  core: string
  gameUrl: string
  gameName?: string
  pathToData: string
  volume?: number
  threaded?: boolean
  onStart?: () => void
}

/** Default CDN for the EmulatorJS core/runtime data (path-configurable per node). */
export const DEFAULT_EJS_DATA = 'https://cdn.emulatorjs.org/stable/data/'

let capturePatched = false
let lastAudioTap: MediaStream | null = null
// Context to NOT tap (LATCH's own Tone context); otherwise the tap would capture
// the master mix — wrong audio, and a feedback loop once the emulator's audio
// output is routed back to the master. Set by the emulation executor.
let excludedContext: BaseAudioContext | null = null

/** Exclude an AudioContext (e.g. Tone's) from the emulator audio tap. */
export function setExcludedAudioContext(ctx: BaseAudioContext | null): void {
  excludedContext = ctx
}

/**
 * Patch (once) so the emulator canvas is sampleable as a texture and its audio is
 * tappable. EmulatorJS renders WebGL without preserveDrawingBuffer (→ black when
 * sampled) and plays via Web Audio (no media element), so we force the flag and
 * tap a MediaStreamAudioDestinationNode on connect-to-destination.
 */
function patchForCapture(): void {
  if (capturePatched || typeof HTMLCanvasElement === 'undefined') return
  capturePatched = true

  const proto = HTMLCanvasElement.prototype
  const origGetContext = proto.getContext
  proto.getContext = function (this: HTMLCanvasElement, type: string, attrs?: any) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      attrs = { ...(attrs || {}), preserveDrawingBuffer: true }
    }
    return (origGetContext as any).call(this, type, attrs)
  } as any

  if (typeof AudioNode !== 'undefined') {
    const aproto = AudioNode.prototype
    const origConnect = aproto.connect
    aproto.connect = function (this: AudioNode, dest: any, ...rest: any[]) {
      try {
        const ctx = this.context as any
        if (ctx && ctx !== excludedContext && dest === ctx.destination && typeof ctx.createMediaStreamDestination === 'function') {
          const tap = ctx.__latchTap ?? (ctx.__latchTap = ctx.createMediaStreamDestination())
          lastAudioTap = tap.stream
          ;(origConnect as any).call(this, tap)
        }
      } catch {
        /* never let the tap break real audio routing */
      }
      return (origConnect as any).call(this, dest, ...rest)
    } as any
  }
}

export class EmulatorJSLoader {
  private container: HTMLElement
  private playerId: string
  private loaderScript: HTMLScriptElement | null = null
  private ready = false

  constructor(container: HTMLElement) {
    this.container = container
    if (!container.id) {
      container.id = `ejs-${Math.random().toString(36).slice(2, 10)}`
    }
    this.playerId = container.id
  }

  boot(opts: EmulatorBootOptions): void {
    patchForCapture()
    this.teardown()
    this.ready = false

    const w = window as EJSWindow
    w.EJS_player = `#${this.playerId}`
    w.EJS_core = opts.core
    w.EJS_gameUrl = opts.gameUrl
    w.EJS_gameName = opts.gameName ?? 'game'
    w.EJS_pathtodata = opts.pathToData
    w.EJS_startOnLoaded = true
    w.EJS_threads = !!(opts.threaded && (globalThis as any).crossOriginIsolated)
    if (opts.volume != null) w.EJS_volume = opts.volume
    w.EJS_onGameStart = () => {
      this.ready = true
      opts.onStart?.()
    }

    const script = document.createElement('script')
    script.src = `${opts.pathToData}loader.js`
    document.body.appendChild(script)
    this.loaderScript = script
  }

  isReady(): boolean {
    return this.ready && !!(window as EJSWindow).EJS_emulator?.gameManager?.simulateInput
  }

  /** Inject one input. Indices/values come from coreMap.controllerStateToEmuInputs. */
  simulate(player: number, index: number, value: number): void {
    const gm = (window as EJSWindow).EJS_emulator?.gameManager
    if (gm?.simulateInput) {
      try {
        gm.simulateInput(player, index, value)
      } catch {
        /* a dropped frame is harmless */
      }
    }
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.container.querySelector('canvas')
  }

  getAudioStream(): MediaStream | null {
    return lastAudioTap
  }

  reset(): void {
    try { (window as EJSWindow).EJS_emulator?.gameManager?.restart?.() } catch { /* ignore */ }
  }

  setVolume(volume: number): void {
    const w = window as EJSWindow
    w.EJS_volume = volume
    try { w.EJS_emulator?.setVolume?.(volume) } catch { /* ignore */ }
  }

  /** Stop + clear the emulator. EmulatorJS has no clean teardown, so reset globals. */
  teardown(): void {
    const w = window as EJSWindow
    try { w.EJS_emulator?.callEvent?.('exit') } catch { /* ignore */ }
    try { w.EJS_emulator?.pause?.() } catch { /* ignore */ }
    this.container.innerHTML = ''
    if (this.loaderScript?.parentNode) {
      this.loaderScript.parentNode.removeChild(this.loaderScript)
    }
    this.loaderScript = null
    delete w.EJS_emulator
    this.ready = false
  }
}
