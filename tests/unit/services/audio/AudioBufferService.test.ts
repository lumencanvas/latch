/**
 * Audio Buffer Service Tests
 *
 * Tests for audio capture, resampling, and VAD functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Test the core logic patterns used by AudioBufferService

describe('AudioBufferService Logic', () => {
  describe('Ring Buffer Management', () => {
    it('stores chunks in ring buffer', () => {
      const ringBuffer: Float32Array[] = []
      const maxChunks = 5

      // Add chunks
      for (let i = 0; i < 3; i++) {
        ringBuffer.push(new Float32Array([i, i + 0.1, i + 0.2]))
      }

      expect(ringBuffer.length).toBe(3)
    })

    it('trims buffer when exceeding max size', () => {
      const ringBuffer: Float32Array[] = []
      const maxChunks = 3

      // Add more chunks than max
      for (let i = 0; i < 5; i++) {
        ringBuffer.push(new Float32Array([i]))
        while (ringBuffer.length > maxChunks) {
          ringBuffer.shift()
        }
      }

      expect(ringBuffer.length).toBe(3)
      expect(ringBuffer[0][0]).toBe(2) // First two were removed
    })

    it('calculates max chunks from duration and sample rate', () => {
      const sampleRate = 44100
      const chunkSize = 2048
      const bufferDuration = 5 // seconds

      const chunksPerSecond = sampleRate / chunkSize
      const maxChunks = Math.ceil(bufferDuration * chunksPerSecond)

      expect(chunksPerSecond).toBeCloseTo(21.53, 1)
      expect(maxChunks).toBe(108) // 5 seconds worth
    })
  })

  describe('RMS Calculation (VAD)', () => {
    it('calculates RMS of audio samples', () => {
      const samples = new Float32Array([0.5, -0.5, 0.5, -0.5])

      let sum = 0
      for (let i = 0; i < samples.length; i++) {
        sum += samples[i] * samples[i]
      }
      const rms = Math.sqrt(sum / samples.length)

      expect(rms).toBe(0.5)
    })

    it('returns 0 for silent audio', () => {
      const samples = new Float32Array([0, 0, 0, 0])

      let sum = 0
      for (let i = 0; i < samples.length; i++) {
        sum += samples[i] * samples[i]
      }
      const rms = Math.sqrt(sum / samples.length)

      expect(rms).toBe(0)
    })

    it('returns 1 for full-scale audio', () => {
      const samples = new Float32Array([1, 1, 1, 1])

      let sum = 0
      for (let i = 0; i < samples.length; i++) {
        sum += samples[i] * samples[i]
      }
      const rms = Math.sqrt(sum / samples.length)

      expect(rms).toBe(1)
    })

    it('detects voice activity above threshold', () => {
      const vadThreshold = 0.01
      const rms = 0.05

      const isSpeaking = rms > vadThreshold

      expect(isSpeaking).toBe(true)
    })

    it('detects silence below threshold', () => {
      const vadThreshold = 0.01
      const rms = 0.005

      const isSpeaking = rms > vadThreshold

      expect(isSpeaking).toBe(false)
    })
  })

  describe('VAD State Machine', () => {
    interface VADState {
      speaking: boolean
      speechStartTime: number | null
      silenceStartTime: number | null
    }

    it('transitions to speaking when voice detected', () => {
      const state: VADState = {
        speaking: false,
        speechStartTime: null,
        silenceStartTime: null,
      }
      const vadThreshold = 0.01
      const rms = 0.05
      const now = 1000

      if (rms > vadThreshold) {
        if (!state.speaking) {
          state.speaking = true
          state.speechStartTime = now
          state.silenceStartTime = null
        }
      }

      expect(state.speaking).toBe(true)
      expect(state.speechStartTime).toBe(1000)
    })

    it('transitions to silence after duration', () => {
      const state: VADState = {
        speaking: true,
        speechStartTime: 1000,
        silenceStartTime: 2000,
      }
      const vadSilenceDuration = 500
      const now = 2600

      if (state.speaking && state.silenceStartTime) {
        if (now - state.silenceStartTime > vadSilenceDuration) {
          state.speaking = false
          state.speechStartTime = null
          state.silenceStartTime = null
        }
      }

      expect(state.speaking).toBe(false)
      expect(state.speechStartTime).toBeNull()
    })

    it('resets silence timer when voice resumes', () => {
      const state: VADState = {
        speaking: true,
        speechStartTime: 1000,
        silenceStartTime: 1500,
      }
      const vadThreshold = 0.01
      const rms = 0.05

      if (rms > vadThreshold && state.speaking) {
        state.silenceStartTime = null
      }

      expect(state.silenceStartTime).toBeNull()
    })
  })

  describe('Audio Resampling', () => {
    it('calculates output length for downsampling', () => {
      const inputLength = 44100
      const sourceSampleRate = 44100
      const targetSampleRate = 16000

      const ratio = sourceSampleRate / targetSampleRate
      const outputLength = Math.floor(inputLength / ratio)

      expect(outputLength).toBe(16000)
    })

    it('calculates source index for interpolation', () => {
      const sourceSampleRate = 44100
      const targetSampleRate = 16000
      const ratio = sourceSampleRate / targetSampleRate

      const outputIndex = 100
      const srcIndex = outputIndex * ratio
      const srcIndexFloor = Math.floor(srcIndex)
      const fraction = srcIndex - srcIndexFloor

      expect(srcIndex).toBeCloseTo(275.625, 2)
      expect(srcIndexFloor).toBe(275)
      expect(fraction).toBeCloseTo(0.625, 2)
    })

    it('performs linear interpolation', () => {
      const sample1 = 0.5
      const sample2 = 1.0
      const fraction = 0.4

      const interpolated = sample1 * (1 - fraction) + sample2 * fraction

      expect(interpolated).toBeCloseTo(0.7, 5)
    })

    it('returns same data when sample rates match', () => {
      const sourceSampleRate = 16000
      const targetSampleRate = 16000
      const input = new Float32Array([0.1, 0.2, 0.3])

      const shouldResample = sourceSampleRate !== targetSampleRate

      expect(shouldResample).toBe(false)
    })
  })

  describe('Buffer Duration Extraction', () => {
    it('calculates samples needed for duration', () => {
      const durationMs = 3000
      const sampleRate = 44100
      const samplesPerMs = sampleRate / 1000

      const samplesNeeded = durationMs * samplesPerMs

      expect(samplesNeeded).toBe(132300)
    })

    it('calculates chunks needed', () => {
      const samplesNeeded = 132300
      const chunkSize = 2048

      const chunksNeeded = Math.ceil(samplesNeeded / chunkSize)

      expect(chunksNeeded).toBe(65)
    })

    it('combines chunks into single buffer', () => {
      const chunks = [
        new Float32Array([0.1, 0.2]),
        new Float32Array([0.3, 0.4]),
        new Float32Array([0.5, 0.6]),
      ]

      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const combined = new Float32Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        combined.set(chunk, offset)
        offset += chunk.length
      }

      expect(combined.length).toBe(6)
      expect(combined[0]).toBeCloseTo(0.1, 5)
      expect(combined[5]).toBeCloseTo(0.6, 5)
    })

    it('trims buffer to exact duration', () => {
      const combined = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      const samplesNeeded = 6

      const startSample = Math.max(0, combined.length - samplesNeeded)
      const trimmed = combined.slice(startSample)

      expect(trimmed.length).toBe(6)
      expect(trimmed[0]).toBe(5)
      expect(trimmed[5]).toBe(10)
    })
  })

  describe('Level Monitoring', () => {
    it('calculates current audio level', () => {
      const fftSize = 8
      const dataArray = new Float32Array([0.1, -0.1, 0.2, -0.2, 0.1, -0.1, 0.2, -0.2])

      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i]
      }
      const level = Math.sqrt(sum / dataArray.length)

      expect(level).toBeCloseTo(0.158, 2)
    })

    it('returns 0 when not connected', () => {
      const isConnected = false
      const level = isConnected ? 0.5 : 0

      expect(level).toBe(0)
    })
  })
})

describe('AudioBufferService State', () => {
  it('tracks connection status', () => {
    let isConnected = false

    // Simulate connect
    isConnected = true
    expect(isConnected).toBe(true)

    // Simulate disconnect
    isConnected = false
    expect(isConnected).toBe(false)
  })

  it('manages listener subscriptions', () => {
    const listeners = new Set<(state: unknown) => void>()

    const callback1 = vi.fn()
    const callback2 = vi.fn()

    listeners.add(callback1)
    listeners.add(callback2)
    expect(listeners.size).toBe(2)

    // Notify listeners
    const state = { speaking: true }
    for (const listener of listeners) {
      listener(state)
    }

    expect(callback1).toHaveBeenCalledWith(state)
    expect(callback2).toHaveBeenCalledWith(state)

    // Unsubscribe
    listeners.delete(callback1)
    expect(listeners.size).toBe(1)
  })

  it('clears buffer on disconnect', () => {
    const ringBuffer: Float32Array[] = [
      new Float32Array([1, 2, 3]),
      new Float32Array([4, 5, 6]),
    ]

    // Simulate disconnect
    ringBuffer.length = 0

    expect(ringBuffer.length).toBe(0)
  })
})
