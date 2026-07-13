import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { aiInference } from '@/services/ai/AIInference'
import { pendingOperations, getCached, setCached, hasTriggerValue, getSTTState, isToneAudioNode } from '../shared'

const definition: NodeDefinition = {
  id: 'speech-recognition',
  name: 'Speech to Text',
  version: '2.0.0',
  category: 'ai',
  description: 'Transcribe audio to text using Whisper with manual, continuous, or VAD modes',
  icon: 'mic',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'trigger', type: 'trigger', label: 'Transcribe' },
  ],
  outputs: [
    { id: 'text', type: 'string', label: 'Transcribed Text' },
    { id: 'partial', type: 'string', label: 'Partial Text' },
    { id: 'speaking', type: 'boolean', label: 'Speaking' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    {
      id: 'mode',
      type: 'select',
      label: 'Mode',
      default: 'manual',
      props: {
        options: [
          { value: 'manual', label: 'Manual (on trigger)' },
          { value: 'continuous', label: 'Continuous (auto-chunk)' },
          { value: 'vad', label: 'VAD (voice detection)' },
        ],
      },
    },
    {
      id: 'bufferDuration',
      type: 'number',
      label: 'Buffer Duration (s)',
      default: 5,
      props: { min: 1, max: 30, step: 1 },
    },
    {
      id: 'vadThreshold',
      type: 'number',
      label: 'VAD Threshold',
      default: 0.01,
      props: { min: 0.001, max: 0.1, step: 0.001 },
    },
    {
      id: 'vadSilenceDuration',
      type: 'number',
      label: 'Silence Duration (ms)',
      default: 500,
      props: { min: 100, max: 2000, step: 50 },
    },
    {
      id: 'chunkInterval',
      type: 'number',
      label: 'Chunk Interval (ms)',
      default: 3000,
      props: { min: 1000, max: 10000, step: 500 },
    },
  ],
  tags: ['speech recognition', 'stt', 'whisper', 'transcribe', 'voice', 'audio', 'ai'],
  info: {
    overview: 'Transcribes audio to text using the Whisper model. Supports three modes: manual transcription on trigger, continuous auto-chunking, and voice activity detection (VAD) that listens for speech and transcribes automatically. Runs entirely in the browser.',
    tips: [
      'Use VAD mode for hands-free transcription that only processes audio when someone is speaking.',
      'Increase the buffer duration in continuous mode to get longer, more coherent transcription chunks.',
    ],
    pairsWith: ['audio-input', 'sentiment-analysis', 'text-generation', 'string-template'],
  },
}

export const speechRecognitionExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const audioInput = ctx.inputs.get('audio')
  const trigger = ctx.inputs.get('trigger')

  // Get controls
  const mode = (ctx.controls.get('mode') as string) ?? 'manual'
  const bufferDuration = (ctx.controls.get('bufferDuration') as number) ?? 5
  const vadThreshold = (ctx.controls.get('vadThreshold') as number) ?? 0.01
  const vadSilenceDuration = (ctx.controls.get('vadSilenceDuration') as number) ?? 500
  const chunkInterval = (ctx.controls.get('chunkInterval') as number) ?? 3000
  const modelId = ctx.controls.get('model') as string | undefined

  // Check if model is loaded
  const isLoaded = aiInference.isModelLoaded('automatic-speech-recognition', modelId)

  if (!isLoaded) {
    outputs.set('text', getCached(`${ctx.nodeId}:text`, ''))
    outputs.set('partial', getCached(`${ctx.nodeId}:partial`, ''))
    outputs.set('speaking', false)
    outputs.set('loading', false)
    outputs.set('_error', 'Model not loaded. Open AI Model Manager to load.')
    return outputs
  }

  // Get node-specific STT state
  const state = getSTTState(ctx.nodeId)
  const now = Date.now()

  // Update AudioBufferService settings
  state.audioBufferService.setVadThreshold(vadThreshold)
  state.audioBufferService.setVadSilenceDuration(vadSilenceDuration)

  // Handle audio input - can be Tone.js node, Float32Array, or null
  let hasAudioSource = false

  if (isToneAudioNode(audioInput)) {
    hasAudioSource = true
    // Connect AudioBufferService to Tone.js node if not already connected or if node changed
    if (state.connectedAudioNode !== audioInput && !state.connecting) {
      state.connecting = true
      state.connectedAudioNode = audioInput

      // Connect async - will be ready on next frame
      state.audioBufferService
        .connectSource(audioInput, {
          bufferDuration,
          sampleRate: 16000, // Whisper requires 16kHz
          vadThreshold,
          vadSilenceDuration,
        })
        .then(() => {
          state.connecting = false
        })
        .catch((err) => {
          console.error('[STT] Failed to connect AudioBufferService:', err)
          state.connecting = false
          state.connectedAudioNode = null
        })
    }
  } else if (audioInput === null || audioInput === undefined) {
    // No audio input - disconnect if was connected
    if (state.connectedAudioNode !== null) {
      state.audioBufferService.disconnect()
      state.connectedAudioNode = null
    }
  }

  // If connecting or not connected, return early
  if (state.connecting || !state.audioBufferService.connected) {
    outputs.set('text', getCached(`${ctx.nodeId}:text`, ''))
    outputs.set('partial', getCached(`${ctx.nodeId}:partial`, ''))
    outputs.set('speaking', false)
    outputs.set('loading', state.connecting)
    if (!hasAudioSource) {
      outputs.set('_error', 'No audio input connected')
    } else if (state.connecting) {
      outputs.set('_error', 'Connecting to audio source...')
    }
    return outputs
  }

  // Get VAD state from AudioBufferService
  const vadState = state.audioBufferService.getVadState()
  const isSpeaking = vadState.speaking
  outputs.set('speaking', isSpeaking)
  // Surface a previously-swallowed transcription failure on the public error port
  // (badge via the engine latch); cleared by the next successful transcribe. The
  // transient connecting/no-audio states stay on the internal `_error` channel.
  outputs.set('error', getCached<string | null>(`${ctx.nodeId}:sttError`, null) ?? '')

  // Determine if we should transcribe based on mode
  let shouldTranscribe = false
  let audioToTranscribe: Float32Array | null = null

  if (mode === 'manual') {
    // Manual mode: transcribe on trigger
    if (hasTriggerValue(trigger)) {
      // Get the full buffer (resampled to 16kHz)
      const buffer = state.audioBufferService.getBuffer(bufferDuration * 1000)
      if (buffer.length > 0) {
        shouldTranscribe = true
        audioToTranscribe = buffer
      }
    }
  } else if (mode === 'continuous') {
    // Continuous mode: transcribe at regular intervals
    if (now - state.lastChunkTime >= chunkInterval) {
      // Get recent audio buffer (resampled to 16kHz)
      const buffer = state.audioBufferService.getBuffer(chunkInterval)
      if (buffer.length > 0) {
        shouldTranscribe = true
        audioToTranscribe = buffer
        state.lastChunkTime = now
      }
    }
  } else if (mode === 'vad') {
    // VAD mode: transcribe on speech→silence transition
    if (!isSpeaking && state.vadWasSpeaking) {
      // Speech just ended - transcribe the captured speech
      const buffer = state.audioBufferService.getFullBuffer()
      if (buffer.length > 0) {
        shouldTranscribe = true
        audioToTranscribe = buffer
        // Clear buffer after capturing for VAD mode
        state.audioBufferService.clearBuffer()
      }
    }
    state.vadWasSpeaking = isSpeaking
  }

  // If not transcribing, return cached values
  if (!shouldTranscribe || !audioToTranscribe || audioToTranscribe.length === 0) {
    outputs.set('text', getCached(`${ctx.nodeId}:text`, ''))
    outputs.set('partial', getCached(`${ctx.nodeId}:partial`, ''))
    outputs.set('loading', getCached(`${ctx.nodeId}:loading`, false))
    return outputs
  }

  // Check if already processing
  if (pendingOperations.has(ctx.nodeId)) {
    outputs.set('text', getCached(`${ctx.nodeId}:text`, ''))
    outputs.set('partial', getCached(`${ctx.nodeId}:partial`, ''))
    outputs.set('loading', true)
    return outputs
  }

  setCached(`${ctx.nodeId}:loading`, true)

  const audioData = audioToTranscribe // Capture for closure

  const operation = (async () => {
    try {
      const text = await aiInference.transcribe(audioData, modelId)

      if (mode === 'continuous') {
        // In continuous mode, update partial and accumulate text
        setCached(`${ctx.nodeId}:partial`, text)
        if (text.trim()) {
          state.fullText = state.fullText ? `${state.fullText} ${text}` : text
          setCached(`${ctx.nodeId}:text`, state.fullText)
        }
      } else {
        // In manual/vad mode, replace text
        setCached(`${ctx.nodeId}:text`, text)
        setCached(`${ctx.nodeId}:partial`, text)
      }

      setCached(`${ctx.nodeId}:loading`, false)
      setCached(`${ctx.nodeId}:sttError`, null)
    } catch (error) {
      console.error('[STT] Speech recognition error:', error)
      setCached(`${ctx.nodeId}:loading`, false)
      setCached(`${ctx.nodeId}:sttError`, error instanceof Error ? error.message : String(error))
    } finally {
      pendingOperations.delete(ctx.nodeId)
    }
  })()

  pendingOperations.set(ctx.nodeId, operation)

  outputs.set('text', getCached(`${ctx.nodeId}:text`, ''))
  outputs.set('partial', getCached(`${ctx.nodeId}:partial`, ''))
  outputs.set('loading', true)
  return outputs
}

export default defineNode({ definition, executor: speechRecognitionExecutor })
