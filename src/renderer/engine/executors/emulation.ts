/**
 * EmulatorJS node executor.
 *
 * The EmulatorJS container + ROM blob live in the node's Vue component, so the
 * component registers its loader and boot/stop/reset callbacks here on mount. The
 * executor drives those callbacks from the start/stop/reset trigger inlets, injects
 * controller input each frame (diffed), and exposes the emulator canvas + audio as
 * texture/audio outputs.
 */

import * as THREE from 'three'
import * as Tone from 'tone'
import type { NodeExecutorFn, ExecutionContext } from '../ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { coreSpec, controllerStateToEmuInputs } from '@/services/emulation/coreMap'
import { setExcludedAudioContext, type EmulatorJSLoader } from '@/services/emulation/emulatorjs'
import type { ControllerState } from '@/services/input/controllerState'

/** The control surface a node component registers so triggers can drive it. */
export interface EmulatorControls {
  loader: EmulatorJSLoader
  /** Current resolved core key (reactive — follows the ROM/system selection). */
  getCoreKey: () => string
  /** Boot (Load) the emulator with the current ROM. */
  onStart: () => void
  /** Tear the emulator down. */
  onStop: () => void
  /** Reset the running game. */
  onReset: () => void
}

interface EmulatorEntry {
  controls: EmulatorControls
  prevInputs: Map<number, Map<number, number>>
  prevTrigger: { start: boolean; stop: boolean; reset: boolean }
  texture?: THREE.Texture
  audioSource?: MediaStreamAudioSourceNode
  audioGain?: Tone.Gain
}

const emulators = new Map<string, EmulatorEntry>()

/** Registered by the node component on mount (one stable loader per node). */
export function registerEmulatorNode(nodeId: string, controls: EmulatorControls): void {
  const existing = emulators.get(nodeId)
  if (existing && existing.controls.loader !== controls.loader) cleanupEntry(existing, false)
  emulators.set(nodeId, {
    controls,
    prevInputs: new Map(),
    prevTrigger: { start: false, stop: false, reset: false },
    texture: existing?.controls.loader === controls.loader ? existing.texture : undefined,
    audioSource: existing?.controls.loader === controls.loader ? existing.audioSource : undefined,
    audioGain: existing?.controls.loader === controls.loader ? existing.audioGain : undefined,
  })
}

export function unregisterEmulator(nodeId: string): void {
  const entry = emulators.get(nodeId)
  if (entry) {
    cleanupEntry(entry, true)
    emulators.delete(nodeId)
  }
}

function isTrigger(v: unknown): boolean {
  return v === true || v === 1 || (typeof v === 'number' && v > 0)
}

export const emulatorExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  // Keep LATCH's Tone context out of the emulator audio tap (idempotent, must be set
  // before the emulator's audio connects so the tap never grabs the master mix).
  setExcludedAudioContext(Tone.getContext().rawContext as unknown as BaseAudioContext)
  const entry = emulators.get(ctx.nodeId)
  if (!entry) {
    outputs.set('running', false)
    outputs.set('texture', null)
    outputs.set('audio', null)
    outputs.set('system', '')
    return outputs
  }

  const { controls } = entry
  const { loader } = controls
  const spec = coreSpec(controls.getCoreKey())

  // start/stop/reset trigger inlets → boot / teardown / reset (rising edge),
  // mirroring the node's Load/Stop/Reset buttons so the graph can drive them.
  const startNow = isTrigger(ctx.inputs.get('start'))
  const stopNow = isTrigger(ctx.inputs.get('stop'))
  const resetNow = isTrigger(ctx.inputs.get('reset'))
  if (startNow && !entry.prevTrigger.start) controls.onStart()
  if (stopNow && !entry.prevTrigger.stop) controls.onStop()
  if (resetNow && !entry.prevTrigger.reset) controls.onReset()
  entry.prevTrigger = { start: startNow, stop: stopNow, reset: resetNow }

  const ready = loader.isReady()

  // Inject each controller seat the core supports, diffing vs the previous frame.
  if (ready) {
    for (let seat = 0; seat < spec.maxPlayers; seat++) {
      const cs = ctx.inputs.get(`controller${seat}`) as ControllerState | undefined
      if (!cs || !cs.buttons) continue
      const next = controllerStateToEmuInputs(spec, cs)
      const prev = entry.prevInputs.get(seat) ?? new Map<number, number>()
      const indices = new Set<number>([...next.keys(), ...prev.keys()])
      for (const idx of indices) {
        const nv = next.get(idx) ?? 0
        if (nv !== (prev.get(idx) ?? 0)) loader.simulate(seat, idx, nv)
      }
      entry.prevInputs.set(seat, next)
    }
  }

  // Texture output from the emulator canvas.
  const canvas = ready ? loader.getCanvas() : null
  if (canvas) {
    const renderer = getThreeShaderRenderer()
    if (!entry.texture) entry.texture = renderer.createTexture(canvas)
    else renderer.updateTexture(entry.texture, canvas)
    outputs.set('texture', entry.texture)
  } else {
    outputs.set('texture', entry.texture ?? null)
  }

  // Audio output: bridge the emulator's captured MediaStream into Tone's context once.
  if (ready && !entry.audioGain) {
    const stream = loader.getAudioStream()
    if (stream && stream.getAudioTracks().length > 0) {
      try {
        const rawCtx = Tone.getContext().rawContext as unknown as AudioContext
        const src = rawCtx.createMediaStreamSource(stream)
        const gain = new Tone.Gain(1)
        Tone.connect(src, gain)
        entry.audioSource = src
        entry.audioGain = gain
      } catch {
        /* audio bridge is best-effort */
      }
    }
  }
  outputs.set('audio', entry.audioGain ?? null)
  outputs.set('running', ready)
  outputs.set('system', spec.label)
  return outputs
}

function cleanupEntry(entry: EmulatorEntry, teardownLoader: boolean): void {
  if (entry.texture) {
    try { entry.texture.dispose() } catch { /* ignore */ }
    entry.texture = undefined
  }
  if (entry.audioGain) {
    try { entry.audioGain.dispose() } catch { /* ignore */ }
    entry.audioGain = undefined
  }
  if (entry.audioSource) {
    try { entry.audioSource.disconnect() } catch { /* ignore */ }
    entry.audioSource = undefined
  }
  if (teardownLoader) {
    try { entry.controls.loader.teardown() } catch { /* ignore */ }
  }
}

export function gcEmulationState(validNodeIds: Set<string>): void {
  for (const [id, entry] of emulators) {
    if (!validNodeIds.has(id)) {
      cleanupEntry(entry, true)
      emulators.delete(id)
    }
  }
}

export function disposeAllEmulationNodes(): void {
  for (const entry of emulators.values()) cleanupEntry(entry, true)
  emulators.clear()
}
