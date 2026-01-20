/**
 * Audio Node Executors
 *
 * These executors handle audio-related nodes using Tone.js
 */

import * as Tone from 'tone'
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { audioManager } from '@/services/audio/AudioManager'

// Store for persistent audio nodes (oscillators, effects, etc.)
const audioNodes = new Map<string, Tone.ToneAudioNode>()

// Forward declaration for synth state (used by disposeAllAudioNodes)
interface SynthVoice {
  synth: Tone.Synth | Tone.MonoSynth | Tone.FMSynth | Tone.AMSynth
  note: number
}

interface SynthState {
  voices: Map<number, SynthVoice>
  instrument: string
  prevGate: boolean
  prevNote: number
}

const synthState = new Map<string, SynthState>()

/**
 * Get or create a Tone.js node for a given node ID
 */
function getOrCreateNode<T extends Tone.ToneAudioNode>(
  nodeId: string,
  factory: () => T
): T {
  let node = audioNodes.get(nodeId) as T | undefined
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
 * Dispose all audio nodes
 */
export function disposeAllAudioNodes(): void {
  audioNodes.forEach(node => node.dispose())
  audioNodes.clear()

  // Also clean up synth state
  for (const nodeId of synthState.keys()) {
    const state = synthState.get(nodeId)
    if (state) {
      for (const voice of state.voices.values()) {
        try {
          voice.synth.triggerRelease()
          voice.synth.dispose()
        } catch { /* ignore */ }
      }
    }
  }
  synthState.clear()
}

// ============================================================================
// Oscillator Node
// ============================================================================

// Volume bounds for oscillator (in dB)
const MIN_OSCILLATOR_VOLUME = -96 // Essentially silent
const MAX_OSCILLATOR_VOLUME = 6 // Some headroom but prevents extreme amplification

export const oscillatorExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const frequency = (ctx.inputs.get('frequency') as number) ?? (ctx.controls.get('frequency') as number) ?? 440
  const detune = (ctx.inputs.get('detune') as number) ?? (ctx.controls.get('detune') as number) ?? 0
  const waveform = (ctx.controls.get('waveform') as OscillatorType) ?? 'sine'
  const rawVolume = (ctx.controls.get('volume') as number) ?? -6 // dB
  // Clamp volume to safe bounds
  const volume = Math.max(MIN_OSCILLATOR_VOLUME, Math.min(MAX_OSCILLATOR_VOLUME, rawVolume))

  // Get or create oscillator
  const osc = getOrCreateNode(ctx.nodeId, () => {
    const oscillator = new Tone.Oscillator({
      frequency,
      type: waveform,
      volume,
    })
    oscillator.start()
    return oscillator
  })

  // Update parameters
  osc.frequency.value = frequency
  osc.detune.value = detune
  if (osc.type !== waveform) {
    osc.type = waveform
  }
  osc.volume.value = volume

  const outputs = new Map<string, unknown>()
  outputs.set('audio', osc)
  outputs.set('frequency', frequency)
  return outputs
}

// ============================================================================
// Audio Input (Microphone) Node
// ============================================================================

export const audioInputExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true

  if (!enabled) {
    const outputs = new Map<string, unknown>()
    outputs.set('audio', null)
    outputs.set('level', -Infinity)
    return outputs
  }

  // Ensure microphone is available
  if (!audioManager.hasMicrophone) {
    try {
      await audioManager.requestMicrophoneAccess()
    } catch {
      const outputs = new Map<string, unknown>()
      outputs.set('audio', null)
      outputs.set('level', -Infinity)
      outputs.set('_error', 'Microphone access denied')
      return outputs
    }
  }

  const mic = audioManager.microphoneSource
  if (!mic) {
    const outputs = new Map<string, unknown>()
    outputs.set('audio', null)
    outputs.set('level', -Infinity)
    return outputs
  }

  // Get or create meter for this node
  const meter = getOrCreateNode(`${ctx.nodeId}_meter`, () => {
    const m = new Tone.Meter()
    mic.connect(m)
    return m
  })

  const level = meter.getValue()
  const normalizedLevel = typeof level === 'number' ? level : level[0]

  const outputs = new Map<string, unknown>()
  outputs.set('audio', mic)
  outputs.set('level', normalizedLevel)
  return outputs
}

// ============================================================================
// Audio Output (Speaker) Node
// ============================================================================

export const audioOutputExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const volume = (ctx.controls.get('volume') as number) ?? 0 // dB
  const mute = (ctx.controls.get('mute') as boolean) ?? false

  // Get or create gain for this output
  const gain = getOrCreateNode(`${ctx.nodeId}_gain`, () => {
    const g = new Tone.Gain(1)
    g.connect(audioManager.getMasterOutput())
    return g
  })

  // Update volume
  gain.gain.value = mute ? 0 : Tone.dbToGain(volume)

  // Connect input to gain if available
  if (audio && 'connect' in audio) {
    // Check if already connected
    const prevInput = audioNodes.get(`${ctx.nodeId}_input`)
    if (prevInput !== audio) {
      if (prevInput) {
        prevInput.disconnect(gain)
      }
      audio.connect(gain)
      audioNodes.set(`${ctx.nodeId}_input`, audio)
    }
  }

  const outputs = new Map<string, unknown>()
  outputs.set('_connected', audio !== null)
  return outputs
}

// ============================================================================
// Audio Analyzer Node
// ============================================================================

export const audioAnalyzerExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const smoothing = (ctx.controls.get('smoothing') as number) ?? 0.8

  if (!audio) {
    const outputs = new Map<string, unknown>()
    outputs.set('level', -Infinity)
    outputs.set('bass', 0)
    outputs.set('mid', 0)
    outputs.set('high', 0)
    return outputs
  }

  // Get or create FFT analyzer
  const fft = getOrCreateNode(`${ctx.nodeId}_fft`, () => {
    const f = new Tone.FFT(256)
    f.smoothing = smoothing
    return f
  }) as Tone.FFT

  // Get or create meter
  const meter = getOrCreateNode(`${ctx.nodeId}_meter`, () => {
    return new Tone.Meter()
  }) as Tone.Meter

  // Connect input
  const prevInput = audioNodes.get(`${ctx.nodeId}_input`)
  if (prevInput !== audio) {
    if (prevInput) {
      prevInput.disconnect(fft)
      prevInput.disconnect(meter)
    }
    audio.connect(fft)
    audio.connect(meter)
    audioNodes.set(`${ctx.nodeId}_input`, audio)
  }

  // Get FFT data
  const fftData = fft.getValue()

  // Calculate frequency bands (simple averaging)
  const bassRange = Math.floor(fftData.length * 0.1) // 0-10%
  const midStart = bassRange
  const midEnd = Math.floor(fftData.length * 0.5) // 10-50%
  const highStart = midEnd

  let bass = 0, mid = 0, high = 0

  for (let i = 0; i < bassRange; i++) {
    bass += fftData[i] + 100 // Normalize from dB
  }
  bass = Math.max(0, bass / Math.max(1, bassRange) / 100)

  for (let i = midStart; i < midEnd; i++) {
    mid += fftData[i] + 100
  }
  mid = Math.max(0, mid / Math.max(1, midEnd - midStart) / 100)

  for (let i = highStart; i < fftData.length; i++) {
    high += fftData[i] + 100
  }
  high = Math.max(0, high / Math.max(1, fftData.length - highStart) / 100)

  const level = meter.getValue()
  const normalizedLevel = typeof level === 'number' ? level : level[0]

  const outputs = new Map<string, unknown>()
  outputs.set('level', normalizedLevel)
  outputs.set('bass', bass)
  outputs.set('mid', mid)
  outputs.set('high', high)
  return outputs
}

// ============================================================================
// Gain Node
// ============================================================================

export const gainExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const gain = (ctx.inputs.get('gain') as number) ?? (ctx.controls.get('gain') as number) ?? 1

  if (!audio) {
    const outputs = new Map<string, unknown>()
    outputs.set('audio', null)
    return outputs
  }

  // Get or create gain node
  const gainNode = getOrCreateNode(ctx.nodeId, () => {
    return new Tone.Gain(gain)
  }) as Tone.Gain

  // Update gain
  gainNode.gain.value = gain

  // Connect input
  const prevInput = audioNodes.get(`${ctx.nodeId}_input`)
  if (prevInput !== audio) {
    if (prevInput) {
      prevInput.disconnect(gainNode)
    }
    audio.connect(gainNode)
    audioNodes.set(`${ctx.nodeId}_input`, audio)
  }

  const outputs = new Map<string, unknown>()
  outputs.set('audio', gainNode)
  return outputs
}

// ============================================================================
// Filter Node
// ============================================================================

export const filterExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const frequency = (ctx.inputs.get('frequency') as number) ?? (ctx.controls.get('frequency') as number) ?? 1000
  const Q = (ctx.controls.get('Q') as number) ?? 1
  const type = (ctx.controls.get('type') as BiquadFilterType) ?? 'lowpass'

  if (!audio) {
    const outputs = new Map<string, unknown>()
    outputs.set('audio', null)
    return outputs
  }

  // Get or create filter
  const filter = getOrCreateNode(ctx.nodeId, () => {
    return new Tone.Filter({
      frequency,
      type,
      Q,
    })
  }) as Tone.Filter

  // Update parameters
  filter.frequency.value = frequency
  filter.Q.value = Q
  if (filter.type !== type) {
    filter.type = type
  }

  // Connect input
  const prevInput = audioNodes.get(`${ctx.nodeId}_input`)
  if (prevInput !== audio) {
    if (prevInput) {
      prevInput.disconnect(filter)
    }
    audio.connect(filter)
    audioNodes.set(`${ctx.nodeId}_input`, audio)
  }

  const outputs = new Map<string, unknown>()
  outputs.set('audio', filter)
  return outputs
}

// ============================================================================
// Delay Node
// ============================================================================

export const delayExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const delayTime = (ctx.inputs.get('time') as number) ?? (ctx.controls.get('time') as number) ?? 0.25
  const feedback = (ctx.controls.get('feedback') as number) ?? 0.5
  const wet = (ctx.controls.get('wet') as number) ?? 0.5

  if (!audio) {
    const outputs = new Map<string, unknown>()
    outputs.set('audio', null)
    return outputs
  }

  // Get or create delay
  const delay = getOrCreateNode(ctx.nodeId, () => {
    return new Tone.FeedbackDelay({
      delayTime,
      feedback,
      wet,
    })
  }) as Tone.FeedbackDelay

  // Update parameters
  delay.delayTime.value = delayTime
  delay.feedback.value = feedback
  delay.wet.value = wet

  // Connect input
  const prevInput = audioNodes.get(`${ctx.nodeId}_input`)
  if (prevInput !== audio) {
    if (prevInput) {
      prevInput.disconnect(delay)
    }
    audio.connect(delay)
    audioNodes.set(`${ctx.nodeId}_input`, audio)
  }

  const outputs = new Map<string, unknown>()
  outputs.set('audio', delay)
  return outputs
}

// ============================================================================
// Beat Detection Node
// ============================================================================

// State for beat detection per node
const beatState = new Map<string, {
  lastEnergy: number
  threshold: number
  lastBeatTime: number
  bpm: number
  beatTimes: number[]
}>()

export const beatDetectExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const sensitivity = (ctx.controls.get('sensitivity') as number) ?? 1.5
  const minInterval = (ctx.controls.get('minInterval') as number) ?? 200 // ms between beats
  const decayRate = (ctx.controls.get('decayRate') as number) ?? 0.95

  if (!audio) {
    const outputs = new Map<string, unknown>()
    outputs.set('beat', false)
    outputs.set('bpm', 0)
    outputs.set('energy', 0)
    return outputs
  }

  // Get or create FFT analyzer for this node
  const fft = getOrCreateNode(`${ctx.nodeId}_fft`, () => {
    const f = new Tone.FFT(256)
    return f
  }) as Tone.FFT

  // Connect input
  const prevInput = audioNodes.get(`${ctx.nodeId}_input`)
  if (prevInput !== audio) {
    if (prevInput) {
      prevInput.disconnect(fft)
    }
    audio.connect(fft)
    audioNodes.set(`${ctx.nodeId}_input`, audio)
  }

  // Initialize state if needed
  if (!beatState.has(ctx.nodeId)) {
    beatState.set(ctx.nodeId, {
      lastEnergy: 0,
      threshold: 0,
      lastBeatTime: 0,
      bpm: 0,
      beatTimes: [],
    })
  }

  const state = beatState.get(ctx.nodeId)!
  const now = performance.now()

  // Get FFT data and calculate energy (focus on bass frequencies for beat detection)
  const fftData = fft.getValue()
  const bassEnd = Math.floor(fftData.length * 0.15) // Focus on low frequencies

  let energy = 0
  for (let i = 0; i < bassEnd; i++) {
    const val = fftData[i] + 100 // Normalize from dB
    energy += val * val
  }
  energy = Math.sqrt(energy / Math.max(1, bassEnd)) / 100

  // Update adaptive threshold
  state.threshold = state.threshold * decayRate + energy * (1 - decayRate)

  // Detect beat
  const timeSinceLastBeat = now - state.lastBeatTime
  const isBeat =
    energy > state.threshold * sensitivity &&
    energy > state.lastEnergy &&
    timeSinceLastBeat > minInterval

  if (isBeat) {
    state.lastBeatTime = now

    // Track beat times for BPM calculation (keep last 10 beats)
    state.beatTimes.push(now)
    if (state.beatTimes.length > 10) {
      state.beatTimes.shift()
    }

    // Calculate BPM from beat intervals
    if (state.beatTimes.length >= 2) {
      const intervals: number[] = []
      for (let i = 1; i < state.beatTimes.length; i++) {
        intervals.push(state.beatTimes[i] - state.beatTimes[i - 1])
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
      state.bpm = Math.round(60000 / avgInterval)

      // Clamp to reasonable BPM range
      if (state.bpm < 60) state.bpm *= 2
      if (state.bpm > 200) state.bpm = Math.round(state.bpm / 2)
    }
  }

  state.lastEnergy = energy

  const outputs = new Map<string, unknown>()
  outputs.set('beat', isBeat)
  outputs.set('bpm', state.bpm)
  outputs.set('energy', energy)
  return outputs
}

// ============================================================================
// Audio Player Node
// ============================================================================

// State for audio players
const playerState = new Map<string, {
  url: string
  player: Tone.Player | null
  loading: boolean
  error: string | null
}>()

export const audioPlayerExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const url = (ctx.inputs.get('url') as string) ?? (ctx.controls.get('url') as string) ?? ''
  const play = ctx.inputs.get('play') as boolean | undefined
  const stop = ctx.inputs.get('stop') as boolean | undefined
  const loop = (ctx.controls.get('loop') as boolean) ?? false
  const volume = (ctx.controls.get('volume') as number) ?? 0 // dB
  const playbackRate = (ctx.controls.get('playbackRate') as number) ?? 1
  const autoplay = (ctx.controls.get('autoplay') as boolean) ?? false

  // Initialize state
  if (!playerState.has(ctx.nodeId)) {
    playerState.set(ctx.nodeId, {
      url: '',
      player: null,
      loading: false,
      error: null,
    })
  }

  const state = playerState.get(ctx.nodeId)!

  // Handle URL change - load new audio
  if (url && url !== state.url) {
    state.url = url
    state.loading = true
    state.error = null

    // Dispose old player
    if (state.player) {
      state.player.dispose()
      audioNodes.delete(ctx.nodeId)
    }

    try {
      const player = new Tone.Player({
        url,
        loop,
        volume,
        playbackRate,
        autostart: autoplay,
        onload: () => {
          state.loading = false
        },
        onerror: (err) => {
          state.error = err?.message ?? 'Failed to load audio'
          state.loading = false
          // Clear player reference on error - it's in an invalid state
          if (state.player === player) {
            state.player = null
            audioNodes.delete(ctx.nodeId)
            try { player.dispose() } catch { /* ignore */ }
          }
        },
      })

      state.player = player
      audioNodes.set(ctx.nodeId, player)
    } catch (err) {
      state.error = err instanceof Error ? err.message : 'Failed to load audio'
      state.loading = false
      // Ensure player is null on synchronous failure
      state.player = null
      audioNodes.delete(ctx.nodeId)
    }
  }

  const player = state.player

  if (player) {
    // Update parameters
    player.loop = loop
    player.volume.value = volume
    player.playbackRate = playbackRate

    // Handle play/stop triggers
    if (play && player.loaded && player.state !== 'started') {
      player.start()
    }

    if (stop && player.state === 'started') {
      player.stop()
    }
  }

  const outputs = new Map<string, unknown>()
  outputs.set('audio', player)
  outputs.set('playing', player?.state === 'started')
  outputs.set('duration', player?.buffer?.duration ?? 0)
  outputs.set('loading', state.loading)
  outputs.set('error', state.error)
  return outputs
}

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
// Reverb Node
// ============================================================================

export const reverbExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const decay = (ctx.controls.get('decay') as number) ?? 1.5
  const wet = (ctx.controls.get('wet') as number) ?? 0.5
  const preDelay = (ctx.controls.get('preDelay') as number) ?? 0.01

  if (!audio) {
    const outputs = new Map<string, unknown>()
    outputs.set('audio', null)
    return outputs
  }

  // Get or create reverb
  const reverb = getOrCreateNode(ctx.nodeId, () => {
    return new Tone.Reverb({
      decay,
      wet,
      preDelay,
    })
  }) as Tone.Reverb

  // Update parameters
  reverb.decay = decay
  reverb.wet.value = wet
  reverb.preDelay = preDelay

  // Connect input
  const prevInput = audioNodes.get(`${ctx.nodeId}_input`)
  if (prevInput !== audio) {
    if (prevInput) {
      prevInput.disconnect(reverb)
    }
    audio.connect(reverb)
    audioNodes.set(`${ctx.nodeId}_input`, audio)
  }

  const outputs = new Map<string, unknown>()
  outputs.set('audio', reverb)
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
 * Garbage collect orphaned audio state entries.
 * Call this with the set of currently valid node IDs.
 */
export function gcAudioState(validNodeIds: Set<string>): void {
  // Clean audioNodes
  for (const key of audioNodes.keys()) {
    // Extract base nodeId (may have suffixes like _meter, _input, _fft)
    const baseId = key.split('_')[0]
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
const svfState = new Map<
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

export const svfFilterExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const cutoffInput = ctx.inputs.get('cutoff') as number | undefined
  const resonanceInput = ctx.inputs.get('resonance') as number | undefined

  const cutoff = cutoffInput ?? (ctx.controls.get('cutoff') as number) ?? 1000
  const resonance = resonanceInput ?? (ctx.controls.get('resonance') as number) ?? 0.5
  const driveAmount = (ctx.controls.get('drive') as number) ?? 0

  // Map resonance (0-1) to Q factor (0.5-20)
  const Q = 0.5 + resonance * 19.5

  const outputs = new Map<string, unknown>()

  if (!audio) {
    outputs.set('lowpass', null)
    outputs.set('highpass', null)
    outputs.set('bandpass', null)
    outputs.set('notch', null)
    return outputs
  }

  // Initialize or get state
  let state = svfState.get(ctx.nodeId)
  if (!state) {
    state = {
      lowpass: new Tone.Filter({ type: 'lowpass', frequency: cutoff, Q }),
      highpass: new Tone.Filter({ type: 'highpass', frequency: cutoff, Q }),
      bandpass: new Tone.Filter({ type: 'bandpass', frequency: cutoff, Q }),
      notch: new Tone.Filter({ type: 'notch', frequency: cutoff, Q }),
      drive: driveAmount > 0 ? new Tone.Distortion(driveAmount) : null,
      prevInput: null,
    }
    svfState.set(ctx.nodeId, state)
  }

  // Update filter parameters
  state.lowpass.frequency.value = cutoff
  state.lowpass.Q.value = Q
  state.highpass.frequency.value = cutoff
  state.highpass.Q.value = Q
  state.bandpass.frequency.value = cutoff
  state.bandpass.Q.value = Q
  state.notch.frequency.value = cutoff
  state.notch.Q.value = Q

  // Handle drive
  const hadDrive = state.drive !== null
  if (driveAmount > 0) {
    if (!state.drive) {
      state.drive = new Tone.Distortion(driveAmount)
    }
    state.drive.distortion = driveAmount
  } else if (state.drive) {
    // Drive was disabled - disconnect and dispose old drive node
    try {
      state.drive.disconnect()
    } catch { /* ignore */ }
    state.drive.dispose()
    state.drive = null
  }
  const hasDrive = state.drive !== null
  const driveStateChanged = hadDrive !== hasDrive

  // Connect input to all filters (via drive if enabled)
  // Also reconnect if drive state changed
  if (state.prevInput !== audio || driveStateChanged) {
    // Disconnect previous input based on PREVIOUS drive state (hadDrive)
    if (state.prevInput) {
      try {
        if (hadDrive) {
          // Was connected via drive - but drive may have been disposed, so just disconnect from filters
          state.prevInput.disconnect(state.lowpass)
          state.prevInput.disconnect(state.highpass)
          state.prevInput.disconnect(state.bandpass)
          state.prevInput.disconnect(state.notch)
        } else {
          state.prevInput.disconnect(state.lowpass)
          state.prevInput.disconnect(state.highpass)
          state.prevInput.disconnect(state.bandpass)
          state.prevInput.disconnect(state.notch)
        }
      } catch { /* ignore */ }
    }

    // Connect new input based on CURRENT drive state (hasDrive)
    if (hasDrive && state.drive) {
      audio.connect(state.drive)
      state.drive.connect(state.lowpass)
      state.drive.connect(state.highpass)
      state.drive.connect(state.bandpass)
      state.drive.connect(state.notch)
    } else {
      audio.connect(state.lowpass)
      audio.connect(state.highpass)
      audio.connect(state.bandpass)
      audio.connect(state.notch)
    }

    state.prevInput = audio
  }

  outputs.set('lowpass', state.lowpass)
  outputs.set('highpass', state.highpass)
  outputs.set('bandpass', state.bandpass)
  outputs.set('notch', state.notch)

  return outputs
}

// ============================================================================
// Pitch Detect Node
// ============================================================================

// Note names for pitch detection
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// State for pitch detection
const pitchState = new Map<
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

function autoCorrelate(buffer: Float32Array, sampleRate: number, minFreq: number, maxFreq: number): { frequency: number; confidence: number } {
  const size = buffer.length
  let maxCorrelation = 0
  let bestOffset = -1

  // Find the DC offset
  let sum = 0
  for (let i = 0; i < size; i++) {
    sum += buffer[i]
  }
  const dc = sum / size

  // Copy buffer and remove DC offset to avoid mutating input
  const processed = new Float32Array(size)
  let rms = 0
  for (let i = 0; i < size; i++) {
    processed[i] = buffer[i] - dc
    rms += processed[i] * processed[i]
  }
  rms = Math.sqrt(rms / size)

  // Not enough signal
  if (rms < 0.01) {
    return { frequency: 0, confidence: 0 }
  }

  const minPeriod = Math.floor(sampleRate / maxFreq)
  const maxPeriod = Math.floor(sampleRate / minFreq)

  // Autocorrelation
  for (let offset = minPeriod; offset < Math.min(maxPeriod, size); offset++) {
    let correlation = 0
    for (let i = 0; i < size - offset; i++) {
      correlation += processed[i] * processed[i + offset]
    }
    correlation /= size - offset

    if (correlation > maxCorrelation) {
      maxCorrelation = correlation
      bestOffset = offset
    }
  }

  if (bestOffset === -1) {
    return { frequency: 0, confidence: 0 }
  }

  const frequency = sampleRate / bestOffset
  const confidence = maxCorrelation / rms

  return { frequency, confidence: Math.min(1, confidence) }
}

export const pitchDetectExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null
  const minFreq = (ctx.controls.get('minFreq') as number) ?? 50
  const maxFreq = (ctx.controls.get('maxFreq') as number) ?? 2000

  const outputs = new Map<string, unknown>()

  if (!audio) {
    outputs.set('frequency', 0)
    outputs.set('note', '')
    outputs.set('octave', 0)
    outputs.set('midi', 0)
    outputs.set('confidence', 0)
    return outputs
  }

  // Initialize state
  let state = pitchState.get(ctx.nodeId)
  if (!state) {
    const audioContext = Tone.getContext().rawContext as AudioContext
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 2048

    // Create buffer with explicit ArrayBuffer to ensure correct type
    const arrayBuffer = new ArrayBuffer(analyser.fftSize * 4) // 4 bytes per float
    const buffer = new Float32Array(arrayBuffer)

    state = {
      analyser,
      audioContext,
      buffer,
      prevInput: null,
      lastFreq: 0,
      lastConfidence: 0,
    }
    pitchState.set(ctx.nodeId, state)
  }

  // Connect input
  if (state.prevInput !== audio) {
    if (state.prevInput) {
      try {
        (state.prevInput as unknown as { disconnect: (node: AudioNode) => void }).disconnect(state.analyser!)
      } catch { /* ignore */ }
    }

    try {
      (audio as unknown as { connect: (node: AudioNode) => void }).connect(state.analyser!)
    } catch { /* ignore */ }

    state.prevInput = audio
  }

  // Get time domain data
  state.analyser!.getFloatTimeDomainData(state.buffer!)

  // Detect pitch
  const { frequency, confidence } = autoCorrelate(
    state.buffer!,
    state.audioContext!.sampleRate,
    minFreq,
    maxFreq
  )

  // Smooth the frequency
  const smoothedFreq = frequency > 0 ? frequency : state.lastFreq * 0.95
  state.lastFreq = smoothedFreq
  state.lastConfidence = confidence

  // Calculate note and octave from frequency
  let note = ''
  let octave = 0
  let midi = 0

  if (smoothedFreq > 0) {
    midi = Math.round(12 * Math.log2(smoothedFreq / 440) + 69)
    note = noteNames[midi % 12]
    octave = Math.floor(midi / 12) - 1
  }

  outputs.set('frequency', Math.round(smoothedFreq * 10) / 10)
  outputs.set('note', note)
  outputs.set('octave', octave)
  outputs.set('midi', midi)
  outputs.set('confidence', Math.round(confidence * 100) / 100)

  return outputs
}

// ============================================================================
// Envelope Visual Node (same as envelope but with visual control type)
// ============================================================================

export const envelopeVisualExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  // Uses the same logic as envelopeExecutor
  return envelopeExecutor(ctx)
}

// ============================================================================
// Parametric EQ Node
// ============================================================================

// State for parametric EQ connections
const parametricEqState = new Map<
  string,
  {
    band1: Tone.Filter
    band2: Tone.Filter
    band3: Tone.Filter
    prevInput: Tone.ToneAudioNode | null
  }
>()

export const parametricEqExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const audio = ctx.inputs.get('audio') as Tone.ToneAudioNode | null

  // Get band parameters
  const freq1 = (ctx.controls.get('freq1') as number) ?? 200
  const gain1 = (ctx.controls.get('gain1') as number) ?? 0
  const q1 = (ctx.controls.get('q1') as number) ?? 1

  const freq2 = (ctx.controls.get('freq2') as number) ?? 1000
  const gain2 = (ctx.controls.get('gain2') as number) ?? 0
  const q2 = (ctx.controls.get('q2') as number) ?? 1

  const freq3 = (ctx.controls.get('freq3') as number) ?? 5000
  const gain3 = (ctx.controls.get('gain3') as number) ?? 0
  const q3 = (ctx.controls.get('q3') as number) ?? 1

  const outputs = new Map<string, unknown>()

  if (!audio) {
    outputs.set('audio', null)
    return outputs
  }

  // Initialize or get state
  let state = parametricEqState.get(ctx.nodeId)
  if (!state) {
    state = {
      band1: new Tone.Filter({ type: 'peaking', frequency: freq1, Q: q1, gain: gain1 }),
      band2: new Tone.Filter({ type: 'peaking', frequency: freq2, Q: q2, gain: gain2 }),
      band3: new Tone.Filter({ type: 'peaking', frequency: freq3, Q: q3, gain: gain3 }),
      prevInput: null,
    }
    // Chain filters together
    state.band1.connect(state.band2)
    state.band2.connect(state.band3)
    parametricEqState.set(ctx.nodeId, state)
  }

  // Update filter parameters
  state.band1.frequency.value = freq1
  state.band1.Q.value = q1
  state.band1.gain.value = gain1

  state.band2.frequency.value = freq2
  state.band2.Q.value = q2
  state.band2.gain.value = gain2

  state.band3.frequency.value = freq3
  state.band3.Q.value = q3
  state.band3.gain.value = gain3

  // Connect input to first filter
  if (state.prevInput !== audio) {
    if (state.prevInput) {
      try {
        state.prevInput.disconnect(state.band1)
      } catch { /* ignore */ }
    }
    audio.connect(state.band1)
    state.prevInput = audio
  }

  outputs.set('audio', state.band3)
  return outputs
}

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
const wavetableState = new Map<
  string,
  {
    oscillator: Tone.Oscillator
    periodicWave: PeriodicWave | null
    lastPreset: string
    lastWaveform: number[] | null
  }
>()

export const wavetableExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const frequencyInput = ctx.inputs.get('frequency') as number | undefined
  const frequency = frequencyInput ?? (ctx.controls.get('frequency') as number) ?? 440
  const volume = (ctx.controls.get('volume') as number) ?? 0.5
  const preset = (ctx.controls.get('preset') as string) ?? 'sine'
  const waveform = (ctx.controls.get('waveform') as number[]) ?? null

  // Initialize or get state
  let state = wavetableState.get(ctx.nodeId)
  if (!state) {
    const oscillator = new Tone.Oscillator({
      frequency,
      type: preset as OscillatorType,
      volume: Tone.gainToDb(volume),
    })
    oscillator.start()

    state = {
      oscillator,
      periodicWave: null,
      lastPreset: preset,
      lastWaveform: null,
    }
    wavetableState.set(ctx.nodeId, state)
  }

  // Update frequency and volume
  state.oscillator.frequency.value = frequency
  state.oscillator.volume.value = Tone.gainToDb(volume)

  // Handle preset change or custom waveform
  if (preset !== 'custom') {
    if (state.lastPreset !== preset) {
      state.oscillator.type = preset as OscillatorType
      state.lastPreset = preset
      state.lastWaveform = null
    }
  } else if (waveform && waveform.length > 0) {
    // Custom waveform - convert samples to periodic wave
    const waveformChanged = !state.lastWaveform ||
      state.lastWaveform.length !== waveform.length ||
      state.lastWaveform.some((v, i) => Math.abs(v - waveform[i]) > 0.001)

    if (waveformChanged) {
      // Convert time-domain samples to frequency-domain via simple DFT
      const n = waveform.length
      const real = new Float32Array(n / 2 + 1)
      const imag = new Float32Array(n / 2 + 1)

      // Simple DFT for harmonics
      for (let k = 0; k <= n / 2; k++) {
        let sumReal = 0
        let sumImag = 0
        for (let t = 0; t < n; t++) {
          const angle = (2 * Math.PI * k * t) / n
          sumReal += waveform[t] * Math.cos(angle)
          sumImag -= waveform[t] * Math.sin(angle)
        }
        real[k] = sumReal / n
        imag[k] = sumImag / n
      }

      // Create periodic wave
      const audioContext = Tone.getContext().rawContext as AudioContext
      const periodicWave = audioContext.createPeriodicWave(real, imag)
      state.periodicWave = periodicWave

      // Apply to oscillator
      const rawOsc = (state.oscillator as unknown as { _oscillator?: OscillatorNode })._oscillator
      if (rawOsc) {
        rawOsc.setPeriodicWave(periodicWave)
      }

      state.lastWaveform = [...waveform]
      state.lastPreset = 'custom'
    }
  }

  const outputs = new Map<string, unknown>()
  outputs.set('audio', state.oscillator)
  return outputs
}

export function disposeWavetable(nodeId: string): void {
  const state = wavetableState.get(nodeId)
  if (state) {
    state.oscillator.dispose()
    wavetableState.delete(nodeId)
  }
}

// ============================================================================
// Synth Node (MIDI-driven polyphonic synthesizer)
// ============================================================================

function createSynthForInstrument(instrument: string): Tone.Synth | Tone.MonoSynth | Tone.FMSynth | Tone.AMSynth {
  switch (instrument) {
    case 'moog':
      return new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' },
        filter: { type: 'lowpass', rolloff: -24 },
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.3 },
        filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3, baseFrequency: 200, octaves: 4 },
      })
    case 'piano':
      return new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.5, sustain: 0.1, release: 1.5 },
      })
    case 'organ':
      return new Tone.AMSynth({
        harmonicity: 2,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 1, release: 0.5 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.5, decay: 0, sustain: 1, release: 0.5 },
      })
    case 'pluck':
      return new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1 },
      })
    case 'pad':
      return new Tone.FMSynth({
        harmonicity: 3,
        modulationIndex: 10,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.5, decay: 0.3, sustain: 0.8, release: 2 },
        modulation: { type: 'triangle' },
        modulationEnvelope: { attack: 0.5, decay: 0.1, sustain: 0.5, release: 0.5 },
      })
    case 'sine':
    default:
      return new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 },
      })
  }
}

export const synthExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  // Get inputs from connected nodes
  const note = (ctx.inputs.get('note') as number) ?? (ctx.controls.get('note') as number) ?? 60
  const velocity = (ctx.inputs.get('velocity') as number) ?? (ctx.controls.get('velocity') as number) ?? 100
  const gate = (ctx.inputs.get('gate') as boolean) ?? (ctx.controls.get('gate') as boolean) ?? false
  const trigger = ctx.inputs.get('trigger')

  // Get control settings
  const instrument = (ctx.controls.get('instrument') as string) ?? 'sine'
  const volume = (ctx.controls.get('volume') as number) ?? -6
  const attack = (ctx.controls.get('attack') as number) ?? 0.01
  const decay = (ctx.controls.get('decay') as number) ?? 0.1
  const sustain = (ctx.controls.get('sustain') as number) ?? 0.7
  const release = (ctx.controls.get('release') as number) ?? 0.3

  // Initialize state
  let state = synthState.get(ctx.nodeId)
  if (!state) {
    state = {
      voices: new Map(),
      instrument,
      prevGate: false,
      prevNote: 0,
    }
    synthState.set(ctx.nodeId, state)
  }

  // Check if instrument changed - dispose old voices
  if (state.instrument !== instrument) {
    for (const voice of state.voices.values()) {
      voice.synth.dispose()
    }
    state.voices.clear()
    state.instrument = instrument
  }

  // Convert MIDI note to frequency
  const freq = Tone.Frequency(note, 'midi').toFrequency()

  // Get or create main output gain
  const outputGain = getOrCreateNode(`${ctx.nodeId}_output`, () => {
    const gain = new Tone.Gain(Tone.dbToGain(volume))
    return gain
  }) as Tone.Gain

  // Update volume
  outputGain.gain.value = Tone.dbToGain(volume)

  // Handle gate changes (note on/off)
  const gateRising = gate && !state.prevGate
  const gateFalling = !gate && state.prevGate
  const hasTrigger = trigger === true || trigger === 1 || (typeof trigger === 'number' && trigger > 0)

  // Note on
  if (gateRising || hasTrigger) {
    // Stop any existing voice for this note
    const existingVoice = state.voices.get(note)
    if (existingVoice) {
      existingVoice.synth.triggerRelease()
      existingVoice.synth.dispose()
      state.voices.delete(note)
    }

    // Create new voice
    const synth = createSynthForInstrument(instrument)

    // Update envelope if accessible
    if ('envelope' in synth) {
      synth.envelope.attack = attack
      synth.envelope.decay = decay
      synth.envelope.sustain = sustain
      synth.envelope.release = release
    }

    synth.volume.value = -6 // Individual voice volume
    synth.connect(outputGain)

    // Calculate velocity (0-127 to 0-1)
    const vel = Math.min(1, Math.max(0, velocity / 127))
    synth.triggerAttack(freq, Tone.now(), vel)

    state.voices.set(note, { synth, note })
  }

  // Note off
  if (gateFalling) {
    const voice = state.voices.get(state.prevNote)
    if (voice) {
      voice.synth.triggerRelease()
      // Schedule cleanup after release
      setTimeout(() => {
        voice.synth.dispose()
        state!.voices.delete(state!.prevNote)
      }, (release + 0.1) * 1000)
    }
  }

  state.prevGate = gate
  state.prevNote = note

  const outputs = new Map<string, unknown>()
  outputs.set('audio', outputGain)
  return outputs
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

export const audioExecutors: Record<string, NodeExecutorFn> = {
  oscillator: oscillatorExecutor,
  'audio-input': audioInputExecutor,
  'audio-output': audioOutputExecutor,
  'audio-analyzer': audioAnalyzerExecutor,
  gain: gainExecutor,
  filter: filterExecutor,
  'audio-delay': delayExecutor,
  'beat-detect': beatDetectExecutor,
  'audio-player': audioPlayerExecutor,
  envelope: envelopeExecutor,
  reverb: reverbExecutor,
  'svf-filter': svfFilterExecutor,
  'pitch-detect': pitchDetectExecutor,
  'envelope-visual': envelopeVisualExecutor,
  'parametric-eq': parametricEqExecutor,
  wavetable: wavetableExecutor,
  synth: synthExecutor,
}
