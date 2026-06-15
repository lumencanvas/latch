/**
 * Audio Manager - Central service for managing Web Audio / Tone.js
 *
 * Handles:
 * - AudioContext initialization (requires user gesture)
 * - Microphone access
 * - Audio routing
 * - Master output
 */

import * as Tone from 'tone'
import {
  needsUserGesture as audioNeedsGesture,
  tryResumeAudio,
  type ResumableContext,
} from './audioUnlock'

export type AudioState = 'suspended' | 'running' | 'closed' | 'interrupted'

export interface AudioDevice {
  deviceId: string
  label: string
  kind: 'audioinput' | 'audiooutput'
}

export interface AudioManagerState {
  initialized: boolean
  state: AudioState
  sampleRate: number
  inputDevices: AudioDevice[]
  outputDevices: AudioDevice[]
  currentInputDevice: string | null
  masterVolume: number
  muted: boolean
  /** True when audio is suspended/interrupted and a user gesture is required to (re)start it. */
  needsUserGesture: boolean
}

class AudioManagerService {
  private _initialized = false
  private _micSource: Tone.UserMedia | null = null
  private _masterGain: Tone.Gain | null = null
  private _analyzer: Tone.Analyser | null = null
  private _meter: Tone.Meter | null = null
  private _inputDevices: AudioDevice[] = []
  private _outputDevices: AudioDevice[] = []
  private _currentInputDevice: string | null = null
  private _masterVolume = 0.8
  private _muted = false
  private _listeners: Set<() => void> = new Set()
  private _needsUserGesture = false
  /** Detaches the AudioContext `statechange` listener; null when not attached. */
  private _ctxWatcher: (() => void) | null = null

  /**
   * Initialize the audio system
   * Must be called after a user gesture (click, keypress, etc.)
   */
  async initialize(): Promise<void> {
    // If already initialized, just ensure the context is running
    if (this._initialized) {
      await this.resume()
      return
    }

    try {
      // Start Tone.js audio context
      await Tone.start()
      // Watch for iOS interruptions / inactivity suspends so we can recover or
      // surface a "needs gesture" state.
      this.watchContextState()

      // Create master gain
      this._masterGain = new Tone.Gain(this._masterVolume).toDestination()

      // Create analyzer for visualization
      this._analyzer = new Tone.Analyser('waveform', 256)
      this._meter = new Tone.Meter()

      // Connect analyzer and meter to master
      this._masterGain.connect(this._analyzer)
      this._masterGain.connect(this._meter)

      // Enumerate audio devices
      await this.refreshDevices()

      this._initialized = true
      this.notifyListeners()

    } catch (error) {
      console.error('[AudioManager] Failed to initialize:', error)
      throw error
    }
  }

  /**
   * Refresh the list of available audio devices
   */
  async refreshDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()

      this._inputDevices = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
          kind: 'audioinput' as const,
        }))

      this._outputDevices = devices
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Speaker ${d.deviceId.slice(0, 8)}`,
          kind: 'audiooutput' as const,
        }))

      this.notifyListeners()
    } catch (error) {
      console.error('[AudioManager] Failed to enumerate devices:', error)
    }
  }

  /**
   * Request microphone access and create input source
   */
  async requestMicrophoneAccess(deviceId?: string): Promise<Tone.UserMedia> {
    if (!this._initialized) {
      throw new Error('AudioManager not initialized. Call initialize() first.')
    }

    try {
      // Close existing mic if open
      if (this._micSource) {
        this._micSource.close()
        this._micSource = null
      }

      // Create new UserMedia with optional device selection
      this._micSource = new Tone.UserMedia()

      if (deviceId) {
        // Open with specific device
        await this._micSource.open(deviceId)
        this._currentInputDevice = deviceId
      } else {
        // Open with default device
        await this._micSource.open()
        this._currentInputDevice = 'default'
      }

      this.notifyListeners()

      return this._micSource
    } catch (error) {
      console.error('[AudioManager] Failed to access microphone:', error)
      throw error
    }
  }

  /**
   * Close microphone access
   */
  closeMicrophone(): void {
    if (this._micSource) {
      this._micSource.close()
      this._micSource = null
      this._currentInputDevice = null
      this.notifyListeners()
    }
  }

  /**
   * Get the master gain node for routing audio to output
   */
  getMasterOutput(): Tone.Gain {
    if (!this._masterGain) {
      throw new Error('AudioManager not initialized')
    }
    return this._masterGain
  }

  /**
   * Get the analyzer for waveform visualization
   */
  getAnalyzer(): Tone.Analyser {
    if (!this._analyzer) {
      throw new Error('AudioManager not initialized')
    }
    return this._analyzer
  }

  /**
   * Get the meter for level monitoring
   */
  getMeter(): Tone.Meter {
    if (!this._meter) {
      throw new Error('AudioManager not initialized')
    }
    return this._meter
  }

  /**
   * Get current waveform data
   */
  getWaveform(): Float32Array {
    if (!this._analyzer) return new Float32Array(0)
    return this._analyzer.getValue() as Float32Array
  }

  /**
   * Get current audio level in dB
   */
  getLevel(): number {
    if (!this._meter) return -Infinity
    const value = this._meter.getValue()
    return typeof value === 'number' ? value : value[0]
  }

  /**
   * Set master volume (0-1)
   */
  setMasterVolume(volume: number): void {
    this._masterVolume = Math.max(0, Math.min(1, volume))
    if (this._masterGain && !this._muted) {
      this._masterGain.gain.value = this._masterVolume
    }
    this.notifyListeners()
  }

  /**
   * Toggle mute
   */
  setMuted(muted: boolean): void {
    this._muted = muted
    if (this._masterGain) {
      this._masterGain.gain.value = muted ? 0 : this._masterVolume
    }
    this.notifyListeners()
  }

  /**
   * Resume the audio context if suspended/interrupted (inactivity or iOS).
   */
  async resume(): Promise<void> {
    const running = await tryResumeAudio(this.contextAdapter())
    this._needsUserGesture = !running
  }

  /**
   * Resume/unlock audio in response to a user gesture (the mobile "Enable Audio"
   * affordance). Initializes on first call. Returns true if audio is running.
   */
  async unlock(): Promise<boolean> {
    if (!this._initialized) {
      await this.initialize()
    }
    const running = await tryResumeAudio(this.contextAdapter())
    this._needsUserGesture = !running
    this.notifyListeners()
    return running
  }

  /** Minimal {@link ResumableContext} adapter over the Tone.js context. */
  private contextAdapter(): ResumableContext {
    return {
      get state() {
        return Tone.getContext().state
      },
      resume: () => Tone.start(),
    }
  }

  /** Attach a one-time `statechange` listener to recover from interruptions. */
  private watchContextState(): void {
    if (this._ctxWatcher) return
    const raw = Tone.getContext().rawContext as unknown as AudioContext | undefined
    if (!raw || typeof raw.addEventListener !== 'function') return
    const handler = () => {
      void this.handleContextStateChange()
    }
    raw.addEventListener('statechange', handler)
    this._ctxWatcher = () => raw.removeEventListener('statechange', handler)
  }

  /** On an interruption/suspend, try a silent resume; iOS will need a gesture. */
  private async handleContextStateChange(): Promise<void> {
    const state = Tone.getContext().state
    if (audioNeedsGesture(state)) {
      const resumed = await tryResumeAudio(this.contextAdapter())
      this._needsUserGesture = !resumed
    } else {
      this._needsUserGesture = false
    }
    this.notifyListeners()
  }

  /**
   * Get current state
   */
  getState(): AudioManagerState {
    return {
      initialized: this._initialized,
      state: Tone.getContext().state as AudioState,
      sampleRate: Tone.getContext().sampleRate,
      inputDevices: this._inputDevices,
      outputDevices: this._outputDevices,
      currentInputDevice: this._currentInputDevice,
      masterVolume: this._masterVolume,
      muted: this._muted,
      needsUserGesture: this._needsUserGesture,
    }
  }

  /**
   * Check if microphone is currently open
   */
  get hasMicrophone(): boolean {
    return this._micSource !== null && this._micSource.state === 'started'
  }

  /**
   * Get the microphone source if available
   */
  get microphoneSource(): Tone.UserMedia | null {
    return this._micSource
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: () => void): () => void {
    this._listeners.add(listener)
    return () => {
      this._listeners.delete(listener)
    }
  }

  private notifyListeners(): void {
    this._listeners.forEach(listener => listener())
  }

  /**
   * Cleanup and dispose
   */
  dispose(): void {
    this.closeMicrophone()

    if (this._ctxWatcher) {
      this._ctxWatcher()
      this._ctxWatcher = null
    }

    if (this._analyzer) {
      this._analyzer.dispose()
      this._analyzer = null
    }

    if (this._meter) {
      this._meter.dispose()
      this._meter = null
    }

    if (this._masterGain) {
      this._masterGain.dispose()
      this._masterGain = null
    }

    this._initialized = false
    this._listeners.clear()
  }
}

// Singleton instance
export const audioManager = new AudioManagerService()

// Export Tone for use in other modules
export { Tone }
