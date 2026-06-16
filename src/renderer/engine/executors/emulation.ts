/**
 * EmulatorJS node executor.
 *
 * The EmulatorJS container lives in the node's Vue component (it owns the DOM), so
 * the component creates the loader and registers it here; the executor reads it each
 * frame to inject controller input (diffed) and to expose the emulator canvas + audio
 * as texture/audio outputs. The start/stop/reset trigger inlets pause/resume/reset the
 * already-loaded emulator (Load happens from the editor, which has the ROM blob).
 */

import * as THREE from 'three'
import * as Tone from 'tone'
import type { NodeExecutorFn, ExecutionContext } from '../ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { coreSpec, controllerStateToEmuInputs } from '@/services/emulation/coreMap'
import { setExcludedAudioContext, type EmulatorJSLoader } from '@/services/emulation/emulatorjs'
import type { ControllerState } from '@/services/input/controllerState'

interface EmulatorEntry {
  loader: EmulatorJSLoader
  coreKey: string
  prevInputs: Map<number, Map<number, number>>
  prevTrigger: { start: boolean; stop: boolean; reset: boolean }
  texture?: THREE.Texture
  audioSource?: MediaStreamAudioSourceNode
  audioGain?: Tone.Gain
}

const emulators = new Map<string, EmulatorEntry>()

/** Called by the node component once it has booted (or rebooted) its loader. */
export function registerEmulator(nodeId: string, loader: EmulatorJSLoader, coreKey: string): void {
  const existing = emulators.get(nodeId)
  if (existing && existing.loader !== loader) cleanupEntry(existing, false)
  emulators.set(nodeId, {
    loader,
    coreKey,
    prevInputs: new Map(),
    prevTrigger: { start: false, stop: false, reset: false },
    texture: existing?.loader === loader ? existing.texture : undefined,
    audioSource: existing?.loader === loader ? existing.audioSource : undefined,
    audioGain: existing?.loader === loader ? existing.audioGain : undefined,
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

  const { loader } = entry
  const spec = coreSpec(entry.coreKey)

  // start/stop/reset trigger inlets → resume/pause/reset (rising edge).
  const startNow = isTrigger(ctx.inputs.get('start'))
  const stopNow = isTrigger(ctx.inputs.get('stop'))
  const resetNow = isTrigger(ctx.inputs.get('reset'))
  if (startNow && !entry.prevTrigger.start) loader.resume()
  if (stopNow && !entry.prevTrigger.stop) loader.pause()
  if (resetNow && !entry.prevTrigger.reset) loader.reset()
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
    try { entry.loader.teardown() } catch { /* ignore */ }
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
