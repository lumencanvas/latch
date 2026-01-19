/**
 * AI Node Executors
 *
 * These executors handle AI/ML nodes using Transformers.js via Web Worker.
 * IMPORTANT: Models must be pre-loaded via the AI Model Manager.
 * All inference runs off the main thread for smooth UI performance.
 */

import * as Tone from 'tone'
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { aiInference } from '@/services/ai/AIInference'
import { AudioBufferServiceImpl } from '@/services/audio/AudioBufferService'
import { getShaderRenderer } from './visual'

// Cache for node state and results
const nodeCache = new Map<string, unknown>()

// Track pending async operations per node
const pendingOperations = new Map<string, Promise<void>>()

function getCached<T>(key: string, defaultValue: T): T {
  const val = nodeCache.get(key)
  return val !== undefined ? (val as T) : defaultValue
}

function setCached(key: string, value: unknown): void {
  nodeCache.set(key, value)
}

// Helper to check for truthy trigger values
function hasTriggerValue(trigger: unknown): boolean {
  return trigger !== undefined && trigger !== null && trigger !== false && trigger !== 0 && trigger !== ''
}

// ============================================================================
// Image Input Type Conversion
// ============================================================================

/**
 * Type guards for image input types
 */
function isImageData(input: unknown): input is ImageData {
  return input instanceof ImageData
}

function isHTMLCanvasElement(input: unknown): input is HTMLCanvasElement {
  return input instanceof HTMLCanvasElement
}

function isHTMLVideoElement(input: unknown): input is HTMLVideoElement {
  return input instanceof HTMLVideoElement
}

function isWebGLTexture(input: unknown): input is WebGLTexture {
  // WebGLTexture doesn't have a global constructor in all environments
  // Check if it's an object and the renderer recognizes it
  if (!input || typeof input !== 'object') return false
  try {
    const renderer = getShaderRenderer()
    const gl = renderer.getCanvas().getContext('webgl2')
    return gl !== null && gl.isTexture(input as WebGLTexture)
  } catch {
    return false
  }
}

/**
 * Convert WebGLTexture to ImageData
 */
function webglTextureToImageData(texture: WebGLTexture): ImageData | null {
  try {
    const renderer = getShaderRenderer()
    const gl = renderer.getCanvas().getContext('webgl2')
    if (!gl) return null

    const canvas = renderer.getCanvas()
    const width = canvas.width
    const height = canvas.height

    // Create a framebuffer to read the texture
    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)

    // Check framebuffer status
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.deleteFramebuffer(fbo)
      return null
    }

    // Read pixels from texture
    const pixels = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    // Clean up
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteFramebuffer(fbo)

    // WebGL texture is upside down, need to flip vertically
    const flipped = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y++) {
      const srcRow = (height - 1 - y) * width * 4
      const dstRow = y * width * 4
      flipped.set(pixels.subarray(srcRow, srcRow + width * 4), dstRow)
    }

    return new ImageData(new Uint8ClampedArray(flipped), width, height)
  } catch (err) {
    console.error('[AI] Failed to convert WebGLTexture to ImageData:', err)
    return null
  }
}

/**
 * Convert HTMLVideoElement to ImageData
 */
function videoElementToImageData(video: HTMLVideoElement): ImageData | null {
  try {
    const width = video.videoWidth || video.width || 640
    const height = video.videoHeight || video.height || 480

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0, width, height)
    return ctx.getImageData(0, 0, width, height)
  } catch (err) {
    console.error('[AI] Failed to convert HTMLVideoElement to ImageData:', err)
    return null
  }
}

/**
 * Convert HTMLCanvasElement to ImageData
 */
function canvasElementToImageData(canvas: HTMLCanvasElement): ImageData | null {
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  } catch (err) {
    console.error('[AI] Failed to convert HTMLCanvasElement to ImageData:', err)
    return null
  }
}

/**
 * Convert any supported image input to ImageData for AI processing
 * Supports: ImageData, HTMLCanvasElement, HTMLVideoElement, WebGLTexture
 */
function convertToImageData(input: unknown): ImageData | null {
  if (!input) return null

  // Already ImageData - return as-is
  if (isImageData(input)) {
    return input
  }

  // HTMLCanvasElement - extract ImageData
  if (isHTMLCanvasElement(input)) {
    return canvasElementToImageData(input)
  }

  // HTMLVideoElement - draw to canvas, extract ImageData
  if (isHTMLVideoElement(input)) {
    return videoElementToImageData(input)
  }

  // WebGLTexture - read pixels via framebuffer
  if (isWebGLTexture(input)) {
    return webglTextureToImageData(input as WebGLTexture)
  }

  // Unknown type
  console.warn('[AI] Unknown image input type:', typeof input, input)
  return null
}

// ============================================================================
// Text Generation Node
// ============================================================================

export const textGenerationExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const trigger = ctx.inputs.get('trigger')

  // Get prompt from: 1) prompt input, 2) trigger value if string, 3) control
  let prompt = (ctx.inputs.get('prompt') as string) ?? ''

  // If trigger is a non-empty string and no prompt input, use trigger as prompt
  if (!prompt && typeof trigger === 'string' && trigger.trim()) {
    prompt = trigger
  }

  // Fall back to control value if still no prompt
  if (!prompt) {
    prompt = (ctx.controls.get('prompt') as string) ?? ''
  }

  // Check if model is loaded
  const modelId = ctx.controls.get('model') as string | undefined
  const isLoaded = aiInference.isModelLoaded('text-generation', modelId)

  if (!isLoaded) {
    outputs.set('text', getCached(`${ctx.nodeId}:lastOutput`, ''))
    outputs.set('loading', false)
    outputs.set('_error', 'Model not loaded. Open AI Model Manager to load.')
    return outputs
  }

  // Only run on explicit trigger
  if (!hasTriggerValue(trigger)) {
    outputs.set('text', getCached(`${ctx.nodeId}:lastOutput`, ''))
    outputs.set('loading', getCached(`${ctx.nodeId}:loading`, false))
    return outputs
  }

  // Check if already processing
  if (pendingOperations.has(ctx.nodeId)) {
    outputs.set('text', getCached(`${ctx.nodeId}:lastOutput`, ''))
    outputs.set('loading', true)
    return outputs
  }

  if (!prompt.trim()) {
    outputs.set('text', '')
    outputs.set('loading', false)
    return outputs
  }

  // Start async generation - runs in web worker, non-blocking
  setCached(`${ctx.nodeId}:loading`, true)

  const maxTokens = (ctx.controls.get('maxTokens') as number) ?? 50
  const temperature = (ctx.controls.get('temperature') as number) ?? 0.7

  const operation = (async () => {
    try {
      const result = await aiInference.generateText(prompt, {
        maxLength: maxTokens,
        temperature,
      }, modelId)
      setCached(`${ctx.nodeId}:lastOutput`, result)
      setCached(`${ctx.nodeId}:loading`, false)
    } catch (error) {
      console.error('[AI Executor] Text generation error:', error)
      setCached(`${ctx.nodeId}:loading`, false)
    } finally {
      pendingOperations.delete(ctx.nodeId)
    }
  })()

  pendingOperations.set(ctx.nodeId, operation)

  outputs.set('text', getCached(`${ctx.nodeId}:lastOutput`, ''))
  outputs.set('loading', true)
  return outputs
}

// ============================================================================
// Image Classification Node
// ============================================================================

export const imageClassificationExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const imageInput = ctx.inputs.get('image')
  const trigger = ctx.inputs.get('trigger')

  // Check if model is loaded
  const modelId = ctx.controls.get('model') as string | undefined
  const isLoaded = aiInference.isModelLoaded('image-classification', modelId)

  if (!isLoaded) {
    outputs.set('labels', [])
    outputs.set('topLabel', '')
    outputs.set('topScore', 0)
    outputs.set('loading', false)
    outputs.set('_error', 'Model not loaded. Open AI Model Manager to load.')
    return outputs
  }

  // Convert image input to ImageData (handles WebGLTexture, HTMLVideoElement, etc.)
  const imageData = convertToImageData(imageInput)

  if (!imageData) {
    outputs.set('labels', getCached(`${ctx.nodeId}:labels`, []))
    outputs.set('topLabel', getCached(`${ctx.nodeId}:topLabel`, ''))
    outputs.set('topScore', getCached(`${ctx.nodeId}:topScore`, 0))
    outputs.set('loading', false)
    if (imageInput) {
      outputs.set('_error', 'Unsupported image input type. Use Webcam Snapshot or Texture to Data node.')
    }
    return outputs
  }

  // Run on explicit trigger or frame interval
  const hasTrigger = hasTriggerValue(trigger)
  const currentFrame = ctx.frameCount
  const lastFrame = getCached<number>(`${ctx.nodeId}:lastFrame`, 0)
  const interval = (ctx.controls.get('interval') as number) ?? 60

  if (!hasTrigger && lastFrame && (currentFrame - lastFrame) < interval) {
    outputs.set('labels', getCached(`${ctx.nodeId}:labels`, []))
    outputs.set('topLabel', getCached(`${ctx.nodeId}:topLabel`, ''))
    outputs.set('topScore', getCached(`${ctx.nodeId}:topScore`, 0))
    outputs.set('loading', getCached(`${ctx.nodeId}:loading`, false))
    return outputs
  }

  // Check if already processing
  if (pendingOperations.has(ctx.nodeId)) {
    outputs.set('labels', getCached(`${ctx.nodeId}:labels`, []))
    outputs.set('topLabel', getCached(`${ctx.nodeId}:topLabel`, ''))
    outputs.set('topScore', getCached(`${ctx.nodeId}:topScore`, 0))
    outputs.set('loading', true)
    return outputs
  }

  setCached(`${ctx.nodeId}:loading`, true)
  setCached(`${ctx.nodeId}:lastFrame`, currentFrame)

  const topK = (ctx.controls.get('topK') as number) ?? 5

  const operation = (async () => {
    try {
      const results = await aiInference.classifyImage(imageData, topK, modelId)
      setCached(`${ctx.nodeId}:labels`, results)
      const topResult = results[0]
      setCached(`${ctx.nodeId}:topLabel`, topResult?.label ?? '')
      setCached(`${ctx.nodeId}:topScore`, topResult?.score ?? 0)
      setCached(`${ctx.nodeId}:loading`, false)
    } catch (error) {
      console.error('[AI] Image classification error:', error)
      setCached(`${ctx.nodeId}:loading`, false)
    } finally {
      pendingOperations.delete(ctx.nodeId)
    }
  })()

  pendingOperations.set(ctx.nodeId, operation)

  outputs.set('labels', getCached(`${ctx.nodeId}:labels`, []))
  outputs.set('topLabel', getCached(`${ctx.nodeId}:topLabel`, ''))
  outputs.set('topScore', getCached(`${ctx.nodeId}:topScore`, 0))
  outputs.set('loading', true)
  return outputs
}

// ============================================================================
// Sentiment Analysis Node
// ============================================================================

export const sentimentAnalysisExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const text = (ctx.inputs.get('text') as string) ?? ''
  const trigger = ctx.inputs.get('trigger')

  // Check if model is loaded
  const modelId = ctx.controls.get('model') as string | undefined
  const isLoaded = aiInference.isModelLoaded('sentiment-analysis', modelId)

  if (!isLoaded) {
    outputs.set('sentiment', '')
    outputs.set('score', 0)
    outputs.set('positive', 0)
    outputs.set('negative', 0)
    outputs.set('loading', false)
    outputs.set('_error', 'Model not loaded. Open AI Model Manager to load.')
    return outputs
  }

  if (!text.trim()) {
    outputs.set('sentiment', '')
    outputs.set('score', 0)
    outputs.set('positive', 0)
    outputs.set('negative', 0)
    outputs.set('loading', false)
    return outputs
  }

  // Run on explicit trigger or text change
  const hasTrigger = hasTriggerValue(trigger)
  const lastText = getCached<string>(`${ctx.nodeId}:lastText`, '')
  const textChanged = text !== lastText

  if (!hasTrigger && !textChanged) {
    outputs.set('sentiment', getCached(`${ctx.nodeId}:sentiment`, ''))
    outputs.set('score', getCached(`${ctx.nodeId}:score`, 0))
    outputs.set('positive', getCached(`${ctx.nodeId}:positive`, 0))
    outputs.set('negative', getCached(`${ctx.nodeId}:negative`, 0))
    outputs.set('loading', false)
    return outputs
  }

  // Check if already processing
  if (pendingOperations.has(ctx.nodeId)) {
    outputs.set('sentiment', getCached(`${ctx.nodeId}:sentiment`, ''))
    outputs.set('score', getCached(`${ctx.nodeId}:score`, 0))
    outputs.set('positive', getCached(`${ctx.nodeId}:positive`, 0))
    outputs.set('negative', getCached(`${ctx.nodeId}:negative`, 0))
    outputs.set('loading', true)
    return outputs
  }

  setCached(`${ctx.nodeId}:loading`, true)
  setCached(`${ctx.nodeId}:lastText`, text)

  const operation = (async () => {
    try {
      const results = await aiInference.analyzeSentiment(text, modelId)

      let positive = 0
      let negative = 0
      for (const result of results) {
        if (result.label.toLowerCase().includes('positive')) {
          positive = result.score
        } else if (result.label.toLowerCase().includes('negative')) {
          negative = result.score
        }
      }

      const topResult = results[0]
      setCached(`${ctx.nodeId}:sentiment`, topResult?.label ?? '')
      setCached(`${ctx.nodeId}:score`, topResult?.score ?? 0)
      setCached(`${ctx.nodeId}:positive`, positive)
      setCached(`${ctx.nodeId}:negative`, negative)
      setCached(`${ctx.nodeId}:loading`, false)
    } catch (error) {
      console.error('[AI] Sentiment analysis error:', error)
      setCached(`${ctx.nodeId}:loading`, false)
    } finally {
      pendingOperations.delete(ctx.nodeId)
    }
  })()

  pendingOperations.set(ctx.nodeId, operation)

  outputs.set('sentiment', getCached(`${ctx.nodeId}:sentiment`, ''))
  outputs.set('score', getCached(`${ctx.nodeId}:score`, 0))
  outputs.set('positive', getCached(`${ctx.nodeId}:positive`, 0))
  outputs.set('negative', getCached(`${ctx.nodeId}:negative`, 0))
  outputs.set('loading', true)
  return outputs
}

// ============================================================================
// Image Captioning Node
// ============================================================================

export const imageCaptioningExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const imageInput = ctx.inputs.get('image')
  const trigger = ctx.inputs.get('trigger')

  // Check if model is loaded
  const modelId = ctx.controls.get('model') as string | undefined
  const isLoaded = aiInference.isModelLoaded('image-to-text', modelId)

  if (!isLoaded) {
    outputs.set('caption', getCached(`${ctx.nodeId}:caption`, ''))
    outputs.set('loading', false)
    outputs.set('_error', 'Model not loaded. Open AI Model Manager to load.')
    return outputs
  }

  // Convert image input to ImageData (handles WebGLTexture, HTMLVideoElement, etc.)
  const imageData = convertToImageData(imageInput)

  if (!imageData) {
    outputs.set('caption', '')
    outputs.set('loading', false)
    if (imageInput) {
      outputs.set('_error', 'Unsupported image input type. Use Webcam Snapshot or Texture to Data node.')
    }
    return outputs
  }

  // Run on explicit trigger or frame interval
  const hasTrigger = hasTriggerValue(trigger)
  const currentFrame = ctx.frameCount
  const lastFrame = getCached<number>(`${ctx.nodeId}:lastFrame`, 0)
  const interval = (ctx.controls.get('interval') as number) ?? 120

  if (!hasTrigger && lastFrame && (currentFrame - lastFrame) < interval) {
    outputs.set('caption', getCached(`${ctx.nodeId}:caption`, ''))
    outputs.set('loading', getCached(`${ctx.nodeId}:loading`, false))
    return outputs
  }

  // Check if already processing
  if (pendingOperations.has(ctx.nodeId)) {
    outputs.set('caption', getCached(`${ctx.nodeId}:caption`, ''))
    outputs.set('loading', true)
    return outputs
  }

  setCached(`${ctx.nodeId}:loading`, true)
  setCached(`${ctx.nodeId}:lastFrame`, currentFrame)

  const operation = (async () => {
    try {
      const caption = await aiInference.captionImage(imageData, modelId)
      setCached(`${ctx.nodeId}:caption`, caption)
      setCached(`${ctx.nodeId}:loading`, false)
    } catch (error) {
      console.error('[AI] Image captioning error:', error)
      setCached(`${ctx.nodeId}:loading`, false)
    } finally {
      pendingOperations.delete(ctx.nodeId)
    }
  })()

  pendingOperations.set(ctx.nodeId, operation)

  outputs.set('caption', getCached(`${ctx.nodeId}:caption`, ''))
  outputs.set('loading', true)
  return outputs
}

// ============================================================================
// Feature Extraction (Embeddings) Node
// ============================================================================

export const featureExtractionExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const text = (ctx.inputs.get('text') as string) ?? ''
  const trigger = ctx.inputs.get('trigger')

  // Check if model is loaded
  const modelId = ctx.controls.get('model') as string | undefined
  const isLoaded = aiInference.isModelLoaded('feature-extraction', modelId)

  if (!isLoaded) {
    outputs.set('embedding', [])
    outputs.set('dimensions', 0)
    outputs.set('loading', false)
    outputs.set('_error', 'Model not loaded. Open AI Model Manager to load.')
    return outputs
  }

  if (!text.trim()) {
    outputs.set('embedding', [])
    outputs.set('dimensions', 0)
    outputs.set('loading', false)
    return outputs
  }

  // Run on explicit trigger or text change
  const hasTrigger = hasTriggerValue(trigger)
  const lastText = getCached<string>(`${ctx.nodeId}:lastText`, '')
  const textChanged = text !== lastText

  if (!hasTrigger && !textChanged) {
    outputs.set('embedding', getCached(`${ctx.nodeId}:embedding`, []))
    outputs.set('dimensions', getCached(`${ctx.nodeId}:dimensions`, 0))
    outputs.set('loading', false)
    return outputs
  }

  // Check if already processing
  if (pendingOperations.has(ctx.nodeId)) {
    outputs.set('embedding', getCached(`${ctx.nodeId}:embedding`, []))
    outputs.set('dimensions', getCached(`${ctx.nodeId}:dimensions`, 0))
    outputs.set('loading', true)
    return outputs
  }

  setCached(`${ctx.nodeId}:loading`, true)
  setCached(`${ctx.nodeId}:lastText`, text)

  const operation = (async () => {
    try {
      const embedding = await aiInference.extractFeatures(text, modelId)
      setCached(`${ctx.nodeId}:embedding`, embedding)
      setCached(`${ctx.nodeId}:dimensions`, embedding.length)
      setCached(`${ctx.nodeId}:loading`, false)
    } catch (error) {
      console.error('[AI] Feature extraction error:', error)
      setCached(`${ctx.nodeId}:loading`, false)
    } finally {
      pendingOperations.delete(ctx.nodeId)
    }
  })()

  pendingOperations.set(ctx.nodeId, operation)

  outputs.set('embedding', getCached(`${ctx.nodeId}:embedding`, []))
  outputs.set('dimensions', getCached(`${ctx.nodeId}:dimensions`, 0))
  outputs.set('loading', true)
  return outputs
}

// ============================================================================
// Speech Recognition Node
// ============================================================================

// Track per-node audio buffer service and state
interface STTNodeState {
  audioBufferService: AudioBufferServiceImpl
  connectedAudioNode: Tone.ToneAudioNode | null
  connecting: boolean
  lastChunkTime: number
  vadWasSpeaking: boolean
  fullText: string // Accumulated text for continuous mode
}

const sttState = new Map<string, STTNodeState>()

function getSTTState(nodeId: string): STTNodeState {
  let state = sttState.get(nodeId)
  if (!state) {
    state = {
      audioBufferService: new AudioBufferServiceImpl(),
      connectedAudioNode: null,
      connecting: false,
      lastChunkTime: 0,
      vadWasSpeaking: false,
      fullText: '',
    }
    sttState.set(nodeId, state)
  }
  return state
}

// Check if audio input is a Tone.js node
function isToneAudioNode(audio: unknown): audio is Tone.ToneAudioNode {
  return audio !== null && typeof audio === 'object' && 'connect' in audio && typeof (audio as Tone.ToneAudioNode).connect === 'function'
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
          console.log('[STT] AudioBufferService connected to audio source')
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
      console.log(`[STT] Transcribing ${audioData.length} samples (${(audioData.length / 16000).toFixed(2)}s at 16kHz)`)
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
    } catch (error) {
      console.error('[STT] Speech recognition error:', error)
      setCached(`${ctx.nodeId}:loading`, false)
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

// Cleanup function for STT state
export function disposeSTTNode(nodeId: string): void {
  const state = sttState.get(nodeId)
  if (state) {
    state.audioBufferService.disconnect()
    sttState.delete(nodeId)
  }
}

// ============================================================================
// Text Transformation Node
// ============================================================================

export const textTransformationExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const trigger = ctx.inputs.get('trigger')

  // Get text from input or control
  let text = (ctx.inputs.get('text') as string) ?? ''
  if (!text) {
    text = (ctx.controls.get('text') as string) ?? ''
  }

  // Check if model is loaded
  const modelId = ctx.controls.get('model') as string | undefined
  const isLoaded = aiInference.isModelLoaded('text2text-generation', modelId)

  if (!isLoaded) {
    outputs.set('result', getCached(`${ctx.nodeId}:result`, ''))
    outputs.set('loading', false)
    outputs.set('_error', 'Model not loaded. Open AI Model Manager to load.')
    return outputs
  }

  if (!text.trim()) {
    outputs.set('result', '')
    outputs.set('loading', false)
    return outputs
  }

  // Only run on explicit trigger
  if (!hasTriggerValue(trigger)) {
    outputs.set('result', getCached(`${ctx.nodeId}:result`, ''))
    outputs.set('loading', getCached(`${ctx.nodeId}:loading`, false))
    return outputs
  }

  // Check if already processing
  if (pendingOperations.has(ctx.nodeId)) {
    outputs.set('result', getCached(`${ctx.nodeId}:result`, ''))
    outputs.set('loading', true)
    return outputs
  }

  setCached(`${ctx.nodeId}:loading`, true)

  const task = (ctx.controls.get('task') as string) ?? 'summarize'
  const maxTokens = (ctx.controls.get('maxTokens') as number) ?? 100

  // Prepend task instruction for T5/Flan models
  let taskPrompt: string
  switch (task) {
    case 'summarize':
      taskPrompt = `summarize: ${text}`
      break
    case 'translate':
      taskPrompt = `translate English to French: ${text}`
      break
    case 'paraphrase':
      taskPrompt = `paraphrase: ${text}`
      break
    default:
      taskPrompt = text
  }

  const operation = (async () => {
    try {
      const result = await aiInference.text2text(taskPrompt, { maxLength: maxTokens }, modelId)
      setCached(`${ctx.nodeId}:result`, result)
      setCached(`${ctx.nodeId}:loading`, false)
    } catch (error) {
      console.error('[AI] Text transformation error:', error)
      setCached(`${ctx.nodeId}:loading`, false)
    } finally {
      pendingOperations.delete(ctx.nodeId)
    }
  })()

  pendingOperations.set(ctx.nodeId, operation)

  outputs.set('result', getCached(`${ctx.nodeId}:result`, ''))
  outputs.set('loading', true)
  return outputs
}

// ============================================================================
// Object Detection Node
// ============================================================================

export const objectDetectionExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const imageInput = ctx.inputs.get('image')
  const trigger = ctx.inputs.get('trigger')

  // Check if model is loaded
  const modelId = ctx.controls.get('model') as string | undefined
  const isLoaded = aiInference.isModelLoaded('object-detection', modelId)

  if (!isLoaded) {
    outputs.set('objects', [])
    outputs.set('count', 0)
    outputs.set('loading', false)
    outputs.set('_error', 'Model not loaded. Open AI Model Manager to load.')
    return outputs
  }

  // Convert image input to ImageData (handles WebGLTexture, HTMLVideoElement, etc.)
  const imageData = convertToImageData(imageInput)

  if (!imageData) {
    outputs.set('objects', getCached(`${ctx.nodeId}:objects`, []))
    outputs.set('count', getCached(`${ctx.nodeId}:count`, 0))
    outputs.set('loading', false)
    if (imageInput) {
      outputs.set('_error', 'Unsupported image input type. Use Webcam Snapshot or Texture to Data node.')
    }
    return outputs
  }

  // Run on explicit trigger or frame interval
  const hasTrigger = hasTriggerValue(trigger)
  const currentFrame = ctx.frameCount
  const lastFrame = getCached<number>(`${ctx.nodeId}:lastFrame`, 0)
  const interval = (ctx.controls.get('interval') as number) ?? 60

  if (!hasTrigger && lastFrame && (currentFrame - lastFrame) < interval) {
    outputs.set('objects', getCached(`${ctx.nodeId}:objects`, []))
    outputs.set('count', getCached(`${ctx.nodeId}:count`, 0))
    outputs.set('loading', getCached(`${ctx.nodeId}:loading`, false))
    return outputs
  }

  // Check if already processing
  if (pendingOperations.has(ctx.nodeId)) {
    outputs.set('objects', getCached(`${ctx.nodeId}:objects`, []))
    outputs.set('count', getCached(`${ctx.nodeId}:count`, 0))
    outputs.set('loading', true)
    return outputs
  }

  setCached(`${ctx.nodeId}:loading`, true)
  setCached(`${ctx.nodeId}:lastFrame`, currentFrame)

  const threshold = (ctx.controls.get('threshold') as number) ?? 0.5

  const operation = (async () => {
    try {
      const objects = await aiInference.detectObjects(imageData, threshold, modelId)
      setCached(`${ctx.nodeId}:objects`, objects)
      setCached(`${ctx.nodeId}:count`, objects.length)
      setCached(`${ctx.nodeId}:loading`, false)
    } catch (error) {
      console.error('[AI] Object detection error:', error)
      setCached(`${ctx.nodeId}:loading`, false)
    } finally {
      pendingOperations.delete(ctx.nodeId)
    }
  })()

  pendingOperations.set(ctx.nodeId, operation)

  outputs.set('objects', getCached(`${ctx.nodeId}:objects`, []))
  outputs.set('count', getCached(`${ctx.nodeId}:count`, 0))
  outputs.set('loading', true)
  return outputs
}

// ============================================================================
// Cleanup helpers
// ============================================================================

export function disposeAINode(nodeId: string): void {
  const keys = Array.from(nodeCache.keys()).filter(k => k.startsWith(nodeId))
  keys.forEach(k => nodeCache.delete(k))
  pendingOperations.delete(nodeId)
  sttState.delete(nodeId)
}

export function disposeAllAINodes(): void {
  nodeCache.clear()
  pendingOperations.clear()
  sttState.clear()
}

// ============================================================================
// Registry
// ============================================================================

export const aiExecutors: Record<string, NodeExecutorFn> = {
  'text-generation': textGenerationExecutor,
  'image-classification': imageClassificationExecutor,
  'sentiment-analysis': sentimentAnalysisExecutor,
  'image-captioning': imageCaptioningExecutor,
  'feature-extraction': featureExtractionExecutor,
  'object-detection': objectDetectionExecutor,
  'speech-recognition': speechRecognitionExecutor,
  'text-transformation': textTransformationExecutor,
}
