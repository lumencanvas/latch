/**
 * Audio Buffer Service
 *
 * Captures raw audio samples from Tone.js audio nodes,
 * resamples to 16kHz for Whisper, and provides VAD functionality.
 */

import * as Tone from 'tone'

export interface VADState {
  speaking: boolean
  speechStartTime: number | null
  silenceStartTime: number | null
}

export interface AudioBufferServiceOptions {
  bufferDuration?: number // seconds, default 5
  sampleRate?: number // target sample rate, default 16000 (Whisper requirement)
  vadThreshold?: number // RMS threshold, default 0.01
  vadSilenceDuration?: number // ms before speech end, default 500
}

// Type for accessing Tone.UserMedia's private _stream property
// Using a more flexible type to avoid private property errors
interface UserMediaWithStream {
  _stream?: MediaStream
}

class AudioBufferServiceImpl {
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private scriptProcessor: ScriptProcessorNode | null = null
  private silentGain: GainNode | null = null
  private audioContext: AudioContext | null = null

  // Track the original MediaStream to properly stop tracks on disconnect
  private ownedMediaStream: MediaStream | null = null

  // For Tone.js bridge (fallback)
  private toneStreamDest: MediaStreamAudioDestinationNode | null = null
  private toneSourceNode: Tone.ToneAudioNode | null = null

  private ringBuffer: Float32Array[] = []
  private maxBufferChunks: number = 0
  private sourceSampleRate: number = 44100
  private targetSampleRate: number = 16000
  private bufferDuration: number = 5

  private vadThreshold: number = 0.01
  private vadSilenceDuration: number = 500
  private vadState: VADState = {
    speaking: false,
    speechStartTime: null,
    silenceStartTime: null,
  }

  private isConnected: boolean = false
  private listeners: Set<(state: VADState) => void> = new Set()

  /**
   * Connect to an audio source (microphone or Tone.js node)
   */
  async connectSource(
    source: MediaStream | Tone.ToneAudioNode,
    options: AudioBufferServiceOptions = {}
  ): Promise<void> {
    this.disconnect()

    this.bufferDuration = options.bufferDuration ?? 5
    this.targetSampleRate = options.sampleRate ?? 16000
    this.vadThreshold = options.vadThreshold ?? 0.01
    this.vadSilenceDuration = options.vadSilenceDuration ?? 500

    let captureStream: MediaStream

    if (source instanceof MediaStream) {
      // Direct MediaStream input
      captureStream = source
    } else {
      // Tone.js node - try to get MediaStream directly
      const toneNode = source as Tone.ToneAudioNode

      // Check if this is a UserMedia with direct stream access
      // Tone.UserMedia stores the original MediaStream as _stream
      const userMediaNode = toneNode as UserMediaWithStream
      if (userMediaNode._stream && userMediaNode._stream instanceof MediaStream) {
        captureStream = userMediaNode._stream
      } else {
        // Fallback: Use MediaStreamDestination bridge for other Tone.js nodes
        const toneContext = Tone.getContext()
        const nativeContext = toneContext.rawContext as AudioContext

        if (!nativeContext || typeof (nativeContext as AudioContext).createMediaStreamDestination !== 'function') {
          throw new Error('Cannot create MediaStream from audio context')
        }

        this.toneStreamDest = (nativeContext as AudioContext).createMediaStreamDestination()
        this.toneSourceNode = toneNode

        // Connect Tone.js node to the destination
        if (this.toneStreamDest) {
          Tone.connect(toneNode, this.toneStreamDest)
          captureStream = this.toneStreamDest.stream
        } else {
          throw new Error('Failed to create MediaStream destination')
        }
      }
    }

    // Create our own AudioContext for capture
    this.audioContext = new AudioContext()
    this.sourceSampleRate = this.audioContext.sampleRate

    // Calculate buffer chunks needed
    const chunkSize = 2048
    const chunksPerSecond = this.sourceSampleRate / chunkSize
    this.maxBufferChunks = Math.ceil(this.bufferDuration * chunksPerSecond)
    this.ringBuffer = []

    // Create analyser for VAD
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.3

    // Create script processor for capturing samples
    if (typeof this.audioContext.createScriptProcessor !== 'function') {
      throw new Error('AudioContext.createScriptProcessor is not available')
    }
    this.scriptProcessor = this.audioContext.createScriptProcessor(chunkSize, 1, 1)

    this.scriptProcessor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0)

      // Store chunk in ring buffer
      const chunk = new Float32Array(inputData)
      this.ringBuffer.push(chunk)

      // Trim ring buffer if too large
      while (this.ringBuffer.length > this.maxBufferChunks) {
        this.ringBuffer.shift()
      }

      // Update VAD state
      this.updateVAD(inputData)
    }

    // Silent gain to prevent playback
    this.silentGain = this.audioContext.createGain()
    this.silentGain.gain.value = 0
    this.silentGain.connect(this.audioContext.destination)

    // Connect capture stream
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(captureStream)
    this.mediaStreamSource.connect(this.analyser)
    this.mediaStreamSource.connect(this.scriptProcessor)
    this.scriptProcessor.connect(this.silentGain)

    this.isConnected = true
  }

  /**
   * Connect directly to microphone
   */
  async connectMicrophone(options: AudioBufferServiceOptions = {}): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100,
      },
    })

    // Track ownership so we can stop tracks on disconnect
    this.ownedMediaStream = stream

    await this.connectSource(stream, options)
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    // Disconnect Tone.js bridge if used
    if (this.toneSourceNode && this.toneStreamDest) {
      try {
        Tone.disconnect(this.toneSourceNode, this.toneStreamDest)
      } catch {
        // May already be disconnected
      }
      this.toneSourceNode = null
      this.toneStreamDest = null
    }

    // Clear onaudioprocess callback to prevent any stale references
    if (this.scriptProcessor) {
      this.scriptProcessor.onaudioprocess = null
      this.scriptProcessor.disconnect()
      this.scriptProcessor = null
    }

    if (this.analyser) {
      this.analyser.disconnect()
      this.analyser = null
    }

    if (this.silentGain) {
      this.silentGain.disconnect()
      this.silentGain = null
    }

    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect()
      this.mediaStreamSource = null
    }

    // Stop owned media stream tracks (from getUserMedia)
    if (this.ownedMediaStream) {
      this.ownedMediaStream.getTracks().forEach(track => track.stop())
      this.ownedMediaStream = null
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
    }

    this.ringBuffer = []
    this.isConnected = false
    this.vadState = {
      speaking: false,
      speechStartTime: null,
      silenceStartTime: null,
    }
    this.listeners.clear()
  }

  /**
   * Get audio buffer for the last N milliseconds
   */
  getBuffer(durationMs: number): Float32Array {
    if (this.ringBuffer.length === 0) {
      return new Float32Array(0)
    }

    const chunkSize = this.ringBuffer[0].length
    const samplesPerMs = this.sourceSampleRate / 1000
    const samplesNeeded = Math.min(durationMs * samplesPerMs, this.ringBuffer.length * chunkSize)
    const chunksNeeded = Math.ceil(samplesNeeded / chunkSize)

    const recentChunks = this.ringBuffer.slice(-chunksNeeded)
    const combinedLength = recentChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const combined = new Float32Array(combinedLength)
    let offset = 0
    for (const chunk of recentChunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }

    const startSample = Math.max(0, combined.length - Math.floor(samplesNeeded))
    const trimmed = combined.slice(startSample)

    return this.resample(trimmed, this.sourceSampleRate, this.targetSampleRate)
  }

  /**
   * Get entire buffer (all captured audio)
   */
  getFullBuffer(): Float32Array {
    if (this.ringBuffer.length === 0) {
      return new Float32Array(0)
    }

    const combinedLength = this.ringBuffer.reduce((sum, chunk) => sum + chunk.length, 0)
    const combined = new Float32Array(combinedLength)
    let offset = 0
    for (const chunk of this.ringBuffer) {
      combined.set(chunk, offset)
      offset += chunk.length
    }

    return this.resample(combined, this.sourceSampleRate, this.targetSampleRate)
  }

  clearBuffer(): void {
    this.ringBuffer = []
  }

  isVoiceActive(): boolean {
    return this.vadState.speaking
  }

  getVadState(): VADState {
    return { ...this.vadState }
  }

  onVadChange(callback: (state: VADState) => void): () => void {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  setVadThreshold(threshold: number): void {
    this.vadThreshold = threshold
  }

  setVadSilenceDuration(durationMs: number): void {
    this.vadSilenceDuration = durationMs
  }

  get connected(): boolean {
    return this.isConnected
  }

  getCurrentLevel(): number {
    if (!this.analyser) return 0

    const dataArray = new Float32Array(this.analyser.fftSize)
    this.analyser.getFloatTimeDomainData(dataArray)

    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i]
    }
    return Math.sqrt(sum / dataArray.length)
  }

  private updateVAD(samples: Float32Array): void {
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i]
    }
    const rms = Math.sqrt(sum / samples.length)

    const now = Date.now()
    const wasSpeak = this.vadState.speaking

    if (rms > this.vadThreshold) {
      if (!this.vadState.speaking) {
        this.vadState.speaking = true
        this.vadState.speechStartTime = now
        this.vadState.silenceStartTime = null
      } else {
        this.vadState.silenceStartTime = null
      }
    } else {
      if (this.vadState.speaking) {
        if (!this.vadState.silenceStartTime) {
          this.vadState.silenceStartTime = now
        } else if (now - this.vadState.silenceStartTime > this.vadSilenceDuration) {
          this.vadState.speaking = false
          this.vadState.speechStartTime = null
          this.vadState.silenceStartTime = null
        }
      }
    }

    if (wasSpeak !== this.vadState.speaking) {
      this.notifyListeners()
    }
  }

  private notifyListeners(): void {
    const state = this.getVadState()
    for (const listener of this.listeners) {
      try {
        listener(state)
      } catch (error) {
        console.error('[AudioBufferService] Listener error:', error)
      }
    }
  }

  private resample(
    input: Float32Array,
    sourceSampleRate: number,
    targetSampleRate: number
  ): Float32Array {
    if (sourceSampleRate === targetSampleRate) {
      return input
    }

    const ratio = sourceSampleRate / targetSampleRate
    const outputLength = Math.floor(input.length / ratio)
    const output = new Float32Array(outputLength)

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio
      const srcIndexFloor = Math.floor(srcIndex)
      const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1)
      const fraction = srcIndex - srcIndexFloor
      output[i] = input[srcIndexFloor] * (1 - fraction) + input[srcIndexCeil] * fraction
    }

    return output
  }
}

export const audioBufferService = new AudioBufferServiceImpl()
export { AudioBufferServiceImpl }
