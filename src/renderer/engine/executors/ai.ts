/**
 * AI Node Executors
 *
 * These executors handle AI/ML nodes using Transformers.js via Web Worker.
 * IMPORTANT: Models must be pre-loaded via the AI Model Manager.
 * All inference runs off the main thread for smooth UI performance.
 */

import * as Tone from 'tone'
import * as THREE from 'three'
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { aiInference } from '@/services/ai/AIInference'
import { AudioBufferServiceImpl } from '@/services/audio/AudioBufferService'
import { getThreeShaderRenderer } from './visual'

// Cache for node state and results
const nodeCache = new Map<string, unknown>()

// Track pending async operations per node
const pendingOperations = new Map<string, Promise<void>>()

// Track disposed nodes to prevent async callbacks from updating stale state
const disposedNodes = new Set<string>()

// Check if a node has been disposed (for use in async callbacks)
export function isNodeDisposed(nodeId: string): boolean {
  return disposedNodes.has(nodeId)
}

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
  // Use ThreeShaderRenderer's context to check (avoids creating extra WebGL contexts)
  if (!input || typeof input !== 'object') return false
  // Quick check: THREE.Texture is not a WebGLTexture
  if (input instanceof THREE.Texture) return false
  try {
    const renderer = getThreeShaderRenderer()
    const gl = renderer.getContext()
    return gl !== null && gl.isTexture(input as WebGLTexture)
  } catch {
    return false
  }
}

function isThreeTexture(input: unknown): input is THREE.Texture {
  return input instanceof THREE.Texture
}

/**
 * Convert WebGLTexture to ImageData (legacy fallback)
 * Uses ThreeShaderRenderer's context to avoid creating extra WebGL contexts
 */
function webglTextureToImageData(texture: WebGLTexture): ImageData | null {
  try {
    const renderer = getThreeShaderRenderer()
    const gl = renderer.getContext()
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
 * Convert THREE.Texture to ImageData
 */
function threeTextureToImageData(texture: THREE.Texture): ImageData | null {
  try {
    const renderer = getThreeShaderRenderer()

    // Get texture dimensions
    const width = texture.image?.width || 512
    const height = texture.image?.height || 512

    // Create a temporary canvas to render the texture
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = width
    tempCanvas.height = height

    // Use ThreeShaderRenderer to render the texture to canvas
    renderer.renderToCanvas(texture, tempCanvas)

    // Extract ImageData from the canvas
    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return null

    return ctx.getImageData(0, 0, width, height)
  } catch (err) {
    console.error('[AI] Failed to convert THREE.Texture to ImageData:', err)
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
 * Supports: ImageData, HTMLCanvasElement, HTMLVideoElement, THREE.Texture, WebGLTexture
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

  // THREE.Texture - render to canvas, extract ImageData (preferred format)
  if (isThreeTexture(input)) {
    return threeTextureToImageData(input)
  }

  // WebGLTexture (legacy) - read pixels via framebuffer
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
// MediaPipe Hand Tracking Node
// ============================================================================

import {
  mediaPipeService,
  extractFingerTips,
  recognizeGesture,
  extractHeadRotation,
  calculateFaceBox,
  extractBlendshapeValues,
} from '@/services/ai/MediaPipeService'

export const mediapipeHandExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const videoInput = ctx.inputs.get('video') as HTMLVideoElement | null
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true
  const handIndex = (ctx.controls.get('handIndex') as number) ?? 0

  if (!enabled || !videoInput) {
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('worldLandmarks', getCached(`${ctx.nodeId}:worldLandmarks`, []))
    outputs.set('handedness', getCached(`${ctx.nodeId}:handedness`, ''))
    outputs.set('confidence', getCached(`${ctx.nodeId}:confidence`, 0))
    outputs.set('gestureType', getCached(`${ctx.nodeId}:gestureType`, 'unknown'))
    outputs.set('fingerTips', getCached(`${ctx.nodeId}:fingerTips`, null))
    outputs.set('handCount', getCached(`${ctx.nodeId}:handCount`, 0))
    outputs.set('allHands', getCached(`${ctx.nodeId}:allHands`, []))
    outputs.set('detected', false)
    outputs.set('loading', mediaPipeService.isLoading('hand'))
    return outputs
  }

  // Check if loading
  if (mediaPipeService.isLoading('hand')) {
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('worldLandmarks', getCached(`${ctx.nodeId}:worldLandmarks`, []))
    outputs.set('handedness', '')
    outputs.set('confidence', 0)
    outputs.set('gestureType', 'unknown')
    outputs.set('fingerTips', null)
    outputs.set('handCount', 0)
    outputs.set('allHands', getCached(`${ctx.nodeId}:allHands`, []))
    outputs.set('detected', false)
    outputs.set('loading', true)
    return outputs
  }

  try {
    const result = await mediaPipeService.detectHands(videoInput, ctx.totalTime * 1000)

    if (!result || result.landmarks.length === 0) {
      setCached(`${ctx.nodeId}:detected`, false)
      setCached(`${ctx.nodeId}:handCount`, 0)
      setCached(`${ctx.nodeId}:allHands`, [])
      outputs.set('landmarks', [])
      outputs.set('worldLandmarks', [])
      outputs.set('handedness', '')
      outputs.set('confidence', 0)
      outputs.set('gestureType', 'unknown')
      outputs.set('fingerTips', null)
      outputs.set('handCount', 0)
      outputs.set('allHands', [])
      outputs.set('detected', false)
      outputs.set('loading', false)
      return outputs
    }

    // Get the selected hand (for individual outputs)
    const idx = Math.min(handIndex, result.landmarks.length - 1)
    const landmarks = result.landmarks[idx] || []
    const worldLandmarks = result.worldLandmarks[idx] || []
    const handedness = result.handedness[idx]?.categoryName || ''
    const confidence = result.handedness[idx]?.score || 0

    // Extract gesture and finger tips
    const gestureType = recognizeGesture(landmarks)
    const fingerTips = extractFingerTips(landmarks)

    // Build all hands data for visualization
    const allHands = result.landmarks.map((lm, i) => ({
      landmarks: lm,
      worldLandmarks: result.worldLandmarks[i] || [],
      handedness: result.handedness[i]?.categoryName || '',
      confidence: result.handedness[i]?.score || 0,
    }))

    setCached(`${ctx.nodeId}:landmarks`, landmarks)
    setCached(`${ctx.nodeId}:worldLandmarks`, worldLandmarks)
    setCached(`${ctx.nodeId}:handedness`, handedness)
    setCached(`${ctx.nodeId}:confidence`, confidence)
    setCached(`${ctx.nodeId}:gestureType`, gestureType)
    setCached(`${ctx.nodeId}:fingerTips`, fingerTips)
    setCached(`${ctx.nodeId}:handCount`, result.landmarks.length)
    setCached(`${ctx.nodeId}:allHands`, allHands)
    setCached(`${ctx.nodeId}:detected`, true)

    outputs.set('landmarks', landmarks)
    outputs.set('worldLandmarks', worldLandmarks)
    outputs.set('handedness', handedness)
    outputs.set('confidence', confidence)
    outputs.set('gestureType', gestureType)
    outputs.set('fingerTips', fingerTips)
    outputs.set('handCount', result.landmarks.length)
    outputs.set('allHands', allHands)
    outputs.set('detected', true)
    outputs.set('loading', false)
  } catch (error) {
    console.error('[MediaPipe Hand] Detection error:', error)
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('worldLandmarks', getCached(`${ctx.nodeId}:worldLandmarks`, []))
    outputs.set('handedness', '')
    outputs.set('confidence', 0)
    outputs.set('gestureType', 'unknown')
    outputs.set('fingerTips', null)
    outputs.set('handCount', 0)
    outputs.set('allHands', getCached(`${ctx.nodeId}:allHands`, []))
    outputs.set('detected', false)
    outputs.set('loading', false)
    outputs.set('_error', error instanceof Error ? error.message : 'Detection failed')
  }

  return outputs
}

// ============================================================================
// MediaPipe Face Mesh Node
// ============================================================================

export const mediapipeFaceExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const videoInput = ctx.inputs.get('video') as HTMLVideoElement | null
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true

  if (!enabled || !videoInput) {
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('blendshapes', getCached(`${ctx.nodeId}:blendshapes`, {}))
    outputs.set('headRotation', getCached(`${ctx.nodeId}:headRotation`, null))
    outputs.set('pitch', 0)
    outputs.set('yaw', 0)
    outputs.set('roll', 0)
    outputs.set('faceBox', getCached(`${ctx.nodeId}:faceBox`, null))
    outputs.set('mouthOpen', 0)
    outputs.set('eyeBlinkLeft', 0)
    outputs.set('eyeBlinkRight', 0)
    outputs.set('browRaise', 0)
    outputs.set('smile', 0)
    outputs.set('detected', false)
    outputs.set('loading', mediaPipeService.isLoading('face'))
    return outputs
  }

  // Check if loading
  if (mediaPipeService.isLoading('face')) {
    outputs.set('landmarks', [])
    outputs.set('blendshapes', {})
    outputs.set('headRotation', null)
    outputs.set('pitch', 0)
    outputs.set('yaw', 0)
    outputs.set('roll', 0)
    outputs.set('faceBox', null)
    outputs.set('mouthOpen', 0)
    outputs.set('eyeBlinkLeft', 0)
    outputs.set('eyeBlinkRight', 0)
    outputs.set('browRaise', 0)
    outputs.set('smile', 0)
    outputs.set('detected', false)
    outputs.set('loading', true)
    return outputs
  }

  try {
    const result = await mediaPipeService.detectFace(videoInput, ctx.totalTime * 1000)

    if (!result || result.landmarks.length === 0) {
      outputs.set('landmarks', [])
      outputs.set('blendshapes', {})
      outputs.set('headRotation', null)
      outputs.set('pitch', 0)
      outputs.set('yaw', 0)
      outputs.set('roll', 0)
      outputs.set('faceBox', null)
      outputs.set('mouthOpen', 0)
      outputs.set('eyeBlinkLeft', 0)
      outputs.set('eyeBlinkRight', 0)
      outputs.set('browRaise', 0)
      outputs.set('smile', 0)
      outputs.set('detected', false)
      outputs.set('loading', false)
      return outputs
    }

    const landmarks = result.landmarks[0] || []
    // faceBlendshapes[0] is a Classifications object with a 'categories' array
    const blendshapeCategories = result.blendshapes[0]?.categories
    const blendshapes = blendshapeCategories ? extractBlendshapeValues(blendshapeCategories) : {}
    const headRotation = result.transformationMatrixes[0] ? extractHeadRotation(result.transformationMatrixes[0]) : { pitch: 0, yaw: 0, roll: 0 }
    const faceBox = calculateFaceBox(landmarks)

    // Extract specific blendshape values
    const mouthOpen = blendshapes['jawOpen'] || blendshapes['mouthOpen'] || 0
    const eyeBlinkLeft = blendshapes['eyeBlinkLeft'] || 0
    const eyeBlinkRight = blendshapes['eyeBlinkRight'] || 0
    const browRaise = ((blendshapes['browInnerUp'] || 0) + (blendshapes['browOuterUpLeft'] || 0) + (blendshapes['browOuterUpRight'] || 0)) / 3
    const smile = ((blendshapes['mouthSmileLeft'] || 0) + (blendshapes['mouthSmileRight'] || 0)) / 2

    setCached(`${ctx.nodeId}:landmarks`, landmarks)
    setCached(`${ctx.nodeId}:blendshapes`, blendshapes)
    setCached(`${ctx.nodeId}:headRotation`, headRotation)
    setCached(`${ctx.nodeId}:faceBox`, faceBox)

    outputs.set('landmarks', landmarks)
    outputs.set('blendshapes', blendshapes)
    outputs.set('headRotation', headRotation)
    outputs.set('pitch', headRotation.pitch)
    outputs.set('yaw', headRotation.yaw)
    outputs.set('roll', headRotation.roll)
    outputs.set('faceBox', faceBox)
    outputs.set('mouthOpen', mouthOpen)
    outputs.set('eyeBlinkLeft', eyeBlinkLeft)
    outputs.set('eyeBlinkRight', eyeBlinkRight)
    outputs.set('browRaise', browRaise)
    outputs.set('smile', smile)
    outputs.set('detected', true)
    outputs.set('loading', false)
  } catch (error) {
    console.error('[MediaPipe Face] Detection error:', error)
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('blendshapes', {})
    outputs.set('headRotation', null)
    outputs.set('pitch', 0)
    outputs.set('yaw', 0)
    outputs.set('roll', 0)
    outputs.set('faceBox', null)
    outputs.set('mouthOpen', 0)
    outputs.set('eyeBlinkLeft', 0)
    outputs.set('eyeBlinkRight', 0)
    outputs.set('browRaise', 0)
    outputs.set('smile', 0)
    outputs.set('detected', false)
    outputs.set('loading', false)
    outputs.set('_error', error instanceof Error ? error.message : 'Detection failed')
  }

  return outputs
}

// ============================================================================
// MediaPipe Pose Estimation Node
// ============================================================================

// Pose landmark indices
const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
}

export const mediapipePoseExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const videoInput = ctx.inputs.get('video') as HTMLVideoElement | null
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true

  if (!enabled || !videoInput) {
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('worldLandmarks', getCached(`${ctx.nodeId}:worldLandmarks`, []))
    outputs.set('visibility', getCached(`${ctx.nodeId}:visibility`, {}))
    outputs.set('nose', null)
    outputs.set('leftShoulder', null)
    outputs.set('rightShoulder', null)
    outputs.set('leftElbow', null)
    outputs.set('rightElbow', null)
    outputs.set('leftWrist', null)
    outputs.set('rightWrist', null)
    outputs.set('leftHip', null)
    outputs.set('rightHip', null)
    outputs.set('detected', false)
    outputs.set('loading', mediaPipeService.isLoading('pose'))
    return outputs
  }

  // Check if loading
  if (mediaPipeService.isLoading('pose')) {
    outputs.set('landmarks', [])
    outputs.set('worldLandmarks', [])
    outputs.set('visibility', {})
    outputs.set('nose', null)
    outputs.set('leftShoulder', null)
    outputs.set('rightShoulder', null)
    outputs.set('leftElbow', null)
    outputs.set('rightElbow', null)
    outputs.set('leftWrist', null)
    outputs.set('rightWrist', null)
    outputs.set('leftHip', null)
    outputs.set('rightHip', null)
    outputs.set('detected', false)
    outputs.set('loading', true)
    return outputs
  }

  try {
    const result = await mediaPipeService.detectPose(videoInput, ctx.totalTime * 1000)

    if (!result || result.landmarks.length === 0) {
      outputs.set('landmarks', [])
      outputs.set('worldLandmarks', [])
      outputs.set('visibility', {})
      outputs.set('nose', null)
      outputs.set('leftShoulder', null)
      outputs.set('rightShoulder', null)
      outputs.set('leftElbow', null)
      outputs.set('rightElbow', null)
      outputs.set('leftWrist', null)
      outputs.set('rightWrist', null)
      outputs.set('leftHip', null)
      outputs.set('rightHip', null)
      outputs.set('detected', false)
      outputs.set('loading', false)
      return outputs
    }

    const landmarks = result.landmarks[0] || []
    const worldLandmarks = result.worldLandmarks[0] || []

    // Build visibility map
    const visibility: Record<string, number> = {}
    landmarks.forEach((lm, i) => {
      visibility[`landmark_${i}`] = (lm as { visibility?: number }).visibility ?? 1
    })

    // Extract key body points
    const getPoint = (idx: number) => landmarks[idx] || null

    setCached(`${ctx.nodeId}:landmarks`, landmarks)
    setCached(`${ctx.nodeId}:worldLandmarks`, worldLandmarks)
    setCached(`${ctx.nodeId}:visibility`, visibility)

    outputs.set('landmarks', landmarks)
    outputs.set('worldLandmarks', worldLandmarks)
    outputs.set('visibility', visibility)
    outputs.set('nose', getPoint(POSE_LANDMARKS.NOSE))
    outputs.set('leftShoulder', getPoint(POSE_LANDMARKS.LEFT_SHOULDER))
    outputs.set('rightShoulder', getPoint(POSE_LANDMARKS.RIGHT_SHOULDER))
    outputs.set('leftElbow', getPoint(POSE_LANDMARKS.LEFT_ELBOW))
    outputs.set('rightElbow', getPoint(POSE_LANDMARKS.RIGHT_ELBOW))
    outputs.set('leftWrist', getPoint(POSE_LANDMARKS.LEFT_WRIST))
    outputs.set('rightWrist', getPoint(POSE_LANDMARKS.RIGHT_WRIST))
    outputs.set('leftHip', getPoint(POSE_LANDMARKS.LEFT_HIP))
    outputs.set('rightHip', getPoint(POSE_LANDMARKS.RIGHT_HIP))
    outputs.set('detected', true)
    outputs.set('loading', false)
  } catch (error) {
    console.error('[MediaPipe Pose] Detection error:', error)
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('worldLandmarks', [])
    outputs.set('visibility', {})
    outputs.set('nose', null)
    outputs.set('leftShoulder', null)
    outputs.set('rightShoulder', null)
    outputs.set('leftElbow', null)
    outputs.set('rightElbow', null)
    outputs.set('leftWrist', null)
    outputs.set('rightWrist', null)
    outputs.set('leftHip', null)
    outputs.set('rightHip', null)
    outputs.set('detected', false)
    outputs.set('loading', false)
    outputs.set('_error', error instanceof Error ? error.message : 'Detection failed')
  }

  return outputs
}

// ============================================================================
// MediaPipe Object Detection Node
// ============================================================================

export const mediapipeObjectExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const videoInput = ctx.inputs.get('video') as HTMLVideoElement | null
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true
  const minConfidence = (ctx.controls.get('minConfidence') as number) ?? 0.5
  const maxResults = (ctx.controls.get('maxResults') as number) ?? 10
  const labelFilter = (ctx.controls.get('labelFilter') as string) ?? ''

  if (!enabled || !videoInput) {
    outputs.set('detections', getCached(`${ctx.nodeId}:detections`, []))
    outputs.set('count', getCached(`${ctx.nodeId}:count`, 0))
    outputs.set('filtered', getCached(`${ctx.nodeId}:filtered`, []))
    outputs.set('topLabel', '')
    outputs.set('topConfidence', 0)
    outputs.set('topBox', null)
    outputs.set('detected', false)
    outputs.set('loading', mediaPipeService.isLoading('object'))
    return outputs
  }

  // Check if loading
  if (mediaPipeService.isLoading('object')) {
    outputs.set('detections', [])
    outputs.set('count', 0)
    outputs.set('filtered', [])
    outputs.set('topLabel', '')
    outputs.set('topConfidence', 0)
    outputs.set('topBox', null)
    outputs.set('detected', false)
    outputs.set('loading', true)
    return outputs
  }

  try {
    const result = await mediaPipeService.detectObjects(videoInput, ctx.totalTime * 1000)

    if (!result || result.detections.length === 0) {
      outputs.set('detections', [])
      outputs.set('count', 0)
      outputs.set('filtered', [])
      outputs.set('topLabel', '')
      outputs.set('topConfidence', 0)
      outputs.set('topBox', null)
      outputs.set('detected', false)
      outputs.set('loading', false)
      return outputs
    }

    // Filter by confidence
    let detections = result.detections.filter(d =>
      d.categories.some(c => c.score >= minConfidence)
    )

    // Filter by label if specified
    const filterLabels = labelFilter.split(',').map(l => l.trim().toLowerCase()).filter(Boolean)
    if (filterLabels.length > 0) {
      detections = detections.filter(d =>
        d.categories.some(c => filterLabels.includes(c.categoryName.toLowerCase()))
      )
    }

    // Limit results
    detections = detections.slice(0, maxResults)

    // Get top detection
    const topDetection = detections[0]
    const topCategory = topDetection?.categories[0]

    setCached(`${ctx.nodeId}:detections`, detections)
    setCached(`${ctx.nodeId}:count`, detections.length)
    setCached(`${ctx.nodeId}:filtered`, detections)

    outputs.set('detections', detections)
    outputs.set('count', detections.length)
    outputs.set('filtered', detections)
    outputs.set('topLabel', topCategory?.categoryName || '')
    outputs.set('topConfidence', topCategory?.score || 0)
    outputs.set('topBox', topDetection?.boundingBox || null)
    outputs.set('detected', detections.length > 0)
    outputs.set('loading', false)
  } catch (error) {
    console.error('[MediaPipe Object] Detection error:', error)
    outputs.set('detections', getCached(`${ctx.nodeId}:detections`, []))
    outputs.set('count', 0)
    outputs.set('filtered', [])
    outputs.set('topLabel', '')
    outputs.set('topConfidence', 0)
    outputs.set('topBox', null)
    outputs.set('detected', false)
    outputs.set('loading', false)
    outputs.set('_error', error instanceof Error ? error.message : 'Detection failed')
  }

  return outputs
}

// ============================================================================
// MediaPipe Segmentation Executor
// ============================================================================

export const mediapipeSegmentationExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const videoInput = ctx.inputs.get('video') as HTMLVideoElement | null
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true

  if (!enabled || !videoInput) {
    outputs.set('mask', getCached(`${ctx.nodeId}:mask`, null))
    outputs.set('detected', false)
    outputs.set('loading', mediaPipeService.isLoading('segmentation'))
    return outputs
  }

  // Check if loading
  if (mediaPipeService.isLoading('segmentation')) {
    outputs.set('mask', getCached(`${ctx.nodeId}:mask`, null))
    outputs.set('detected', false)
    outputs.set('loading', true)
    return outputs
  }

  try {
    const result = await mediaPipeService.segmentImage(videoInput, ctx.totalTime * 1000)

    if (!result || !result.categoryMask) {
      setCached(`${ctx.nodeId}:detected`, false)
      outputs.set('mask', null)
      outputs.set('detected', false)
      outputs.set('loading', false)
      return outputs
    }

    setCached(`${ctx.nodeId}:mask`, result.categoryMask)
    setCached(`${ctx.nodeId}:detected`, true)

    outputs.set('mask', result.categoryMask)
    outputs.set('detected', true)
    outputs.set('loading', false)
  } catch (error) {
    console.error('[MediaPipe Segmentation] Error:', error)
    outputs.set('mask', getCached(`${ctx.nodeId}:mask`, null))
    outputs.set('detected', false)
    outputs.set('loading', false)
    outputs.set('_error', error instanceof Error ? error.message : 'Segmentation failed')
  }

  return outputs
}

// ============================================================================
// MediaPipe Gesture Recognition Executor
// ============================================================================

export const mediapipeGestureExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const videoInput = ctx.inputs.get('video') as HTMLVideoElement | null
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true
  const confidenceThreshold = (ctx.controls.get('confidenceThreshold') as number) ?? 0.5

  if (!enabled || !videoInput) {
    outputs.set('gesture', 'None')
    outputs.set('confidence', 0)
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('handedness', '')
    outputs.set('handCount', 0)
    outputs.set('allGestures', [])
    outputs.set('detected', false)
    outputs.set('loading', mediaPipeService.isLoading('gesture'))
    return outputs
  }

  // Check if loading
  if (mediaPipeService.isLoading('gesture')) {
    outputs.set('gesture', getCached(`${ctx.nodeId}:gesture`, 'None'))
    outputs.set('confidence', getCached(`${ctx.nodeId}:confidence`, 0))
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('handedness', '')
    outputs.set('handCount', 0)
    outputs.set('allGestures', [])
    outputs.set('detected', false)
    outputs.set('loading', true)
    return outputs
  }

  try {
    const result = await mediaPipeService.recognizeGestures(videoInput, ctx.totalTime * 1000)

    if (!result || result.gestures.length === 0) {
      setCached(`${ctx.nodeId}:detected`, false)
      outputs.set('gesture', 'None')
      outputs.set('confidence', 0)
      outputs.set('landmarks', [])
      outputs.set('handedness', '')
      outputs.set('handCount', 0)
      outputs.set('allGestures', [])
      outputs.set('detected', false)
      outputs.set('loading', false)
      return outputs
    }

    // Build all gestures data for visualization
    const allGestures = result.gestures.map((gestureArray, i) => {
      const topGesture = gestureArray[0]
      return {
        gesture: topGesture?.categoryName || 'None',
        confidence: topGesture?.score || 0,
        handedness: result.handedness[i]?.categoryName || '',
        landmarks: result.landmarks[i] || [],
      }
    }).filter(g => g.confidence >= confidenceThreshold)

    // Get top gesture from first hand
    const topGesture = result.gestures[0]?.[0]
    const topGestureName = topGesture?.categoryName || 'None'
    const topConfidence = topGesture?.score || 0

    setCached(`${ctx.nodeId}:gesture`, topGestureName)
    setCached(`${ctx.nodeId}:confidence`, topConfidence)
    setCached(`${ctx.nodeId}:landmarks`, result.landmarks[0] || [])
    setCached(`${ctx.nodeId}:allGestures`, allGestures)
    setCached(`${ctx.nodeId}:detected`, topGestureName !== 'None')

    outputs.set('gesture', topGestureName)
    outputs.set('confidence', topConfidence)
    outputs.set('landmarks', result.landmarks[0] || [])
    outputs.set('handedness', result.handedness[0]?.categoryName || '')
    outputs.set('handCount', result.landmarks.length)
    outputs.set('allGestures', allGestures)
    outputs.set('detected', topGestureName !== 'None' && topConfidence >= confidenceThreshold)
    outputs.set('loading', false)
  } catch (error) {
    console.error('[MediaPipe Gesture] Recognition error:', error)
    outputs.set('gesture', getCached(`${ctx.nodeId}:gesture`, 'None'))
    outputs.set('confidence', 0)
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('handedness', '')
    outputs.set('handCount', 0)
    outputs.set('allGestures', [])
    outputs.set('detected', false)
    outputs.set('loading', false)
    outputs.set('_error', error instanceof Error ? error.message : 'Recognition failed')
  }

  return outputs
}

// ============================================================================
// MediaPipe Audio Classification Executor
// ============================================================================

// Audio classification is a placeholder - requires @mediapipe/tasks-audio package
// For now, output placeholder values
export const mediapipeAudioExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const audioInput = ctx.inputs.get('audio')
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true

  // Audio classification requires additional package installation
  // This is a placeholder that outputs default values
  if (!enabled || !audioInput) {
    outputs.set('category', '')
    outputs.set('confidence', 0)
    outputs.set('categories', [])
    outputs.set('isSpeech', false)
    outputs.set('isMusic', false)
    outputs.set('detected', false)
    outputs.set('loading', false)
    return outputs
  }

  // TODO: Implement audio classification when @mediapipe/tasks-audio is added
  // For now, output placeholder values indicating feature is not yet available
  outputs.set('category', 'Not implemented')
  outputs.set('confidence', 0)
  outputs.set('categories', [])
  outputs.set('isSpeech', false)
  outputs.set('isMusic', false)
  outputs.set('detected', false)
  outputs.set('loading', false)

  return outputs
}

// ============================================================================
// Cleanup helpers
// ============================================================================

export function disposeAINode(nodeId: string): void {
  // Mark as disposed to prevent async callbacks from updating stale state
  disposedNodes.add(nodeId)

  const keys = Array.from(nodeCache.keys()).filter(k => k.startsWith(nodeId))
  keys.forEach(k => nodeCache.delete(k))
  pendingOperations.delete(nodeId)

  // Disconnect STT audio service before deleting
  const stt = sttState.get(nodeId)
  if (stt?.audioBufferService) {
    stt.audioBufferService.disconnect()
  }
  sttState.delete(nodeId)
}

export function disposeAllAINodes(): void {
  // Mark all nodes as disposed
  for (const key of nodeCache.keys()) {
    const nodeId = key.split(':')[0]
    disposedNodes.add(nodeId)
  }
  for (const nodeId of pendingOperations.keys()) {
    disposedNodes.add(nodeId)
  }
  for (const nodeId of sttState.keys()) {
    disposedNodes.add(nodeId)
  }

  // Disconnect all STT audio services before clearing
  for (const state of sttState.values()) {
    if (state?.audioBufferService) {
      state.audioBufferService.disconnect()
    }
  }
  nodeCache.clear()
  pendingOperations.clear()
  sttState.clear()
}

export function gcAIState(validNodeIds: Set<string>): void {
  // Clean nodeCache - keys formatted as "nodeId:suffix"
  for (const key of nodeCache.keys()) {
    const nodeId = key.split(':')[0]
    if (!validNodeIds.has(nodeId)) {
      disposedNodes.add(nodeId)
      nodeCache.delete(key)
    }
  }

  // Clean pendingOperations
  for (const nodeId of pendingOperations.keys()) {
    if (!validNodeIds.has(nodeId)) {
      disposedNodes.add(nodeId)
      pendingOperations.delete(nodeId)
    }
  }

  // Clean sttState (disconnect audio first)
  for (const nodeId of sttState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      disposedNodes.add(nodeId)
      const state = sttState.get(nodeId)
      if (state?.audioBufferService) {
        state.audioBufferService.disconnect()
      }
      sttState.delete(nodeId)
    }
  }

  // Clean up old entries from disposedNodes set to prevent unbounded growth
  // Keep only recently disposed nodes (those not in validNodeIds)
  for (const nodeId of disposedNodes) {
    if (validNodeIds.has(nodeId)) {
      disposedNodes.delete(nodeId)
    }
  }
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
  'mediapipe-hand': mediapipeHandExecutor,
  'mediapipe-face': mediapipeFaceExecutor,
  'mediapipe-pose': mediapipePoseExecutor,
  'mediapipe-object': mediapipeObjectExecutor,
  'mediapipe-segmentation': mediapipeSegmentationExecutor,
  'mediapipe-gesture': mediapipeGestureExecutor,
  'mediapipe-audio': mediapipeAudioExecutor,
}
