/**
 * Audio shared state, helpers & lifecycle (Workstream B co-location).
 *
 * The Tone.js node backbone (`audioNodes`), the per-node state Maps, the shared helpers
 * (`getOrCreateNode`/`connectEffectInput`/`audioNodeBaseId`), `envelopeExecutor` (used by both
 * the envelope and envelope-visual nodes), and the gc/dispose lifecycle live here so each audio
 * node's executor can co-locate in its own registry/audio/<id>/node.ts. Moved verbatim from
 * engine/executors/audio.ts (now deleted). Store-free leaf — safe to import from a co-located node.ts.
 */

import * as Tone from 'tone'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineLifecycle } from '@/engine/nodeState'

// Store for persistent audio nodes (oscillators, effects, etc.)
export const audioNodes = new Map<string, Tone.ToneAudioNode>()

// Forward declaration for synth state (used by disposeAllAudioNodes)
export interface SynthVoice {
  synth: Tone.Synth | Tone.MonoSynth | Tone.FMSynth | Tone.AMSynth
  note: number
}

export interface SynthState {
  voices: Map<number, SynthVoice>
  instrument: string
  prevGate: boolean
  prevNote: number
}

export const synthState = new Map<string, SynthState>()

/**
 * Get or create a Tone.js node for a given node ID
 * Handles disposed nodes by recreating them
 */
export function getOrCreateNode<T extends Tone.ToneAudioNode>(
  nodeId: string,
  factory: () => T
): T {
  let node = audioNodes.get(nodeId) as T | undefined

  // Check if node exists but was disposed (Tone.js nodes have a disposed property)
  if (node && (node as unknown as { disposed?: boolean }).disposed) {
    audioNodes.delete(nodeId)
    node = undefined
  }

  if (!node) {
    node = factory()
    audioNodes.set(nodeId, node)
  }
  return node
}

/**
 * Dispose of an audio node when no longer needed
 */
export function disposeAudioNode(nodeId: string): void {
  const node = audioNodes.get(nodeId)
  if (node) {
    node.dispose()
    audioNodes.delete(nodeId)
  }
}

/**
 * Dispose all audio nodes and clear ALL state maps
 * This ensures clean restart without stale disposed node references
 */
export function disposeAllAudioNodes(): void {
  // Dispose all cached Tone.js nodes
  audioNodes.forEach(node => {
    try { node.dispose() } catch { /* ignore */ }
  })
  audioNodes.clear()

  // Clean up synth state
  for (const state of synthState.values()) {
    for (const voice of state.voices.values()) {
      try {
        voice.synth.triggerRelease()
        voice.synth.dispose()
      } catch { /* ignore */ }
    }
  }
  synthState.clear()

  // Clean up beat detection state
  beatState.clear()

  // Clean up audio player state
  for (const state of playerState.values()) {
    if (state.player) {
      try { state.player.dispose() } catch { /* ignore */ }
    }
  }
  playerState.clear()

  // Clean up SVF filter state
  for (const state of svfState.values()) {
    try {
      state.lowpass.dispose()
      state.highpass.dispose()
      state.bandpass.dispose()
      state.notch.dispose()
      state.drive?.dispose()
    } catch { /* ignore */ }
  }
  svfState.clear()

  // Clean up pitch detection state
  pitchState.clear()

  // Clean up parametric EQ state
  for (const state of parametricEqState.values()) {
    try {
      state.band1.dispose()
      state.band2.dispose()
      state.band3.dispose()
    } catch { /* ignore */ }
  }
  parametricEqState.clear()

  // Clean up wavetable state
  for (const state of wavetableState.values()) {
    try { state.oscillator.dispose() } catch { /* ignore */ }
  }
  wavetableState.clear()
}

// ============================================================================
// Beat Detection Node
// ============================================================================

// State for beat detection per node
export const beatState = new Map<string, {
  lastEnergy: number
  threshold: number
  lastBeatTime: number
  bpm: number
  beatTimes: number[]
}>()

// ============================================================================
// Audio Player Node
// ============================================================================

// State for audio players
export const playerState = new Map<string, {
  url: string
  player: Tone.Player | null
  loading: boolean
  error: string | null
}>()

// ============================================================================
// Envelope (ADSR) Node
// ============================================================================

export const envelopeExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const trigger = ctx.inputs.get('trigger') as boolean | undefined
  const release = ctx.inputs.get('release') as boolean | undefined
  const attack = (ctx.controls.get('attack') as number) ?? 0.01
  const decay = (ctx.controls.get('decay') as number) ?? 0.1
  const sustain = (ctx.controls.get('sustain') as number) ?? 0.5
  const releaseTime = (ctx.controls.get('release') as number) ?? 0.3

  // Get or create envelope
  const envelope = getOrCreateNode(ctx.nodeId, () => {
    return new Tone.AmplitudeEnvelope({
      attack,
      decay,
      sustain,
      release: releaseTime,
    })
  }) as Tone.AmplitudeEnvelope

  // Update parameters
  envelope.attack = attack
  envelope.decay = decay
  envelope.sustain = sustain
  envelope.release = releaseTime

  // Handle triggers
  if (trigger) {
    envelope.triggerAttack()
  }

  if (release) {
    envelope.triggerRelease()
  }

  const outputs = new Map<string, unknown>()
  outputs.set('envelope', envelope)
  outputs.set('value', envelope.value)
  return outputs
}

// ============================================================================
// Dispose helpers for new nodes
// ============================================================================

export function disposeBeatDetector(nodeId: string): void {
  beatState.delete(nodeId)
}

export function disposeAudioPlayer(nodeId: string): void {
  const state = playerState.get(nodeId)
  if (state?.player) {
    state.player.dispose()
  }
  playerState.delete(nodeId)
}

export function disposeSvfFilter(nodeId: string): void {
  const state = svfState.get(nodeId)
  if (state) {
    state.lowpass.dispose()
    state.highpass.dispose()
    state.bandpass.dispose()
    state.notch.dispose()
    state.drive?.dispose()
    svfState.delete(nodeId)
  }
}

export function disposePitchDetect(nodeId: string): void {
  pitchState.delete(nodeId)
}

/**
 * Recover the owning nodeId from an `audioNodes` map key. Keys are either a bare
 * nodeId or `${nodeId}_${suffix}` for a fixed suffix set. Splitting on '_' is WRONG:
 * nanoid ids contain '_' (~26% of the time), so `key.split('_')[0]` truncates the id —
 * `gcAudioState` would then fail to match a live node and dispose its Tone graph on any
 * unrelated node removal (self-heals next frame, but glitches audio). Strip a known
 * suffix instead; a bare id (no suffix) is returned unchanged.
 */
export function audioNodeBaseId(key: string): string {
  return key.replace(/_(meter|gain|input|fft|output)$/, '')
}

/**
 * Garbage collect orphaned audio state entries.
 * Call this with the set of currently valid node IDs.
 */
export function gcAudioState(validNodeIds: Set<string>): void {
  // Clean audioNodes
  for (const key of audioNodes.keys()) {
    const baseId = audioNodeBaseId(key)
    if (!validNodeIds.has(baseId)) {
      const node = audioNodes.get(key)
      if (node) {
        try { node.dispose() } catch { /* ignore */ }
      }
      audioNodes.delete(key)
    }
  }

  // Clean beatState
  for (const nodeId of beatState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      beatState.delete(nodeId)
    }
  }

  // Clean playerState
  for (const nodeId of playerState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      const state = playerState.get(nodeId)
      if (state?.player) {
        try { state.player.dispose() } catch { /* ignore */ }
      }
      playerState.delete(nodeId)
    }
  }

  // Clean svfState
  for (const nodeId of svfState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      const state = svfState.get(nodeId)
      if (state) {
        try {
          state.lowpass.dispose()
          state.highpass.dispose()
          state.bandpass.dispose()
          state.notch.dispose()
          state.drive?.dispose()
        } catch { /* ignore */ }
      }
      svfState.delete(nodeId)
    }
  }

  // Clean pitchState
  for (const nodeId of pitchState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      pitchState.delete(nodeId)
    }
  }

  // Clean parametricEqState
  for (const nodeId of parametricEqState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      const state = parametricEqState.get(nodeId)
      if (state) {
        try {
          state.band1.dispose()
          state.band2.dispose()
          state.band3.dispose()
        } catch { /* ignore */ }
      }
      parametricEqState.delete(nodeId)
    }
  }

  // Clean wavetableState
  for (const nodeId of wavetableState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      const state = wavetableState.get(nodeId)
      if (state) {
        try {
          state.oscillator.dispose()
        } catch { /* ignore */ }
      }
      wavetableState.delete(nodeId)
    }
  }

  // Clean synthState
  for (const nodeId of synthState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      disposeSynth(nodeId)
    }
  }
}

// ============================================================================
// SVF Filter Node
// ============================================================================

// State for SVF filter connections
export const svfState = new Map<
  string,
  {
    lowpass: Tone.Filter
    highpass: Tone.Filter
    bandpass: Tone.Filter
    notch: Tone.Filter
    drive: Tone.Distortion | null
    prevInput: Tone.ToneAudioNode | null
  }
>()

// State for pitch detection
export const pitchState = new Map<
  string,
  {
    analyser: AnalyserNode | null
    audioContext: AudioContext | null
    buffer: Float32Array<ArrayBuffer> | null
    prevInput: Tone.ToneAudioNode | null
    lastFreq: number
    lastConfidence: number
  }
>()

// ============================================================================
// Parametric EQ Node
// ============================================================================

// State for parametric EQ connections
export const parametricEqState = new Map<
  string,
  {
    band1: Tone.Filter
    band2: Tone.Filter
    band3: Tone.Filter
    prevInput: Tone.ToneAudioNode | null
  }
>()

export function disposeParametricEq(nodeId: string): void {
  const state = parametricEqState.get(nodeId)
  if (state) {
    // Disconnect the chain before disposing
    try {
      if (state.prevInput) state.prevInput.disconnect(state.band1)
      state.band1.disconnect(state.band2)
      state.band2.disconnect(state.band3)
    } catch { /* ignore - may already be disconnected */ }
    state.band1.dispose()
    state.band2.dispose()
    state.band3.dispose()
    parametricEqState.delete(nodeId)
  }
}

// ============================================================================
// Wavetable Node
// ============================================================================

// State for wavetable oscillators
export const wavetableState = new Map<
  string,
  {
    oscillator: Tone.Oscillator
    periodicWave: PeriodicWave | null
    lastPreset: string
    lastWaveform: number[] | null
  }
>()

export function disposeWavetable(nodeId: string): void {
  const state = wavetableState.get(nodeId)
  if (state) {
    state.oscillator.dispose()
    wavetableState.delete(nodeId)
  }
}

export function disposeSynth(nodeId: string): void {
  const state = synthState.get(nodeId)
  if (state) {
    for (const voice of state.voices.values()) {
      try {
        voice.synth.triggerRelease()
        voice.synth.dispose()
      } catch { /* ignore */ }
    }
    state.voices.clear()
    synthState.delete(nodeId)
  }
}

// ============================================================================
// Registry
// ============================================================================

// ============================================================================
// Dynamics / distortion effects (compressor, distortion, bitcrusher)
//
// Pure Tone effects following the gain/filter template: cached in the generic
// audioNodes map, so disposeAudioNode/disposeAllAudioNodes free them — no new
// cleanup path. Each taps the upstream node via the `${nodeId}_input` link.
// ============================================================================

/** Shared input-connect helper for inline audio effects. */
export function connectEffectInput(nodeId: string, audio: Tone.ToneAudioNode, effect: Tone.ToneAudioNode): void {
  const prevInput = audioNodes.get(`${nodeId}_input`)
  if (prevInput !== audio) {
    if (prevInput) prevInput.disconnect(effect)
    audio.connect(effect)
    audioNodes.set(`${nodeId}_input`, audio)
  }
}

// All audio nodes are co-located (registry/audio/<id>/node.ts) and import their executor
// consts from this module; there is no `audioExecutors` map to register.

// Self-register into the engine's generic lifecycle loop (replaces the hand-wired
// gcAudioState / disposeAllAudioNodes calls in ExecutionEngine). `defineLifecycle`,
// NOT `defineNodeState`: disposeAllAudioNodes encodes a specific Tone teardown SEQUENCE
// across 8 maps (audioNodes first, then synth voices / players / filters), and the
// audioNodes map uses suffixed keys (`${id}_meter`). Splitting into independent stores
// could reorder disposal and break Tone graphs. Cleanup logic is unchanged.
defineLifecycle({
  label: 'audio',
  gc: gcAudioState,
  disposeAll: disposeAllAudioNodes,
})
