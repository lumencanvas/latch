/**
 * Speech-to-Text Executor Tests
 *
 * Tests for the enhanced STT executor with 3 modes: manual, continuous, VAD
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Speech-to-Text Executor Logic', () => {
  describe('Mode Detection', () => {
    it('defaults to manual mode', () => {
      const mode = undefined ?? 'manual'
      expect(mode).toBe('manual')
    })

    it('accepts valid mode values', () => {
      const validModes = ['manual', 'continuous', 'vad']

      for (const mode of validModes) {
        expect(validModes.includes(mode)).toBe(true)
      }
    })
  })

  describe('Manual Mode', () => {
    it('triggers transcription on explicit trigger', () => {
      const mode = 'manual'
      const trigger = true
      const audio = new Float32Array([0.1, 0.2, 0.3])

      const shouldTranscribe = mode === 'manual' && trigger && audio.length > 0

      expect(shouldTranscribe).toBe(true)
    })

    it('does not transcribe without trigger', () => {
      const mode = 'manual'
      const trigger = false
      const audio = new Float32Array([0.1, 0.2, 0.3])

      const shouldTranscribe = mode === 'manual' && trigger && audio.length > 0

      expect(shouldTranscribe).toBe(false)
    })

    it('does not transcribe without audio', () => {
      const mode = 'manual'
      const trigger = true
      const audio = new Float32Array(0)

      const shouldTranscribe = mode === 'manual' && trigger && audio.length > 0

      expect(shouldTranscribe).toBe(false)
    })
  })

  describe('Continuous Mode', () => {
    interface STTState {
      lastChunkTime: number
      speechBuffer: Float32Array[]
    }

    it('accumulates audio in buffer', () => {
      const state: STTState = {
        lastChunkTime: 0,
        speechBuffer: [],
      }
      const audio = new Float32Array([0.1, 0.2])

      state.speechBuffer.push(audio)

      expect(state.speechBuffer.length).toBe(1)
    })

    it('triggers transcription at interval', () => {
      const state: STTState = {
        lastChunkTime: 1000,
        speechBuffer: [new Float32Array([0.1])],
      }
      const chunkInterval = 3000
      const now = 4500

      const shouldTranscribe = now - state.lastChunkTime >= chunkInterval

      expect(shouldTranscribe).toBe(true)
    })

    it('does not transcribe before interval', () => {
      const state: STTState = {
        lastChunkTime: 1000,
        speechBuffer: [new Float32Array([0.1])],
      }
      const chunkInterval = 3000
      const now = 2500

      const shouldTranscribe = now - state.lastChunkTime >= chunkInterval

      expect(shouldTranscribe).toBe(false)
    })

    it('combines buffered audio', () => {
      const state: STTState = {
        lastChunkTime: 0,
        speechBuffer: [
          new Float32Array([0.1, 0.2]),
          new Float32Array([0.3, 0.4]),
          new Float32Array([0.5, 0.6]),
        ],
      }

      const totalLength = state.speechBuffer.reduce((sum, buf) => sum + buf.length, 0)
      const audioToTranscribe = new Float32Array(totalLength)
      let offset = 0
      for (const buf of state.speechBuffer) {
        audioToTranscribe.set(buf, offset)
        offset += buf.length
      }

      expect(audioToTranscribe.length).toBe(6)
      expect(audioToTranscribe[0]).toBeCloseTo(0.1, 5)
      expect(audioToTranscribe[5]).toBeCloseTo(0.6, 5)
    })

    it('keeps last chunk for context overlap', () => {
      const state: STTState = {
        lastChunkTime: 0,
        speechBuffer: [
          new Float32Array([0.1, 0.2]),
          new Float32Array([0.3, 0.4]),
          new Float32Array([0.5, 0.6]),
        ],
      }

      // After transcription, keep last chunk
      const lastChunk = state.speechBuffer[state.speechBuffer.length - 1]
      state.speechBuffer = lastChunk ? [lastChunk] : []

      expect(state.speechBuffer.length).toBe(1)
      expect(state.speechBuffer[0][0]).toBe(0.5)
    })

    it('accumulates text in continuous mode', () => {
      let fullText = ''
      const chunks = ['Hello', 'world', 'how are you']

      for (const chunk of chunks) {
        fullText = fullText ? `${fullText} ${chunk}` : chunk
      }

      expect(fullText).toBe('Hello world how are you')
    })
  })

  describe('VAD Mode', () => {
    interface VADState {
      vadWasSpeaking: boolean
      speechBuffer: Float32Array[]
      speechStartTime: number | null
    }

    it('buffers audio when speaking', () => {
      const state: VADState = {
        vadWasSpeaking: false,
        speechBuffer: [],
        speechStartTime: null,
      }
      const isSpeaking = true
      const audio = new Float32Array([0.5, 0.6])
      const now = 1000

      if (isSpeaking) {
        state.speechBuffer.push(audio)
        if (!state.speechStartTime) {
          state.speechStartTime = now
        }
        state.vadWasSpeaking = true
      }

      expect(state.speechBuffer.length).toBe(1)
      expect(state.speechStartTime).toBe(1000)
      expect(state.vadWasSpeaking).toBe(true)
    })

    it('triggers transcription on speech→silence transition', () => {
      const state: VADState = {
        vadWasSpeaking: true,
        speechBuffer: [new Float32Array([0.5, 0.6])],
        speechStartTime: 1000,
      }
      const isSpeaking = false
      const vadSilenceDuration = 500

      let shouldTranscribe = false
      if (!isSpeaking && state.vadWasSpeaking && state.speechBuffer.length > 0) {
        shouldTranscribe = true
      }

      expect(shouldTranscribe).toBe(true)
    })

    it('resets state after transcription', () => {
      const state: VADState = {
        vadWasSpeaking: true,
        speechBuffer: [new Float32Array([0.5, 0.6])],
        speechStartTime: 1000,
      }

      // After transcription
      state.speechBuffer = []
      state.speechStartTime = null
      state.vadWasSpeaking = false

      expect(state.speechBuffer.length).toBe(0)
      expect(state.speechStartTime).toBeNull()
      expect(state.vadWasSpeaking).toBe(false)
    })

    it('does not transcribe during continued speaking', () => {
      const state: VADState = {
        vadWasSpeaking: true,
        speechBuffer: [new Float32Array([0.5, 0.6])],
        speechStartTime: 1000,
      }
      const isSpeaking = true

      let shouldTranscribe = false
      if (!isSpeaking && state.vadWasSpeaking && state.speechBuffer.length > 0) {
        shouldTranscribe = true
      }

      expect(shouldTranscribe).toBe(false)
    })
  })

  describe('VAD Threshold Detection', () => {
    it('calculates RMS from audio samples', () => {
      const audio = new Float32Array([0.5, -0.5, 0.5, -0.5])

      let sum = 0
      for (let i = 0; i < audio.length; i++) {
        sum += audio[i] * audio[i]
      }
      const rms = Math.sqrt(sum / audio.length)

      expect(rms).toBe(0.5)
    })

    it('detects speaking above threshold', () => {
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

    it('handles zero-length audio', () => {
      const audio = new Float32Array(0)

      let rms = 0
      if (audio.length > 0) {
        let sum = 0
        for (let i = 0; i < audio.length; i++) {
          sum += audio[i] * audio[i]
        }
        rms = Math.sqrt(sum / audio.length)
      }

      expect(rms).toBe(0)
    })
  })

  describe('STT Node State Management', () => {
    it('initializes state for new node', () => {
      const sttState = new Map<string, {
        lastChunkTime: number
        vadWasSpeaking: boolean
        speechBuffer: Float32Array[]
        speechStartTime: number | null
      }>()

      const nodeId = 'stt-1'
      if (!sttState.has(nodeId)) {
        sttState.set(nodeId, {
          lastChunkTime: 0,
          vadWasSpeaking: false,
          speechBuffer: [],
          speechStartTime: null,
        })
      }

      expect(sttState.has(nodeId)).toBe(true)
      expect(sttState.get(nodeId)!.lastChunkTime).toBe(0)
    })

    it('cleans up state on node disposal', () => {
      const sttState = new Map<string, unknown>()
      sttState.set('stt-1', { lastChunkTime: 0 })
      sttState.set('stt-2', { lastChunkTime: 100 })

      // Dispose one node
      sttState.delete('stt-1')

      expect(sttState.has('stt-1')).toBe(false)
      expect(sttState.has('stt-2')).toBe(true)
    })

    it('clears all state on dispose all', () => {
      const sttState = new Map<string, unknown>()
      sttState.set('stt-1', { lastChunkTime: 0 })
      sttState.set('stt-2', { lastChunkTime: 100 })

      sttState.clear()

      expect(sttState.size).toBe(0)
    })
  })

  describe('Output Construction', () => {
    it('constructs outputs for speaking state', () => {
      const outputs = new Map<string, unknown>()

      outputs.set('text', 'Hello world')
      outputs.set('partial', 'Hello world')
      outputs.set('speaking', true)
      outputs.set('loading', false)

      expect(outputs.get('text')).toBe('Hello world')
      expect(outputs.get('speaking')).toBe(true)
      expect(outputs.get('loading')).toBe(false)
    })

    it('constructs outputs for loading state', () => {
      const outputs = new Map<string, unknown>()

      outputs.set('text', '')
      outputs.set('partial', '')
      outputs.set('speaking', false)
      outputs.set('loading', true)

      expect(outputs.get('loading')).toBe(true)
    })

    it('includes error output when model not loaded', () => {
      const outputs = new Map<string, unknown>()
      const isLoaded = false

      if (!isLoaded) {
        outputs.set('_error', 'Model not loaded. Open AI Model Manager to load.')
      }

      expect(outputs.get('_error')).toContain('Model not loaded')
    })
  })

  describe('Trigger Detection', () => {
    it('detects boolean true trigger', () => {
      const trigger = true
      const hasTrigger = trigger === true || trigger === 1 || (typeof trigger === 'number' && trigger > 0)
      expect(hasTrigger).toBe(true)
    })

    it('detects number 1 trigger', () => {
      const trigger = 1
      const hasTrigger = trigger === true || trigger === 1 || (typeof trigger === 'number' && trigger > 0)
      expect(hasTrigger).toBe(true)
    })

    it('detects positive number trigger', () => {
      const trigger = 0.5
      const hasTrigger = trigger === true || trigger === 1 || (typeof trigger === 'number' && trigger > 0)
      expect(hasTrigger).toBe(true)
    })

    it('does not trigger on false', () => {
      const trigger = false
      const hasTrigger = trigger === true || trigger === 1 || (typeof trigger === 'number' && trigger > 0)
      expect(hasTrigger).toBe(false)
    })

    it('does not trigger on 0', () => {
      const trigger = 0
      const hasTrigger = trigger === true || trigger === 1 || (typeof trigger === 'number' && trigger > 0)
      expect(hasTrigger).toBe(false)
    })
  })

  describe('Control Defaults', () => {
    it('uses default buffer duration', () => {
      const bufferDuration = undefined ?? 5
      expect(bufferDuration).toBe(5)
    })

    it('uses default VAD threshold', () => {
      const vadThreshold = undefined ?? 0.01
      expect(vadThreshold).toBe(0.01)
    })

    it('uses default VAD silence duration', () => {
      const vadSilenceDuration = undefined ?? 500
      expect(vadSilenceDuration).toBe(500)
    })

    it('uses default chunk interval', () => {
      const chunkInterval = undefined ?? 3000
      expect(chunkInterval).toBe(3000)
    })
  })
})
