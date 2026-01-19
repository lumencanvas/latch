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
}

// ============================================================================
// Oscillator Node
// ============================================================================

export const oscillatorExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const frequency = (ctx.inputs.get('frequency') as number) ?? (ctx.controls.get('frequency') as number) ?? 440
  const detune = (ctx.inputs.get('detune') as number) ?? (ctx.controls.get('detune') as number) ?? 0
  const waveform = (ctx.controls.get('waveform') as OscillatorType) ?? 'sine'
  const volume = (ctx.controls.get('volume') as number) ?? -6 // dB

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
        },
      })

      state.player = player
      audioNodes.set(ctx.nodeId, player)
    } catch (err) {
      state.error = err instanceof Error ? err.message : 'Failed to load audio'
      state.loading = false
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
  if (driveAmount > 0) {
    if (!state.drive) {
      state.drive = new Tone.Distortion(driveAmount)
    }
    state.drive.distortion = driveAmount
  }

  // Connect input to all filters (via drive if enabled)
  if (state.prevInput !== audio) {
    // Disconnect previous input
    if (state.prevInput) {
      try {
        if (state.drive) state.prevInput.disconnect(state.drive)
        else {
          state.prevInput.disconnect(state.lowpass)
          state.prevInput.disconnect(state.highpass)
          state.prevInput.disconnect(state.bandpass)
          state.prevInput.disconnect(state.notch)
        }
      } catch { /* ignore */ }
    }

    // Connect new input
    if (state.drive) {
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

  // Remove DC offset and find RMS
  let rms = 0
  for (let i = 0; i < size; i++) {
    buffer[i] -= dc
    rms += buffer[i] * buffer[i]
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
      correlation += buffer[i] * buffer[i + offset]
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
}
