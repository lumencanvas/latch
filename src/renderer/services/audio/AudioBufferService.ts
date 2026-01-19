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

class AudioBufferServiceImpl {
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private scriptProcessor: ScriptProcessorNode | null = null
  private silentGain: GainNode | null = null // Prevents audio from playing through speakers
  private audioContext: AudioContext | null = null

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

    const isToneSource = !(source instanceof MediaStream)

    // Get or create audio context
    // For Tone.js nodes, we MUST use Tone's context to avoid InvalidAccessError
    // when connecting nodes from different contexts
    if (isToneSource) {
      // For Tone.js nodes, always use Tone's context
      const toneContext = Tone.getContext()
      // Cast to AudioContext - Tone.js wraps it but it's still an AudioContext
      // The rawContext property gives us the underlying native AudioContext
      this.audioContext = toneContext.rawContext as AudioContext
    } else {
      // For MediaStream, we can use our own context or Tone's
      const toneContext = Tone.getContext()
      if (toneContext.rawContext instanceof AudioContext) {
        this.audioContext = toneContext.rawContext
      } else {
        this.audioContext = new AudioContext()
      }
    }
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
    // Note: ScriptProcessorNode is deprecated but still widely supported
    // and necessary for real-time audio capture
    if (typeof this.audioContext.createScriptProcessor !== 'function') {
      throw new Error(
        'AudioContext.createScriptProcessor is not available. Audio capture not supported in this environment.'
      )
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

    // Create a silent gain node to prevent audio from playing through speakers
    // ScriptProcessorNode requires connection to destination to process, but we don't want to hear it
    this.silentGain = this.audioContext.createGain()
    this.silentGain.gain.value = 0
    this.silentGain.connect(this.audioContext.destination)

    // Connect source
    if (source instanceof MediaStream) {
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(source)
      this.mediaStreamSource.connect(this.analyser)
      this.mediaStreamSource.connect(this.scriptProcessor)
    } else {
      // Tone.js node - use Tone.connect for proper routing through Tone's graph
      const toneNode = source as Tone.ToneAudioNode
      Tone.connect(toneNode, this.analyser)
      Tone.connect(toneNode, this.scriptProcessor)
    }

    // Connect script processor through silent gain (required for it to process)
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

    await this.connectSource(stream, options)
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    if (this.scriptProcessor) {
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
      // Stop all tracks in the media stream
      const stream = this.mediaStreamSource.mediaStream
      stream.getTracks().forEach((track) => track.stop())
      this.mediaStreamSource = null
    }

    this.ringBuffer = []
    this.isConnected = false
    this.vadState = {
      speaking: false,
      speechStartTime: null,
      silenceStartTime: null,
    }
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

    // Get recent chunks
    const recentChunks = this.ringBuffer.slice(-chunksNeeded)

    // Combine into single buffer
    const combinedLength = recentChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const combined = new Float32Array(combinedLength)
    let offset = 0
    for (const chunk of recentChunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }

    // Trim to exact duration needed
    const startSample = Math.max(0, combined.length - Math.floor(samplesNeeded))
    const trimmed = combined.slice(startSample)

    // Resample to target sample rate (16kHz for Whisper)
    return this.resample(trimmed, this.sourceSampleRate, this.targetSampleRate)
  }

  /**
   * Get entire buffer (all captured audio)
   */
  getFullBuffer(): Float32Array {
    if (this.ringBuffer.length === 0) {
      return new Float32Array(0)
    }

    // Combine all chunks
    const combinedLength = this.ringBuffer.reduce((sum, chunk) => sum + chunk.length, 0)
    const combined = new Float32Array(combinedLength)
    let offset = 0
    for (const chunk of this.ringBuffer) {
      combined.set(chunk, offset)
      offset += chunk.length
    }

    // Resample to target sample rate
    return this.resample(combined, this.sourceSampleRate, this.targetSampleRate)
  }

  /**
   * Clear the buffer
   */
  clearBuffer(): void {
    this.ringBuffer = []
  }

  /**
   * Check if voice is currently active (VAD)
   */
  isVoiceActive(): boolean {
    return this.vadState.speaking
  }

  /**
   * Get current VAD state
   */
  getVadState(): VADState {
    return { ...this.vadState }
  }

  /**
   * Subscribe to VAD state changes
   */
  onVadChange(callback: (state: VADState) => void): () => void {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  /**
   * Update VAD threshold
   */
  setVadThreshold(threshold: number): void {
    this.vadThreshold = threshold
  }

  /**
   * Update VAD silence duration
   */
  setVadSilenceDuration(durationMs: number): void {
    this.vadSilenceDuration = durationMs
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected
  }

  /**
   * Get current RMS level (for UI display)
   */
  getCurrentLevel(): number {
    if (!this.analyser) return 0

    const dataArray = new Float32Array(this.analyser.fftSize)
    this.analyser.getFloatTimeDomainData(dataArray)

    // Calculate RMS
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i]
    }
    return Math.sqrt(sum / dataArray.length)
  }

  // Private methods

  private updateVAD(samples: Float32Array): void {
    // Calculate RMS
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i]
    }
    const rms = Math.sqrt(sum / samples.length)

    const now = Date.now()
    const wasSpeak = this.vadState.speaking

    if (rms > this.vadThreshold) {
      // Voice detected
      if (!this.vadState.speaking) {
        this.vadState.speaking = true
        this.vadState.speechStartTime = now
        this.vadState.silenceStartTime = null
      } else {
        // Still speaking, reset silence timer
        this.vadState.silenceStartTime = null
      }
    } else {
      // Silence detected
      if (this.vadState.speaking) {
        if (!this.vadState.silenceStartTime) {
          this.vadState.silenceStartTime = now
        } else if (now - this.vadState.silenceStartTime > this.vadSilenceDuration) {
          // Silence duration exceeded, speech ended
          this.vadState.speaking = false
          this.vadState.speechStartTime = null
          this.vadState.silenceStartTime = null
        }
      }
    }

    // Notify listeners if state changed
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

  /**
   * Resample audio from source to target sample rate
   * Using linear interpolation for simplicity
   */
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

      // Linear interpolation
      output[i] = input[srcIndexFloor] * (1 - fraction) + input[srcIndexCeil] * fraction
    }

    return output
  }
}

// Export singleton instance
export const audioBufferService = new AudioBufferServiceImpl()

// Export class for testing
export { AudioBufferServiceImpl }
