/**
 * MediaPipe Service
 *
 * Centralized service for MediaPipe vision tasks including:
 * - Hand landmark detection
 * - Face landmark detection (with blendshapes)
 * - Pose landmark detection
 * - Object detection
 *
 * Uses @mediapipe/tasks-vision for all tasks.
 */

// MediaPipe types - using 'any' for runtime types to avoid InstanceType issues with private constructors
// The actual types are checked at runtime when the module is imported
type FilesetResolver = typeof import('@mediapipe/tasks-vision')['FilesetResolver']
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HandLandmarker = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FaceLandmarker = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PoseLandmarker = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ObjectDetector = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ImageSegmenter = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GestureRecognizer = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AudioClassifier = any

// ============================================================================
// Result Types
// ============================================================================

export interface Point3D {
  x: number
  y: number
  z: number
}

export interface HandResult {
  landmarks: Point3D[][]
  worldLandmarks: Point3D[][]
  handedness: Array<{ categoryName: string; score: number }>
}

// MediaPipe Classifications type (from faceBlendshapes)
export interface Classifications {
  categories: Array<{ categoryName: string; score: number }>
  headIndex?: number
  headName?: string
}

export interface FaceResult {
  landmarks: Point3D[][]
  blendshapes: Classifications[]
  transformationMatrixes: Float32Array[]
}

export interface PoseResult {
  landmarks: Point3D[][]
  worldLandmarks: Point3D[][]
  segmentationMasks: ImageData[]
}

export interface Detection {
  boundingBox: {
    originX: number
    originY: number
    width: number
    height: number
  }
  categories: Array<{
    categoryName: string
    score: number
    index: number
  }>
}

export interface ObjectDetectionResult {
  detections: Detection[]
}

export interface SegmentationResult {
  categoryMask: ImageData | null
  confidenceMasks: ImageData[]
  width: number
  height: number
}

export interface GestureResult {
  gestures: Array<Array<{ categoryName: string; score: number }>>
  handedness: Array<{ categoryName: string; score: number }>
  landmarks: Point3D[][]
  worldLandmarks: Point3D[][]
}

export interface AudioClassificationResult {
  categories: Array<{ categoryName: string; score: number }>
  timestampMs: number
}

// ============================================================================
// Gesture Recognition
// ============================================================================

export type GestureType = 'open' | 'closed' | 'pointing' | 'peace' | 'thumbs_up' | 'thumbs_down' | 'pinch' | 'unknown'

export interface FingerTips {
  thumb: Point3D | null
  index: Point3D | null
  middle: Point3D | null
  ring: Point3D | null
  pinky: Point3D | null
}

// Hand landmark indices
const HAND_LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
}

/**
 * Extract finger tip positions from hand landmarks
 */
export function extractFingerTips(landmarks: Point3D[]): FingerTips {
  if (landmarks.length < 21) {
    return { thumb: null, index: null, middle: null, ring: null, pinky: null }
  }

  return {
    thumb: landmarks[HAND_LANDMARKS.THUMB_TIP],
    index: landmarks[HAND_LANDMARKS.INDEX_TIP],
    middle: landmarks[HAND_LANDMARKS.MIDDLE_TIP],
    ring: landmarks[HAND_LANDMARKS.RING_TIP],
    pinky: landmarks[HAND_LANDMARKS.PINKY_TIP],
  }
}

/**
 * Recognize hand gesture from landmarks
 */
export function recognizeGesture(landmarks: Point3D[]): GestureType {
  if (landmarks.length < 21) return 'unknown'

  // Get key points
  const wrist = landmarks[HAND_LANDMARKS.WRIST]
  const thumbTip = landmarks[HAND_LANDMARKS.THUMB_TIP]
  const indexTip = landmarks[HAND_LANDMARKS.INDEX_TIP]
  const middleTip = landmarks[HAND_LANDMARKS.MIDDLE_TIP]
  const ringTip = landmarks[HAND_LANDMARKS.RING_TIP]
  const pinkyTip = landmarks[HAND_LANDMARKS.PINKY_TIP]

  const indexMcp = landmarks[HAND_LANDMARKS.INDEX_MCP]
  const middleMcp = landmarks[HAND_LANDMARKS.MIDDLE_MCP]
  const ringMcp = landmarks[HAND_LANDMARKS.RING_MCP]
  const pinkyMcp = landmarks[HAND_LANDMARKS.PINKY_MCP]

  // Helper to check if finger is extended
  const isExtended = (tip: Point3D, mcp: Point3D): boolean => {
    return tip.y < mcp.y - 0.05 // Finger tip is above MCP joint
  }

  const indexExtended = isExtended(indexTip, indexMcp)
  const middleExtended = isExtended(middleTip, middleMcp)
  const ringExtended = isExtended(ringTip, ringMcp)
  const pinkyExtended = isExtended(pinkyTip, pinkyMcp)

  // Calculate distance between thumb and index for pinch detection
  const pinchDistance = Math.sqrt(
    Math.pow(thumbTip.x - indexTip.x, 2) +
    Math.pow(thumbTip.y - indexTip.y, 2) +
    Math.pow(thumbTip.z - indexTip.z, 2)
  )

  // Pinch gesture
  if (pinchDistance < 0.05) {
    return 'pinch'
  }

  // Thumbs up/down
  const thumbExtended = thumbTip.y < wrist.y - 0.1
  const thumbDown = thumbTip.y > wrist.y + 0.1
  const othersCurled = !indexExtended && !middleExtended && !ringExtended && !pinkyExtended

  if (thumbExtended && othersCurled) {
    return 'thumbs_up'
  }
  if (thumbDown && othersCurled) {
    return 'thumbs_down'
  }

  // Peace sign
  if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
    return 'peace'
  }

  // Pointing
  if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return 'pointing'
  }

  // Open hand
  if (indexExtended && middleExtended && ringExtended && pinkyExtended) {
    return 'open'
  }

  // Closed fist
  if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return 'closed'
  }

  return 'unknown'
}

// ============================================================================
// Face Mesh Helpers
// ============================================================================

export interface HeadRotation {
  pitch: number  // Up/down (negative = looking up)
  yaw: number    // Left/right (negative = looking left)
  roll: number   // Tilt (negative = tilting left)
}

export interface FaceBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Extract head rotation from face transformation matrix
 */
export function extractHeadRotation(matrix: Float32Array): HeadRotation {
  if (matrix.length < 16) {
    return { pitch: 0, yaw: 0, roll: 0 }
  }

  // Extract rotation from 4x4 transformation matrix
  const r02 = matrix[2]
  const r10 = matrix[4], r11 = matrix[5], r12 = matrix[6]
  const r22 = matrix[10]

  // Calculate Euler angles
  const pitch = Math.asin(-r12) * (180 / Math.PI)
  const yaw = Math.atan2(r02, r22) * (180 / Math.PI)
  const roll = Math.atan2(r10, r11) * (180 / Math.PI)

  return { pitch, yaw, roll }
}

/**
 * Calculate face bounding box from landmarks
 */
export function calculateFaceBox(landmarks: Point3D[]): FaceBox {
  if (landmarks.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  for (const point of landmarks) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * Extract key blendshape values
 */
export function extractBlendshapeValues(
  blendshapes: Array<{ categoryName: string; score: number }> | unknown
): Record<string, number> {
  const result: Record<string, number> = {}

  // Handle case where blendshapes is not an array
  if (!Array.isArray(blendshapes)) {
    return result
  }

  for (const shape of blendshapes) {
    if (shape && typeof shape.categoryName === 'string' && typeof shape.score === 'number') {
      result[shape.categoryName] = shape.score
    }
  }

  return result
}

// ============================================================================
// MediaPipe Service
// ============================================================================

class MediaPipeServiceImpl {
  private filesetResolver: Awaited<ReturnType<FilesetResolver['forVisionTasks']>> | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private audioFilesetResolver: any = null // Audio-specific fileset
  private handLandmarker: HandLandmarker | null = null
  private faceLandmarker: FaceLandmarker | null = null
  private poseLandmarker: PoseLandmarker | null = null
  private objectDetector: ObjectDetector | null = null
  private imageSegmenter: ImageSegmenter | null = null
  private gestureRecognizer: GestureRecognizer | null = null
  private audioClassifier: AudioClassifier | null = null

  private loading = new Set<string>()

  // Track last timestamps to detect playback restarts
  // MediaPipe requires monotonically increasing timestamps
  private lastTimestamp: Map<string, number> = new Map()

  // CDN URLs for MediaPipe WASM files
  private readonly WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  private readonly AUDIO_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@latest/wasm'
  private readonly MODEL_BASE = 'https://storage.googleapis.com/mediapipe-models'

  // =========================================================================
  // Timestamp Management
  // =========================================================================

  /**
   * Check if timestamp went backwards (playback restart) and reset landmarker if needed.
   * MediaPipe requires monotonically increasing timestamps.
   * Returns the timestamp to use (always monotonically increasing).
   */
  private checkTimestampReset(taskType: string, timestamp: number): number {
    const lastTs = this.lastTimestamp.get(taskType) ?? 0

    // If timestamp went backwards significantly, reset the landmarker
    // We use a threshold to avoid resetting on minor jitter
    if (timestamp < lastTs - 100) {
      this.dispose(taskType as 'hand' | 'face' | 'pose' | 'object')
      this.lastTimestamp.set(taskType, timestamp)
      return timestamp
    }

    // Ensure timestamp is always increasing (handle minor backwards jumps)
    const safeTimestamp = Math.max(timestamp, lastTs + 1)
    this.lastTimestamp.set(taskType, safeTimestamp)
    return safeTimestamp
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  private async ensureFileset(): Promise<void> {
    if (this.filesetResolver) return

    const { FilesetResolver } = await import('@mediapipe/tasks-vision')
    this.filesetResolver = await FilesetResolver.forVisionTasks(this.WASM_URL)
  }

  private async ensureAudioFileset(): Promise<void> {
    if (this.audioFilesetResolver) return

    const { FilesetResolver } = await import('@mediapipe/tasks-audio')
    this.audioFilesetResolver = await FilesetResolver.forAudioTasks(this.AUDIO_WASM_URL)
  }

  async loadHandLandmarker(): Promise<void> {
    if (this.handLandmarker || this.loading.has('hand')) return
    this.loading.add('hand')

    try {
      await this.ensureFileset()
      const { HandLandmarker } = await import('@mediapipe/tasks-vision')

      this.handLandmarker = await HandLandmarker.createFromOptions(this.filesetResolver!, {
        baseOptions: {
          modelAssetPath: `${this.MODEL_BASE}/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task`,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
      })

    } finally {
      this.loading.delete('hand')
    }
  }

  async loadFaceLandmarker(): Promise<void> {
    if (this.faceLandmarker || this.loading.has('face')) return
    this.loading.add('face')

    try {
      await this.ensureFileset()
      const { FaceLandmarker } = await import('@mediapipe/tasks-vision')

      this.faceLandmarker = await FaceLandmarker.createFromOptions(this.filesetResolver!, {
        baseOptions: {
          modelAssetPath: `${this.MODEL_BASE}/face_landmarker/face_landmarker/float16/latest/face_landmarker.task`,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      })

    } finally {
      this.loading.delete('face')
    }
  }

  async loadPoseLandmarker(): Promise<void> {
    if (this.poseLandmarker || this.loading.has('pose')) return
    this.loading.add('pose')

    try {
      await this.ensureFileset()
      const { PoseLandmarker } = await import('@mediapipe/tasks-vision')

      this.poseLandmarker = await PoseLandmarker.createFromOptions(this.filesetResolver!, {
        baseOptions: {
          modelAssetPath: `${this.MODEL_BASE}/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        outputSegmentationMasks: false, // Disable for performance
      })

    } finally {
      this.loading.delete('pose')
    }
  }

  async loadObjectDetector(): Promise<void> {
    if (this.objectDetector || this.loading.has('object')) return
    this.loading.add('object')

    try {
      await this.ensureFileset()
      const { ObjectDetector } = await import('@mediapipe/tasks-vision')

      this.objectDetector = await ObjectDetector.createFromOptions(this.filesetResolver!, {
        baseOptions: {
          modelAssetPath: `${this.MODEL_BASE}/object_detector/efficientdet_lite0/int8/latest/efficientdet_lite0.tflite`,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        maxResults: 10,
        scoreThreshold: 0.5,
      })

    } finally {
      this.loading.delete('object')
    }
  }

  async loadImageSegmenter(): Promise<void> {
    if (this.imageSegmenter || this.loading.has('segmentation')) return
    this.loading.add('segmentation')

    try {
      await this.ensureFileset()
      const { ImageSegmenter } = await import('@mediapipe/tasks-vision')

      this.imageSegmenter = await ImageSegmenter.createFromOptions(this.filesetResolver!, {
        baseOptions: {
          modelAssetPath: `${this.MODEL_BASE}/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite`,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      })

    } finally {
      this.loading.delete('segmentation')
    }
  }

  async loadGestureRecognizer(): Promise<void> {
    if (this.gestureRecognizer || this.loading.has('gesture')) return
    this.loading.add('gesture')

    try {
      await this.ensureFileset()
      const { GestureRecognizer } = await import('@mediapipe/tasks-vision')

      this.gestureRecognizer = await GestureRecognizer.createFromOptions(this.filesetResolver!, {
        baseOptions: {
          modelAssetPath: `${this.MODEL_BASE}/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task`,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })

    } finally {
      this.loading.delete('gesture')
    }
  }

  async loadAudioClassifier(): Promise<void> {
    if (this.audioClassifier || this.loading.has('audio')) return
    this.loading.add('audio')

    try {
      await this.ensureAudioFileset()
      const { AudioClassifier } = await import('@mediapipe/tasks-audio')

      this.audioClassifier = await AudioClassifier.createFromOptions(this.audioFilesetResolver, {
        baseOptions: {
          modelAssetPath: `${this.MODEL_BASE}/audio_classifier/yamnet/float32/latest/yamnet.tflite`,
        },
        maxResults: 5,
        scoreThreshold: 0.3,
      })

    } finally {
      this.loading.delete('audio')
    }
  }

  // =========================================================================
  // Detection Methods
  // =========================================================================

  async detectHands(video: HTMLVideoElement, timestamp: number): Promise<HandResult | null> {
    // Check for timestamp reset (playback restart)
    const safeTimestamp = this.checkTimestampReset('hand', timestamp)

    if (!this.handLandmarker) {
      await this.loadHandLandmarker()
    }

    if (!this.handLandmarker || video.readyState < 2) {
      return null
    }

    try {
      const result = this.handLandmarker.detectForVideo(video, safeTimestamp)

      return {
        landmarks: result.landmarks,
        worldLandmarks: result.worldLandmarks,
        handedness: result.handedness.flat(),
      }
    } catch (error) {
      console.error('[MediaPipe] Hand detection error:', error)
      return null
    }
  }

  async detectFace(video: HTMLVideoElement, timestamp: number): Promise<FaceResult | null> {
    // Check for timestamp reset (playback restart)
    const safeTimestamp = this.checkTimestampReset('face', timestamp)

    if (!this.faceLandmarker) {
      await this.loadFaceLandmarker()
    }

    if (!this.faceLandmarker || video.readyState < 2) {
      return null
    }

    try {
      const result = this.faceLandmarker.detectForVideo(video, safeTimestamp)

      return {
        landmarks: result.faceLandmarks,
        blendshapes: result.faceBlendshapes || [],
        transformationMatrixes: result.facialTransformationMatrixes || [],
      }
    } catch (error) {
      console.error('[MediaPipe] Face detection error:', error)
      return null
    }
  }

  async detectPose(video: HTMLVideoElement, timestamp: number): Promise<PoseResult | null> {
    // Check for timestamp reset (playback restart)
    const safeTimestamp = this.checkTimestampReset('pose', timestamp)

    if (!this.poseLandmarker) {
      await this.loadPoseLandmarker()
    }

    if (!this.poseLandmarker || video.readyState < 2) {
      return null
    }

    try {
      const result = this.poseLandmarker.detectForVideo(video, safeTimestamp)

      return {
        landmarks: result.landmarks,
        worldLandmarks: result.worldLandmarks,
        segmentationMasks: [], // Disabled for performance
      }
    } catch (error) {
      console.error('[MediaPipe] Pose detection error:', error)
      return null
    }
  }

  async detectObjects(video: HTMLVideoElement, timestamp: number): Promise<ObjectDetectionResult | null> {
    // Check for timestamp reset (playback restart)
    const safeTimestamp = this.checkTimestampReset('object', timestamp)

    if (!this.objectDetector) {
      await this.loadObjectDetector()
    }

    if (!this.objectDetector || video.readyState < 2) {
      return null
    }

    try {
      const result = this.objectDetector.detectForVideo(video, safeTimestamp)

      return {
        detections: result.detections.map((d: { boundingBox?: Detection['boundingBox']; categories: Detection['categories'] }) => ({
          boundingBox: d.boundingBox!,
          categories: d.categories,
        })),
      }
    } catch (error) {
      console.error('[MediaPipe] Object detection error:', error)
      return null
    }
  }

  async segmentImage(video: HTMLVideoElement, timestamp: number): Promise<SegmentationResult | null> {
    // Check for timestamp reset (playback restart)
    const safeTimestamp = this.checkTimestampReset('segmentation', timestamp)

    if (!this.imageSegmenter) {
      await this.loadImageSegmenter()
    }

    if (!this.imageSegmenter || video.readyState < 2) {
      return null
    }

    try {
      const result = this.imageSegmenter.segmentForVideo(video, safeTimestamp)

      // Convert MPImage to ImageData
      // MPImage can be converted via canvas or by accessing raw data
      let categoryMask: ImageData | null = null
      if (result.categoryMask) {
        const mpImage = result.categoryMask
        const width = mpImage.width
        const height = mpImage.height

        // Get the raw data - categoryMask contains category indices (0 = background, 1+ = foreground)
        // Try different methods depending on MediaPipe version
        let rawData: Uint8Array | Uint8ClampedArray | null = null

        if (typeof mpImage.getAsUint8Array === 'function') {
          rawData = mpImage.getAsUint8Array()
        } else if (mpImage.canvas) {
          // Fallback: draw to canvas and extract
          const ctx = mpImage.canvas.getContext('2d')
          if (ctx) {
            const imgData = ctx.getImageData(0, 0, width, height)
            categoryMask = imgData
          }
        }

        // Convert single-channel mask to RGBA ImageData
        if (rawData && !categoryMask) {
          const rgba = new Uint8ClampedArray(width * height * 4)
          for (let i = 0; i < rawData.length; i++) {
            const val = rawData[i]
            // Store category value in R channel, full opacity
            rgba[i * 4] = val > 0 ? 255 : 0     // R - person mask
            rgba[i * 4 + 1] = val > 0 ? 255 : 0 // G
            rgba[i * 4 + 2] = val > 0 ? 255 : 0 // B
            rgba[i * 4 + 3] = 255               // A
          }
          categoryMask = new ImageData(rgba, width, height)
        }
      }

      return {
        categoryMask,
        confidenceMasks: [],
        width: result.categoryMask?.width ?? video.videoWidth,
        height: result.categoryMask?.height ?? video.videoHeight,
      }
    } catch (error) {
      console.error('[MediaPipe] Image segmentation error:', error)
      return null
    }
  }

  async recognizeGestures(video: HTMLVideoElement, timestamp: number): Promise<GestureResult | null> {
    // Check for timestamp reset (playback restart)
    const safeTimestamp = this.checkTimestampReset('gesture', timestamp)

    if (!this.gestureRecognizer) {
      await this.loadGestureRecognizer()
    }

    if (!this.gestureRecognizer || video.readyState < 2) {
      return null
    }

    try {
      const result = this.gestureRecognizer.recognizeForVideo(video, safeTimestamp)

      return {
        gestures: result.gestures.map((g: Array<{ categoryName: string; score: number }>) =>
          g.map((category) => ({
            categoryName: category.categoryName,
            score: category.score,
          }))
        ),
        handedness: result.handedness.flat(),
        landmarks: result.landmarks,
        worldLandmarks: result.worldLandmarks,
      }
    } catch (error) {
      console.error('[MediaPipe] Gesture recognition error:', error)
      return null
    }
  }

  async classifyAudio(audioBuffer: Float32Array, sampleRate: number): Promise<AudioClassificationResult | null> {
    if (!this.audioClassifier) {
      await this.loadAudioClassifier()
    }

    if (!this.audioClassifier || audioBuffer.length === 0) {
      return null
    }

    try {
      // MediaPipe Audio Classifier expects audio at specific sample rates
      // Resample if necessary (YAMNet typically expects 16kHz)
      let processedBuffer = audioBuffer
      const expectedSampleRate = 16000

      if (sampleRate !== expectedSampleRate) {
        // Simple linear interpolation resampling
        const ratio = sampleRate / expectedSampleRate
        const outputLength = Math.floor(audioBuffer.length / ratio)
        processedBuffer = new Float32Array(outputLength)

        for (let i = 0; i < outputLength; i++) {
          const srcIndex = i * ratio
          const srcIndexFloor = Math.floor(srcIndex)
          const srcIndexCeil = Math.min(srcIndexFloor + 1, audioBuffer.length - 1)
          const fraction = srcIndex - srcIndexFloor
          processedBuffer[i] = audioBuffer[srcIndexFloor] * (1 - fraction) + audioBuffer[srcIndexCeil] * fraction
        }
      }

      const result = this.audioClassifier.classify(processedBuffer)

      if (!result || !result.classifications || result.classifications.length === 0) {
        return null
      }

      const classification = result.classifications[0]
      return {
        categories: classification.categories.map((c: { categoryName: string; score: number }) => ({
          categoryName: c.categoryName,
          score: c.score,
        })),
        timestampMs: classification.timestampMs ?? Date.now(),
      }
    } catch (error) {
      console.error('[MediaPipe] Audio classification error:', error)
      return null
    }
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  dispose(taskType?: 'hand' | 'face' | 'pose' | 'object' | 'segmentation' | 'gesture' | 'audio'): void {
    if (!taskType || taskType === 'hand') {
      this.handLandmarker?.close()
      this.handLandmarker = null
      this.lastTimestamp.delete('hand')
    }
    if (!taskType || taskType === 'face') {
      this.faceLandmarker?.close()
      this.faceLandmarker = null
      this.lastTimestamp.delete('face')
    }
    if (!taskType || taskType === 'pose') {
      this.poseLandmarker?.close()
      this.poseLandmarker = null
      this.lastTimestamp.delete('pose')
    }
    if (!taskType || taskType === 'object') {
      this.objectDetector?.close()
      this.objectDetector = null
      this.lastTimestamp.delete('object')
    }
    if (!taskType || taskType === 'segmentation') {
      this.imageSegmenter?.close()
      this.imageSegmenter = null
      this.lastTimestamp.delete('segmentation')
    }
    if (!taskType || taskType === 'gesture') {
      this.gestureRecognizer?.close()
      this.gestureRecognizer = null
      this.lastTimestamp.delete('gesture')
    }
    if (!taskType || taskType === 'audio') {
      this.audioClassifier?.close()
      this.audioClassifier = null
    }

    if (!taskType) {
      this.filesetResolver = null
      this.audioFilesetResolver = null
      this.lastTimestamp.clear()
    }
  }

  isLoaded(taskType: 'hand' | 'face' | 'pose' | 'object' | 'segmentation' | 'gesture' | 'audio'): boolean {
    switch (taskType) {
      case 'hand': return this.handLandmarker !== null
      case 'face': return this.faceLandmarker !== null
      case 'pose': return this.poseLandmarker !== null
      case 'object': return this.objectDetector !== null
      case 'segmentation': return this.imageSegmenter !== null
      case 'gesture': return this.gestureRecognizer !== null
      case 'audio': return this.audioClassifier !== null
      default: return false
    }
  }

  isLoading(taskType: 'hand' | 'face' | 'pose' | 'object' | 'segmentation' | 'gesture' | 'audio'): boolean {
    return this.loading.has(taskType)
  }
}

// Singleton instance
export const mediaPipeService = new MediaPipeServiceImpl()
