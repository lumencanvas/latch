import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { mediaPipeService } from '@/services/ai/MediaPipeService'
import { pendingOperations, getCached, setCached, isToneAudioNode, getAudioClassifierState, SPEECH_CATEGORIES, MUSIC_CATEGORIES } from '../shared'

import { markRaw } from 'vue'
import MediaPipeAudioNode from './MediaPipeAudioNode.vue'

const definition: NodeDefinition = {
  id: 'mediapipe-audio',
  component: markRaw(MediaPipeAudioNode),
  name: 'Audio Classifier',
  version: '1.0.0',
  category: 'ai',
  description: 'Classify audio using MediaPipe YamNet model',
  icon: 'audio-waveform',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
  ],
  outputs: [
    { id: 'category', type: 'string', label: 'Category' },
    { id: 'confidence', type: 'number', label: 'Confidence' },
    { id: 'categories', type: 'data', label: 'All Categories' },
    { id: 'isSpeech', type: 'boolean', label: 'Is Speech' },
    { id: 'isMusic', type: 'boolean', label: 'Is Music' },
    { id: 'detected', type: 'boolean', label: 'Detected' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    {
      id: 'enabled',
      type: 'toggle',
      label: 'Enabled',
      default: true,
    },
    {
      id: 'classifyInterval',
      type: 'number',
      label: 'Interval (ms)',
      default: 500,
      props: { min: 100, max: 5000, step: 100 },
    },
    {
      id: 'maxResults',
      type: 'slider',
      label: 'Max Results',
      default: 5,
      props: { min: 1, max: 20, step: 1 },
    },
    {
      id: 'scoreThreshold',
      type: 'slider',
      label: 'Min Score',
      default: 0.3,
      props: { min: 0, max: 1, step: 0.05 },
    },
  ],
  tags: ['audio classification', 'mediapipe', 'yamnet', 'sound', 'audio', 'ai'],
  info: {
    overview: 'Classifies audio input using the MediaPipe YamNet model, identifying sounds like speech, music, and environmental noise. Outputs the top category, confidence score, and convenience booleans for speech and music detection.',
    tips: [
      'Raise the min score threshold to filter out low-confidence classifications.',
      'Use the isSpeech output to trigger speech recognition only when someone is actually talking.',
    ],
    pairsWith: ['audio-input', 'speech-recognition', 'gate', 'monitor'],
  },
}

export const mediapipeAudioExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const audioInput = ctx.inputs.get('audio')
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true
  const classifyInterval = (ctx.controls.get('classifyInterval') as number) ?? 500 // ms

  // Get node-specific state
  const state = getAudioClassifierState(ctx.nodeId)
  const now = Date.now()

  if (!enabled || !audioInput) {
    outputs.set('category', getCached(`${ctx.nodeId}:category`, ''))
    outputs.set('confidence', getCached(`${ctx.nodeId}:confidence`, 0))
    outputs.set('categories', getCached(`${ctx.nodeId}:categories`, []))
    outputs.set('isSpeech', getCached(`${ctx.nodeId}:isSpeech`, false))
    outputs.set('isMusic', getCached(`${ctx.nodeId}:isMusic`, false))
    outputs.set('detected', false)
    outputs.set('loading', mediaPipeService.isLoading('audio'))
    return outputs
  }

  // Check if loading
  if (mediaPipeService.isLoading('audio')) {
    outputs.set('category', getCached(`${ctx.nodeId}:category`, ''))
    outputs.set('confidence', getCached(`${ctx.nodeId}:confidence`, 0))
    outputs.set('categories', getCached(`${ctx.nodeId}:categories`, []))
    outputs.set('isSpeech', getCached(`${ctx.nodeId}:isSpeech`, false))
    outputs.set('isMusic', getCached(`${ctx.nodeId}:isMusic`, false))
    outputs.set('detected', false)
    outputs.set('loading', true)
    return outputs
  }

  // Handle audio input - can be Tone.js node
  if (isToneAudioNode(audioInput)) {
    // Connect AudioBufferService to Tone.js node if not already connected
    if (state.connectedAudioNode !== audioInput && !state.connecting) {
      state.connecting = true
      state.connectedAudioNode = audioInput

      state.audioBufferService
        .connectSource(audioInput, {
          bufferDuration: 2, // 2 seconds buffer
          sampleRate: 16000, // YAMNet expects 16kHz
        })
        .then(() => {
          state.connecting = false
        })
        .catch((err) => {
          console.error('[MediaPipe Audio] Failed to connect AudioBufferService:', err)
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

  // If connecting or not connected, return cached values
  if (state.connecting || !state.audioBufferService.connected) {
    outputs.set('category', getCached(`${ctx.nodeId}:category`, ''))
    outputs.set('confidence', getCached(`${ctx.nodeId}:confidence`, 0))
    outputs.set('categories', getCached(`${ctx.nodeId}:categories`, []))
    outputs.set('isSpeech', getCached(`${ctx.nodeId}:isSpeech`, false))
    outputs.set('isMusic', getCached(`${ctx.nodeId}:isMusic`, false))
    outputs.set('detected', false)
    outputs.set('loading', state.connecting)
    if (state.connecting) {
      outputs.set('_error', 'Connecting to audio source...')
    }
    return outputs
  }

  // Rate limit classification
  if (now - state.lastClassifyTime < classifyInterval) {
    outputs.set('category', getCached(`${ctx.nodeId}:category`, ''))
    outputs.set('confidence', getCached(`${ctx.nodeId}:confidence`, 0))
    outputs.set('categories', getCached(`${ctx.nodeId}:categories`, []))
    outputs.set('isSpeech', getCached(`${ctx.nodeId}:isSpeech`, false))
    outputs.set('isMusic', getCached(`${ctx.nodeId}:isMusic`, false))
    outputs.set('detected', getCached(`${ctx.nodeId}:detected`, false))
    outputs.set('loading', false)
    return outputs
  }

  // Check if already processing
  if (pendingOperations.has(ctx.nodeId)) {
    outputs.set('category', getCached(`${ctx.nodeId}:category`, ''))
    outputs.set('confidence', getCached(`${ctx.nodeId}:confidence`, 0))
    outputs.set('categories', getCached(`${ctx.nodeId}:categories`, []))
    outputs.set('isSpeech', getCached(`${ctx.nodeId}:isSpeech`, false))
    outputs.set('isMusic', getCached(`${ctx.nodeId}:isMusic`, false))
    outputs.set('detected', getCached(`${ctx.nodeId}:detected`, false))
    outputs.set('loading', true)
    return outputs
  }

  // Get audio buffer for classification (1 second of audio)
  const audioBuffer = state.audioBufferService.getBuffer(1000)

  if (audioBuffer.length === 0) {
    outputs.set('category', getCached(`${ctx.nodeId}:category`, ''))
    outputs.set('confidence', getCached(`${ctx.nodeId}:confidence`, 0))
    outputs.set('categories', getCached(`${ctx.nodeId}:categories`, []))
    outputs.set('isSpeech', getCached(`${ctx.nodeId}:isSpeech`, false))
    outputs.set('isMusic', getCached(`${ctx.nodeId}:isMusic`, false))
    outputs.set('detected', false)
    outputs.set('loading', false)
    return outputs
  }

  state.lastClassifyTime = now
  setCached(`${ctx.nodeId}:loading`, true)

  const operation = (async () => {
    try {
      const result = await mediaPipeService.classifyAudio(audioBuffer, 16000)

      if (!result || result.categories.length === 0) {
        setCached(`${ctx.nodeId}:detected`, false)
        setCached(`${ctx.nodeId}:loading`, false)
        return
      }

      const categories = result.categories
      const topCategory = categories[0]

      // Check if any category indicates speech or music
      const categoryNames = categories.map(c => c.categoryName.toLowerCase())
      const isSpeech = categoryNames.some(name =>
        SPEECH_CATEGORIES.some(speech => name.includes(speech.toLowerCase()))
      )
      const isMusic = categoryNames.some(name =>
        MUSIC_CATEGORIES.some(music => name.includes(music.toLowerCase()))
      )

      setCached(`${ctx.nodeId}:category`, topCategory.categoryName)
      setCached(`${ctx.nodeId}:confidence`, topCategory.score)
      setCached(`${ctx.nodeId}:categories`, categories)
      setCached(`${ctx.nodeId}:isSpeech`, isSpeech)
      setCached(`${ctx.nodeId}:isMusic`, isMusic)
      setCached(`${ctx.nodeId}:detected`, true)
      setCached(`${ctx.nodeId}:loading`, false)
    } catch (error) {
      console.error('[MediaPipe Audio] Classification error:', error)
      setCached(`${ctx.nodeId}:loading`, false)
    } finally {
      pendingOperations.delete(ctx.nodeId)
    }
  })()

  pendingOperations.set(ctx.nodeId, operation)

  outputs.set('category', getCached(`${ctx.nodeId}:category`, ''))
  outputs.set('confidence', getCached(`${ctx.nodeId}:confidence`, 0))
  outputs.set('categories', getCached(`${ctx.nodeId}:categories`, []))
  outputs.set('isSpeech', getCached(`${ctx.nodeId}:isSpeech`, false))
  outputs.set('isMusic', getCached(`${ctx.nodeId}:isMusic`, false))
  outputs.set('detected', getCached(`${ctx.nodeId}:detected`, false))
  outputs.set('loading', true)

  return outputs
}

export default defineNode({ definition, executor: mediapipeAudioExecutor })
